/**
 * Prepare a self-contained Bun-first distribution package for publication.
 *
 * The stage reads the compiled `apps/cli` artifacts, points the bin shebang at
 * Bun, resolves every `workspace:` dependency to the registry version of that
 * workspace package, and writes the publication manifest and its README. Every
 * input it needs must exist: a missing build output, an unresolvable workspace
 * dependency, or an absent LICENSE aborts the stage instead of publishing a
 * package that cannot install.
 * @module scripts/prepare-bun-package
 */

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

/** Staging inputs live under this repository; tests pass their own fixture root. */
const repositoryRoot = resolve(import.meta.dirname, '..')

/**
 * Publication name. The unscoped name `dsh-bun` is owned by another publisher
 * on the public registry, so the staged package uses `dsh_bun`, which is free.
 */
const DEFAULT_PACKAGE_NAME = 'dsh_bun'

/** Default staging directory, relative to the repository root. */
const DEFAULT_OUT_DIR = join('dist', 'dsh_bun')

/**
 * Default command names. The stage claims `dsh-bun` only: installing a second
 * `dsh` command would shadow the published `@deepseek-ai/dsh` bin according to
 * PATH order. `--with-dsh-bin` adds that alias explicitly.
 */
const DEFAULT_BIN_NAMES: readonly string[] = ['dsh-bun']

/** Shebang of the staged bin: the staged CLI runs on Bun, not on the Node launcher. */
const BUN_SHEBANG = '/usr/bin/env bun'

/** Repository the published manifest points back to. */
const REPOSITORY_URL = 'git+https://github.com/2841649220/deepseek-harness-bun.git'

/**
 * Upstream packages whose published code aborts under Bun, and which this
 * distribution therefore resolves to a patched fork published under
 * {@link DEFAULT_PATCHED_SCOPE}. The staged manifest keeps the original name as
 * an npm alias, so profile rows and the peer ranges that name them still resolve.
 */
const PATCHED_PACKAGES: readonly string[] = ['@deepseek-ai/dsh-code-runtime-worker-thread']

/** Scope holding the patched forks; override with `--patched-scope`. */
const DEFAULT_PATCHED_SCOPE = '@2841649220'

/** The subset of `apps/cli/package.json` the stage reads. */
interface CliPackageJson {
  name: string
  version: string
  dependencies?: Record<string, string>
}

/** Options accepted by {@link prepareBunPackage}. */
export interface PrepareBunPackageOptions {
  /** Repository root holding `apps/cli` and the workspace manifests. */
  root?: string | undefined
  /** Publication package name; defaults to `dsh_bun`. */
  name?: string | undefined
  /** Output directory, absolute or relative to `root`; defaults to `dist/dsh_bun`. */
  outDir?: string | undefined
  /** Published version; defaults to the CLI manifest version. */
  version?: string | undefined
  /** Version range used for every `workspace:` dependency, for a release the registry does not carry yet. */
  depVersion?: string | undefined
  /** npm registry recorded in `publishConfig`. */
  registry?: string | undefined
  /** Command names mapped to the staged bin; defaults to `dsh-bun`. */
  bins?: readonly string[] | undefined
  /** Scope holding the patched forks; an empty string leaves every dependency on its published upstream package. */
  patchedScope?: string | undefined
  /**
   * Tarball URL holding the patched fork, published as a release asset where
   * the registry serving the distribution needs a credential to download
   * (GitHub Packages does, even for a public package). Takes precedence over
   * {@link PrepareBunPackageOptions.patchedScope}.
   */
  patchedUrl?: string | undefined
}

/**
 * Recursively find all package.json files and map package name to version.
 * @param rootDir - Workspace root path.
 * @returns Map of package name to version.
 */
export function collectWorkspaceVersions(rootDir: string): Map<string, string> {
  const versions = new Map<string, string>()

  function scan(dir: string, depth = 0): void {
    if (depth > 4) return
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'lib') {
        continue
      }
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        scan(fullPath, depth + 1)
      } else if (entry.isFile() && entry.name === 'package.json') {
        try {
          const pkg = JSON.parse(readFileSync(fullPath, 'utf8')) as { name?: string; version?: string }
          if (pkg.name && pkg.version) {
            versions.set(pkg.name, pkg.version)
          }
        } catch {
          // A manifest the scan cannot parse is not a publication input: the
          // dependency pass aborts on any name this map fails to answer.
        }
      }
    }
  }

  for (const subdir of ['packages', 'vendor', 'apps']) {
    const dir = join(rootDir, subdir)
    if (existsSync(dir)) {
      scan(dir, 0)
    }
  }

  return versions
}

/**
 * Drop a leading interpreter line so the stage can install its own.
 * @param source - bin file contents.
 * @returns the contents without a shebang line.
 */
function withoutShebang(source: string): string {
  if (!source.startsWith('#!')) return source
  const breakIndex = source.indexOf('\n')
  return breakIndex === -1 ? '' : source.slice(breakIndex + 1)
}

/**
 * Resolve the publication dependency map, replacing `workspace:` specs with registry ranges.
 * @param dependencies - the CLI manifest dependency map.
 * @param workspaceVersions - discovered workspace package versions.
 * @param depVersion - explicit range overriding every discovered workspace version.
 * @returns the publication dependency map.
 * @throws when a `workspace:` dependency has neither a workspace version nor an explicit range.
 */
export function publicationDependencies(
  dependencies: Record<string, string>,
  workspaceVersions: Map<string, string>,
  depVersion: string | undefined,
): Record<string, string> {
  const resolved: Record<string, string> = {}
  const unresolved: string[] = []
  for (const [dep, spec] of Object.entries(dependencies)) {
    if (!spec.startsWith('workspace:')) {
      resolved[dep] = spec
      continue
    }
    if (depVersion !== undefined) {
      resolved[dep] = depVersion
      continue
    }
    const version = workspaceVersions.get(dep)
    if (version === undefined) {
      unresolved.push(dep)
      continue
    }
    resolved[dep] = `^${version}`
  }
  if (unresolved.length > 0) {
    throw new Error(
      'prepare-bun-package: no workspace version for '
      + unresolved.join(', ')
      + '; pass --dep-version <range> to publish against a version that is not in this workspace',
    )
  }
  return resolved
}

/**
 * Stage the Bun distribution package into the target directory.
 * @param options - package name, staging directory, version, dependency override, registry, and bins.
 * @returns the staging directory, package name, version, and bin names.
 * @throws when the CLI build output, a workspace dependency version, or the repository LICENSE is missing.
 */
export function prepareBunPackage(options: PrepareBunPackageOptions = {}): {
  outDir: string
  packageName: string
  version: string
  bins: readonly string[]
} {
  const root = options.root ?? repositoryRoot
  const cliPkg = JSON.parse(readFileSync(resolve(root, 'apps/cli/package.json'), 'utf8')) as CliPackageJson

  const packageName = options.name ?? DEFAULT_PACKAGE_NAME
  const version = options.version ?? cliPkg.version
  const bins = options.bins ?? DEFAULT_BIN_NAMES
  if (bins.length === 0) throw new Error('prepare-bun-package: the publication package needs at least one bin name')
  const outDir = resolve(root, options.outDir ?? DEFAULT_OUT_DIR)

  console.log(`prepare-bun-package: staging ${packageName}@${version} into ${outDir}...`)

  // 1. Clean and prepare the output directory.
  if (existsSync(outDir)) {
    rmSync(outDir, { recursive: true, force: true })
  }
  mkdirSync(outDir, { recursive: true })

  // 2. Copy the compiled CLI artifacts.
  const cliLibDir = resolve(root, 'apps/cli/lib')
  if (!existsSync(cliLibDir)) {
    throw new Error('prepare-bun-package: apps/cli/lib not found. Run "pnpm run build" before preparing the Bun package.')
  }
  cpSync(cliLibDir, join(outDir, 'lib'), { recursive: true })

  // 3. Point the bin at Bun. The compiled bin carries the Node launcher's
  // shebang, and an artifact with no interpreter line at all is repairable here
  // rather than published as a file no shell can execute.
  const binPath = join(outDir, 'lib/bin.js')
  if (!existsSync(binPath)) {
    throw new Error(`prepare-bun-package: ${binPath} is missing; the CLI build must emit the bin its manifest references`)
  }
  writeFileSync(binPath, `#!${BUN_SHEBANG}\n${withoutShebang(readFileSync(binPath, 'utf8'))}`, 'utf8')

  // 4. Resolve workspace dependencies to published versions.
  const workspaceVersions = collectWorkspaceVersions(root)
  console.log(`prepare-bun-package: discovered ${workspaceVersions.size} workspace package versions`)
  const dependencies = publicationDependencies(cliPkg.dependencies ?? {}, workspaceVersions, options.depVersion)

  // 4b. Point the packages whose published code cannot run under Bun at this
  // distribution's patched forks. The range stays the upstream one: the fork
  // carries the same version, so the alias satisfies every dependent's range.
  const patchedScope = options.patchedScope ?? DEFAULT_PATCHED_SCOPE
  const patched: string[] = []
  if (options.patchedUrl !== undefined || patchedScope !== '') {
    for (const name of PATCHED_PACKAGES) {
      const version0 = workspaceVersions.get(name)
      if (version0 === undefined) {
        throw new Error(`prepare-bun-package: patched package ${name} has no workspace version to alias against`)
      }
      // A tarball URL is a complete spec on its own; only the registry form
      // needs the npm-alias prefix that keeps the original name resolvable.
      const replacement = options.patchedUrl
        ?? `npm:${patchedScope}/${name.slice(name.indexOf('/') + 1)}@^${version0}`
      dependencies[name] = replacement
      patched.push(`${name} -> ${replacement}`)
    }
    console.log(`prepare-bun-package: aliased ${patched.length} patched package(s)`)
    for (const line of patched) console.log(`  ${line}`)
  }

  // 5. Construct the publication manifest. The CLI's `dsh.configTrees` entry is not
  // carried over: it points at a sibling package inside this repository, which
  // the installed package does not contain.
  const pubPkg: Record<string, unknown> = {
    name: packageName,
    version,
    description: 'DeepSeek Harness CLI - Bun-first distribution of the dsh command',
    type: 'module',
    bin: Object.fromEntries(bins.map(bin => [bin, 'lib/bin.js'])),
    files: [
      'lib/*.js',
      'README.md',
      'LICENSE',
    ],
    engines: {
      bun: '>=1.1.0',
      node: '^22.19.0 || >=24.0.0',
    },
    publishConfig: {
      access: 'public',
      ...(options.registry ? { registry: options.registry } : {}),
    },
    repository: {
      type: 'git',
      url: REPOSITORY_URL,
    },
    license: 'MIT',
    keywords: [
      'deepseek',
      'agent',
      'harness',
      'bun',
      'ai',
      'llm',
    ],
    dependencies,
  }

  writeFileSync(join(outDir, 'package.json'), `${JSON.stringify(pubPkg, null, 2)}\n`, 'utf8')

  // 6. Write the packaged README.
  const commands = bins
    .map(bin => `${bin} --profile headless "Analyze the current workspace"`)
    .join('\n')
  const bunReadme = `# ${packageName}

DeepSeek Harness (\`dsh\`) CLI distribution for the **[Bun](https://bun.sh/)** runtime.

## Requirements

Bun 1.1.0 or newer, installed with the official installer so that \`bun.exe\` resolves on \`PATH\`.
The generated launchers look the interpreter up by name; an npm-installed Bun, which exposes only
\`bun\`, \`bun.cmd\`, and \`bun.ps1\`, is not found on Windows.

## Quick Start with Bun

### 1. Direct execution with \`bunx\`

No installation required:

\`\`\`bash
export DEEPSEEK_API_KEY="sk-..."
bunx ${packageName} --profile headless "Analyze the current workspace"
\`\`\`

### 2. Global installation

Install globally via Bun:

\`\`\`bash
bun add -g ${packageName}
\`\`\`

Once installed, the staged commands are available in your PATH:

\`\`\`bash
export DEEPSEEK_API_KEY="sk-..."

${commands}
\`\`\`

## Configuration and environment

- \`DEEPSEEK_API_KEY\`: (Required) Your DeepSeek API key.
- \`DEEPSEEK_BASE_URL\`: (Optional) Custom DeepSeek API endpoint or proxy.

## Profiles

- \`--profile headless\`: Headless autonomous agent mode.
- \`--profile web\`: Browser UI.
- \`--profile acp\`: Agent Client Protocol server mode.
- \`--profile sdk\`: JSON-RPC SDK server mode.

A profile declared \`patchReload: live\` (the shipped \`web\` profile) applies edits to its
\`cordis.patch.yml\` immediately only on Node, whose internal module loader backs the HMR service.
Under Bun those edits apply on the next boot.

## License

MIT License. DeepSeek Harness is an open-source project by DeepSeek AI.
`
  writeFileSync(join(outDir, 'README.md'), bunReadme, 'utf8')

  // 7. Copy the repository LICENSE.
  const licensePath = resolve(root, 'LICENSE')
  if (!existsSync(licensePath)) {
    throw new Error(`prepare-bun-package: ${licensePath} not found; the publication claims MIT and must ship its text`)
  }
  cpSync(licensePath, join(outDir, 'LICENSE'))

  console.log(`prepare-bun-package: successfully prepared ${packageName}@${version} in ${outDir}`)
  return { outDir, packageName, version, bins }
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      name: { type: 'string' },
      out: { type: 'string' },
      version: { type: 'string' },
      'dep-version': { type: 'string' },
      registry: { type: 'string' },
      bin: { type: 'string', multiple: true },
      'with-dsh-bin': { type: 'boolean' },
      'patched-scope': { type: 'string' },
      'patched-url': { type: 'string' },
    },
    allowPositionals: false,
  })

  const bins = [...values.bin ?? DEFAULT_BIN_NAMES]
  if (values['with-dsh-bin'] === true && !bins.includes('dsh')) bins.push('dsh')

  const res = prepareBunPackage({
    name: values.name,
    outDir: values.out,
    version: values.version,
    depVersion: values['dep-version'],
    registry: values.registry,
    bins,
    patchedScope: values['patched-scope'],
    patchedUrl: values['patched-url'],
  })

  console.log('\nReady to publish or test:')
  console.log(`  1. Local test: bun add -g ${res.outDir}`)
  console.log(`  2. Publish:    cd ${res.outDir} && bun publish --access public`)
}
