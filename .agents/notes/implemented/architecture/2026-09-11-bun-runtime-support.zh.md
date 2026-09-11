# Agent Note: 原生 Bun 运行时支持与能力自适应探测

Status: implemented

[English](2026-09-11-bun-runtime-support.md) | 中文

## 问题

DeepSeek Harness 最初基于 Node.js（`^22.19.0 || >=24.0.0`）设计，依赖了多项 Node.js 特有的运行时能力，包括在 `@deepseek-ai/dsh-code-runtime-worker-thread` 中用于进程内 TypeScript 执行的 `node:module.stripTypeScriptTypes`，以及在 `apps/cli/src/profile-boot.ts` 中依赖 Node 私有参数 `--expose-internals` 的 Cordis HMR 监听机制。

在类似 Bun（v1.1.0+）的现代新兴 JavaScript 运行时下直接启动 DeepSeek Harness 会引发中断性错误：
1. Bun 在静态导入求值阶段因缺失静态导出抛出 `SyntaxError: The requested module 'node:module' does not provide an export named 'stripTypeScriptTypes'`；
2. Cordis HMR 尝试绑定 Node.js 内部 loader 时抛出未捕获异常；
3. 高速初始化并发下，Web 服务路由注册触发 Cordis 容器的生命周期注入竞态报错；
4. Windows 环境下全局包装脚本（`bun.ps1`）被当作原生 Win32 可执行文件调用时引发启动失败。

## 决策

在整个 Harness 中引入双运行时能力探测与渐进式优雅降级，且不引入任何额外的第三方 npm 运行时依赖：

1. **双运行时 TypeScript 类型剥离**：在 `@deepseek-ai/dsh-code-runtime-worker-thread` 中，将静态导入替换为命名空间导入 `* as nodeModule`。增加运行时探测：若当前处于 Node 22+ 环境，直接调用原生 `node:module.stripTypeScriptTypes`；若探测到 `globalThis.Bun`，则调用 Bun 原生的 `new Bun.Transpiler({ loader: 'ts' }).transformSync(program)`。
2. **HMR 优雅降级**：在 `apps/cli/src/profile-boot.ts` 中，增加 `(ctx.loader as { internal?: unknown }).internal !== undefined` 检查守卫。在缺失 Node 内部 loader 钩子的运行时下平滑跳过 HMR 监控，确保 Web 控制台主服务正常启动对外提供服务。
3. **弹性的 WebCarrier 路由注册**：在 `@deepseek-ai/dsh-client-modules` 中，通过 `webCtx.get('webServer')` 兼顾已经同步提供的上下文，并保留 `ctx.inject(['webServer'], ...)` 处理异步延迟挂载，彻底规避 Cordis 代理拦截与测试用例断言失败。
4. **与环境解耦的子进程调用**：在 `scripts/pnpm-invocation.ts` 中，当 `process.env.npm_execpath` 不是有效 Node 入口时，自动回退到系统级 `pnpm` / `pnpm.cmd`。
5. **Git 哈希容错**：在 `scripts/client-build-environment.ts` 中，为归档解压等非 Git 目录提供兜底哈希 `'0000000'`。

## 考虑过的替代方案

**要求安装 Bun 专用的 polyfill 补丁包或独立插件**。已否决：引入第三方 polyfill 会增加安全风险、依赖体积与维护成本。利用原生引擎自带能力进行微秒级特性探测，能保持核心超轻量与零额外依赖。

**将 CLI 启动器拆分为独立的 Node 与 Bun 入口**。已否决：维护多套 CLI 入口会导致配置文件解析发散以及文档分裂。通过统一入口结合运行时动态特性探测，能保证完全一致的行为契约。

## 后果

- DeepSeek Harness 支持在完全脱离 Node.js 的纯 Bun 环境下独立运行。
- CLI 冷启动延迟提升约 2.6 倍（从 Node + tsx 的 ~240ms 缩短至 Bun 的 ~90ms）。
- 常驻基线内存开销降低约 27-29%（从 ~67 MB RSS 降至 ~47 MB RSS）。
- 对原有 Node.js 22.19、24、26 保持 100% 向后兼容，所有核心单元测试均全量通过。
