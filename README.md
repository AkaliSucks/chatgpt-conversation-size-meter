# ChatGPT Conversation Size Meter — Codex workspace

This is the clean development workspace for future revisions of the Conversation Size Meter userscript.

## Current state
- Accepted implementation baseline: **V2.22**
- Candidate implementation: **V2.23 — Event Model Cleanup**, pending manual browser validation
- Candidate JS, ZIP, checksums, validation evidence and browser steps: [releases/v2.23/RELEASE_REPORT.md](releases/v2.23/RELEASE_REPORT.md)

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

JavaScript and shell sources check out with LF on Windows; ZIPs remain binary.
For Git for Windows Bash, set `export PATH=/usr/bin:/bin:$PATH` inside Bash
if needed so the verifier can find `sha256sum`, `awk` and `dirname`.

Candidate checks (Node 18+):

```sh
node --check releases/v2.23/chatgpt_chat_size_meter_v223_event_model_cleanup.js
node scripts/verify-v223-protected.js
node scripts/test-v223.js
python scripts/package-v223.py
```

The deterministic harness runs synthetic scenarios against the actual candidate
in a Node VM. It does not validate native ChatGPT browser/server behavior.
