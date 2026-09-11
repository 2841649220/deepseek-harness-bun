/**
 * Stage one workspace package as a scoped patched fork for publication.
 *
 * The Bun distribution resolves a few upstream packages to patched forks
 * (`PATCHED_PACKAGES` in `prepare-bun-package.ts`), because their published
 * code cannot run under Bun. A fork keeps the upstream version and public
 * entry points, so the npm alias that names it satisfies every dependent's
 * range and every profile row still resolves.
 * @module scripts/prepare-patched-package
 */

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { collectWorkspaceVersions, publicationDependencies } from './prepare-bun-package.ts'

/** Staging inputs live under this repository; tests pass their own fixture root. */
const repositoryRoot = resolve(import.meta.dirname, '..')

/** Upstream manifest fields a fork keeps verbatim. */
interface ForkSourceManifest {
  name: string
  version: string
  description?: string
  type?: string
  main?: string
  types?: string
  exports?: Record<string, unknown>
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  peerDependenciesMeta?: Record<string, { optional?: boolean }>
  license?: string
}

/** Options accepted by {@link preparePatchedPackage}. */
export interface PreparePatchedPackageOptions {
  /** Repository root holding the workspace manifests. */
  root?: string | undefined
  /** Workspace package name to fork, for example `@deepseek-ai/dsh-code-runtime-worker-thread`. */
  packageName: string
  /** Scoped publication name for the fork. */
  name: string
  /** Output directory, absolute or relative to `root`. */
  outDir: string
  /** Repository the fork manifest points back to; defaults to this checkout. */
  repositoryUrl?: string | undefined
  /** npm registry recorded in `publishConfig`. */
  registry?: string | undefined
}

/**
 * Stage one workspace package as a scoped fork.
 * @param options - the workspace package, the fork name, the staging directory, and the registry.
 * @returns the staging directory and the published name and version.
 * @throws when the workspace package, its built output, or its manifest is missing.
 */
export function preparePatchedPackage(options: PreparePatchedPackageOptions): {
  outDir: string
  packageName: string
  version: string
} {
  const root = options.root ?? repositoryRoot
  const versions = collectWorkspaceVersions(root)
  const version = versions.get(options.packageName)
  if (version === undefined) {
    throw new Error(`prepare-patched-package: ${options.packageName} is not a workspace package`)
  }
  const source = findPackageDir(root, options.packageName)
  if (source === undefined) {
    throw new Error(`prepare-patched-package: no directory under packages/vendor/apps declares ${options.packageName}`)
  }
  const manifest = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8')) as ForkSourceManifest
  const libDir = join(source, 'lib')
  if (!existsSync(libDir)) {
    throw new Error(`prepare-patched-package: ${libDir} is missing; run "pnpm run build" before staging a fork`)
  }

  const outDir = resolve(root, options.outDir)
  if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true })
  mkdirSync(outDir, { recursive: true })
  cpSync(libDir, join(outDir, 'lib'), { recursive: true })

  // A fork ships the same version and entry points, so the npm alias that names
  // it satisfies the range every dependent declares.
  const forked: Record<string, unknown> = {
    name: options.name,
    version,
    ...(manifest.description !== undefined ? { description: manifest.description } : {}),
    ...(manifest.type !== undefined ? { type: manifest.type } : {}),
    ...(manifest.main !== undefined ? { main: manifest.main } : {}),
    ...(manifest.types !== undefined ? { types: manifest.types } : {}),
    ...(manifest.exports !== undefined ? { exports: manifest.exports } : {}),
    files: ['lib', 'README.md', 'LICENSE'],
    ...(manifest.peerDependencies === undefined
      ? {}
      : { peerDependencies: publicationDependencies(manifest.peerDependencies, versions, undefined) }),
    ...(manifest.peerDependenciesMeta !== undefined ? { peerDependenciesMeta: manifest.peerDependenciesMeta } : {}),
    license: manifest.license ?? 'MIT',
    publishConfig: {
      access: 'public',
      ...(options.registry ? { registry: options.registry } : {}),
    },
    repository: { type: 'git', url: options.repositoryUrl ?? 'git+https://github.com/2841649220/deepseek-harness-bun.git' },
    dependencies: publicationDependencies(manifest.dependencies ?? {}, versions, undefined),
  }
  writeFileSync(join(outDir, 'package.json'), `${JSON.stringify(forked, null, 2)}\n`, 'utf8')

  const readme = join(source, 'README.md')
  const upstream = existsSync(readme) ? readFileSync(readme, 'utf8') : ''
  const header = `# ${options.name} (patched fork)\n\nStaged from the ${options.packageName} sources in this repository.\n`
  writeFileSync(join(outDir, 'README.md'), upstream === '' ? header : `${header}\n${upstream}`, 'utf8')
  const license = join(root, 'LICENSE')
  if (existsSync(license)) cpSync(license, join(outDir, 'LICENSE'))

  console.log(`prepare-patched-package: staged ${options.name}@${version} from ${options.packageName} into ${outDir}`)
  return { outDir, packageName: options.name, version }
}

/**
 * Locate the directory of one workspace package.
 * @param root - repository root.
 * @param packageName - package name to find.
 * @returns the package directory, or undefined when no scanned manifest declares it.
 */
function findPackageDir(root: string, packageName: string): string | undefined {
  const matches = collectPackageJsons(root)
  for (const path of matches) {
    try {
      const manifest = JSON.parse(readFileSync(path, 'utf8')) as { name?: string }
      if (manifest.name === packageName) return resolve(path, '..')
    } catch {
      // An unparseable manifest is not the package being forked; the caller
      // reports a missing directory when nothing else declares the name.
    }
  }
  return undefined
}

/**
 * List the manifests the workspace scan considers, excluding build and install trees.
 * @param root - repository root.
 * @returns absolute manifest paths.
 */
function collectPackageJsons(root: string): string[] {
  const found: string[] = []
  const walk = (dir: string, depth: number): void => {
    if (depth > 3 || !existsSync(dir)) return
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.') || entry.name === 'lib' || entry.name === 'dist') continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full, depth + 1)
      else if (entry.name === 'package.json') found.push(full)
    }
  }
  for (const sub of ['packages', 'vendor', 'apps']) walk(join(root, sub), 0)
  return found
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      package: { type: 'string' },
      name: { type: 'string' },
      out: { type: 'string' },
      registry: { type: 'string' },
      'repository-url': { type: 'string' },
    },
    allowPositionals: false,
  })
  if (values.package === undefined || values.name === undefined) {
    throw new Error('prepare-patched-package: --package <workspace name> and --name <scoped fork name> are required')
  }
  const out = values.out ?? join('dist', basename(values.name))
  const staged = preparePatchedPackage({
    packageName: values.package,
    name: values.name,
    outDir: out,
    registry: values.registry,
    repositoryUrl: values['repository-url'],
  })
  console.log(`\nPublish: cd ${staged.outDir} && npm publish --tag latest`)
}
