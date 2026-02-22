# How to work with Google Jules on this repo

This repo is designed for a "single writer agent" workflow:
- Jules writes code in PRs.
- You review and merge only when CI is green.

## 0) Repo rules
- Read `AGENTS.md` first.
- Every change starts as a GitHub Issue using the template.

## 1) Create your GitHub repo (first time)
1. Create an empty repo on GitHub named `DoneWellAudio`.
2. Upload this repository contents (or `git push`).

Recommended: enable GitHub Actions.

## 2) Run locally on Windows
```powershell
dotnet restore DoneWellAudio.sln
dotnet build DoneWellAudio.sln -c Release
dotnet test DoneWellAudio.sln -c Release --no-build
```

## 3) Typical change loop
1. Open an Issue with acceptance criteria.
2. Ask Gemini Deep Think for a plan + failure modes (store in the Issue or `docs/design/`).
3. Ask ChatGPT for a test plan + review checklist.
4. Give Jules the Issue + plan + test plan and require plan approval.
5. Jules opens a PR; you review; merge only when CI is green.

## 4) Jules prompt hint
Use the prompt in `docs/prompts/google_jules_master_prompt.md`.
