# Agent Note: 原生 Bun 运行时支持与能力探测

Status: implemented

[English](2026-09-11-bun-runtime-support.md) | 中文

## 问题

DeepSeek Harness 面向 Node.js（`^22.19.0 || >=24.0.0`）设计，并依赖若干 Node 专属能力：`@deepseek-ai/dsh-code-runtime-worker-thread` 用 `node:module.stripTypeScriptTypes` 在进程内执行 TypeScript，`apps/cli/src/profile-boot.ts` 通过 Node 内部模块加载器（经 `node-addon-require-builtin`）支撑 Cordis HMR。

在 Bun（1.1.0 以上）下启动会在四处失败：

1. `SyntaxError: The requested module 'node:module' does not provide an export named 'stripTypeScriptTypes'`——Bun 的 `node:module` 命名空间没有 `stripTypeScriptTypes` 具名导出，仅静态导入就会中止模块求值。
2. Cordis HMR 尝试绑定 Bun 并不提供的 Node 内部模块加载器。
3. Bun 启动更快，Web carrier 的路由注册与服务读取发生竞态。
4. Windows 启动器 shim 被当作原生 Win32 可执行文件调用时失败。

## 决策

探测运行时的真实能力并显式降级，不引入任何第三方运行时依赖：

1. **运行时选择类型剥离能力**——`code-runtime-worker-thread` 以命名空间导入读取 `node:module`，在运行时于两种能力之间选择：Node 22+ 的 `stripTypeScriptTypes`，或 `new Bun.Transpiler({ loader: 'ts' }).transformSync`。两个分支都剥离同一个 `async function` 包裹层（`STRIP_WRAP`）的函数体，因此程序的顶层 `await` 与 `return` 在两种运行时下处于相同的语法上下文。`src/type-strip.ts` 负责能力选择与包裹层，`tests/type-strip.spec.ts` 在不需要 Bun 进程的情况下覆盖两种能力（包括 Bun 分支）。
2. **显式 HMR 降级**——`profile-boot.ts` 仅在 `ctx.loader.internal` 存在时挂载只监视配置的 HMR 兜底实例；当 `patchReload: live` profile 因运行时缺少 Node 内部加载器而无法监视 patch 文件时，向 stderr 写出一次提示。profile 仍正常启动并提供服务，缺少的只有实时 patch 重载。
3. **按能力读取 Web carrier 注册**——`dsh-client-modules` 对已提供的上下文改用 `webCtx.get('webServer')` 解析 Web 服务，同时保留 `ctx.inject(['webServer'], ...)` 处理延迟挂载。
4. **与运行时无关的包管理器查找**——`scripts/pnpm-invocation.ts` 在缺少 `npm_execpath`（直接用 `bun run` 或 `node` 运行脚本）时回退到 `PATH` 上的 `pnpm` 或 `pnpm.cmd`，并在 stderr 上说明该回退。
5. **Git 元数据容错**——`scripts/client-build-environment.ts` 对没有 Git 仓库的工作区记录占位提交哈希，并在 stderr 上说明。

## 考虑过的替代方案

**要求安装 Bun 专用 polyfill 包或插件。** 已否决：运行时本身已提供该能力，引入 polyfill 只会增加消费方体积与维护成本。直接读取进程真实具备的能力，可保持零依赖。

**把 CLI 启动器拆成 Node 与 Bun 两个入口。** 已否决：两个启动器会在配置解析与文档上分叉。单一入口在运行时选择能力，可以只保留一份行为约定。

## 后果

- DeepSeek Harness 可在 `PATH` 中没有任何 Node 可执行文件的情况下于 Bun 下启动运行：源码入口、构建产物 bin、暂存包、Web UI 与 headless 任务均已与同一次 Node 运行对照验证（Bun 1.4.2）。
- 能力缺口并不均一，且每一处都有明确归属：使用不可擦除 TypeScript 语法（例如 `enum`）的程序在 Node 的仅剥离模式下失败、在 Bun 的完整转换下可运行，因此程序只有保持可擦除才可移植；`patchReload: live` profile 在 Bun 下的 patch 编辑于下次启动生效，并在启动时给出提示；打包后的命令名与其分发渠道记录在 `README.md`。
- 不提供剥离能力的运行时，或像 Bun 这样 `node:module` 没有 `stripTypeScriptTypes` 的运行时，会得到程序失败的结果，而不是在模块求值阶段整体抛错。
- Node.js 22.19、24、26 保持原有行为。
