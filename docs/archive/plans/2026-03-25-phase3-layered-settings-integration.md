# Phase 3: Layered Settings Integration

## Goal

Wire useLayeredSettings into useAudioAnalyzer so all settings flow through the layered model.

## Tasks

### 1. Write integration tests for useLayeredSettings hook
- Create `hooks/__tests__/useLayeredSettings.test.ts`
- Test: derivedSettings valid on mount, setMode works, legacy shim routes correctly, persistence

### 2. Modify useAudioAnalyzer to use layered hook
- Replace flat useState + customDefaultsStorage with useLayeredSettings()
- Route updateSettings through applyLegacyPartial
- Route resetSettings through resetAll

### 3. Simplify handleModeChange in AudioAnalyzerContext
- Replace 13-field OPERATION_MODES spread with updateSettings({mode})

### 4. Extend SettingsContext with optional layered state
- Add optional session/displayPrefs to SettingsContextValue

### 5. Verify build gate
- npx tsc --noEmit && pnpm test && pnpm build
