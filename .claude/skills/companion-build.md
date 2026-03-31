---
name: companion-build
description: Build, version, and package the Companion module for GitHub Releases
---

# Companion Build

Build and package the Companion module zip for distribution.

## Instructions

1. **Version check** — Read `companion-module/package.json` version. If the user provides a version, update it. Otherwise auto-increment the date suffix (e.g., `0.3.20260331`).

2. **Build** — Run from the companion-module directory:
   ```bash
   cd companion-module && pnpm install && pnpm build
   ```

3. **Verify build** — Check that `companion-module/dist/main.js` exists and is non-empty.

4. **Package** — Create the three release assets that CompanionTab.tsx links to:

   ```bash
   # Individual module zip
   cd companion-module && zip -r ../companion-module-donewell-audio.zip package.json dist/ LICENSE 2>/dev/null

   # DBX DriveRack PA2 module zip (if present)
   # cd companion-module-dbx && zip -r ../companion-module-dbx-driverack-pa2.zip package.json dist/ LICENSE 2>/dev/null

   # Bundle zip (all modules combined)
   cd .. && zip -r donewell-companion-modules.zip companion-module-donewell-audio.zip companion-module-dbx-driverack-pa2.zip 2>/dev/null
   ```

   Expected output files (must match CompanionTab.tsx download links exactly):
   - `companion-module-donewell-audio.zip`
   - `companion-module-dbx-driverack-pa2.zip`
   - `donewell-companion-modules.zip` (bundle)

5. **Report** — Show each zip file path and size. Remind the user to:
   - Upload all three zips to GitHub Releases under the tag `companion-modules-v<version>`
   - Update `CompanionTab.tsx` download links if the release tag changed

6. **Stop** — Do NOT push or create releases. The user handles GitHub Releases manually.
