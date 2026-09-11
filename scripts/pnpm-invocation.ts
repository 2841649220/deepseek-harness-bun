/** Resolve shell-free child-process invocations for the pnpm process that launched a package script. */

/**
 * Resolve pnpm's executable and arguments from its lifecycle environment.
 * @param args - Arguments to pass to pnpm.
 * @param environment - Lifecycle environment containing `npm_execpath`.
 * @returns A command and argument array suitable for `spawn` or `spawnSync` without a shell.
 */
export function pnpmInvocation(
  args: readonly string[],
  environment: NodeJS.ProcessEnv = process.env,
): { command: string; args: string[] } {
  const entrypoint = environment.npm_execpath
  if (entrypoint !== undefined && entrypoint !== '') {
    if (/\.[cm]?js$/iu.test(entrypoint)) {
      return { command: process.execPath, args: [entrypoint, ...args] }
    }
    return { command: entrypoint, args: [...args] }
  }
  // A script run outside a package-manager lifecycle (a direct `bun run` or
  // `node` invocation of a build entry) has no entrypoint to reuse; the pnpm on
  // PATH is then the only candidate, and naming it keeps the substitution visible.
  const fallback = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
  process.stderr.write(`pnpm invocation: npm_execpath is unavailable; running ${fallback} from PATH\n`)
  return { command: fallback, args: [...args] }
}
