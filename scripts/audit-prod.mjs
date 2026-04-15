import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

const SEVERITY_RANK = {
  info: 0,
  low: 1,
  moderate: 2,
  high: 3,
  critical: 4,
}

const MANIFEST_ENTRIES = [
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  '.npmrc',
  '.pnpmfile.cjs',
  '.pnpmfile.js',
  'patches',
]

/**
 * @param {string} severity
 * @returns {number}
 */
export function getSeverityRank(severity) {
  return SEVERITY_RANK[severity] ?? -1
}

/**
 * @param {string[]} argv
 * @returns {{ auditLevel: keyof typeof SEVERITY_RANK }}
 */
export function parseAuditArgs(argv) {
  let auditLevel = 'high'

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg.startsWith('--audit-level=')) {
      auditLevel = arg.slice('--audit-level='.length)
      continue
    }
    if (arg === '--audit-level') {
      auditLevel = argv[index + 1] ?? ''
      index += 1
    }
  }

  if (!(auditLevel in SEVERITY_RANK)) {
    throw new Error(`Invalid --audit-level "${auditLevel}". Expected one of: ${Object.keys(SEVERITY_RANK).join(', ')}`)
  }

  return {
    auditLevel,
  }
}

/**
 * @param {string[]} args
 * @param {string} cwd
 * @returns {string}
 */
export function runPnpm(args, cwd) {
  if (process.platform === 'win32') {
    return execFileSync(
      'cmd.exe',
      ['/d', '/s', '/c', `pnpm ${args.join(' ')}`],
      {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
  }

  return execFileSync(
    'pnpm',
    args,
    {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
}

/**
 * @param {string} sourceDir
 * @param {string} targetDir
 */
export function copyAuditInputs(sourceDir, targetDir) {
  for (const entry of MANIFEST_ENTRIES) {
    const sourcePath = path.join(sourceDir, entry)
    if (!existsSync(sourcePath)) {
      continue
    }
    cpSync(sourcePath, path.join(targetDir, entry), { recursive: true })
  }
}

/**
 * @param {unknown} node
 * @param {Map<string, Set<string>>} packages
 * @param {(packagePath: string) => boolean} isInstalledPath
 */
function collectDependency(node, packages, isInstalledPath) {
  if (!node || typeof node !== 'object') {
    return
  }

  const packagePath = typeof node.path === 'string' ? node.path : null
  const packageName = typeof node.name === 'string'
    ? node.name
    : typeof node.from === 'string'
      ? node.from
      : null
  const version = typeof node.version === 'string' ? node.version : null

  if (packageName && version && packagePath && isInstalledPath(packagePath)) {
    let versions = packages.get(packageName)
    if (!versions) {
      versions = new Set()
      packages.set(packageName, versions)
    }
    versions.add(version)
  }

  if (!('dependencies' in node) || !node.dependencies || typeof node.dependencies !== 'object') {
    return
  }

  for (const dependency of Object.values(node.dependencies)) {
    collectDependency(dependency, packages, isInstalledPath)
  }
}

/**
 * @param {unknown[]} roots
 * @param {(packagePath: string) => boolean} [isInstalledPath]
 * @returns {Record<string, string[]>}
 */
export function collectInstalledPackageVersions(roots, isInstalledPath = existsSync) {
  const packages = new Map()

  for (const root of roots) {
    if (!root || typeof root !== 'object' || !('dependencies' in root) || !root.dependencies || typeof root.dependencies !== 'object') {
      continue
    }

    for (const dependency of Object.values(root.dependencies)) {
      collectDependency(dependency, packages, isInstalledPath)
    }
  }

  return Object.fromEntries(
    [...packages.entries()]
      .sort(([leftName], [rightName]) => leftName.localeCompare(rightName))
      .map(([packageName, versions]) => [packageName, [...versions].sort()]),
  )
}

/**
 * @typedef {{
 *   id: number
 *   url: string
 *   title: string
 *   severity: keyof typeof SEVERITY_RANK
 *   vulnerable_versions: string
 * }} Advisory
 */

/**
 * @param {Record<string, ReadonlyArray<Advisory>>} advisoriesByPackage
 * @param {Record<string, string[]>} packageVersions
 * @param {keyof typeof SEVERITY_RANK} minimumSeverity
 * @returns {Array<{ packageName: string, installedVersions: string[], advisory: Advisory }>}
 */
export function filterAdvisories(advisoriesByPackage, packageVersions, minimumSeverity) {
  const minimumRank = getSeverityRank(minimumSeverity)
  const findings = []
  const seen = new Set()

  for (const [packageName, advisories] of Object.entries(advisoriesByPackage)) {
    for (const advisory of advisories) {
      if (getSeverityRank(advisory.severity) < minimumRank) {
        continue
      }

      const findingKey = `${packageName}:${advisory.id}`
      if (seen.has(findingKey)) {
        continue
      }
      seen.add(findingKey)

      findings.push({
        packageName,
        installedVersions: packageVersions[packageName] ?? [],
        advisory,
      })
    }
  }

  return findings.sort((left, right) => {
    const severityDelta = getSeverityRank(right.advisory.severity) - getSeverityRank(left.advisory.severity)
    if (severityDelta !== 0) {
      return severityDelta
    }
    return left.packageName.localeCompare(right.packageName)
  })
}

/**
 * @param {Record<string, string[]>} packageVersions
 * @returns {Promise<Record<string, Advisory[]>>}
 */
export async function requestBulkAdvisories(packageVersions) {
  const response = await fetch('https://registry.npmjs.org/-/npm/v1/security/advisories/bulk', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(packageVersions),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`npm bulk advisory request failed with ${response.status}: ${body}`)
  }

  return /** @type {Promise<Record<string, Advisory[]>>} */ (response.json())
}

/**
 * @param {{ auditLevel: keyof typeof SEVERITY_RANK }} options
 * @returns {Promise<{ packageCount: number, findings: Array<{ packageName: string, installedVersions: string[], advisory: Advisory }> }>}
 */
export async function runAudit(options) {
  const sourceDir = process.cwd()
  const tempDir = mkdtempSync(path.join(tmpdir(), 'dwa-prod-audit-'))

  try {
    copyAuditInputs(sourceDir, tempDir)
    runPnpm(
      ['install', '--prod', '--frozen-lockfile', '--ignore-scripts', '--prefer-offline', '--reporter=silent'],
      tempDir,
    )

    const rawTree = runPnpm(['ls', '--prod', '--json', '--depth', '100'], tempDir)
    const packageVersions = collectInstalledPackageVersions(JSON.parse(rawTree))
    const advisoriesByPackage = await requestBulkAdvisories(packageVersions)
    const findings = filterAdvisories(advisoriesByPackage, packageVersions, options.auditLevel)

    return {
      packageCount: Object.keys(packageVersions).length,
      findings,
    }
  } finally {
    rmSync(tempDir, { force: true, recursive: true })
  }
}

/**
 * @param {{ packageCount: number, findings: Array<{ packageName: string, installedVersions: string[], advisory: Advisory }>, auditLevel: keyof typeof SEVERITY_RANK }} result
 */
export function printAuditResult(result) {
  if (result.findings.length === 0) {
    console.log(`Production audit passed: no ${result.auditLevel}+ advisories in ${result.packageCount} installed packages.`)
    return
  }

  console.error(`Production audit failed: found ${result.findings.length} ${result.auditLevel}+ advisories in installed production dependencies.`)
  for (const finding of result.findings) {
    const versions = finding.installedVersions.length > 0
      ? finding.installedVersions.join(', ')
      : 'unknown version'
    console.error(`- [${finding.advisory.severity}] ${finding.packageName}@${versions}: ${finding.advisory.title}`)
    console.error(`  ${finding.advisory.url}`)
  }
}

const executedScript = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : ''

if (import.meta.url === executedScript) {
  try {
    const options = parseAuditArgs(process.argv.slice(2))
    const result = await runAudit(options)
    printAuditResult({
      ...result,
      auditLevel: options.auditLevel,
    })
    if (result.findings.length > 0) {
      process.exitCode = 1
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    process.exitCode = 1
  }
}
