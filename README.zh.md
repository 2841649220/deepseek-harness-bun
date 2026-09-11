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

#### 1. Install from a GitHub Release (recommended, no configuration)

The `dsh_bun-0.1.5-rc.2.tgz` asset on the releases page is the complete distributable, and downloading it needs **no account and no token**. Bun fetches the patched dependency from the URL the package declares:

```sh
bun add -g https://github.com/2841649220/deepseek-harness-bun/releases/download/v0.1.5-rc.2/dsh_bun-0.1.5-rc.2.tgz
dsh-bun --version
```

This is the preferred way to hand the build to someone else: one command, no GitHub account, no `~/.npmrc`.

#### 2. Install from GitHub Packages (needs a token)

The package is also published to GitHub Packages under the `rc` tag, and carries `latest` as well. It requires token authentication **even though it is public**, and `bunx` reads only the user-level `~/.npmrc` — a project `.npmrc` or `bunfig.toml` has no effect on it:

```sh
# ~/.npmrc (on Windows: C:\Users\<you>\.npmrc)
@2841649220:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=<YOUR_GITHUB_TOKEN>
```

The registry entry alone is not enough. Without it `bunx` looks in the default registry (for example `registry.npmmirror.com`) and returns 404, and an npm-installed Bun exposes only `bun`, `bun.cmd`, and `bun.ps1`, so the command also reports `bun is not installed in %PATH%`; put the real interpreter directory on `PATH`:

```powershell
$env:PATH = "$env:APPDATA\npm\node_modules\bun\bin;$env:PATH"
```

Then install and run it:

```sh
export DEEPSEEK_API_KEY="sk-..."
bun add -g @2841649220/dsh_bun
bunx @2841649220/dsh_bun --profile headless "task"
```

Either install provides three commands that all drive the same CLI: `dsh`, `dsh-bun`, and `dsh_bun` (`dsh_bun` is the package name and is easy to mistake for the command; all three work):

```sh
dsh web
dsh-bun web
dsh_bun web
```

`bunx @2841649220/dsh_bun` needs a profile argument, or the CLI reports `--profile <name> is required`; use `bunx @2841649220/dsh_bun web` to open the Web UI directly.

#### What the package resolves

The published package resolves `@deepseek-ai/dsh-code-runtime-worker-thread` to the patched fork `@2841649220/dsh-code-runtime-worker-thread`, because the upstream release aborts during module evaluation under Bun. The alias lives in package metadata only, so profile configuration and dependency ranges are unchanged. A GitHub Packages install points it at the package in that scope; a release install points it at the patched tarball asset (`--patched-url`), which is why the release route needs no registry credential at all. A build that wants the upstream package passes `--patched-scope ''`.

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
