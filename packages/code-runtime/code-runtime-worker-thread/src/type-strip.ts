/**
 * TypeScript stripping for one worker program: the stripping capability of the
 * running runtime, plus the function shell that keeps the stripped source in
 * the grammatical context it executes in.
 *
 * Node's strip-only mode removes type syntax and refuses non-erasable syntax
 * such as `enum`; Bun's transpiler is a full TypeScript transform and
 * accepts it. Non-erasable syntax therefore behaves as Node's contract
 * describes (a program failure) on Node, and runs on Bun.
 * @module @deepseek-ai/dsh-code-runtime-worker-thread/type-strip
 */

import * as nodeModule from 'node:module'

/**
 * The shell a program is wrapped in for the type strip, matching the
 * grammatical context it will execute in (an async function body, where
 * top-level `return` and `await` are legal — a bare module parse
 * rejects the `return`, and Bun's transpiler parses as a module).
 * Node's strip mode is position-preserving, so a stripped error still reports
 * its original line and column.
 */
export const STRIP_WRAP = { prefix: 'async function __dsh_program__() {\n', suffix: '\n}' } as const

/** One runtime capability that removes TypeScript syntax from a function body. */
export type TypeScriptStripper = (code: string) => string

/** The runtime surfaces {@link selectStripper} reads. */
export interface TypeStripRuntime {
  /** Node 22+ `node:module.stripTypeScriptTypes`, which strips types without transforming syntax. */
  stripTypeScriptTypes?: ((code: string) => string) | undefined
  /** Bun's transpiler constructor, the only stripping entry point Bun exposes. */
  Bun?: { Transpiler: new (options: { loader: string }) => { transformSync: (code: string) => string } } | undefined
}

/**
 * Select the stripping capability of one runtime.
 * @param runtime - capability surfaces to read.
 * @returns the stripper, or undefined when the runtime exposes none.
 */
export function selectStripper(runtime: TypeStripRuntime): TypeScriptStripper | undefined {
  const strip = runtime.stripTypeScriptTypes
  if (typeof strip === 'function') return strip
  const bun = runtime.Bun
  if (bun !== undefined) return code => new bun.Transpiler({ loader: 'ts' }).transformSync(code)
  return undefined
}

/**
 * The capability surfaces of the running process.
 * @returns Node's strip function when the runtime provides it, and Bun's transpiler under Bun.
 */
export function currentTypeStripRuntime(): TypeStripRuntime {
  const moduleNamespace = nodeModule as TypeStripRuntime
  const bun = (globalThis as { Bun?: TypeStripRuntime['Bun'] }).Bun
  return { stripTypeScriptTypes: moduleNamespace.stripTypeScriptTypes, Bun: bun }
}

/**
 * Strip one program's type syntax by wrapping it in the function shell.
 * @param program - the program source, as the model wrote it.
 * @param strip - the runtime stripping capability.
 * @returns the stripped function body, ready to evaluate.
 * @throws whatever `strip` throws for a program that does not survive the strip.
 */
export function stripProgram(program: string, strip: TypeScriptStripper): string {
  const stripped = strip(STRIP_WRAP.prefix + program + STRIP_WRAP.suffix)
  return stripped.slice(STRIP_WRAP.prefix.length, stripped.length - STRIP_WRAP.suffix.length)
}

/**
 * Strip one program with the capability of the running runtime.
 * @param program - the program source, as the model wrote it.
 * @param runtime - capability surfaces; defaults to the running process.
 * @returns the stripped function body, ready to evaluate.
 * @throws when the runtime exposes no stripping capability, or when the program does not survive the strip.
 */
export function stripTypeScript(program: string, runtime: TypeStripRuntime = currentTypeStripRuntime()): string {
  const strip = selectStripper(runtime)
  if (strip === undefined) {
    throw new Error('dsh-code-runtime-worker-thread: stripTypeScriptTypes is not supported on this runtime')
  }
  return stripProgram(program, strip)
}
