# DeepSeek Harness (Bun Support)

English | [中文](README.md)

DeepSeek Harness (`dsh`) is an open-source agent harness developed by [DeepSeek AI](https://deepseek.com).

This repository adds compatibility support for the **Bun runtime** on top of the official release, allowing the CLI to run directly with Bun and providing tools to package and publish it as a Bun-compatible package.

It is built on an **everything-is-a-plugin** architecture and powered by [Cordis](https://github.com/cordiverse/cordis), whose design is described in [_A Programming Paradigm for Spatiotemporal Composability_](https://arxiv.org/abs/2608.25512).

Documentation: [https://deepseek-harness.github.io/deepseek-harness/](https://deepseek-harness.github.io/deepseek-harness/)

## Additions in this Repository

- **Direct execution with Bun**: Run the CLI source and built-in profiles directly using Bun.
- **Bun packaging pipeline**: `pnpm run package:bun` resolves the workspace dependency versions, injects the Bun shebang, and stages a publishable `dsh_bun` package.
- **Cross-platform fixes**: Resolved Windows symlink and config verification issues.
- **Node.js compatibility preserved**: Full compatibility with the existing Node.js and pnpm workflows is retained.

## Before Running on Bun

Install Bun with the [official installer](https://bun.sh/docs/installation) so that `bun.exe` (Windows) or `bun` resolves on `PATH`. An npm-installed Bun exposes only `bun`, `bun.cmd`, and `bun.ps1`, and the `dsh-bun` launcher generated at install time looks the interpreter up by name — it reports `bun is not installed in %PATH%` otherwise.

Source execution, the built artifacts, an installed staged package, the Web UI, and a headless task were each verified on Bun 1.4.2. The repository declares Bun 1.1.0 as its floor.

### Differences from Node.js

- **Live patch reload works only on Node**: a `patchReload: live` profile (the shipped `web` profile) needs Node's internal module loader to back the HMR service, which Bun does not expose. The profile still boots, but `cordis.patch.yml` edits land on the next boot, and boot prints one notice on stderr.
- **Non-erasable TypeScript syntax**: `enum` and its kin are a program failure under Node's strip-only mode and run under Bun's full transform; keep type syntax erasable for code that must behave the same on both.

## Developer preview

DeepSeek Harness is in _developer preview_ and iterating rapidly. **THERE WILL BE COMPATIBILITY-BREAKING CHANGES.**

Review the [safety notice](SAFETY.zh.md) before running the project.

<a id="run"></a>

## Run

### Run with Bun

#### 1. Instant execution with `bunx`

The staged package is published as `dsh_bun` (underscore; the hyphenated unscoped name belongs to another publisher):

```sh
export DEEPSEEK_API_KEY="sk-..."
bunx dsh_bun --profile headless "task"
```

#### 2. Global CLI installation

Install globally via Bun:

```sh
bun add -g dsh_bun
```

The staged package declares the `dsh-bun` command by default. It does not claim `dsh`, which would shadow the published `@deepseek-ai/dsh` command according to PATH order; pass `--with-dsh-bin` at staging time to add that alias:

```sh
export DEEPSEEK_API_KEY="sk-..."
dsh-bun --profile headless "task"
dsh-bun --profile web
```

#### 3. Run directly from source

Install [Bun](https://bun.sh/) (v1.1.0 or higher), clone the repository and run directly:

```sh
bun run apps/cli/src/bin.ts --profile headless "task"
bun run apps/cli/src/bin.ts web --no-open --port 3080
```

Or using the configured npm script in `package.json`:

```sh
bun run dsh:bun --profile headless "task"
```

#### 4. Package and publish

The stage copies the built CLI and resolves its dependencies into `dist/dsh_bun`:

```sh
pnpm run build          # the stage requires apps/cli/lib to exist
pnpm run package:bun
cd dist/dsh_bun && bun publish --access public
```

Other flags: `--name <package>`, `--out <dir>`, `--registry <registry>`, `--dep-version <range>` (override every `workspace:` range when publishing against a version the registry does not carry yet), and `--with-dsh-bin`.

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
