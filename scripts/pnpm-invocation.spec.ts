import { describe, expect, it, vi } from 'vitest'
import { pnpmInvocation } from './pnpm-invocation.ts'

describe('pnpm invocation', () => {
  it.each([
    '/tools/pnpm.js',
    '/tools/pnpm.cjs',
    '/tools/pnpm.mjs',
    '/tools/PNPM.CJS',
    '/tools/with spaces/工具/$pnpm;.mjs',
  ])('runs the JavaScript entrypoint %j through Node', (entrypoint) => {
    expect(pnpmInvocation(['run', 'build'], { npm_execpath: entrypoint })).toEqual({
      command: process.execPath,
      args: [entrypoint, 'run', 'build'],
    })
  })

  it.each([
    '/tools/pnpm',
    '/tools/with spaces/$pnpm;',
    String.raw`C:\Program Files\工具\$pnpm;\pnpm.exe`,
  ])('runs the executable entrypoint %j directly', (entrypoint) => {
    expect(pnpmInvocation(['run', 'build'], { npm_execpath: entrypoint })).toEqual({
      command: entrypoint,
      args: ['run', 'build'],
    })
  })

  it.each([undefined, ''])('falls back to the pnpm on PATH when the lifecycle entrypoint is %j', (entrypoint) => {
    const notice = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    try {
      expect(pnpmInvocation(['run', 'build'], { npm_execpath: entrypoint })).toEqual({
        command: process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
        args: ['run', 'build'],
      })
      expect(notice).toHaveBeenCalledWith('pnpm invocation: npm_execpath is unavailable; running '
        + (process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm') + ' from PATH\n')
    } finally {
      notice.mockRestore()
    }
  })
})
