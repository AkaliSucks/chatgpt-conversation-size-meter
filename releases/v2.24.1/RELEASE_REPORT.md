# V2.24.1 dual-axis empirical pressure candidate

Prepared 2026-10-01 on `codex/v241-dual-axis-pressure`, directly from validated
checkpoint `34195fa83942beb8b5e335833634295abb85898b`. The checkpoint is the commit
containing this report; its exact hash is supplied in the delivery message.
Candidate version: **2.24.1**. Pressure model: **v2241-dual-frontier-1**.
STOP pending native review. No push, merge, or PR.

The new USER-REPORTED state-heavy MAX motivates a second empirical axis. Fixture
values reproduce the request synthetically; they do not establish native acceptance
of this candidate, an official OpenAI limit, or a universal static threshold.

## Capacity and score

The existing exact model / canonical effort tier selection is preserved. It uses
independent MAX conversation counts: prefer exact effort with at least two chats,
or one when the total same-model population is still below two; otherwise explicitly
pool same-model efforts. Unrelated models never supply capacity evidence. The sole
demonstrated effort alias remains `extra high -> max` after case/space normalization.

For **each axis separately**, group the selected comparable MAX rows by conversation
ID. Accept positive finite canonical axis values. Prefer that conversation's
pre-dispatch values; use canonical fresh-post fallback only when the axis has no
valid pre-dispatch value. Choose the **maximum** value within each conversation,
then the **maximum of those independent conversation contributions** as capacity.
Repeated identical retries cannot change capacities or independent counts. Distinct
larger canonical states can legitimately update a chat's single upper contribution.
Supporting `postMax` is never an axis contribution or another observation.

- Text axis: `displayLikeTokens / textCapacityAnchor`.
- Serialized-state axis: `activeBranchBytes / stateCapacityAnchor`.
- Combined ratio: `max(textRatio, stateRatio)`.
- Numeric score: `round(100 * combinedRatio)`, clamped to **0..99**.
- Verified current MAX alone displays **PRESSURE MAX**, with the unchanged red theme.
- Missing current vector/model, missing positive capacity on either axis, or an
  invalid/missing current axis value produces CALIBRATING. A known zero current
  metric is zero; unknown values never coerce to zero. Current MAX overrides missing
  calibration. Both axes must be usable to score this revision.
- Overall and axis confidence remain **LOW throughout V2.24.1**, including large
  homogeneous synthetic populations. No sample-count promotion to MEDIUM/HIGH.
  This provisional model describes a heterogeneous empirical frontier.

Axis ratios at/above one while alive remain nonterminal and set
`exceededWhileAlive`; raw observations continue to be collected. SUCCESS overlap
with either axis is counted once per raw row, plus unique contradictory conversation
count. The displayed index is empirical pressure, never context percent.

## Diagnostics and UI

`textAxis` and `stateAxis` expose field, anchor, ratio, independent MAX count,
observed contribution range, current value, alive exceedance, confidence, exact
anchor rule, fallback count, source-family mismatch, and contributor provenance.
`combined` exposes dominant axis (`text`, `state`, or explicit `tie`), ratio, score,
and reason. Contributor previews are bounded to 16 with omission counts.

All previous diagnostic fields remain. `empiricalMaxAnchor`, `anchorRange`,
`anchorSpread`, and `anchorRule` now alias the **text upper frontier**; spread is
`(max-min)/textAnchor`. `ratioBeforeClamping` now means the combined dual ratio.
The unchanged `pressureEffectiveMax` still provides independent counts and the old
low-side provenance summary. That summary's `anchorContribution` is explicitly
labeled **diagnostic only** by `anchorContributionSummaryRole`; the actual new axis
contributions and their selected event/effort/role/source/time are in each axis.
It cannot silently determine the new capacity.

The nine other metrics remain diagnostic-only: mapping/retained bytes, retained
share, tool-result bytes, hot128/hot256, strong context markers, branch/message
nodes. The existing secondary comparison for active-branch bytes is retained for
compatibility, alongside its scored `stateAxis`. No opaque weights were added.
The compact overlay, expanded layout, colors, CSS, and existing labels stay intact.
Both axes are available in Copy diagnostics.

Under the synthetic USER-REPORTED three-chat cohort, capacities are 845331 text
and 27149953 active-branch bytes, **derived from the test rows, never production
constants**:

| Current fixture | Text ratio, rounded index | State ratio, rounded index | Visible result |
| --- | ---: | ---: | --- |
| Healthy 453725 / 19686898 | 54 | 73 | PRESSURE 73 / 100 · LOW |
| SUCCESS 561842 / 26245630 | 66 | 97 | PRESSURE 97 / 100 · LOW |
| Verified state-heavy MAX 571806 / 27149953 | 68 | 100 | PRESSURE MAX |
| Text-heavy 840795 / 20075510 | 99 | 74 | Numeric 99 until current MAX is verified |
| Text-heavy 845331 / 15320298 | 100 | 56 | Numeric 99 until current MAX is verified |
| Tiny healthy 1000 / 20000 | 0 | 0 | PRESSURE 0 / 100 · LOW |

Fresh post-MAX 571836 / 27151472 remains supporting evidence for the same third
episode; it does not become a fourth chat or increase the pre-MAX capacity.
Unreported parser-structure fields in tests use synthetic scaffolding; those are
not claimed as observed native metrics.

## Storage and source boundary

Storage prefix `const P = 'cgpt-size-meter-v2101';`, compact key
`pressure-calibration-v224`, schema 1, cap **256 events / 512 vectors**, eviction
watermark, dedup, provenance, sampling, migration and persistence are unchanged.
The old store is read without rewriting its bytes. A necessary subsequent evidence
write carries the new model-version field while retaining existing row provenance
and raw effort labels. No startup seeding, destructive migration, or browser-store
manipulation was performed.

Changed functions: **pressureBlank** (model version only), **pressureCompute**
(axis scoring, confidence and diagnostics). Added iterative **pressureAxis**.
Six identity literals change: userscript name/version, diagnostics header, Copy
header, storage-health version, Retry trace version. Every other parent source
byte is unchanged. No recursion was introduced. The parser, candidate selection,
record extraction, topology, retained profiler, early network hooks, DIRECT/BATCH
capture, current MAX lifecycle, Retry Capture, transport errors, and recovery are
preserved. The protected checker confirms **67825 frozen V2.23.5 bytes** and
**65401 immutable V2.22 bytes**, retaining accepted stack-safe helpers. Parser,
migration, status and Retry one-byte mutations are rejected.

New files only: `src/v2241/pressure-calibration.js`, the archived request
`specs/V2.24.1-dual-axis-pressure.md`, `fixtures/v2241/dual-axis-vectors.json`,
six `scripts/*v2241*` build/package/verify/validate/test scripts, and this separate
`releases/v2.24.1/` directory containing JS/ZIP, checksums, report, source patch,
validation transcript and eleven suite transcripts. Existing releases and tests
are preserved. 54 parent files are exact committed bytes, including baseline,
all JS/ZIP and harnesses; 13 older text files retain pre-existing Windows checkout
CRLF only. No parent file was edited or staged.

## Validation and artifacts

- Frozen references: **120/120 V2.23.5**, **99/99 older checkpoint**, **59/59
  initial V2.24**, **31/31 calibration-correctness**.
- All previous superseding runners on their original candidates: **120/120
  initial V2.24 foundation**, **120/120 correctness foundation**, **59/59
  correctness pressure**.
- Candidate: **120/120 foundation**, **59/59 superseding pressure**, **31/31
  superseding correctness**, **34/34 focused dual-axis**. **244 active cases;
  852 recorded case executions** including frozen/reference runs.
- Frozen test files are unchanged. The new regression adapter explicitly updates
  minimum/quartile expectations to upper frontier, confidence expectations to LOW,
  identities/model version, and prior independent-chat/alias corrections. Older
  text-focused synthetic vectors now use a proportional artificial state axis
  (20 bytes/token) in the adapted 59/31 suites instead of a constant 19MB for every
  vector. Actual heterogeneous native-reported metrics are separately asserted by
  the focused suite. All cases execute; no scorer emulation or case skipping.
- Legacy foundation metadata assertions use six identity-only projections. The
  focused suite checks actual V2.24.1 metadata, Retry identity and diagnostics.
- Baseline/syntax/protected-byte checks, quota/recovery, compact storage, unknown
  metrics, alias/tier matching, old-store byte preservation, migration idempotence,
  retention, current/stale/quoted MAX, pressure determinism, and packaging PASS.
- The deterministic ZIP contains exactly the JS bytes below. Two consecutive
  ZIP/checksum builds are identical. Commands and outputs: `VALIDATION.txt`.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| chatgpt_chat_size_meter_v2241_dual_axis_pressure.js | 332216 | `4466fffc8040905d367c3d4acad05a7108d16599b62c5143e8fbeda5488abac5` |
| chatgpt_chat_size_meter_v2241_dual_axis_pressure.zip | 76275 | `684be62fb15041ec175f13a554f9fbd17f81bd68835d56d97f238af000a7b945` |

Paths: `releases/v2.24.1/chatgpt_chat_size_meter_v2241_dual_axis_pressure.js` and
the same basename `.zip`. Checksums: `releases/v2.24.1/SHA256SUMS`.

Known limitations: a small heterogeneous empirical dataset, upper-frontier
sensitivity to unusual canonical observations, sparse/pooled effort comparisons,
fallback/source differences, missing primary-axis metrics, the 256-event retention
window, and inherited local/multi-tab last-writer behavior. Confidence stays LOW.
The visible result follows available local evidence, so a browser missing the
third MAX or using a different comparison tier can produce different anchors.
Native review must inspect both axis anchors/contributors and combined dominance
on the user's actual store. This run used no native-browser execution and makes no
native acceptance claim. Stop at this checkpoint pending native review.
