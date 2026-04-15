import { describe, expect, it } from 'vitest'
import {
  collectInstalledPackageVersions,
  filterAdvisories,
  getSeverityRank,
  parseAuditArgs,
} from '@/scripts/audit-prod.mjs'

describe('audit-prod script helpers', () => {
  it('parses the audit threshold and defaults to high', () => {
    expect(parseAuditArgs([])).toEqual({ auditLevel: 'high' })
    expect(parseAuditArgs(['--audit-level=critical'])).toEqual({ auditLevel: 'critical' })
    expect(parseAuditArgs(['--audit-level', 'moderate'])).toEqual({ auditLevel: 'moderate' })
  })

  it('collects only installed dependency packages and skips the private root', () => {
    const roots = [
      {
        name: 'donewellaudio',
        version: '0.96.0',
        path: '/repo',
        dependencies: {
          next: {
            from: 'next',
            version: '16.2.3',
            path: '/repo/node_modules/next',
            dependencies: {
              '@img/sharp-linux-x64': {
                from: '@img/sharp-linux-x64',
                version: '0.34.5',
                path: '/repo/node_modules/@img/sharp-linux-x64',
              },
              '@img/sharp-win32-arm64': {
                from: '@img/sharp-win32-arm64',
                version: '0.34.5',
                path: '/repo/node_modules/@img/sharp-win32-arm64',
              },
              '@types/react': {
                from: '@types/react',
                version: '19.2.14',
                path: '/repo/node_modules/@types/react',
              },
            },
          },
        },
      },
    ]

    const installedPaths = new Set([
      '/repo/node_modules/next',
      '/repo/node_modules/@img/sharp-linux-x64',
    ])

    const versions = collectInstalledPackageVersions(
      roots,
      (packagePath) => installedPaths.has(packagePath),
    )

    expect(versions).toEqual({
      '@img/sharp-linux-x64': ['0.34.5'],
      next: ['16.2.3'],
    })
  })

  it('filters advisories at or above the requested threshold', () => {
    const advisoriesByPackage = {
      lodash: [
        {
          id: 1,
          url: 'https://github.com/advisories/GHSA-low',
          title: 'Low issue',
          severity: 'low',
          vulnerable_versions: '<1.0.1',
        },
        {
          id: 2,
          url: 'https://github.com/advisories/GHSA-high',
          title: 'High issue',
          severity: 'high',
          vulnerable_versions: '<1.0.2',
        },
      ],
      minimist: [
        {
          id: 3,
          url: 'https://github.com/advisories/GHSA-critical',
          title: 'Critical issue',
          severity: 'critical',
          vulnerable_versions: '<1.2.9',
        },
      ],
    } as const

    const findings = filterAdvisories(
      advisoriesByPackage,
      {
        lodash: ['1.0.0'],
        minimist: ['1.2.8'],
      },
      'high',
    )

    expect(findings).toHaveLength(2)
    expect(findings[0]).toMatchObject({
      packageName: 'minimist',
      installedVersions: ['1.2.8'],
      advisory: {
        id: 3,
        severity: 'critical',
      },
    })
    expect(findings[1]).toMatchObject({
      packageName: 'lodash',
      installedVersions: ['1.0.0'],
      advisory: {
        id: 2,
        severity: 'high',
      },
    })
    expect(getSeverityRank('critical')).toBeGreaterThan(getSeverityRank('high'))
  })
})
