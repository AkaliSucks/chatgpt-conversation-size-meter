# V2.24 / 2.24.0 empirical pressure candidate

Prepared 2026-10-01 on `codex/v240-pressure-index`, directly from frozen,
native-validated V2.23.5 checkpoint
`7f02f4d8b9101a8ff481bda4af97e641e04e8ef0`. The checkpoint containing this
report is the first V2.24 candidate commit; its exact hash is reported in the
delivery message (`git log -1 --format=%H -- releases/v2.24.0/RELEASE_REPORT.md`).
No push, merge, PR, or second revision. Native validation of this candidate is
pending. Native validation of the parent is USER-REPORTED authority from the
build request; this run did not access a live ChatGPT test conversation.

The overlay now adds `PRESSURE <integer> / 100 Â· <confidence>` above the useful
raw display-like token line. Missing calibration displays `PRESSURE â€” / 100 Â·
CALIBRATING`; a current verified episode displays `PRESSURE MAX` and retains
the frozen forced-red behavior. Existing colors continue to use `getStatus`.
Pressure does not drive colors, identify an official limit, describe context
usage/remaining capacity, or predict an exact future MAX.

## Exact algorithms

1. Admit compact parser-derived vectors with positive finite display-like tokens,
   mapping bytes, branch nodes and full-capture timestamp; source must be DIRECT
   or BATCH. Numeric strings, missing fields, negative/nonfinite values and
   incomplete vectors cannot become zero-valued observations.
2. SUCCESS uses the associated real attempt's valid pre snapshot captured no later
   than dispatch. Prefer BATCH, then DIRECT; within a family prefer recency. No
   post-success substitute is admitted. MAX uses the same pre selection when
   associated with a real attempt, and separately retains a fresh post-MAX vector
   captured at/after episode onset. Without pre, fresh post becomes the explicitly
   labeled `fresh-post-max-fallback`. One episode is one MAX event.
3. The current vector follows the newest accepted source observation, preferring
   BATCH on equal timestamps. Thus an old BATCH cannot mask a newer DIRECT state.
   Diagnostics expose its family, capture time and metrics. Current identity uses
   the active request model, otherwise snapshot model, otherwise last request
   model; effort uses the observed UI hint, otherwise the last matching request.
   Effort case/whitespace are normalized. Model aliases and effort aliases are
   never guessed; unknown effort is not an exact-effort comparison.
4. Prefer exact model+effort with at least two MAX events. If exact-effort evidence
   is insufficient, use the explicitly labeled same-model tier. When the entire
   model population has fewer than two MAX events, one exact MAX is preferred to
   pooling. Without a same-model MAX anchor, report CALIBRATING. Unrelated models
   never provide anchors.
5. For one through four comparable MAX events, anchor = minimum canonical
   display-like estimate. At five or more, use the nearest-rank lower quartile:
   sorted values at `ceil(0.25 * count) - 1`. Ratio = current display-like estimate
   / anchor. Visible score = `clamp(round(100 * ratio), 0, 99)`.
   Only a current verified MAX selects terminal `PRESSURE MAX`; score never
   reaches 100. No observed fixture value is hard-coded into this algorithm.
6. Confidence LOW with fewer than two MAX events, spread over 10%, pooled effort,
   post-MAX fallback, or source-family mismatch. MEDIUM requires at least two
   exact-effort pre-MAX events, spread <=10%, and matching current source family.
   HIGH additionally requires at least five MAX events, ten SUCCESS events and
   spread <=5%. Spread is `(largest MAX - smallest MAX) / anchor`.
   Comparable SUCCESS at/above the anchor or current non-MAX state at/above it
   forces LOW and records the overlap/exceedance. These flags do not prove a
   generation succeeded in the currently displayed state.

Secondary fields are exposed as current/min/max comparisons, without scoring
weights: active-branch, mapping, retained and tool-result bytes; retained share;
hot128/hot256; strong context markers; branch/message nodes. Diagnostics include
the comparison tier, counts, anchor/range/spread, unclamped ratio, confidence
reason, fallback/source mismatch, success overlap and unscored reason. The
separate sample summary groups counts by model/effort and exposes time bounds,
retention policy and migration status. No raw sample array is added to normal
copied diagnostics.

## Storage, deduplication and migration

One new origin-wide key:
`cgpt-size-meter-v2101:pressure-calibration-v224`.
Logical schema 1: `modelVersion`, `samples`, `watermark`, `retentionCount`,
`migration`, `lastError`; the existing lossless storage codec supplies the write
envelope. Each allowlisted row holds conversation/event/attempt/episode identity,
outcome, timestamp, model/effort, identity and confirmation provenance, canonical
vector and optional supporting post-MAX vector. Raw mappings, body/stream text,
large diagnostic objects and unrelated properties are excluded.

Cap: **256 event rows, at most 512 vectors**. Retain newest rows by event timestamp
then key; a monotonic eviction watermark rejects replay of evicted older events,
including after reload. Dedup key = conversation + outcome + event ID. First
evidence is stable; only missing-vector, fallback-to-pre or DIRECT-to-BATCH
promotion can improve a vector. Repeated fresh captures do not manufacture MAX
events or continually replace the supporting vector. Synthetic full-cap storage
is 51,677 serialized bytes (actual size depends on identity/metrics).

At UI boot or event persistence, derive compatible evidence from existing V2.23
attempt and episode stores. One bounded origin-name scan examines up to 128
matching keys, reads <=1 Mi characters/key and <=4 Mi characters total, and keeps
only the last ten attempts/episodes from each store. Normal/key-table/LZW records
use the existing decoder. Require attempt schema 3, real network dispatch,
SUCCESS confirmation or a recognized verified episode confirmation, known model,
matching conversation identity and valid compact vectors. Skip malformed,
incomplete, inferred V2.22 and unlinked historical MAX evidence safely. Migration
does not write old keys. The persisted completion marker plus event dedup makes
migration idempotent. Empty migration saves no new key: it stays complete in
memory and may rescan once on a later empty reload, until useful evidence is saved.

Unlinked live MAX may collect a fresh fallback using the live snapshot model/UI
effort, with explicit provenance. Migration cannot invent that identity for an
old unlinked episode. SUCCESS/error/unknown and episode semantics themselves are
unchanged. Successful pre vectors at/above an empirical anchor remain evidence.
Unsupported/corrupt existing pressure storage is preserved with writes blocked;
in-memory collection remains bounded and its persistence limitation is visible.
Quota failures retain in-memory evidence and appear in pressure/storage health.

Model results are cached by compact current vector, identity, active-MAX state
and calibration revision; caches are bounded. No extra request, BATCH replay,
polling, recursion or per-render localStorage scan is introduced. Copy diagnostics
does not initialize/write the store. The inherited V2.23.5 scheduling remains.

## Preservation and validation

All V2.23.5 release files equal exact frozen Git bytes. The V2.22 baseline remains
289,994 bytes, SHA-256
`08bf10714deae924ced7716b5b63f873ba56b11d782289b92d55de62af343696`.
Checkout-only CRLF conversion was restored to committed LF bytes before checking.
No baseline function or frozen artifact content is changed in the checkpoint.

The byte verifier checks **67,825 frozen protected bytes**, including every named
parser, extraction, topology and retained profiler region, and **65,401 immutable
V2.22 bytes**, accounting only for the parent's already accepted iterative helper
exceptions. Both iterative helpers remain exact V2.23.5 bytes. Early hooks,
send/preflight correlation, classifier, MAX detection/finalization, HTTP terminal
handling, capture publication, `getStatus`, Retry/navigation cancellation and
storage recovery/retention remain unchanged. A reproducible builder checks the
entire source against the frozen parent plus only the documented integrations.
Negative one-byte parser and Retry mutations fail verification.

- Unchanged frozen hotfix harness: **120/120 PASS** on V2.23.5.
- Exact original prior harness/source at `3337f1b`: **99/99 PASS**.
- Unchanged 120-case hotfix harness on V2.24: **120/120 PASS**. Its six candidate
  identity literals are projected in memory to the frozen labels expected by
  version-specific assertions; no cases, behavior, fixtures or expectations are
  changed/skipped. A separate new test verifies actual 2.24.0 metadata.
- Separate V2.24 suite: **59/59 PASS**. Total active distinct cases: **179**;
  total executions including frozen reference runs: **398** (prior 99 overlap).
- Baseline verification, source/candidate/harness syntax, storage schema, migration
  idempotence, malformed/unsupported storage, deterministic retention/replay,
  pressure determinism, active/stale MAX and actual fake-DOM rendering PASS.
- Existing SUCCESS, forced-red MAX, clearance, HTTP ERROR/resend identity,
  12,000-deep / 24,000-node profiling, Retry and quota-recovery regressions PASS.
- Saved false-MAX diagnostics remain regression fixtures; quotes/streamed phrases
  do not enter calibration. A/B's approximate MAX and ~438k healthy vectors are
  explicitly synthetic fixtures, not new native observations or production seeds.
- Two package builds have identical ZIP/checksum bytes; the ZIP contains one JS
  member equal to the candidate. Full output is in `VALIDATION.txt`.

## Function and file impact

Runtime integrations: `eventSaveEpisodes` and `saveAttemptState` add guarded
collection taps after existing persistence; `startUI` initializes migration;
`eventDiagnostics` adds two concise sections; `render` adds pressure text while
keeping raw estimates/themes. Metadata-only updates: `meterStorageFinalResult`,
`retryCapture`, `copyStats`, userscript name/version/header. No protected-region
edits. Nineteen new `pressure*` helpers live in the source fragment; integration
is surgical and reproducible rather than a capture/parser rewrite.

Changed files (all new):

- `specs/V2.24-pressure-index.md`: attached V2.24 request, with LF line endings.
- `src/v224/pressure-calibration.js`: compact empirical model/storage helpers.
- `fixtures/v224/pressure-vectors.json`: ten labeled synthetic scenarios.
- `scripts/build-v224.py`, `scripts/package-v224.py`, `scripts/validate-v224.py`.
- `scripts/test-v224.js`, `scripts/test-v224-regressions.js`,
  `scripts/test-v224-prior.js`, `scripts/verify-v224-protected.js`.
- `releases/v2.24.0/chatgpt_chat_size_meter_v224_empirical_pressure.js` and `.zip`.
- `releases/v2.24.0/SHA256SUMS`, `SOURCE_DIFF.patch`, `VALIDATION.txt`,
  `RELEASE_REPORT.md`, `FROZEN_HOTFIX_TESTS.txt`, `PRIOR_CHECKPOINT_TESTS.txt`,
  `REGRESSION.txt`, `PRESSURE_TESTS.txt`.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| JS | 325131 | `b4f042e04f4369c8e830d0f6dd41239054b5134c580cf5d3d1c58b89cdaef866` |
| ZIP | 74583 | `259c906b04fe91117cbfe4bd98110babdd8468e2637c872742af92c34a8ceda3` |

## Known limitations and next native gate

Anchors are local empirical correlations and can overlap successful operation.
Min/lower-quartile selection is conservative, not a proven universal threshold.
Model aliases, unobserved effort, source freshness/representation differences,
post-MAX fallback and missing pre snapshots limit comparability. Migration is
bounded and intentionally incomplete; this repository has no current raw V2.23
native A/B captures with which to independently verify all historical identities.
Unsupported/unknown data is not seeded from summaries. Storage is cached per page;
simultaneous tabs can race with last-writer behavior, so collect initial native
calibration using one active meter tab and preserve copied evidence.

For native validation, install this ZIP alone and retain existing origin data.
Use ordinary isolated chats: check CALIBRATING/score and copied pressure summary
after a normal SUCCESS; inspect each existing capped chat without generating a
giant prompt, require `PRESSURE MAX`/red, then Retry Capture once and check one
episode with canonical/supporting roles. Repeat Retry/reload to check dedup, and
check clearance/navigation restores nonterminal pressure and ordinary colors.
Review calibration tier, confidence reason, timestamp and any migration skips.
Native rendering, browser timing, model/effort labels, real storage population
and multi-tab concurrency remain unvalidated. Stop here until this candidate's
native validation is reviewed.
