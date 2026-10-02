# V2.24.2 — Bundled Anonymous Seed Calibration

Prepared 2026-10-01 on `codex/v242-anonymous-seed-calibration`, directly from frozen
V2.24.1 `2658874a7acf71c8805677098c08f7e79c7422cc`. Native acceptance of that parent
is USER-REPORTED in the request. The checkpoint is the commit containing this
report; its exact hash is supplied in the delivery message. Candidate version:
**2.24.2**; pressure model: **v2242-seeded-dual-frontier-1**. No push, merge or PR.
STOP pending native review of this candidate.

## Anonymous reference and privacy

Read-only static seed version **v2242-anonymous-seed-1**, selected only for exact
model **gpt-5-6-thinking** and canonical effort **max**:

| Anonymous vector | displayLikeTokens | activeBranchBytes |
| --- | ---: | ---: |
| A | 840795 | 20075510 |
| B | 847977 | 15645053 |
| C | 571836 | 27151472 |

The shipped vectors contain exactly those two positive numeric fields. A/B/C are
table positions, not stored identifiers. The outer seed contains only version,
model, canonical effort and the three-vector array. There are no conversation IDs,
titles, timestamps, prompt/response text, URLs, accounts/users, attempt/episode IDs,
screenshots, mappings, diagnostics, or original conversation provenance. These are
the anonymous empirical observations explicitly supplied for this revision, not
official OpenAI limits or an asserted universal context capacity.

`src/v2242/anonymous-seed.js` freezes the outer object, array, and every vector.
The privacy test enforces exact field allowlists and exact numeric pairs, rejects
identifying fields/UUIDs/URLs, verifies immutability, and confirms those exact static
bytes occur in the shipped JS. The deterministic ZIP contains **only that JS**;
no fixtures, diagnostic files, local data or old conversation provenance are packaged.

## Selection, frontiers and visible behavior

Seed selection uses the existing canonical effort normalization: case/space
normalization and only the demonstrated **Extra High -> max** alias. Missing,
different or unpaired effort labels cannot select this seed; similar/unrelated
model slugs cannot select it. Unsupported settings with insufficient local MAX
evidence remain CALIBRATING. Valid local evidence can still score those settings.

Local tier selection and `pressureAxis` are byte-identical to V2.24.1. They retain
exact-model/effort preference, explicit same-model effort pooling when exact local
evidence is sparse, independent conversation accounting, per-conversation upper
contributions, pre-MAX preference and supporting-post exclusion. Seed selection
is independently exact; local pooling never makes a seed eligible for another effort.

For each selected seed axis, derive its frontier as the maximum of the three
anonymous values. This yields text **847977** and state **27151472**, derived from
the vectors rather than a fabricated single context limit. Effective axis capacity
is **max(seed frontier, valid local frontier)**, or whichever source exists. Local
evidence can extend either frontier upward independently, but cannot lower a seed
frontier. Exact ties report `seed` as the contributing source. This upward-only
policy is an explicit provisional limitation, not evidence that the seed is exact.

The V2.24.1 dual-axis score remains:
`max(current displayLikeTokens / textAnchor, current activeBranchBytes / stateAnchor)`,
rounded after multiplying by 100 and clamped to **0..99**. Only verified **current**
MAX produces **PRESSURE MAX** and the preserved red theme. Historical MAX, ratio
exceedance, quotes and bundled observations never create terminal MAX. Confidence
remains **LOW throughout this revision**, including seed-only and larger local
populations. Three seed profiles are never three locally verified conversations.

With a valid captured current vector and known supported model/effort, a fresh
installation scores immediately without personal MAX events or a generation dispatch.
The production UI test observes the Extra High button and parser-derived model,
then displays **PRESSURE 73 / 100 · LOW** for 453725 / 19686898. Near-boundary SUCCESS
561842 / 26245630 scores **97**, while both text and state boundary fixtures score
**99** until current MAX is verified. A tiny 1000 / 20000 chat scores **0**. Missing
current parser data, model/effort identity or a primary metric still needs capture;
the seed does not invent those facts. Layout, CSS, collapsed/expanded UI and colors
are unchanged. No large UI or official-capacity terminology was added.

## Diagnostics and local storage

New compact diagnostics: `calibrationSource`, `seedVersion`, `seedProfileCount`,
`seedMaxProfileCount`, `seedModel`, `seedCanonicalEffort`, `seedTextFrontier`,
`seedStateFrontier`, `localIndependentMaxConversationCount`, `localTextFrontier`,
`localStateFrontier`, `effectiveTextFrontier`, `effectiveStateFrontier`, and each
effective frontier's `seed`/`local` source. No bundled profile arrays are dumped.

`calibrationSource` describes MAX-capacity evidence: **seed-only**, **seed+local**,
**local-only**, or **calibrating**. A selected seed can remain `seed-only` while the
visible state is CALIBRATING because its current vector is missing. Local SUCCESS
rows do not convert seed-only MAX capacity into locally observed MAX evidence.
Seed diagnostics/counts are zero/null when the exact seed is ineligible.

Axis diagnostics preserve local contribution previews/counts, fallback/source
details and current metrics, adding `localAnchor`, `seedAnchor`, `frontierSource`,
`seedMaxProfileCount`, separate local/seed MAX ranges, and the combined range.
Existing anchor/ratio aliases describe effective combined capacities. Existing raw
MAX/SUCCESS totals and effective/unique counts still count **local rows only**.
Seed-only raw/effective/local MAX counts are zero, and local previews are empty.
The prior low-side provenance summary remains explicitly diagnostic only.

The seed never enters `pressure-calibration-v224`, `pressureUpsert`, migration,
retention, or localStorage. There is no new persistent namespace. Prefix
`const P = 'cgpt-size-meter-v2101';`, schema 1, 256-event local cap, watermark,
codec, dedup, provenance and idempotent migration are unchanged. Existing store
bytes remain unchanged on read; necessary local-evidence writes retain old rows
and record only the new model-version metadata, never seed vectors/diagnostics.
Tests cover empty migration, denied storage, repeated diagnostics/cache reads,
explicit saves, old-store load/append and local retention with the seed active.

## Changes and preservation

Changed functions: **pressureBlank** (model version only), **pressureCompute**
(seed selection, combination and diagnostics). Added **pressureSeed** and
**pressureSeedAxis**, plus the immutable static `PRESSURE_SEED`. Six candidate
identity literals change: userscript name/version, diagnostics/Copy headers,
storage-health version and Retry trace version. Every other parent source byte is
unchanged, including local axis calculation, effective MAX accounting, sampling,
storage, migration, current-vector selection, cache, UI and all V2.23.5 behavior.
No recursion or architecture rewrite was added.

The verifier reconstructs the exact pinned parent and confirms **67825 frozen
V2.23.5 protected bytes** and **65401 immutable V2.22 bytes**, retaining accepted
stack-safe helpers. Parser, migration, local axis, status, Retry and seed one-byte
mutations are rejected. All 80 relevant parent files, including every JS/ZIP,
harness and V2.24.1 artifact, remain exact committed bytes; 13 older text files
retain only pre-existing Windows checkout CRLF. No parent file was edited.

New files only: two `src/v2242/` source fragments, the archived request
`specs/V2.24.2-anonymous-seed-calibration.md`, six `scripts/*v2242*` scripts, and
`releases/v2.24.2/` containing JS/ZIP, SHA256SUMS, this report, SOURCE_DIFF.patch,
VALIDATION.txt and sixteen individual suite transcripts. No old artifact/test
file or actual browser calibration store was changed.

## Validation and artifacts

- All frozen/reference and prior superseding suites: **852/852 case executions**,
  including V2.23.5 120, older checkpoint 99, initial V2.24 59, correctness 31,
  their superseding regressions, and V2.24.1 **120/120 + 59/59 + 31/31 + 34/34**.
- Candidate: **120/120 foundation + 59/59 pressure + 31/31 correctness + 34/34
  dual-axis local regressions + 40/40 seed-specific**. **284 active cases;
  1136 total recorded case executions**. Full commands/output: `VALIDATION.txt`.
- Frozen test files and all cases are preserved. The candidate regression
  adapter uses a deliberately seed-ineligible synthetic model for the older
  31/34-case local-only cohorts, preserving their V2.24.1 local-axis expectations;
  it projects identity metadata and reads the revised local source fragment.
  The actual seed constant/scorer remain active. No cases are skipped and no old
  scorer is emulated. The separate 40-case suite tests the actual supported model,
  all seed interactions and current V2.24.2 identity directly.
- Baseline/syntax/protected-byte, privacy/immutability, storage/quota/recovery,
  migration idempotence, retention, MAX lifecycle, pressure determinism and
  deterministic packaging PASS. Two ZIP/checksum builds are identical and their
  single-file payload matches the candidate JS exactly.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| chatgpt_chat_size_meter_v2242_anonymous_seed_calibration.js | 335735 | `6c298711d9d6f8fe16e3495fc478a240da5f0669e1c63377aef2e481e77028b5` |
| chatgpt_chat_size_meter_v2242_anonymous_seed_calibration.zip | 77257 | `1a5adf30cdda34906e85eb80ecb01106e993d05bd5f7c55befd1c76058dff78d` |

Artifacts: `releases/v2.24.2/chatgpt_chat_size_meter_v2242_anonymous_seed_calibration.js`
and the same basename `.zip`. SHA-256 values are also in `releases/v2.24.2/SHA256SUMS`.

Known limitations: just one supported seed model/effort, only three anonymous
empirical observations, upward-only seed floors that cannot adapt downward,
outlier-sensitive upper maxima, sparse or pooled local effort evidence, missing
current identity/metrics, canonical fallback/source differences, the 256-event
retention window and inherited local/multi-tab last-writer behavior. Seed profiles
cannot be cross-deduplicated against local chats without identifying provenance,
so counts and sources remain separate; no independence-confidence claim is made.
Native acceptance of this candidate is unverified. Stop pending native review.
