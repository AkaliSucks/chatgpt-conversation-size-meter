# V2.24.3.2 — Medium canonical-effort repair

Prepared 2026-10-02 on **codex/v2432-medium-effort-repair**, directly from
**849e75ac78c55d5359efa16003783bbb8228c83b**. The checkpoint is the commit containing
this report; its exact hash is supplied in the delivery message. **STOP pending
native review.** No push, merge or PR. The native observation is USER-REPORTED;
reproduction and verification in this run are synthetic/offline.

## Root cause and result

The exact V2.24.3.1 parent leaves backend **standard** unchanged in pressureEffort,
while UI **Medium** normalizes to **medium**. Request ingestion therefore records
requestCanonicalEffort standard, local admission stores standard, and anonymous
MAX selection's canonical identity check rejects standard versus medium before
selecting the usable pre-MAX BATCH vector. Neither MAX detection nor privacy is
the cause.

The first regression reproduces that complete failure on exact parent bytes:
Medium UI, raw/canonical standard request, current pressure medium, verified MAX,
accepted pre-MAX BATCH vector, standard calibration group and refused copy.
The new candidate copies the exact expected JSON in
`fixtures/v22432/medium-max-anonymous-expected.json`: candidate **2.24.3.2**, model
**gpt-5-6-thinking**, canonicalEffort **medium**, outcome **max**, role **pre-max**,
source **batch**, verifiedCurrentMax **true**, pressureState **current-max**, and
all supplied numeric aggregates. The fixture has no IDs, time, content or URLs.

## Canonical effort and historical handling

The only behavioral code change is **pressureEffort** in
`src/v22432/canonical-effort.js`: add the evidenced standard -> medium alias.
The build enforces only that alias and its comment update against the pinned
parent helper. This exact shared module appears once in the shipped JS and is
loaded by the new offline builder. There are no separate alias implementations.

| Input after existing trim/case/whitespace normalization | Canonical effort |
| --- | --- |
| Extra High / max | max |
| High / extended | high |
| Medium / standard | medium |
| every other existing label | unchanged normalized label |
| absent/non-string/blank | null |

Normalization order and 120-character truncation are unchanged. No new aliases,
seeds or thresholds are invented for other labels. Medium, high and max remain
distinct canonical identities and distinct local/builder groups.

Existing request ingestion now derives **requestCanonicalEffort medium** while
retaining **requestEffort standard** and **requestEffortDetected standard**.
Its function body is unchanged. Existing matching, admission, current identity,
effective observation grouping, axis diagnostics, sample projection/validation
and summary evaluation already call the shared helper and now agree on medium.
Registry lookup stays exact and unchanged; its scorer caller supplies canonical
effort. Medium/standard and High/extended have no built-in seed; max keeps the
accepted V2.24.2 seed.

Historical pressure rows retain their original raw standard effort on load and
in storage. Evaluation and grouped diagnostics interpret it as medium. Reads,
copy and repeated completed migration do not rewrite data. A necessary append
retains the prior rows byte-for-field, adding only the new canonical medium row.
Old attempts containing stale requestCanonicalEffort standard still export:
matching normalizes raw requestEffort at evaluation time instead of trusting a
stale canonical field. No destructive migration, schema change, new namespace
or unrelated history rewrite is required.

The inherited explicitly labelled sparse same-model scoring tier remains
unchanged. It may pool local evidence when exact evidence is sparse; canonical
setting groups remain separate. Sufficient exact medium/high/max evidence selects
separate exact tiers. Pooling never selects the max seed for Medium or High.

## Exact changes and preservation

Changed function behavior: **pressureEffort**, adding standard -> medium.
Metadata-only changes occur in **anonymousProjectSample**, **meterStorageFinalResult**,
**eventDiagnostics**, **retryCapture** and **copyStats**. Together with @name and
@version, these are seven candidate identity literals advancing to 2.24.3.2.
No other parent source byte changes.

The new utility **scripts/build-anonymous-seeds-v22432.js** differs from its
V2.24.3.1 counterpart only in its shared-normalizer module path. Its
buildAnonymousSeeds function body, group/duplicate/frontier/contributor handling
and CLI are unchanged. It reuses the unchanged V2.24.3.1 schema. Invoke:

`node scripts/build-anonymous-seeds-v22432.js <anonymous-input.json>`

Raw-input privacy validation precedes normalization; invalid/private fields
cannot be scrubbed away by canonicalizing effort. SUCCESS remains bracketing-only,
duplicates do not create independent observations, and builder candidates are
never automatically installed or persisted.

The privacy validator and complete schema, projection allowlist, anonymous event
selection, storage, migration, scoring, seed registry and UI remain unchanged
apart from the specified version literal. No conversation/message/attempt/episode/
account/user/asset IDs, timestamps, URLs, prompts/responses, file names, mappings
or other private fields enter anonymous export. Tests inject private internal
data and private builder inputs and verify exclusion/refusal and read-only copy.

V2.24.2's original immutable seed remains byte/value identical inside the JS:
gpt-5-6-thinking/max, v2242-anonymous-seed-1, vectors **840795/20075510**,
**847977/15645053**, **571836/27151472**. No Medium or High seed is added.
Pressure model v2242-seeded-dual-frontier-1, LOW confidence, frontier/scoring math,
current MAX override, early hooks, parser/topology/extraction/profiler,
DIRECT/BATCH capture and MAX detection are preserved exactly.

**53 new files only**: one shared normalizer, seven v22432 scripts, one anonymous
expected fixture, one task specification and 43 release files (JS/ZIP,
SHA256SUMS, report, SOURCE_DIFF.patch, VALIDATION.txt and 37 suite transcripts).
All **212** parent files are preserved: **199** exact-byte files, including all
prior artifacts/sources/tests, plus **13** older text files retaining only
pre-existing checkout CRLF. No prior file was edited.

## Tests and artifacts

Node **v24.19.0**, Python **3.13.5**. All checks PASS:

- **29/29** new Medium regressions: exact parent failure/repaired copy, aliases,
  raw/canonical request provenance, canonical admission/grouping, separate effort
  identities, historical read/append/migration/stale metadata, SUCCESS, privacy,
  builder, scores/seed, unsupported calibrating, structured SSE MAX and identity.
- Every unchanged candidate suite: **120/120 + 59/59 + 31/31 + 34/34 + 40/40 +
  45/45 + 31/31**. **389 active cases** including the new Medium tests.
- **1825/1825** frozen/prior case executions; **2214 total recorded case
  executions**. All previous suites and saved false/suspect MAX cases are retained.
- Baseline identity, source/module syntax, exact-parent reconstruction and
  protected-byte checks. **67825** frozen V2.23.5 protected bytes and **65401**
  immutable V2.22 bytes are preserved. Negative mutations to parser, migration,
  scorer, privacy, selection and seed are rejected.
- Storage/quota/recovery, retention, migration idempotence and privacy checks.
- Two deterministic ZIP/checksum builds match, with fixed 2026-10-02 metadata.
  The ZIP contains only the exact tested JS, with no fixtures or diagnostic data.

Full commands/output: **VALIDATION.txt**. Frozen suites are unchanged. The
candidate adapter projects identity metadata and redirects builder/CLI tests to
the new utility; its inherited local-only cohorts keep their established
seed-ineligible synthetic model. No cases are skipped and no old scorer is
substituted. The 29 new cases run actual 2.24.3.2 bytes and metadata.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| chatgpt_chat_size_meter_v22432_medium_effort_repair.js | 347096 | a1e26197db6a6ad4a2344e79da2bf3798f4c1ab29e2b26ac6ebab68fc527dfa6 |
| chatgpt_chat_size_meter_v22432_medium_effort_repair.zip | 80353 | 87f354a4f4eba3985f5801c6dc36bc585c72f8e5aa1dbeb3cea36a4d84113d4e |

Native V2.24.3.2 review remains pending; the candidate was not installed or tested
against live ChatGPT in this run. The supplied aggregate observations and
synthetic reproduction do not establish an official limit or independent native
provenance. The exact-copy fixture is a reproduction of the user's reported
metrics, not a newly observed native event.
