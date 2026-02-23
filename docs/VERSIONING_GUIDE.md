# DoneWellAudio Versioning Guide

This repository uses a simple, automated versioning system based on `.NET` conventions and GitHub Actions. This guide explains how it works and how to replicate it in other projects.

## How It Works

1.  **Single Source of Truth**: The version number is stored in `Directory.Build.props` at the repository root. This file is automatically picked up by all .NET projects in the solution.
    ```xml
    <Project>
      <PropertyGroup>
        <Version>1.0.40</Version>
        ...
      </PropertyGroup>
    </Project>
    ```

2.  **Automated Bumping**: A GitHub Action (`.github/workflows/portable.yml`) runs on every push to the `main` branch. It:
    -   Reads the version from `Directory.Build.props`.
    -   Increments the patch version (e.g., `1.0.40` -> `1.0.41`).
    -   Updates the file.
    -   Commits the change with `[skip ci]` to prevent infinite loops.
    -   Tags the commit (e.g., `v1.0.41`).
    -   Pushes the changes back to the repository.

## Replicating This Setup

To set up this versioning system in another repository, follow these steps:

### 1. Create `Directory.Build.props`

Create this file in the root of your repository:

```xml
<Project>
  <PropertyGroup>
    <Version>1.0.0</Version>
    <Authors>Your Name</Authors>
    <Company>Your Company</Company>
    <Product>Your Product</Product>
  </PropertyGroup>
</Project>
```

### 2. Create the GitHub Action

Create `.github/workflows/version-bump.yml` with the following content:

```yaml
name: Auto Version Bump

on:
  push:
    branches: [ "main" ]
    paths-ignore:
      - '**.md'
      - '.gitignore'
  workflow_dispatch:

permissions:
  contents: write

jobs:
  bump-version:
    runs-on: windows-latest
    if: "!contains(github.event.head_commit.message, '[skip ci]')"

    steps:
      - name: Checkout Code
        uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}

      - name: Increment Version
        shell: pwsh
        run: |
          if (Test-Path Directory.Build.props) {
            $content = Get-Content Directory.Build.props -Raw
            $versionMatch = [regex]::Match($content, "<Version>(.*?)</Version>")
            if ($versionMatch.Success) {
                $v = [version]$versionMatch.Groups[1].Value
                $newVersion = "{0}.{1}.{2}" -f $v.Major, $v.Minor, ($v.Build + 1)
                $content = $content -replace "<Version>.*?</Version>", "<Version>$newVersion</Version>"
                Set-Content Directory.Build.props $content
                echo "NEW_VERSION=$newVersion" >> $env:GITHUB_ENV
                Write-Host "Bumped version to $newVersion"
            } else {
                Write-Error "Could not find <Version> in Directory.Build.props"
                exit 1
            }
          } else {
             Write-Error "Directory.Build.props not found"
             exit 1
          }

      - name: Commit and Push Version Bump
        shell: bash
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add Directory.Build.props
          git commit -m "Bump version to ${{ env.NEW_VERSION }} [skip ci]"
          git tag v${{ env.NEW_VERSION }}
          git push origin HEAD:${{ github.ref_name }} --tags
```

### Prerequisites

-   **GITHUB_TOKEN Permissions**: Ensure "Read and write permissions" are enabled for `GITHUB_TOKEN` in `Settings > Actions > General > Workflow permissions`.
-   **Runners**: This script uses PowerShell (`pwsh`), so use `runs-on: windows-latest` or ensure `pwsh` is installed on your Linux runner.
