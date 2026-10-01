# V2.24.0 calibration-correctness candidate

Prepared 2026-10-01 on `codex/v240-calibration-correctness`, directly from
`2c4e78d80cae6763c3a333841db728060ff669b0`. The new checkpoint is the commit
containing this report; its exact hash is supplied in the delivery message.
Version remains **2.24.0**, with a separate artifact folder/name and diagnostic
identity `V2.24 CALIBRATION CORRECTNESS`. Pressure model version is
`v224-display-ratio-2`. No broader development, push, merge or PR.

## Corrections

`pressureEffort` trims, lowercases and collapses whitespace, then maps only the
demonstrated UI alias **`extra high` -> `max`**. Backend values such as `max`,
`high`, `medium`, `low`, `minimal`, `none` and `xhigh` remain themselves; unknown
labels remain distinct normalized strings; missing/invalid values remain null.
Sample creation/migration, current comparison, effective grouping and summary
counting all use this helper. Existing stored effort labels are preserved on
load and normalized only for the derived comparison view.

Authority for this alias is the USER-REPORTED native V2.23/V2.24 pairing in the
attached revision request: `effortHint: Extra High`, `requestEffort: max` for
`gpt-5-6-thinking`. Repository inspection also found both UI `Extra High` and
backend `max` in `diagnostics/false-max/2026-09-30-fresh-chat-v222.txt` (lines 160
and 173). Those false/suspect-MAX records support effort metadata investigation;
they are never admitted as native MAX calibration evidence. No additional paired
UI/backend aliases were demonstrated, so no others are mapped.

`pressureEffectiveMax` groups selected comparable MAX rows by conversation ID,
trimmed exact model slug and canonical effort. Distinct pre-MAX vectors are
identified by source family plus all eleven compact feature fields. Capture
timestamps and supporting post-MAX vectors cannot manufacture distinct states.
For each setting, prefer canonical pre-MAX vectors and choose the lowest
display-like estimate among distinct pre states. A canonical fresh-post fallback
is eligible only if that setting has no pre vector. Post-MAX supporting vectors
never become additional observations.

Each conversation supplies **at most one anchor contribution**, even when a
same-model comparison pools multiple efforts. Prefer pre-MAX evidence across
settings, then the lowest display-like representative. Exact duplicates are
deduplicated; multiple materially distinct pre states stay in raw provenance and
are exposed through distinct-state counts and min/max ranges. They do not give
one conversation multiple statistical votes. Selection and diagnostics use stable
lexical ordering and earliest-event tie breaking.

Tier sufficiency also uses independent conversations. Exact model+canonical
effort is preferred with two MAX conversations, or one when the whole model
population is still below two. Otherwise use explicitly labeled same-model
fallback. Unknown/different efforts remain distinguishable; unrelated models
never supply anchors. The reported native `extra high` / `max` case now selects
`exact-model-effort`.

Anchor construction retains the original transparent statistic, now applied to
effective conversation contributions: minimum for 1-4, nearest-rank lower
quartile (`ceil(0.25*n)-1`) for >=5. The score remains rounded ratio * 100,
clamped to 0-99; only a verified current MAX displays `PRESSURE MAX`. No observed
MAX values are hard-coded, and colors still use the exact original status logic.

## Confidence and diagnostics

- LOW: fewer than two independent comparable MAX conversations, or the existing
  spread (>10%), pooled effort, selected fallback/source mismatch, overlap or
  current-exceedance conditions.
- MEDIUM: at least two independent exact-effort pre-MAX conversations, <=10%
  spread and matching current source family, with no overlap/exceedance.
- HIGH: the same conditions plus at least **five independent MAX conversations**,
  **ten unique SUCCESS conversations**, and <=5% spread.
- Success samples remain raw research observations. Confidence population counts
  unique conversation IDs in the selected comparison tier. One or more unique
  SUCCESS conversations at/above the anchor forces LOW once; repetitions cannot
  further multiply independent contradiction evidence.

The pressure diagnostics now include `canonicalEffort`,
`rawComparableMaxEpisodeCount`, `effectiveMaxObservationCount`,
`uniqueMaxConversationCount`, `rawComparableSuccessCount`,
`effectiveSuccessObservationCount`, `uniqueSuccessConversationCount`, raw
`contradictorySuccessCount`/`rawContradictorySuccessCount`, and
`effectiveContradictorySuccessConversationCount`. Legacy `comparableMaxCount`
and `comparableSuccessCount` now denote effective conversation counts; the
explicit raw fields retain the episode/attempt totals.

`anchorContributionSummary` exposes each conversation's raw episodes, canonical
efforts, distinct pre/fallback states, pre display-like ranges, selected
effort/role/source and numeric contribution. Normal output previews up to 16
conversations and 8 setting groups per conversation, with omission counts. The
existing sample summary continues to count raw stored events, grouped by canonical
effort. Six repeated episodes on two capped chats therefore report raw=6,
effective=2, unique MAX conversations=2.

## Storage and byte boundary

The existing `cgpt-size-meter-v2101:pressure-calibration-v224` key, schema 1,
256-row cap, retention watermark, migration, compact vectors, dedup keys and
sampling hooks remain. The effective view is derived in memory and cached by
the existing mechanism. Loading, matching, grouping and reading diagnostics do
not rewrite the old store; tests verify exact byte preservation. A necessary
new-evidence write retains existing raw row effort labels/provenance and
canonicalizes newly admitted labels. No raw episodes are deleted to correct
statistical weight. Migration remains bounded and idempotent.

Changed pressure functions: `pressureEffort`, `pressureCleanRow` (preserve loaded
effort), `pressureLoad`, `pressureCompute`, `pressureSummary`; metadata-only
`pressureBlank` model version. Added: `pressureEffectiveMax`. Candidate name,
`eventDiagnostics` header and `copyStats` identity change only their literals.
All other source bytes equal the exact parent, including existing collection,
retention, migration, persistence, current-vector choice, caching, UI, capture,
classification, preflight, SUCCESS/MAX/HTTP handling, Retry, navigation, colors
and storage recovery.

The verifier reconstructs the complete parent plus those exact boundaries and
checks every unchanged pressure helper. The inherited protected checker confirms
67,825 frozen V2.23.5 protected bytes and 65,401 immutable V2.22 bytes (including
preservation of the parent's accepted iterative helper replacements). Negative
parser, migration and status mutations fail. All frozen V2.23.5 and original
V2.24.0 artifacts, baseline, original source fragment and test files equal exact
parent Git bytes.

## Validation

- Frozen references, unchanged: **120/120 V2.23.5**, **99/99 prior checkpoint**,
  **59/59 original V2.24.0**.
- Revised candidate: **120/120 foundation regressions**, **59/59 superseding
  V2.24 regressions**, **31/31 new correctness tests**. **210 distinct active
  cases**, **488 executions** including reference runs.
- The original 59-case file is untouched. Its revision runner explicitly changes
  anchor fixtures from repeated events in one chat to independent conversation
  IDs, changes the obsolete Extra High expectation to `max`, updates the model
  version assertion, and points its source check at this revision. No case is
  removed/skipped. Candidate identity labels are projected only for legacy
  metadata assertions; new tests separately assert the actual revision identity.
- New tests cover native-style alias matching, unknown effort fallback, six raw
  versus two effective MAX events, repeat-invariant confidence/anchor/score,
  distinct pre states, supporting/fallback post-MAX roles, SUCCESS and contradiction
  independence, canonical summary grouping, raw byte preservation on load/append,
  idempotent migration, retention, bounded previews and deterministic ordering.
- Full baseline, protected bytes, syntax, schema/storage, quota/recovery and
  deterministic packaging checks PASS. Two archive/checksum builds are identical;
  the ZIP contains exactly the candidate JS. Commands/output are in `VALIDATION.txt`.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| chatgpt_chat_size_meter_v2240_calibration_correctness.js | 330039 | `106cf0e897c3a20d60e968de50702df22bf3b1b1934dc8e0611d68b7c1f82ca5` |
| chatgpt_chat_size_meter_v2240_calibration_correctness.zip | 75754 | `af25b715c89898dd30bab9e7f5af468541c6e6228da618d7398c51199c83e127` |

Artifacts are under `releases/v2.24.0-calibration-correctness/`. Supporting new
files are `src/v224-correctness/pressure-calibration.js`,
`specs/V2.24.0-calibration-correctness.md`, and six new `*v224-correctness*`
build/package/verify/validate/test scripts. The source patch and full reference,
regression and correctness logs accompany the release.

This is a synthetic validation of the requested native-reported defects, not
native acceptance of the new candidate. One-conversation weighting is deliberately
conservative when a chat has distinct pre states or different efforts. Local
calibration, fallback/comparability and multi-tab last-writer limitations remain.
Native retest should copy the same chat's pressure diagnostics and require
canonical effort `max`, exact tier, raw/effective counts and contribution summary;
repeating Retry at unchanged state must leave effective counts/anchor/confidence
unchanged. Stop after this checkpoint pending native review.
