# Wiki Sync Source

The GitHub wiki is maintained as a separate repository when it is used. It is not checked into this workspace.

Use the following repo docs as the source pages when syncing or rebuilding the wiki:

| Wiki page | Source file |
|---|---|
| Home | [`README.md`](../README.md) |
| Getting Started | [`docs/BEGINNER-GUIDE.md`](./BEGINNER-GUIDE.md) |
| Developer Guide | [`docs/DEVELOPER_GUIDE.md`](./DEVELOPER_GUIDE.md) |
| System Architecture | [`docs/SYSTEM_ARCHITECTURE.md`](./SYSTEM_ARCHITECTURE.md) |
| Technical Reference | [`docs/TECHNICAL_REFERENCE.md`](./TECHNICAL_REFERENCE.md) |
| API Documentation | [`docs/API_DOCUMENTATION.md`](./API_DOCUMENTATION.md) |
| Integrations | [`docs/INTEGRATIONS.md`](./INTEGRATIONS.md) |
| Test Guide | [`tests/README.md`](../tests/README.md) |

## Sync Rules

- Prefer current code, tests, and in-app help over older archived audit notes.
- Do not copy stale file counts, test totals, or version numbers into the wiki unless you re-verify them first.
- Treat `lib/changelog.ts` as the product-facing release history and `CHANGELOG.md` as the branch-level note.
- Keep the startup default distinction explicit:
  - fresh-start snapshot = `25 dB`
  - explicit `speech` mode baseline = `20 dB`

## Recommended Wiki Navigation

1. Home
2. Getting Started
3. Developer Guide
4. System Architecture
5. Technical Reference
6. API Documentation
7. Integrations
8. Test Guide
