# DeepSeek Harness (Bun 支持)

[English](README.zh.md) | 中文

DeepSeek Harness（`dsh`）是由 [DeepSeek AI](https://deepseek.com) 开发的开源 agent harness（智能体框架）。

本仓库是在官方版本基础上，增加了对 **Bun 运行时** 的兼容支持，允许直接使用 Bun 执行 CLI 命令，并提供将 CLI 打包发布为 Bun 全局包的脚本工具。

它构建于**一切皆插件**的架构之上，由 [Cordis](https://github.com/cordiverse/cordis) 驱动，其设计参见论文 [_A Programming Paradigm for Spatiotemporal Composability_](https://arxiv.org/abs/2608.25512)。

文档：[https://deepseek-harness.github.io/deepseek-harness/](https://deepseek-harness.github.io/deepseek-harness/)

## 本仓库新增特性

- **支持 Bun 运行时直接执行**：支持使用 Bun 直接运行 CLI 源码与内置 Profile。
- **提供 Bun 打包流水线**：提供 `pnpm run package:bun` 脚本，自动解析工作区依赖版本并注入 Bun shebang，产出可发布的 `dsh_bun` 包。
- **跨平台修复**：修复了 Windows 环境下的符号链接兼容性及配置检查问题。
- **保持 Node.js 兼容**：保留对原有 Node.js / pnpm 工作流的完整兼容。

## Bun 运行前的准备

Bun 必须用[官方安装方式](https://bun.sh/docs/installation)安装，使 `bun.exe`（Windows）或 `bun` 位于 `PATH` 中。用 npm 安装的 Bun 只提供 `bun`、`bun.cmd`、`bun.ps1`，包安装后生成的 `dsh-bun` 启动器按名称查找解释器，在上述情况下会报 `bun is not installed in %PATH%`。

已在 Bun 1.4.2 上验证源码运行、构建产物运行、打包安装运行、Web UI 与 headless 任务。仓库声明的下限为 Bun 1.1.0。

### 与 Node.js 的行为差异

- **实时 patch 重载只在 Node 下生效**：`patchReload: live` 的 profile（随附的 `web`）依赖 Node 内部模块加载器支撑 HMR 服务，Bun 不提供该能力。此时 profile 正常启动，但 `cordis.patch.yml` 的编辑在下次启动时才生效，启动时会在 stderr 打印一条提示。
- **不可擦除的 TypeScript 语法**：程序里的 `enum` 等在 Node 的仅剥离模式下是程序失败，在 Bun 的完整转译下可运行；需要跨运行时一致的代码请保持类型语法可擦除。

## 开发者预览

DeepSeek Harness 处于 _开发者预览_ 阶段，正在快速迭代。**未来将出现破坏兼容性的变更。**

运行本项目前，请阅读[安全说明](SAFETY.md)。

<a id="run"></a>

## 运行

### 通过 Bun 运行

#### 1. 从 GitHub Packages 安装（默认渠道）

包发布在 GitHub Packages 上，tag 为 `rc`，同时打有 `latest`。它要求带 token 的认证（公开包也一样），而且 `bunx` 只读用户级 `~/.npmrc`——项目里的 `.npmrc` 或 `bunfig.toml` 对它无效：

```sh
# ~/.npmrc (on Windows: C:\Users\<you>\.npmrc)
@2841649220:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=<YOUR_GITHUB_TOKEN>
```

只配好 registry 还不够：缺少 registry 配置时 `bunx` 会去默认 registry（例如 `registry.npmmirror.com`）找包并返回 404；若 Bun 是 npm 装的，它只提供 `bun`、`bun.cmd`、`bun.ps1`，命令还会报 `bun is not installed in %PATH%`，需要把真实解释器目录加入 `PATH`：

```powershell
$env:PATH = "$env:APPDATA\npm\node_modules\bun\bin;$env:PATH"
```

然后安装并运行：

```sh
export DEEPSEEK_API_KEY="sk-..."
bun add -g @2841649220/dsh_bun
bunx @2841649220/dsh_bun --profile headless "task"
```

`dsh-bun --profile headless "task"` 与 `dsh-bun --profile web` 在全局安装后同样可用。打包脚本默认只声明 `dsh-bun` 一个命令，避免与已发布的 `@deepseek-ai/dsh` 的 `dsh` 互相遮蔽；需要时用 `--with-dsh-bin` 追加。

#### 2. 从 GitHub Release 安装（不经过 registry）

发布包里同时附带打包好的 tarball，可直接安装，无需任何 registry：

```sh
bun add -g https://github.com/2841649220/deepseek-harness-bun/releases/download/v0.1.5-rc.2/2841649220-dsh_bun-0.1.5-rc.2.tgz
dsh-bun --version
```

#### 3. 源码本地调试与开发

安装 [Bun](https://bun.sh/)（v1.1.0 或更高版本），克隆仓库后直接运行源码：

```sh
bun run apps/cli/src/bin.ts --profile headless "task"
bun run apps/cli/src/bin.ts web --no-open --port 3080
```

或者使用 `package.json` 中配置的便捷脚本：

```sh
bun run dsh:bun --profile headless "task"
```

#### 4. 打包并发布

打包脚本把已构建的 CLI 及其依赖解析暂存到 `dist/dsh_bun`：

```sh
pnpm run build          # the stage requires apps/cli/lib to exist
pnpm run package:bun
cd dist/dsh_bun && bun publish --access public
```

可选项：`--name <包名>`、`--out <目录>`、`--registry <registry>`、`--dep-version <范围>`（发布尚未进入 registry 的版本时统一覆盖 `workspace:` 依赖范围）、`--with-dsh-bin`。

<a id="run-from-source"></a>

### 从源码运行（Node.js / pnpm）

如需通过传统的 Node.js 方式运行：

```sh
git clone https://github.com/2841649220/deepseek-harness-bun.git
cd deepseek-harness-bun
pnpm install
pnpm run build
pnpm dsh web
```

`pnpm run build` 会准备仓库产物。`pnpm dsh web` 会直接使用这些已构建产物，不会重新构建。

## 社区与支持

- 通过 [GitHub Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions) 提交反馈或 bug 报告。
- 为你的插件仓库添加 [`dsh-plugin`](https://github.com/topics/dsh-plugin) 话题，便于被发现。
- 欢迎加入官方社区与交流渠道。

## 参与贡献

参见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 开发

请先阅读[开发指南](docs/development.md)与[架构文档](docs/architecture.md)。

面向 agent：请遵循 [AGENTS.md](AGENTS.md)。

## 引用

```bibtex
@misc{deepseek-harness2026,
  title={DeepSeek Harness: Everything is a Plugin},
  author={DeepSeek-AI},
  year={2026},
  publisher={GitHub},
  howpublished={\url{https://github.com/deepseek-ai/deepseek-harness}},
}
```

## 许可证

[MIT](LICENSE)

第三方依赖及其许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
