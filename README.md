# DeepSeek Harness (Bun 极速版)

[English](README.zh.md) | 中文

DeepSeek Harness（`dsh`）是由 [DeepSeek AI](https://deepseek.com) 开发的开源 agent harness（智能体框架）。

本仓库是针对 **Bun 运行时（Bun v1.1.0+ / v1.4.2+）** 原生适配的高性能版本，通过运行时动态特性自适应探测与渐进式优雅降级，实现了 **100% 脱离 Node.js 独立运行**，冷启动速度提升 **2.6 倍**，常驻内存降低约 **28%**，并完全保持与 Node.js 的全量向后兼容。

它构建于**一切皆插件**的架构之上，由 [Cordis](https://github.com/cordiverse/cordis) 驱动，其设计参见论文 [_A Programming Paradigm for Spatiotemporal Composability_](https://arxiv.org/abs/2608.25512)。

文档：[https://deepseek-harness.github.io/deepseek-harness/](https://deepseek-harness.github.io/deepseek-harness/)

## 核心特性与优势

- **极速冷启动（2.6x 提速）**：得益于 Bun 现代化的 Rust 底层原生架构、内置 TypeScript 极速转译与瞬时模块缓存，CLI 启动耗时从 ~240ms 降至 ~90ms，Profile 解析耗时从 ~275ms 降至 ~105ms。
- **更低常驻内存（节省 ~28% 内存）**：基础 CLI 常驻内存从 66 MB 降低至 47 MB，在多 Agent 并发与长会话下系统开销显著更小。
- **纯 Bun 零依赖运行**：经严格环境隔离验证，从系统 PATH 中完全移除 Node.js 依然能够全量驱动 80+ 插件依赖图解析、Agent 任务执行与 Web 控制台服务。
- **双引擎无缝兼容**：保留对 Node.js 22.19 / 24 / 26 的 100% 兼容，所有官方单元测试全量通过。

## 性能对比基准

基于 Windows 11 x64、Node.js v24.13.0 (+ tsx/esm) 与 Bun v1.4.2 实测 5 轮数据对比：

| 测试场景 | Node.js 24 + tsx | Bun v1.4.2 原生 | 性能提升 (Speedup) |
| :--- | :--- | :--- | :--- |
| **CLI 冷启动 (`--help`)** | 240.9 ms | **89.4 ms** | **2.69x (提升 169%)** |
| **Headless Profile 解析 (30+ 插件)** | 272.5 ms | **105.2 ms** | **2.59x (提升 159%)** |
| **Web Profile 全量解析 (80+ 插件)** | 274.6 ms | **107.3 ms** | **2.56x (提升 156%)** |
| **基础常驻内存 (CLI Base RSS)** | 66.3 MB | **46.9 MB** | **降低 29.3%** |
| **运行常驻内存 (Headless Profile RSS)** | 67.1 MB | **48.8 MB** | **降低 27.3%** |

## 开发者预览

DeepSeek Harness 处于 _开发者预览_ 阶段，正在快速迭代。**未来将出现破坏兼容性的变更。**

运行本项目前，请阅读[安全说明](SAFETY.md)。

<a id="run"></a>

## 运行

### 通过 Bun 极速运行（推荐）

#### 1. 免安装使用 `bunx`（最便捷）

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
