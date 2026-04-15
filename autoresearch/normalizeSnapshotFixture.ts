import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { SnapshotBatch } from '@/types/data'
import {
  normalizeImportedSnapshotFixture,
  serializeSnapshotFixture,
  type NormalizeSnapshotFixtureInput,
} from './snapshotFixtures'
import type { FeedbackVerdict } from './scenarios'

type RawFixtureFile = SnapshotBatch | { batch: SnapshotBatch }

interface CliOptions {
  input: string
  output: string
  mode: 'speech' | 'worship'
  acceptableVerdicts: FeedbackVerdict[]
  expectAdvisory: boolean
  id?: string
  notes?: string
}

export async function normalizeSnapshotFixtureFile(options: CliOptions): Promise<void> {
  const raw = await readFile(options.input, 'utf8')
  const parsed = JSON.parse(raw) as RawFixtureFile
  const batch = 'batch' in parsed ? parsed.batch : parsed

  const normalized = normalizeImportedSnapshotFixture({
    id: options.id,
    mode: options.mode,
    batch,
    acceptableVerdicts: options.acceptableVerdicts,
    expectAdvisory: options.expectAdvisory,
    notes: options.notes,
  } satisfies NormalizeSnapshotFixtureInput)

  await mkdir(path.dirname(options.output), { recursive: true })
  await writeFile(options.output, serializeSnapshotFixture(normalized), 'utf8')
}

function parseCliArgs(argv: readonly string[]): CliOptions {
  let input = ''
  let output = ''
  let mode: 'speech' | 'worship' = 'speech'
  const acceptableVerdicts: FeedbackVerdict[] = []
  let expectAdvisory = false
  let id: string | undefined
  let notes: string | undefined

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    switch (arg) {
      case '--input':
        input = argv[++index] ?? ''
        break
      case '--output':
        output = argv[++index] ?? ''
        break
      case '--mode': {
        const value = argv[++index]
        if (value === 'speech' || value === 'worship') {
          mode = value
          break
        }
        throw new Error(`Unsupported mode '${String(value)}'`)
      }
      case '--verdict': {
        const value = argv[++index] as FeedbackVerdict | undefined
        if (!value) throw new Error('Missing verdict value')
        acceptableVerdicts.push(value)
        break
      }
      case '--expect-advisory':
        expectAdvisory = true
        break
      case '--no-advisory':
        expectAdvisory = false
        break
      case '--id':
        id = argv[++index] ?? ''
        break
      case '--notes':
        notes = argv[++index] ?? ''
        break
      default:
        throw new Error(`Unknown argument '${arg}'`)
    }
  }

  if (!input) throw new Error('Missing --input')
  if (!output) throw new Error('Missing --output')
  if (acceptableVerdicts.length === 0) {
    throw new Error('Provide at least one --verdict')
  }

  return {
    input,
    output,
    mode,
    acceptableVerdicts,
    expectAdvisory,
    id,
    notes,
  }
}

function isDirectExecution(): boolean {
  const entry = process.argv[1]
  if (!entry) return false
  return import.meta.url === pathToFileURL(entry).href
}

if (isDirectExecution()) {
  normalizeSnapshotFixtureFile(parseCliArgs(process.argv.slice(2))).catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    process.exitCode = 1
  })
}
