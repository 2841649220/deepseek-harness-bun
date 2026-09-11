/**
 * Busy-time metering on a runtime that reports no worker event-loop
 * utilization: workers, programs, and binding transport stay real, and only
 * the utilization read is substituted.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { WorkerThreadCodeRuntime } from '@deepseek-ai/dsh-code-runtime-worker-thread'

const meter = vi.hoisted(() => ({ sample: vi.fn(), implemented: false }))

vi.mock('node:worker_threads', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:worker_threads')>()
  return {
    ...original,
    Worker: class extends original.Worker {
      constructor(...args: ConstructorParameters<typeof original.Worker>) {
        super(...args)
        this.performance.eventLoopUtilization = () => {
          meter.sample()
          if (!meter.implemented) throw new Error('worker_threads.Worker.performance is not yet implemented in Bun.')
          return { idle: 0, active: 0, utilization: 0 }
        }
      }
    },
  }
})

const NOTICE_PREFIX = 'dsh-code-runtime-worker-thread:'

describe('worker budgets on a runtime without a worker utilization read', () => {
  let ctx: Context
  let stderr: string[]

  beforeEach(() => {
    ctx = new Context()
    stderr = []
    meter.sample.mockReset()
    meter.implemented = false
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
      stderr.push(String(chunk))
      return true
    })
  })

  afterEach(async () => {
    try {
      await ctx.fiber.dispose()
    } finally {
      vi.unstubAllGlobals()
      vi.restoreAllMocks()
    }
  })

  const notices = (): string[] => stderr.filter(line => line.startsWith(NOTICE_PREFIX))

  async function mount(): Promise<void> {
    await ctx.plugin(WorkerThreadCodeRuntime, { computeMs: 1_000, maxWallMs: 30_000 })
  }

  it('settles runs whose utilization read throws, announcing the gap once per service', async () => {
    await mount()
    expect(await ctx.codeRuntime.run({ program: 'return 6 * 7', bindings: [] })).toEqual({ logs: [], value: 42 })
    expect(await ctx.codeRuntime.run({ program: 'return 1', bindings: [] })).toEqual({ logs: [], value: 1 })
    // One probe for the runtime, not one per run: the second run reuses the answer.
    expect(meter.sample).toHaveBeenCalledTimes(1)
    expect(notices()).toEqual([
      NOTICE_PREFIX + ' this runtime reports no worker event-loop utilization '
      + '(worker.performance.eventLoopUtilization measures nothing under Bun); config.computeMs '
      + '(1000ms) cannot expire a run, leaving config.maxWallMs (30000ms) as the ceiling\n',
    ])
  })

  it('leaves a read alone that the runtime itself reports as unimplemented', async () => {
    vi.stubGlobal('Bun', {})
    meter.implemented = true
    await mount()
    expect(await ctx.codeRuntime.run({ program: 'return 6 * 7', bindings: [] })).toEqual({ logs: [], value: 42 })
    // Bun's stub measures nothing, so polling it could only burn host CPU.
    expect(meter.sample).not.toHaveBeenCalled()
    expect(notices()).toHaveLength(1)
  })
})
