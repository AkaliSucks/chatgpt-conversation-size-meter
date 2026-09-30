# Codex instructions — ChatGPT Conversation Size Meter

## Purpose
This repository is for empirical research into ChatGPT conversation MAX behavior. It is not an official-limit estimator. Keep observations, hypotheses, and official facts clearly separated.

## Baseline
- Exact immutable baseline: `src/baseline/chatgpt_chat_size_meter_v222_sse_outcome_post_correlation.js`
- Do not edit the baseline in place.
- New versions must start from the exact baseline or the latest accepted release, as explicitly specified by the task.
- Preserve `const P = 'cgpt-size-meter-v2101';`, `unsafeWindow`, `document-start`, early network hooks, DIRECT/BATCH parsing, and the known-good parser/capture lineage unless the active spec explicitly requires otherwise.

## Protected parser/candidate-selection path
Treat these as protected and keep them byte-identical unless the active spec explicitly requires a change:
- `findBestCandidate`
- `parseMappingConversation`
- `parseMessageArray`
- `mergeRecordsForChat`
- `inspectRequestBody`
- `inspectJSON`
- mapping/topology parsing
- retained-state profiler
- record/message extraction logic

If a protected function must change, stop and explain exactly why before changing it.

## Current active spec
`specs/V2.23-event-model-cleanup.md` is authoritative for V2.23.
Do not simplify away requirements.

## Research/data rules
- Do not claim an official OpenAI limit.
- Do not infer a universal static threshold from the diagnostics.
- Label evidence precisely: healthy SUCCESS, confirmed native MAX, V2.22 inferred MAX, false/suspect MAX, blocked-before-dispatch, or correlation incomplete.
- The diagnostics in `diagnostics/false-max/` are regression fixtures showing V2.22 false/suspect MAX behavior and synthetic attempt flooding.
- Quoted MAX text inside a normal conversation must never be treated as native MAX by a future detector.

## Workflow
1. Read `research/handoff-2026-09-30.md`.
2. Read the active spec.
3. Verify the baseline with `scripts/verify-baseline.sh`.
4. Make changes on a new branch/worktree or working copy; never mutate the baseline reference.
5. Keep changes surgical; do not rewrite the architecture.
6. Run `node --check` on the candidate.
7. Compare protected functions against the baseline.
8. Run/record regression checks against saved diagnostics where applicable.
9. Package release JS + ZIP under `releases/<version>/`.
10. Produce a concise change report with tests, file sizes, hashes, and any unresolved risks.

## Chat hygiene
Do not require giant prompts to be pasted into the ChatGPT test conversation. Specs, diagnostics, screenshots, and source live in this repository. Ordinary ChatGPT conversations should be treated primarily as isolated test subjects.