# V2.24.3.1 — Anonymous MAX effort normalization repair

Prepared 2026-10-02 on **codex/v2431-effort-normalization**, directly from
**913458c7be3a07a2cdadb73736170d591500a52c**. The checkpoint is the commit containing
this report; the delivery message gives its exact hash. **STOP pending native
review.** No push, merge or PR. Native evidence supplied in the request is
**USER-REPORTED**; the reproduction and verification here are synthetic/offline.

## Proven root cause

V2.24.3 `pressureEffort` maps only Extra High -> max. Raw backend **extended**
therefore stays extended while UI **High** becomes high. `pressureCurrent`
selects the UI's high, but admission through `pressureCleanRow` stores extended.
`anonymousSampleForChat` correctly compares normalized request effort with
current effort; because the normalizer leaves extended unchanged, its linked
MAX identity check fails before the valid pre-MAX BATCH vector can be exported.
This is an alias-normalization defect, not a missing-vector or privacy failure.

The first new regression runs the **exact parent release bytes** and confirms:
effortHint High; requestEffort/requestEffortDetected extended; accepted BATCH
840795 tokens / 20075510 active bytes; current pressure canonicalEffort high;
verified current MAX; persisted extended group; anonymous selection null and
copy false. The repaired candidate then copies the exact expected anonymous
object in `fixtures/v22431/high-max-anonymous-expected.json`, including every
supplied numeric field, canonicalEffort **high**, role **pre-max**, and
pressureState **current-max**. The fixture contains no private identity or time.

The inspection also found that schema validation allowed only three-part version
strings. It now permits three or four numeric parts so **2.24.3.1** is valid;
five-part/malformed values remain invalid. This is release metadata support,
not a change to private-field validation or sample eligibility.

## One authoritative normalizer

`src/v22431/canonical-effort.js` defines **pressureEffort**. The build and verifier
enforce that these exact function bytes appear once in the shipped JS and match
the new pressure fragment. The new offline builder loads this same module before
loading the production schema. There is no separate builder alias table.

| Input after existing trim/case/whitespace normalization | Canonical effort |
| --- | --- |
| extra high, max | max |
| high, extended | high |
| every other existing label | unchanged normalized label |
| absent/non-string/blank | null |

Existing 120-character truncation and normalization order are preserved. No
aliases are invented for xhigh, extra-high, Thinking, Medium, Low or other labels.
High and max are never aliases of each other.

Request parsing continues to capture raw values unchanged. `attemptApplyRequestMeta`
adds **requestCanonicalEffort** separately while keeping requestEffort and
requestEffortDetected **extended**. Existing pressure admission, comparison,
current identity, effective grouping, axis contributions, summary diagnostics
and anonymous matching already call pressureEffort and now agree on high.
Historical attempts lacking the new field continue to work by normalizing their
raw request effort during evaluation; no stored field is required for matching.

`anonymousProjectSample` also calls the authoritative normalizer rather than
trusting an input label. `anonymousSampleValid` requires the final export label
to equal its canonical form. Registry lookup remains exact and byte-identical;
its existing scorer caller passes authoritative canonical effort. High/extended
select no built-in seed, while max/Extra High retain the existing max seed.

Use the new utility **scripts/build-anonymous-seeds-v22431.js** for this candidate:

`node scripts/build-anonymous-seeds-v22431.js <anonymous-input.json>`

It checks raw input privacy first, canonicalizes effort with pressureEffort,
then applies the production schema without removing unknown fields. Extended,
High and high group together; max and Extra High form a separate group. MAX-only
frontiers, contributing vectors, duplicate collapse, declared-observation counts,
SUCCESS-only bracketing and deterministic order are unchanged. The original
builder remains frozen with the accepted V2.24.3 checkpoint. No builder output is
automatically installed, persisted or treated as verified native evidence.

## Historical data and privacy

Existing pressure rows are still loaded with **preserveEffort=true**. Their
stored/raw effort extended remains available; comparison, aggregation and
diagnostics normalize it to high at evaluation time. Loading, evaluating,
repeated migration and anonymous copy leave existing store bytes unchanged.
A necessary later append preserves old rows—including their original extended
provenance—and adds the new row with effort high. No destructive migration,
schema change, new namespace, event renumbering or history rewrite is needed.

High/max canonical groups stay distinct. The inherited explicitly labelled
same-model tier can still pool sparse local evidence; this repair does not alter
that accepted scoring policy. Such pooling never makes the max seed eligible
for High, and the canonical setting groups remain separate. When High has
sufficient exact evidence, its exact-model-effort tier excludes max observations.

**anonymousPrivacyValid is byte-identical** to the parent. The exact field
allowlist, aggregate projection, recursive forbidden-key checks and value/structure
refusals remain active. No conversation, message, attempt, episode, account,
user or asset IDs, timestamps, URLs, prompts/responses, names, screenshots or
raw mappings reach anonymous exports. requestCanonicalEffort belongs to raw
attempt diagnostics only and does not enter the anonymous object.

Tests inject forbidden fields both into internal vector data and builder input,
confirm their exclusion/refusal, and retain every previous privacy case. Copy
does not change storage bytes, namespaces, calibration counts or MAX detection.

## Exact changes and preservation

Changed production functions, and only these:

1. **pressureEffort** — adds evidenced extended -> high alias using the shared module.
2. **attemptApplyRequestMeta** — adds canonical request metadata; keeps both raw fields.
3. **anonymousSampleValid** — canonical identity agreement and four-part version support.
4. **anonymousProjectSample** — canonicalizes exported effort and sets candidate 2.24.3.1.

Dev-only **buildAnonymousSeeds**, in the new versioned utility, canonicalizes
validated inputs using the same helper. Six existing candidate identity literals
advance to 2.24.3.1; anonymous projection supplies the seventh version literal.
No UI, CSS, capture scheduling, request classification, transport, MAX detection,
event selection, storage codec, local retention or scoring function is changed.

The entire anonymous export/selection fragment and seed registry are unchanged.
V2.24.2's original seed source remains embedded byte-for-byte:
gpt-5-6-thinking/max, version v2242-anonymous-seed-1; vectors
**840795/20075510**, **847977/15645053**, **571836/27151472**. No High seed is added.
Pressure model version remains v2242-seeded-dual-frontier-1. Scoring/frontier
math, LOW confidence, seed-only/seed+local behavior and current MAX override are
unchanged, with only the required canonical identity interpretation repaired.

**47 new files only**: three src/v22431 fragments, seven scripts with v22431 in
their names, one anonymous expected fixture, the V2.24.3.1 task specification,
and 35 release files: JS/ZIP, SHA256SUMS, report, SOURCE_DIFF.patch, VALIDATION.txt,
and 29 suite transcripts. Every parent file is preserved: **152 exact-byte files**
plus **13** older text files retaining only pre-existing checkout CRLF, **165 total**.
All V2.24.2 and accepted V2.24.3 artifacts, sources and test files remain untouched.

## Verification

Node **v24.19.0**, Python **3.13.5**:

- **31/31** new effort regressions: parent failure/repaired copy, all known aliases,
  raw provenance/canonical metadata, separate groups, historical read/append/
  migration, SUCCESS compatibility, privacy, builder, seed, unsupported settings,
  structured SSE MAX and release identity.
- Candidate's unchanged suites: **120/120 + 59/59 + 31/31 + 34/34 + 40/40 + 45/45**.
  **360 active cases** including the new regressions.
- All frozen/prior suites: **1465/1465 case executions**. **1825 total recorded
  case executions**. Saved false/suspect MAX regressions remain covered.
- Immutable baseline, syntax, exact-parent reconstruction, protected-byte checks,
  storage/quota/recovery, retention and migration idempotence PASS.
- Protected checks: **67825 frozen V2.23.5 bytes**, **65401 immutable V2.22 bytes**;
  MAX detector/finalizer, early hooks, parser/extraction/topology/profiler and
  capture lineage remain unchanged. Negative edits to parser, migration, scorer,
  privacy, export selection and seed are rejected.
- Two ZIP/checksum builds match. Fixed metadata is 2026-10-02. The ZIP contains
  only the exact tested JS, with no fixture, local data or diagnostic files.

Full commands and outputs: **VALIDATION.txt**. Every frozen suite/case is unchanged.
The new regression adapter projects version literals for earlier assertions and
redirects the 45-case builder/CLI tests to the repaired utility. Its inherited
local-only 31/34 cohorts retain their existing seed-ineligible synthetic model.
No cases are skipped and no old scorer is substituted. New effort tests execute
actual 2.24.3.1 metadata and production behavior directly.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| chatgpt_chat_size_meter_v22431_effort_normalization.js | 347058 | 5ee71a060d08570073a202dcef25700d5eeb559472f872613206b37f6e98efde |
| chatgpt_chat_size_meter_v22431_effort_normalization.zip | 80336 | 9be7fa8454f3478f66ac7b39437dd73589dfb8cd57370658205da4237e2cba0c |

The repair has not been installed or tested against live ChatGPT in this run.
Native review must confirm the user-reported High MAX case and ordinary SUCCESS
copy in the actual browser. These empirical observations do not establish an
official limit, threshold or independent native provenance.
