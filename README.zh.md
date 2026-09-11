# DeepSeek Harness (Bun Support)

English | [中文](README.md)

DeepSeek Harness (`dsh`) is an open-source agent harness developed by [DeepSeek AI](https://deepseek.com).

This repository adds compatibility support for the **Bun runtime** on top of the official release, allowing the CLI to run directly with Bun and providing tools to package and publish it as a Bun-compatible package.

It is built on an **everything-is-a-plugin** architecture and powered by [Cordis](https://github.com/cordiverse/cordis), whose design is described in [_A Programming Paradigm for Spatiotemporal Composability_](https://arxiv.org/abs/2608.25512).

Documentation: [https://deepseek-harness.github.io/deepseek-harness/](https://deepseek-harness.github.io/deepseek-harness/)

## Additions in this Repository

- **Direct execution with Bun**: Run the CLI source and built-in profiles directly using Bun.
- **Bun packaging pipeline**: Includes a `pnpm run package:bun` script to resolve workspace dependencies and inject the Bun shebang for distribution via `bun add -g` or `bunx`.
- **Cross-platform fixes**: Resolved Windows symlink and config verification issues.
- **Node.js compatibility preserved**: Full compatibility with the existing Node.js and pnpm workflows is retained.

## Developer preview

DeepSeek Harness is in _developer preview_ and iterating rapidly. **THERE WILL BE COMPATIBILITY-BREAKING CHANGES.**

Review the [safety notice](SAFETY.zh.md) before running the project.

<a id="run"></a>

## Run

### Run with Bun

#### 1. Instant execution with `bunx`

Run directly with `bunx`:

```sh
export DEEPSEEK_API_KEY="sk-..."
bunx dsh-bun --profile headless "task"
```

#### 2. Global CLI installation

Install `dsh-bun` globally via Bun:

```sh
bun add -g dsh-bun
```

After installation, both `dsh` and `dsh-bun` commands are available in PATH:

```sh
export DEEPSEEK_API_KEY="sk-..."
dsh --profile headless "task"
dsh --profile web
```

#### 3. Run directly from source

Install [Bun](https://bun.sh/) (v1.1.0 or higher), clone the repository and run directly:

```sh
bun run apps/cli/src/bin.ts --profile headless "task"
bun run apps/cli/src/bin.ts --profile web-clean --port 3080
```

Or using the configured npm script in `package.json`:

```sh
bun run dsh:bun --profile headless "task"
```

#### 4. Package and publish for Bun

Stage the compiled CLI and resolve workspace dependencies into `dist/dsh-bun`:

```sh
pnpm run package:bun
cd dist/dsh-bun && bun publish --access public
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
