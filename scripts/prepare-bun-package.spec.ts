/** Staging contract of the Bun distribution packager. */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { prepareBunPackage } from './prepare-bun-package.ts'

/** Fixture repositories this spec created, removed after every test. */
const roots: string[] = []

/** One workspace package the stage must resolve a version for. */
interface FixturePackage {
  name: string
  version: string
}

/** Inputs of {@link fixture}. */
interface FixtureOptions {
  dependencies?: Record<string, string>
  workspacePackages?: FixturePackage[]
  binSource?: string
  cliLib?: boolean
  license?: boolean
  /** Drop the patched workspace package, for the alias-failure case. */
  patchedPackage?: boolean
}

/** Write one JSON manifest with the repository's trailing-newline convention. */
function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', 'utf8')
}

/** Materialize a minimal repository the packager can stage from. */
function fixture(options: FixtureOptions = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-prepare-bun-'))
  roots.push(root)
  mkdirSync(join(root, 'apps', 'cli'), { recursive: true })
  writeJson(join(root, 'apps', 'cli', 'package.json'), {
    name: '@deepseek-ai/dsh',
    version: '1.2.3',
    dsh: { configTrees: [{ mount: 'config/agent-presets', path: '../../packages/preset/agent-presets/presets' }] },
    dependencies: options.dependencies ?? {},
  })
  if (options.cliLib !== false) {
    const lib = join(root, 'apps', 'cli', 'lib')
    mkdirSync(lib, { recursive: true })
    writeFileSync(join(lib, 'bin.js'), options.binSource ?? '#!/usr/bin/env node\nconsole.log("dsh")\n', 'utf8')
  }
  // Every staged wrapper aliases the patched packages onto this distribution's
  // forks, so a fixture workspace must declare them unless a test opts out.
  const patched = options.patchedPackage === false
    ? []
    : [{ name: '@deepseek-ai/dsh-code-runtime-worker-thread', version: '1.2.3' }]
  for (const pkg of [...patched, ...options.workspacePackages ?? []]) {
    const dir = join(root, 'packages', 'group', pkg.name.replace(/^@[^/]+\//u, ''))
    mkdirSync(dir, { recursive: true })
    writeJson(join(dir, 'package.json'), { name: pkg.name, version: pkg.version })
  }
  if (options.license !== false) writeFileSync(join(root, 'LICENSE'), 'MIT\n', 'utf8')
  return root
}

/** Read one staged file. */
function staged(outDir: string, ...parts: string[]): string {
  return readFileSync(join(outDir, ...parts), 'utf8')
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('Bun package staging', () => {
  it('stages the default publication identity and points the bin at Bun', () => {
    const root = fixture({
      dependencies: { '@deepseek-ai/dsh-base': 'workspace:^', commander: '^15.0.0' },
      workspacePackages: [{ name: '@deepseek-ai/dsh-base', version: '1.2.3' }],
    })

    const staged0 = prepareBunPackage({ root })

    expect(staged0.packageName).toBe('dsh_bun')
    expect(staged0.version).toBe('1.2.3')
    expect(staged0.bins).toEqual(['dsh-bun'])
    expect(staged0.outDir).toBe(join(root, 'dist', 'dsh_bun'))
    const manifest = JSON.parse(staged(staged0.outDir, 'package.json')) as Record<string, unknown>
    expect(manifest).toMatchObject({
      name: 'dsh_bun',
      version: '1.2.3',
      type: 'module',
      bin: { 'dsh-bun': 'lib/bin.js' },
      license: 'MIT',
      publishConfig: { access: 'public' },
      dependencies: {
        '@deepseek-ai/dsh-base': '^1.2.3',
        commander: '^15.0.0',
        '@deepseek-ai/dsh-code-runtime-worker-thread': 'npm:@2841649220/dsh-code-runtime-worker-thread@^1.2.3',
      },
    })
    expect(manifest['dsh']).toBeUndefined()
    expect(manifest['files']).toEqual(['lib/*.js', 'README.md', 'LICENSE'])
    const bin = staged(staged0.outDir, 'lib', 'bin.js')
    expect(bin.startsWith('#!/usr/bin/env bun\n')).toBe(true)
    expect(bin).not.toContain('env node')
    expect(staged(staged0.outDir, 'README.md')).toContain('bun add -g dsh_bun')
    expect(staged(staged0.outDir, 'LICENSE')).toBe('MIT\n')
  })

  it('aliases the patched packages onto this distribution forks', () => {
    const root = fixture()

    const staged0 = prepareBunPackage({ root })

    const manifest = JSON.parse(staged(staged0.outDir, 'package.json')) as { dependencies: Record<string, string> }
    expect(manifest.dependencies['@deepseek-ai/dsh-code-runtime-worker-thread'])
      .toBe('npm:@2841649220/dsh-code-runtime-worker-thread@^1.2.3')
  })

  it('honours another fork scope and an explicit opt-out', () => {
    const scoped = prepareBunPackage({ root: fixture(), patchedScope: '@example' })
    const scopedManifest = JSON.parse(staged(scoped.outDir, 'package.json')) as { dependencies: Record<string, string> }
    expect(scopedManifest.dependencies['@deepseek-ai/dsh-code-runtime-worker-thread'])
      .toBe('npm:@example/dsh-code-runtime-worker-thread@^1.2.3')

    const plain = prepareBunPackage({ root: fixture(), outDir: 'dist/plain', patchedScope: '' })
    const plainManifest = JSON.parse(staged(plain.outDir, 'package.json')) as { dependencies: Record<string, string> }
    expect(plainManifest.dependencies['@deepseek-ai/dsh-code-runtime-worker-thread']).toBeUndefined()
  })

  it('aliases a patched package to a tarball URL when the registry needs a credential', () => {
    const url = 'https://github.com/example/repo/releases/download/v1.2.3/dsh-code-runtime-worker-thread-1.2.3.tgz'

    const hosted = prepareBunPackage({ root: fixture(), outDir: 'dist/hosted', patchedUrl: url })

    const manifest = JSON.parse(staged(hosted.outDir, 'package.json')) as { dependencies: Record<string, string> }
    // A URL is the whole spec: it carries neither an alias prefix nor a range,
    // because the asset is one immutable build rather than a version to select.
    expect(manifest.dependencies['@deepseek-ai/dsh-code-runtime-worker-thread']).toBe(url)
  })

  it('refuses to stage when a patched package has no workspace version', () => {
    const root = fixture({ patchedPackage: false })

    expect(() => prepareBunPackage({ root }))
      .toThrow('prepare-bun-package: patched package @deepseek-ai/dsh-code-runtime-worker-thread has no workspace version')
  })

  it('stages every requested command name', () => {
    const root = fixture()

    const staged0 = prepareBunPackage({ root, bins: ['dsh-bun', 'dsh'] })

    const manifest = JSON.parse(staged(staged0.outDir, 'package.json')) as { bin: Record<string, string> }
    expect(manifest.bin).toEqual({ 'dsh-bun': 'lib/bin.js', dsh: 'lib/bin.js' })
    expect(staged(staged0.outDir, 'README.md')).toContain('dsh --profile headless')
  })

  it('repairs a bin that carries no interpreter line', () => {
    const root = fixture({ binSource: 'console.log("dsh")\n' })

    const staged0 = prepareBunPackage({ root })

    expect(staged(staged0.outDir, 'lib', 'bin.js')).toBe('#!/usr/bin/env bun\nconsole.log("dsh")\n')
  })

  it('repairs a bin whose interpreter line has no body', () => {
    const root = fixture({ binSource: '#!/usr/bin/env node' })

    const staged0 = prepareBunPackage({ root })

    expect(staged(staged0.outDir, 'lib', 'bin.js')).toBe('#!/usr/bin/env bun\n')
  })

  it('records the requested registry', () => {
    const root = fixture()

    const staged0 = prepareBunPackage({ root, registry: 'https://npm.pkg.github.com' })

    const manifest = JSON.parse(staged(staged0.outDir, 'package.json')) as { publishConfig: Record<string, string> }
    expect(manifest.publishConfig).toEqual({ access: 'public', registry: 'https://npm.pkg.github.com' })
  })

  it('resolves a workspace dependency through an explicit range', () => {
    const root = fixture({
      dependencies: { '@deepseek-ai/dsh-unpublished': 'workspace:^', commander: '^15.0.0' },
    })

    const staged0 = prepareBunPackage({ root, depVersion: '^9.9.9' })

    const manifest = JSON.parse(staged(staged0.outDir, 'package.json')) as { dependencies: Record<string, string> }
    expect(manifest.dependencies).toEqual({
      '@deepseek-ai/dsh-unpublished': '^9.9.9',
      commander: '^15.0.0',
      '@deepseek-ai/dsh-code-runtime-worker-thread': 'npm:@2841649220/dsh-code-runtime-worker-thread@^1.2.3',
    })
  })

  it('refuses a workspace dependency the workspace does not declare', () => {
    const root = fixture({ dependencies: { '@deepseek-ai/dsh-absent': 'workspace:^' } })

    expect(() => prepareBunPackage({ root }))
      .toThrow('prepare-bun-package: no workspace version for @deepseek-ai/dsh-absent')
  })

  it('ignores workspace manifests it cannot parse and stops the scan at depth four', () => {
    const root = fixture({
      dependencies: { '@deepseek-ai/dsh-base': 'workspace:^' },
      workspacePackages: [{ name: '@deepseek-ai/dsh-base', version: '1.2.3' }],
    })
    mkdirSync(join(root, 'packages', 'group', 'broken'), { recursive: true })
    writeFileSync(join(root, 'packages', 'group', 'broken', 'package.json'), '{ not json', 'utf8')
    const deep = join(root, 'packages', 'l1', 'l2', 'l3', 'l4', 'l5')
    mkdirSync(deep, { recursive: true })
    writeJson(join(deep, 'package.json'), { name: '@deepseek-ai/dsh-deep', version: '0.0.1' })

    const staged0 = prepareBunPackage({ root })

    const manifest = JSON.parse(staged(staged0.outDir, 'package.json')) as { dependencies: Record<string, string> }
    expect(manifest.dependencies).toEqual({
      '@deepseek-ai/dsh-base': '^1.2.3',
      '@deepseek-ai/dsh-code-runtime-worker-thread': 'npm:@2841649220/dsh-code-runtime-worker-thread@^1.2.3',
    })
  })

  it('refuses a stage without a bin name', () => {
    const root = fixture()

    expect(() => prepareBunPackage({ root, bins: [] }))
      .toThrow('prepare-bun-package: the publication package needs at least one bin name')
  })

  it('refuses a stage without the CLI build output', () => {
    const root = fixture({ cliLib: false })

    expect(() => prepareBunPackage({ root }))
      .toThrow('prepare-bun-package: apps/cli/lib not found')
  })

  it('refuses a stage without a LICENSE', () => {
    const root = fixture({ license: false })

    expect(() => prepareBunPackage({ root }))
      .toThrow('prepare-bun-package: ')
    expect(existsSync(join(root, 'LICENSE'))).toBe(false)
  })
})
