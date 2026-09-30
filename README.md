# ChatGPT Conversation Size Meter — Codex workspace

This is the clean development workspace for future revisions of the Conversation Size Meter userscript.

## Current state
- Accepted implementation baseline: **V2.22**
- Next planned implementation: **V2.23 — Event Model Cleanup**
- V2.23 implementation has **not** been created in this scaffold.

## Key inputs
- `src/baseline/` — exact V2.22 source
- `specs/V2.23-event-model-cleanup.md` — detailed authoritative V2.23 build brief
- `research/handoff-2026-09-30.md` — project history, empirical findings, and workflow context
- `diagnostics/false-max/` — V2.22 false/suspect MAX regression samples
- `screenshots/` — matching visual evidence
- `AGENTS.md` — Codex operating rules

## Recommended development loop
Codex handles source changes, tests, diffs, validation, and packaging. ChatGPT conversations are used as isolated runtime test subjects. Diagnostics are copied back into this workspace rather than turning the test chat into the development workspace.

## Baseline verification
Run:

```bash
./scripts/verify-baseline.sh
```

The script checks the exact V2.22 SHA-256 and runs `node --check`.