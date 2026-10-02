# V2.24.3 — Multi-Profile Anonymous Seed Builder

Candidate **2.24.3**, prepared 2026-10-02 on
`codex/v243-multi-profile-anonymous-builder`, directly from
`be93e49e6c69bf8bd87a7de8e830382afb71f810`. Native acceptance of that V2.24.2 parent
is USER-REPORTED in the request. The checkpoint is the commit containing this
report; the delivery message supplies its exact hash. **STOP pending native
review.** No push, merge or PR.

The candidate adds an exact model/effort seed registry, a manual anonymous copy
action, and an offline builder. V2.24.2 scoring, local calibration accounting,
MAX detection, storage and the collapsed overlay remain unchanged.

## Registry and preserved seed

`ANONYMOUS_PRESSURE_SEEDS` is an immutable array of immutable entries containing
`model`, `canonicalEffort`, `seedVersion`, and `profiles`. It contains exactly
one entry: **gpt-5-6-thinking / max / v2242-anonymous-seed-1**. That entry references
the original immutable `PRESSURE_SEED` object and its original profile array.
The entire V2.24.2 seed source is copied byte-for-byte into `src/v2243/anonymous-seed.js`
and stays byte-identical inside the candidate:

| Profile | displayLikeTokens | activeBranchBytes |
| --- | ---: | ---: |
| A | 840795 | 20075510 |
| B | 847977 | 15645053 |
| C | 571836 | 27151472 |

The text frontier remains **847977**, the state frontier **27151472**. A/B/C are
table positions, not identifiers. These are supplied anonymous empirical
observations, not official limits or a universal capacity claim.

Lookup uses exact model and exact canonical effort after the unchanged effort
normalization, including the demonstrated Extra High -> max alias. No High,
Medium, Low, Instant or other-model seed is shipped. Unsupported settings without
valid local calibration stay CALIBRATING. Future validated entries use the same
shape and lookup; the scoring algorithm needs no change.

`pressureCompute`, `pressureSeedAxis`, `pressureAxis`, `pressureBlank`, and every
other pressure helper except `pressureSeed` are byte-identical to V2.24.2. The
pressure model remains **v2242-seeded-dual-frontier-1**. Effective frontiers remain
`max(seed, valid local)` separately for text and state; combined ratio remains
`max(textRatio, stateRatio)`. Nonterminal scores remain rounded and clamped to
**0..99**, with **LOW** confidence. Only existing verified current MAX gives
**PRESSURE MAX**. Seed-only and seed+local behavior are unchanged.

## Anonymous export

Expanded diagnostic controls add **Copy anon sample** beside Copy diagnostics
and Retry capture. The action copies a small, pretty-printed JSON object to the
clipboard. It neither polls MAX nor forces capture, sends network requests,
admits samples, changes counters, finalizes attempts, migrates data, nor persists
exports. It reads existing caches or bounded persisted bytes directly rather
than calling state loaders that can repair or finalize state.

Schema **1**, candidate version **2.24.3**, uses only these fields:

| Field(s) | Value |
| --- | --- |
| schemaVersion, candidateVersion | 1, "2.24.3" |
| model, canonicalEffort | exact public model slug and canonical effort |
| outcome | max or success |
| snapshotRole | MAX: pre-max, fallback, current-max; SUCCESS: success-pre, current |
| sourceFamily | batch or direct |
| displayLikeTokens, activeBranchBytes, mappingBytes, branchNodes | finite positive primary aggregates |
| retainedBytes, toolResultBytes, messageNodes | finite nonnegative aggregates or explicit null when unknown |
| retainedShare, hot128, hot256, strongContextMarkers | optional finite nonnegative aggregates or explicit null |
| verifiedCurrentMax | true for an existing current MAX episode; false for SUCCESS |
| pressureState | current-max, scored or calibrating |

The exporter includes all listed metric keys; unknown secondary measurements
stay null. It rejects missing identity or invalid/unknown primary axes rather
than inventing values. Copy succeeds only after schema/privacy checks, a 4096
character ceiling, and a current-chat check. Clipboard failure or unavailable
evidence produces visible failure feedback; concurrent anonymous copies coalesce.
Copy diagnostics and Retry keep their original implementations and behavior.

For MAX, prefer a current exact-model/effort canonical pre-dispatch vector, using
the unchanged BATCH-first selection and timestamp eligibility internally. An
accepted fresh post-MAX vector is labelled **fallback**. A final current capture
must be at or after the existing MAX episode and is labelled **current-max**.
Linked model/effort mismatch, cleared MAX, and stale fallback/current captures
refuse export. Internally used event identities and times never enter the result.

SUCCESS requires the latest real generation to have a confirmed successful
outcome for the selected model/effort. A stable capture at/after completion is
labelled **current**; otherwise its accepted pre-dispatch vector is
**success-pre**. In-flight or failed latest generations cannot borrow an older
SUCCESS. A visible but not yet tracked MAX refuses a SUCCESS export. Quoted MAX
text remains ordinary conversation text through the unchanged detector.

## Privacy boundary

Projection constructs a new literal object from an exact header/metric allowlist.
It never serializes an attempt, episode, snapshot, mapping or diagnostic object.
The recursive validator checks every own key through nested arrays/objects,
normalizing punctuation and case. It refuses conversation/message/attempt/episode/
account/user/asset IDs, timestamp fields, titles, prompts/responses/content,
URLs, file names, screenshots, raw mappings and diagnostics. URL/UUID/ISO-time
values, nonfinite numbers, accessors, symbols, cycles/repeated references and
excessive structure also fail closed. The schema validator further rejects
unknown fields, invalid types and contradictory outcome/MAX/role combinations.

Tests inject private data into the internal source and verify that none reaches
the clipboard. Nested forbidden-key and malformed-input tests verify refusal.
Only aggregate numbers and public calibration labels are shared. The ZIP
contains only the release JS, with no test fixtures or real conversation data.

## Offline builder

`scripts/build-anonymous-seeds.js` accepts anonymous samples as a JSON array, or
`{"samples":[...],"groupKeys":[...]}`. Invoke
`node scripts/build-anonymous-seeds.js <anonymous-input.json>` or provide JSON
on stdin. Its exported `buildAnonymousSeeds(samples,{groupKeys})` function is
also callable by tests. The utility validates each sample with the production
privacy/schema functions and never writes or installs its result.

- Group by the exact `[model, canonicalEffort]` pair. No aliasing or borrowing.
- Only validated MAX samples establish candidate profiles. SUCCESS contributes
  diagnostic counts and text/state ranges; a success-only group creates no seed.
- Keep every distinct scored text/state pair; text and state frontiers are their
  independent maxima. Keep the complete contributing anonymous MAX samples in
  `contributingMaxVectors`, including heterogeneous secondary metrics/provenance.
- Optional caller group keys are separate anonymous declarations, never export
  fields and never echoed. Repeated samples within one supplied observation
  collapse. Different labels sharing a scored vector merge transitively, so
  duplicate vectors cannot inflate declared observation counts. Unkeyed samples
  make no independence claim. `independenceVerified` is always false.
- Candidate profiles, groups and contributing vectors are deterministically
  ordered. Invalid samples are counted without echoing private values.

Builder output uses `seedVersion: candidate-anonymous-builder-1`; it is only a
candidate proposal for later evidence review. It is not automatically added to
the static registry or local calibration. Sample labels and caller grouping
cannot independently prove native provenance or independent observations.

## Files and preservation

Changed existing candidate functions: `pressureSeed` (registry lookup),
`quickActionsMarkup` (one extra expanded button), `paintQuickActions` (button
feedback), `bindUI` (one new action case). Added `anonymousReadState`,
`anonymousSampleForChat`, `anonymousPrivacyValid`, `anonymousSampleValid`,
`anonymousProjectSample`, `copyAnonymousSample`, `runAnonymousCopy`. The quick
action state gains `anon`; six release identity literals advance to 2.24.3.

**41 new files only**:

- Five `src/v2243/` fragments: `anonymous-seed.js`, `seed-registry.js`,
  `pressure-calibration.js`, `anonymous-schema.js`, `anonymous-export.js`.
- Seven scripts: `build-v2243.py`, `package-v2243.py`, `validate-v2243.py`,
  `verify-v2243.js`, `test-v2243.js`, `test-v2243-regressions.js`,
  `build-anonymous-seeds.js`.
- Archived request: `specs/V2.24.3-multi-profile-anonymous-seed-builder.md`.
- 28 files in `releases/v2.24.3/`: JS, ZIP, SHA256SUMS, this report,
  SOURCE_DIFF.patch, VALIDATION.txt, and 22 individual suite transcripts.

The exact-parent reconstruction check permits only the new fragments, registry
lookup, four expanded-control edits and six identity fields. All other candidate
bytes—including collapsed UI, CSS, parser/capture lineage, early hooks, local
storage, migration, MAX detector and original Copy/Retry runner—remain unchanged.
Protected checks confirm **67825 frozen V2.23.5 bytes** and **65401 immutable
V2.22 bytes**. Negative one-byte edits to parser, migration, scorer, old runner,
new exporter and seed are rejected.

All **111** exact-byte parent files, including every V2.24.2 artifact and all
test harnesses, remain unchanged. **13** older text files retain only their
pre-existing Windows checkout CRLF; all 124 parent files are preserved.
`const P = 'cgpt-size-meter-v2101';`, schema 1, the 256-event cap and existing
namespaces are unchanged. Built-in profiles never enter pressure-calibration-v224.

## Validation and artifacts

All checks PASS using Node **v24.19.0** and Python **3.13.5**:

- Candidate: **120/120** foundation, **59/59** pressure, **31/31** correctness,
  **34/34** dual-axis, **40/40** unchanged seed tests, **45/45** new registry,
  export/privacy and builder tests: **329 active cases**.
- Frozen/prior reference suites: **1136/1136** case executions. **1465 total**
  recorded case executions. Saved false/suspect MAX fixtures remain covered.
- Baseline identity, candidate/module syntax, protected bytes, reconstruction,
  storage/quota/recovery, migration idempotence, retention, MAX/SUCCESS lifecycle,
  seed equivalence, deterministic frontiers and privacy/refusal checks.
- Two deterministic ZIP/checksum builds match; the ZIP's only payload is the
  exact tested JS. Fixed archive metadata is 2026-10-01 for reproducibility.

Frozen V2.24.2 test files/cases are unchanged. The regression adapter projects
version literals only. Its inherited V2.24.2 adapter keeps seed-ineligible
synthetic model identities for the earlier 31/34 local-only cohorts. No cases
are skipped and no old scorer is emulated. The unchanged 40-case seed suite
exercises the actual supported seed; the 45-case suite uses actual 2.24.3 bytes.
All commands and outputs are in `VALIDATION.txt`.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| chatgpt_chat_size_meter_v2243_anonymous_seed_builder.js | 346971 | 7c603b00cb7c5b6402e433523f4c4821cade4b590ae636fd682f81b102b6dd81 |
| chatgpt_chat_size_meter_v2243_anonymous_seed_builder.zip | 80330 | 11d5f0fcbdc3f6ca8d9192b672614b0519312f1b9189709f0092be7037b397b0 |

## Limits and pending review

Validation is synthetic/offline; this candidate has not been installed or
reviewed against live ChatGPT in this run. Native V2.24.3 review remains pending.
Aggregate exports intentionally omit identifiers/times and therefore cannot
establish native provenance or independence on their own. Copy requires
clipboard access and sufficient confirmed event/capture/identity evidence;
unknown fields remain null and unusable samples are refused. No additional
model/effort thresholds or independent evidence are invented. Existing empirical
frontiers and upward-only local extensions remain provisional and LOW confidence.
