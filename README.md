# DeepSeek Harness (Bun 支持)

[English](README.zh.md) | 中文

DeepSeek Harness（`dsh`）是由 [DeepSeek AI](https://deepseek.com) 开发的开源 agent harness（智能体框架）。

本仓库是在官方版本基础上，增加了对 **Bun 运行时** 的兼容支持，允许直接使用 Bun 执行 CLI 命令，并提供将 CLI 打包发布为 Bun 全局包的脚本工具。

它构建于**一切皆插件**的架构之上，由 [Cordis](https://github.com/cordiverse/cordis) 驱动，其设计参见论文 [_A Programming Paradigm for Spatiotemporal Composability_](https://arxiv.org/abs/2608.25512)。

文档：[https://deepseek-harness.github.io/deepseek-harness/](https://deepseek-harness.github.io/deepseek-harness/)

## 本仓库新增特性

- **支持 Bun 运行时直接执行**：支持使用 Bun 直接运行 CLI 源码与内置 Profile。
- **提供 Bun 打包流水线**：提供 `pnpm run package:bun` 脚本，自动处理工作区依赖并注入 Bun Shebang，便于通过 `bun add -g` 或 `bunx` 分发。
- **跨平台修复**：修复了 Windows 环境下的符号链接兼容性及配置检查问题。
- **保持 Node.js 兼容**：保留对原有 Node.js / pnpm 工作流的完整兼容。

## 开发者预览

DeepSeek Harness 处于 _开发者预览_ 阶段，正在快速迭代。**未来将出现破坏兼容性的变更。**

运行本项目前，请阅读[安全说明](SAFETY.md)。

<a id="run"></a>

## 运行

### 通过 Bun 运行

#### 1. 免安装使用 `bunx`

无需克隆代码或全局安装，直接通过 `bunx` 唤起：

```sh
export DEEPSEEK_API_KEY="sk-..."
bunx dsh-bun --profile headless "task"
```

#### 2. 全局安装为命令行工具

通过 Bun 全局安装 `dsh-bun`：

```sh
bun add -g dsh-bun
```

安装后，`dsh` 与 `dsh-bun` 两个可执行命令均可直接调用：

```sh
export DEEPSEEK_API_KEY="sk-..."
dsh --profile headless "task"
dsh --profile web
```

#### 3. 源码本地调试与开发

安装 [Bun](https://bun.sh/)（v1.1.0 或更高版本），克隆仓库后直接运行源码：

```sh
bun run apps/cli/src/bin.ts --profile headless "task"
bun run apps/cli/src/bin.ts --profile web-clean --port 3080
```

或者使用 `package.json` 中配置的便捷脚本：

```sh
bun run dsh:bun --profile headless "task"
```

#### 4. 打包并发布为 Bun 原生包

运行自动化打包流水线，将 CLI 连同其依赖解析打包至 `dist/dsh-bun`：

```sh
pnpm run package:bun
cd dist/dsh-bun && bun publish --access public
```

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
