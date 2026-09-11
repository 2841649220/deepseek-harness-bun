/** Staging contract of the scoped patched-fork packager. */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { preparePatchedPackage } from './prepare-patched-package.ts'

/** Fixture repositories this spec created, removed after every test. */
const roots: string[] = []

/** Inputs of {@link fixture}. */
interface FixtureOptions {
  name?: string
  version?: string
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  lib?: boolean
  readme?: boolean
  brokenManifest?: boolean
}

/** Write one JSON manifest with the repository's trailing-newline convention. */
function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', 'utf8')
}

/** Materialize a repository holding one workspace package the fork stage can read. */
function fixture(options: FixtureOptions = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-fork-'))
  roots.push(root)
  const dir = join(root, 'packages', 'code-runtime', 'target')
  mkdirSync(dir, { recursive: true })
  writeJson(join(dir, 'package.json'), {
    name: options.name ?? '@deepseek-ai/dsh-target',
    version: options.version ?? '1.2.3',
    description: 'target package',
    type: 'module',
    main: 'lib/index.js',
    types: 'lib/types/index.d.ts',
    exports: { '.': { default: './lib/index.js' } },
    dependencies: options.dependencies ?? { '@deepseek-ai/dsh-util-values': 'workspace:^' },
    peerDependencies: options.peerDependencies ?? { '@deepseek-ai/cordis': 'workspace:^' },
  })
  mkdirSync(join(root, 'packages', 'util', 'values'), { recursive: true })
  writeJson(join(root, 'packages', 'util', 'values', 'package.json'), { name: '@deepseek-ai/dsh-util-values', version: '9.9.9' })
  mkdirSync(join(root, 'vendor', 'cordis'), { recursive: true })
  writeJson(join(root, 'vendor', 'cordis', 'package.json'), { name: '@deepseek-ai/cordis', version: '4.0.2' })
  if (options.lib !== false) {
    mkdirSync(join(dir, 'lib'), { recursive: true })
    writeFileSync(join(dir, 'lib', 'index.js'), 'export const value = 1\n', 'utf8')
  }
  if (options.readme !== false) writeFileSync(join(dir, 'README.md'), '# target\n', 'utf8')
  if (options.brokenManifest === true) {
    const broken = join(root, 'packages', 'group', 'broken')
    mkdirSync(broken, { recursive: true })
    writeFileSync(join(broken, 'package.json'), '{ not json', 'utf8')
  }
  writeFileSync(join(root, 'LICENSE'), 'MIT\n', 'utf8')
  return root
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('patched fork staging', () => {
  it('stages the fork under its scoped name at the upstream version', () => {
    const root = fixture()

    const staged = preparePatchedPackage({
      root,
      packageName: '@deepseek-ai/dsh-target',
      name: '@example/dsh-target',
      outDir: 'dist/fork',
    })

    expect(staged.packageName).toBe('@example/dsh-target')
    expect(staged.version).toBe('1.2.3')
    const manifest = JSON.parse(readFileSync(join(staged.outDir, 'package.json'), 'utf8')) as Record<string, unknown>
    expect(manifest).toMatchObject({
      name: '@example/dsh-target',
      version: '1.2.3',
      type: 'module',
      main: 'lib/index.js',
      license: 'MIT',
      publishConfig: { access: 'public' },
      dependencies: { '@deepseek-ai/dsh-util-values': '^9.9.9' },
      peerDependencies: { '@deepseek-ai/cordis': '^4.0.2' },
    })
    expect(readFileSync(join(staged.outDir, 'lib', 'index.js'), 'utf8')).toBe('export const value = 1\n')
    expect(readFileSync(join(staged.outDir, 'README.md'), 'utf8')).toContain('(patched fork)')
    expect(existsSync(join(staged.outDir, 'LICENSE'))).toBe(true)
  })

  it('records the requested registry and omits peer dependencies the source lacks', () => {
    const root = fixture({ peerDependencies: {} })

    const staged = preparePatchedPackage({
      root,
      packageName: '@deepseek-ai/dsh-target',
      name: '@example/dsh-target',
      outDir: 'dist/fork',
      registry: 'https://npm.pkg.github.com',
    })

    const manifest = JSON.parse(readFileSync(join(staged.outDir, 'package.json'), 'utf8')) as Record<string, unknown>
    expect(manifest['publishConfig']).toEqual({ access: 'public', registry: 'https://npm.pkg.github.com' })
    expect(manifest['peerDependencies']).toEqual({})
  })

  it('stages a fork of a package that ships no README', () => {
    const root = fixture({ readme: false })

    const staged = preparePatchedPackage({
      root,
      packageName: '@deepseek-ai/dsh-target',
      name: '@example/dsh-target',
      outDir: 'dist/fork',
    })

    expect(readFileSync(join(staged.outDir, 'README.md'), 'utf8')).toContain('(patched fork)')
  })

  it('refuses a package the workspace does not declare', () => {
    const root = fixture()

    expect(() => preparePatchedPackage({ root, packageName: '@deepseek-ai/dsh-absent', name: '@example/x', outDir: 'dist/fork' }))
      .toThrow('prepare-patched-package: @deepseek-ai/dsh-absent is not a workspace package')
  })

  it('refuses a stage without the built output', () => {
    const root = fixture({ lib: false })

    expect(() => preparePatchedPackage({ root, packageName: '@deepseek-ai/dsh-target', name: '@example/dsh-target', outDir: 'dist/fork' }))
      .toThrow('run "pnpm run build" before staging a fork')
  })

  it('skips a manifest it cannot parse and still finds the target', () => {
    const root = fixture({ brokenManifest: true })

    const staged = preparePatchedPackage({
      root,
      packageName: '@deepseek-ai/dsh-target',
      name: '@example/dsh-target',
      outDir: 'dist/fork',
    })

    expect(existsSync(join(staged.outDir, 'package.json'))).toBe(true)
  })
})
