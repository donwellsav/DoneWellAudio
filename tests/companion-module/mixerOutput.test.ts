import { describe, expect, it, vi } from 'vitest'
import { MixerOutput, type ActiveGeqWrite, type ActiveSlot } from '../../companion-module/src/mixerOutput'
import type { ModuleConfig } from '../../companion-module/src/config'

const baseConfig: ModuleConfig = {
  siteUrl: '',
  pairingCode: '',
  pollIntervalMs: 500,
  mixerModel: 'venu360',
  outputProtocol: 'osc',
  mixerHost: '127.0.0.1',
  mixerPort: 9000,
  oscPrefix: '1',
  geqPrefix: '1',
  autoApply: false,
  maxCutDb: -12,
  peqBandCount: 8,
  peqBandStart: 1,
  outputMode: 'both',
}

function makeSlot(
  advisoryId: string,
  band: number,
  freqHz: number,
): ActiveSlot {
  return {
    advisoryId,
    band,
    freqHz,
    gainDb: -6,
    q: 4,
    severity: 'GROWING',
    timestamp: Date.now(),
  }
}

function makeGeqWrite(
  advisoryId: string,
  bandIndex: number,
): ActiveGeqWrite {
  return {
    advisoryId,
    prefix: '1',
    bandIndex,
    gainDb: -6,
    timestamp: Date.now(),
  }
}

describe('MixerOutput', () => {
  it('reports the union of advisory IDs that still own mixer state', () => {
    const output = new MixerOutput(baseConfig, vi.fn())

    output.activeSlots.set(1, makeSlot('adv-1', 1, 1000))
    output.activeSlots.set(2, makeSlot('adv-2', 2, 1250))
    output.activeGeqWrites.set('adv-1', makeGeqWrite('adv-1', 12))
    output.activeGeqWrites.set('adv-3', makeGeqWrite('adv-3', 18))

    expect(output.getTrackedAdvisoryIds().sort()).toEqual([
      'adv-1',
      'adv-2',
      'adv-3',
    ])
  })

  it('clears tracked PEQ and GEQ state when the transport succeeds', async () => {
    const output = new MixerOutput(baseConfig, vi.fn())
    const outputInternals = output as unknown as {
      sendEqMessage: (message: unknown) => Promise<void>
    }

    outputInternals.sendEqMessage = vi.fn().mockResolvedValue(undefined)

    output.activeSlots.set(1, makeSlot('adv-1', 1, 1000))
    output.activeSlots.set(2, makeSlot('adv-2', 2, 1250))
    output.activeGeqWrites.set('adv-1', makeGeqWrite('adv-1', 12))
    output.activeGeqWrites.set('adv-3', makeGeqWrite('adv-3', 18))

    await output.clearAll()

    expect(output.activeSlots.size).toBe(0)
    expect(output.activeGeqWrites.size).toBe(0)
    expect(output.getTrackedAdvisoryIds()).toEqual([])
  })

  it('does not report fully cleared while orphaned GEQ state remains', async () => {
    const output = new MixerOutput(baseConfig, vi.fn())
    const outputInternals = output as unknown as {
      sendEqMessage: ReturnType<typeof vi.fn>
      orphanedGeqWrites: ActiveGeqWrite[]
    }

    outputInternals.sendEqMessage = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('orphan clear failed'))

    output.activeGeqWrites.set('adv-1', makeGeqWrite('adv-1', 12))
    outputInternals.orphanedGeqWrites = [makeGeqWrite('adv-1', 18)]

    const result = await output.clearByAdvisoryId('adv-1')

    expect(result).toEqual({
      peqCleared: false,
      geqCleared: false,
      fullyCleared: false,
    })
    expect(output.activeGeqWrites.has('adv-1')).toBe(false)
    expect(output.getTrackedAdvisoryIds()).toEqual(['adv-1'])
  })

  it('retains every advisory sharing a GEQ band when clearAll fails that band', async () => {
    const output = new MixerOutput(baseConfig, vi.fn())
    const outputInternals = output as unknown as {
      sendEqMessage: ReturnType<typeof vi.fn>
      geqBandRefCount: Map<string, number>
    }

    outputInternals.sendEqMessage = vi.fn().mockRejectedValue(new Error('GEQ clear failed'))
    output.activeGeqWrites.set('adv-1', makeGeqWrite('adv-1', 12))
    output.activeGeqWrites.set('adv-2', makeGeqWrite('adv-2', 12))
    outputInternals.geqBandRefCount = new Map([['1:12', 2]])

    await output.clearAll()

    expect(output.getTrackedAdvisoryIds().sort()).toEqual(['adv-1', 'adv-2'])
    expect(output.activeGeqWrites.size).toBe(2)
    expect(outputInternals.geqBandRefCount.get('1:12')).toBe(2)
  })
})
