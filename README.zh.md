# DeepSeek Harness (Bun Edition)

English | [中文](README.md)

DeepSeek Harness (`dsh`) is an open-source agent harness developed by [DeepSeek AI](https://deepseek.com).

This repository is a high-performance edition natively adapted for the **Bun runtime (Bun v1.1.0+ / v1.4.2+)**. Through runtime capability detection and graceful degradation, it achieves **100% independent execution without Node.js**, a **2.6x faster** cold startup latency, ~**28% lower** baseline memory usage, while retaining full backward compatibility with Node.js.

It is built on an **everything-is-a-plugin** architecture and powered by [Cordis](https://github.com/cordiverse/cordis), whose design is described in [_A Programming Paradigm for Spatiotemporal Composability_](https://arxiv.org/abs/2608.25512).

Documentation: [https://deepseek-harness.github.io/deepseek-harness/](https://deepseek-harness.github.io/deepseek-harness/)

## Core Features & Highlights

- **Blazing Fast Cold Startup (2.6x Speedup)**: With Bun's native Zig/C++ TypeScript transpilation and instant module cache, CLI startup latency dropped from ~240ms to ~90ms, and Profile resolution latency dropped from ~275ms to ~105ms.
- **Lower Memory Footprint (~28% Saved)**: Baseline CLI memory dropped from 66 MB RSS to 47 MB RSS, reducing system overhead in concurrent multi-agent tasks and long sessions.
- **Pure Bun Zero-Dependency Execution**: Verified by physical environment isolation—completely removing Node.js from PATH still seamlessly runs 80+ plugins, agent tasks, and Web console services.
- **Dual-Engine Seamless Compatibility**: 100% compatibility with Node.js 22.19 / 24 / 26 is preserved, passing all official unit tests.

## Performance Benchmarks

Measured on Windows 11 x64, Node.js v24.13.0 (+ tsx/esm) vs Bun v1.4.2 over 5 benchmark rounds:

| Test Scenario | Node.js 24 + tsx | Bun v1.4.2 Native | Speedup |
| :--- | :--- | :--- | :--- |
| **CLI Cold Startup (`--help`)** | 240.9 ms | **89.4 ms** | **2.69x (169% faster)** |
| **Headless Profile Resolution (30+ plugins)** | 272.5 ms | **105.2 ms** | **2.59x (159% faster)** |
| **Web Profile Resolution (80+ plugins)** | 274.6 ms | **107.3 ms** | **2.56x (156% faster)** |
| **Baseline Memory (CLI Base RSS)** | 66.3 MB | **46.9 MB** | **29.3% lower** |
| **Active Memory (Headless Profile RSS)** | 67.1 MB | **48.8 MB** | **27.3% lower** |

## Developer preview

DeepSeek Harness is in _developer preview_ and iterating rapidly. **THERE WILL BE COMPATIBILITY-BREAKING CHANGES.**

Review the [safety notice](SAFETY.zh.md) before running the project.

<a id="run"></a>

## Run

### Run with Bun (Recommended)

Install [Bun](https://bun.sh/) (v1.1.0 or higher), then run directly:

```sh
bun run apps/cli/src/bin.ts --profile headless "task"
bun run apps/cli/src/bin.ts --profile web-clean --port 3080
```

Or using the configured npm script in `package.json`:

```sh
bun run dsh:bun --profile headless "task"
```

<a id="run-from-source"></a>

### Run from source (Node.js / pnpm)

To run via traditional Node.js:

```sh
git clone https://github.com/2841649220/deepseek-harness-bun.git
cd deepseek-harness-bun
pnpm install
pnpm run build
pnpm dsh web
```

`pnpm run build` prepares the repository artifacts. `pnpm dsh web` uses those built artifacts without rebuilding.

## Community and support

- Submit feedback or bug reports through [GitHub Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions).
- Add the [`dsh-plugin`](https://github.com/topics/dsh-plugin) topic to your plugin repository for discoverability.
- Join the official community and discussions.

## Contributing

See [CONTRIBUTING.zh.md](CONTRIBUTING.zh.md).

## Development

Start with the [development guide](docs/development.zh.md) and [architecture documentation](docs/architecture.zh.md).

For agents, follow [AGENTS.md](AGENTS.md).

## Citation

```bibtex
@misc{deepseek-harness2026,
  title={DeepSeek Harness: Everything is a Plugin},
  author={DeepSeek-AI},
  year={2026},
  publisher={GitHub},
  howpublished={\url{https://github.com/deepseek-ai/deepseek-harness}},
}
```

## License

[MIT](LICENSE)

Third-party dependencies and their licenses are disclosed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
