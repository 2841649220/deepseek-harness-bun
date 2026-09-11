import { describe, expect, it } from 'vitest'
import { STRIP_WRAP, currentTypeStripRuntime, selectStripper, stripProgram, stripTypeScript } from '../src/type-strip.ts'

/** A stand-in for Bun's transpiler that records the loader it was constructed with. */
class FakeTranspiler {
  static loaders: string[] = []

  constructor(options: { loader: string }) {
    FakeTranspiler.loaders.push(options.loader)
  }

  /**
   * Re-emit the wrapped program the way `Bun.Transpiler` does: the same
   * function shell, its closing brace followed by the transpiler's own newline.
   */
  transformSync(code: string): string {
    const body = code.slice(STRIP_WRAP.prefix.length, code.length - STRIP_WRAP.suffix.length)
    return STRIP_WRAP.prefix + body + '}\n'
  }
}

describe('type stripping', () => {
  it('strips the wrapped program through the capability that removes types only', () => {
    const seen: string[] = []
    const stripper = (code: string): string => {
      seen.push(code)
      return STRIP_WRAP.prefix + 'BODY' + STRIP_WRAP.suffix
    }

    expect(stripProgram('return 1 + 1', stripper)).toBe('BODY')
    expect(seen).toEqual([STRIP_WRAP.prefix + 'return 1 + 1' + STRIP_WRAP.suffix])
  })

  it('wraps the program before handing it to Bun, whose transpiler parses as a module', () => {
    FakeTranspiler.loaders = []

    const result = stripTypeScript('await go()\nreturn 1', { Bun: { Transpiler: FakeTranspiler } })

    expect(FakeTranspiler.loaders).toEqual(['ts'])
    expect(result).toBe('await go()\nreturn 1')
  })

  it('prefers the type-only capability when a runtime exposes both', () => {
    const runtime = {
      stripTypeScriptTypes: (): string => STRIP_WRAP.prefix + 'NODE' + STRIP_WRAP.suffix,
      Bun: { Transpiler: FakeTranspiler },
    }

    expect(stripTypeScript('return 1', runtime)).toBe('NODE')
    expect(selectStripper(runtime)).toBe(runtime.stripTypeScriptTypes)
  })

  it('rejects a runtime with no stripping capability', () => {
    expect(selectStripper({})).toBeUndefined()
    expect(() => stripTypeScript('return 1', {})).toThrow('stripTypeScriptTypes is not supported on this runtime')
  })

  it('reads the capability of the running runtime', () => {
    const runtime = currentTypeStripRuntime()

    expect(runtime.stripTypeScriptTypes ?? runtime.Bun).toBeDefined()
    expect(stripTypeScript('const value: number = 1\nreturn value')).toContain('return value')
  })
})
