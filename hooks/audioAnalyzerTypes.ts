import type { AlgorithmMode, ContentType } from '@/types/advisory'

export interface EarlyWarning {
  predictedFrequencies: number[]
  fundamentalSpacing: number | null
  estimatedPathLength: number | null
  confidence: number
  timestamp: number
}

export interface SpectrumStatus {
  peak: number
  autoGainDb?: number
  autoGainEnabled?: boolean
  autoGainLocked?: boolean
  algorithmMode?: AlgorithmMode
  contentType?: ContentType
  msdFrameCount?: number
  isCompressed?: boolean
  compressionRatio?: number
  isSignalPresent?: boolean
  rawPeakDb?: number
}
