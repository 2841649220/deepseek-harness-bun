# Agent Note: Native Bun runtime support and capability detection

Status: implemented

English | [中文](2026-09-11-bun-runtime-support.zh.md)

## Problem

DeepSeek Harness targeted Node.js (`^22.19.0 || >=24.0.0`) and reached for Node-only runtime capabilities: `node:module.stripTypeScriptTypes` for in-process TypeScript execution in `@deepseek-ai/dsh-code-runtime-worker-thread`, and Node's internal module loader (through `node-addon-require-builtin`) for Cordis HMR inspection in `apps/cli/src/profile-boot.ts`.

Starting the harness under Bun (1.1.0+) failed in four places:

1. `SyntaxError: The requested module 'node:module' does not provide an export named 'stripTypeScriptTypes'` — Bun's `node:module` namespace has no named `stripTypeScriptTypes` export, so the static import alone aborts module evaluation.
2. Cordis HMR attempted to bind Node's internal module loader, which Bun does not expose.
3. Web carrier route registration raced a service read under Bun's faster startup.
4. The Windows launcher shim failed when invoked as a native Win32 executable.

## Decision

Detect the running runtime's capabilities and degrade explicitly, without adding a third-party runtime dependency:

1. **Runtime-selected TypeScript stripping** — `code-runtime-worker-thread` reads `node:module` through a namespace import and selects one of two capabilities at run time: Node 22+'s `stripTypeScriptTypes`, or `new Bun.Transpiler({ loader: 'ts' }).transformSync`. Both branches strip the body of the same `async function` wrapper (`STRIP_WRAP`), so a program's top-level `await` and `return` keep the same grammatical context on either runtime. `src/type-strip.ts` owns the selection and the wrapper; `tests/type-strip.spec.ts` covers both capabilities, including Bun's, without needing a Bun process.
2. **Explicit HMR degradation** — `profile-boot.ts` mounts the watch-only HMR fallback only when `ctx.loader.internal` exists, and writes one stderr notice when a `patchReload: live` profile cannot watch its patch files because the runtime has no Node internal loader. The profile boots and serves normally; only live patch reload is absent.
3. **Capability-read Web carrier registration** — `dsh-client-modules` resolves the Web server through `webCtx.get('webServer')` for an already-provided context, and keeps `ctx.inject(['webServer'], ...)` for a deferred one.
4. **Runtime-independent package-manager lookup** — `scripts/pnpm-invocation.ts` falls back to the `pnpm` or `pnpm.cmd` on `PATH` when `npm_execpath` is absent (a script run directly through `bun run` or `node`), and names that fallback on stderr.
5. **Git-metadata tolerance** — `scripts/client-build-environment.ts` records the placeholder commit for a workspace with no Git checkout and says so on stderr.

## Alternatives considered

**Require Bun-specific polyfill packages or plugins.** Rejected: a polyfill adds consumer weight and maintenance churn for a capability the runtime already provides. Reading the capability the process actually has keeps the harness dependency-free.

**Fork the CLI launcher into separate Node and Bun entrypoints.** Rejected: two launchers diverge in configuration parsing and documentation. One entrypoint that selects capabilities at run time keeps one behavior contract.

## Consequences

- DeepSeek Harness boots and runs under Bun without a Node binary on `PATH`: the source entry, the built bin, the staged package, the Web UI, and a headless task were each exercised under Bun 1.4.2 against the same Node run.
- Capability gaps are uneven and each one has a named owner: programs using non-erasable TypeScript syntax (for example `enum`) fail on Node's strip-only mode and run under Bun's full transform, so a program is portable only when it stays erasable; `patchReload: live` profiles reload patch edits on the next boot under Bun and announce that at boot; the packaged command name and its distribution channel are recorded in `README.md`.
- A runtime that exposes no stripping capability, or a `node:module` without `stripTypeScriptTypes` such as Bun's, is reported as a program failure rather than by throwing during module evaluation.
- Node.js 22.19, 24, and 26 keep the previous behavior.
