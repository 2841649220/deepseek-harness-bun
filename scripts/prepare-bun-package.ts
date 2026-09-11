/**
 * Prepare a self-contained Bun-first distribution package for npm publication.
 *
 * This reads the compiled `apps/cli` artifacts, adjusts the shebang to `bun`,
 * transforms workspace dependencies to public npm registry versions,
 * configures bin aliases (`dsh` and `dsh-bun`), and stages the package
 * ready for `bun publish` or `npm publish`.
 *
 * @module scripts/prepare-bun-package
 */

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

const root = resolve(import.meta.dirname, '..')

interface CliPackageJson {
  name: string
  version: string
  description?: string
  license?: string
  type?: string
  bin?: Record<string, string>
  files?: string[]
  dsh?: Record<string, unknown>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  publishConfig?: Record<string, string>
  engines?: Record<string, string>
  repository?: Record<string, string>
}

/**
 * Recursively find all package.json files and map package name -> version.
 * @param rootDir Workspace root path.
 * @returns Map of package name to version.
 */
function collectWorkspaceVersions(rootDir: string): Map<string, string> {
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
          // ignore unparseable files
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
 * Stage the Bun distribution package into the target directory.
 * @param options Configuration options for package name, output directory, and version.
 * @returns Object with output directory, package name, and version.
 */
export function prepareBunPackage(options: {
  name?: string | undefined
  outDir?: string | undefined
  version?: string | undefined
  depVersion?: string | undefined
} = {}): { outDir: string; packageName: string; version: string } {
  const cliPkgPath = resolve(root, 'apps/cli/package.json')
  const cliPkg = JSON.parse(readFileSync(cliPkgPath, 'utf8')) as CliPackageJson

  const packageName = options.name ?? 'dsh-bun'
  const version = options.version ?? cliPkg.version
  const outDir = resolve(root, options.outDir ?? 'dist/dsh-bun')

  console.log(`prepare-bun-package: staging ${packageName}@${version} into ${outDir}...`)

  // 1. Clean and prepare output directory
  if (existsSync(outDir)) {
    rmSync(outDir, { recursive: true, force: true })
  }
  mkdirSync(outDir, { recursive: true })

  // 2. Copy compiled lib from apps/cli
  const cliLibDir = resolve(root, 'apps/cli/lib')
  if (!existsSync(cliLibDir)) {
    throw new Error('apps/cli/lib not found. Run "pnpm run build" before preparing the Bun package.')
  }
  cpSync(cliLibDir, join(outDir, 'lib'), { recursive: true })

  // 3. Update bin.js shebang to `#!/usr/bin/env bun`
  const binPath = join(outDir, 'lib/bin.js')
  if (existsSync(binPath)) {
    let binContent = readFileSync(binPath, 'utf8')
    if (binContent.startsWith('#!/usr/bin/env node')) {
      binContent = `#!/usr/bin/env bun\n${binContent.slice('#!/usr/bin/env node\n'.length)}`
    } else if (!binContent.startsWith('#!')) {
      binContent = `#!/usr/bin/env bun\n${binContent}`
    }
    writeFileSync(binPath, binContent, 'utf8')
  }

  // 4. Resolve workspace:^ dependencies to npm versions
  const workspaceVersions = collectWorkspaceVersions(root)
  console.log(`prepare-bun-package: discovered ${workspaceVersions.size} workspace package versions`)

  const transformedDeps: Record<string, string> = {}
  for (const [dep, ver] of Object.entries(cliPkg.dependencies ?? {})) {
    if (ver.startsWith('workspace:')) {
      const knownVer = workspaceVersions.get(dep)
      if (knownVer) {
        transformedDeps[dep] = `^${knownVer}`
      } else if (options.depVersion) {
        transformedDeps[dep] = options.depVersion
      } else {
        transformedDeps[dep] = `^${cliPkg.version}`
      }
    } else {
      transformedDeps[dep] = ver
    }
  }

  // 5. Construct publication package.json
  const pubPkg: Record<string, unknown> = {
    name: packageName,
    version,
    description: 'DeepSeek Harness CLI - High-performance agent harness optimized for Bun runtime',
    type: 'module',
    bin: {
      dsh: 'lib/bin.js',
      'dsh-bun': 'lib/bin.js',
    },
    files: [
      'lib/*.js',
      'README.md',
      'LICENSE',
    ],
    dsh: cliPkg.dsh,
    engines: {
      bun: '>=1.1.0',
      node: '^22.19.0 || >=24.0.0',
    },
    publishConfig: {
      access: 'public',
    },
    repository: {
      type: 'git',
      url: 'git+https://github.com/2841649220/deepseek-harness-bun.git',
    },
    license: 'MIT',
    keywords: [
      'deepseek',
      'agent',
      'harness',
      'bun',
      'ai',
      'llm',
      'cordis',
    ],
    dependencies: transformedDeps,
  }

  writeFileSync(join(outDir, 'package.json'), `${JSON.stringify(pubPkg, null, 2)}\n`, 'utf8')

  // 6. Write custom README.md tailored for Bun users
  const bunReadme = `# ${packageName}

DeepSeek Harness (dsh) CLI distribution optimized for the **[Bun](https://bun.sh/)** runtime.

## Quick Start with Bun

### 1. Direct Execution with \`bunx\`

No installation required:

\`\`\`bash
export DEEPSEEK_API_KEY="sk-..."
bunx ${packageName} --profile headless "Analyze the current workspace"
\`\`\`

### 2. Global Installation

Install globally via Bun:

\`\`\`bash
bun add -g ${packageName}
\`\`\`

Once installed, both \`dsh\` and \`dsh-bun\` commands are available in your PATH:

\`\`\`bash
export DEEPSEEK_API_KEY="sk-..."

# Run an interactive or headless session
dsh --profile headless "Run unit tests and fix any failures"

# Or use dsh-bun explicitly
dsh-bun --profile headless "Summarize recent commits"
\`\`\`

## Configuration & Environment

- \`DEEPSEEK_API_KEY\`: (Required) Your DeepSeek API key.
- \`DEEPSEEK_BASE_URL\`: (Optional) Custom DeepSeek API endpoint or proxy.

## Profiles

DeepSeek Harness supports multiple execution profiles:
- \`--profile headless\`: Headless autonomous agent mode.
- \`--profile ptc\`: Program-Thinking-Control loop.
- \`--profile acp\`: Agent Client Protocol server mode.

## License

MIT License. DeepSeek Harness is an open-source project by DeepSeek AI.
`
  writeFileSync(join(outDir, 'README.md'), bunReadme, 'utf8')

  // 7. Copy LICENSE
  const licensePath = resolve(root, 'LICENSE')
  if (existsSync(licensePath)) {
    cpSync(licensePath, join(outDir, 'LICENSE'))
  }

  console.log(`prepare-bun-package: successfully prepared ${packageName}@${version} in ${outDir}`)
  return { outDir, packageName, version }
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      name: { type: 'string' },
      out: { type: 'string' },
      version: { type: 'string' },
      'dep-version': { type: 'string' },
    },
    allowPositionals: false,
  })

  const res = prepareBunPackage({
    name: values.name,
    outDir: values.out,
    version: values.version,
    depVersion: values['dep-version'],
  })

  console.log('\nReady to publish or test:')
  console.log(`  1. Local test: cd ${res.outDir} && bun link`)
  console.log(`  2. Publish:    cd ${res.outDir} && bun publish (or npm publish --access public)`)
}
