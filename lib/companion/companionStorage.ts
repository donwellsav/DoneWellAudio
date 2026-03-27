import { typedStorage } from '@/lib/storage/dwaStorage'
import { DEFAULT_COMPANION_SETTINGS } from '@/types/companion'
import type { CompanionSettings } from '@/types/companion'

export const companionStorage = typedStorage<CompanionSettings>(
  'dwa-companion',
  DEFAULT_COMPANION_SETTINGS,
)
