# V2.24.4.1 — Current pressure model identity repair

Branch: **codex/v2441-current-model-identity**. Direct parent:
**904798397da384c1eee4190035647a22b521464f**. The candidate commit is the commit
containing this report; its exact hash is returned in the delivery message.
**STOP pending native review.** No push, merge or PR. Native V2.24.4 seed isolation
and the stale-model observation are USER-REPORTED. This run's verification is
synthetic/offline; the candidate was not installed or tested against live ChatGPT.

## Exact root cause and repaired result

In the exact parent, pressureCurrent chooses:

`current.requestModel || snapshotModel || (current || last).requestModel`

SUCCESS finalization clears store.current and archives the request into last and
attempts. The snapshot therefore wins over the completed request, including on
refresh. Calibration already uses request provenance correctly, so it can store
gpt-5-5-instant/null SUCCESS while current pressure still reports the stale
gpt-5-6-thinking snapshot identity. The first regression reproduces both completed
and refreshed wrong-model results against exact parent bytes, with correct
SUCCESS storage. No parser, seed lookup, effort alias or scorer defect causes
this discrepancy.

The repaired completed/refreshed native reproduction reports:
**model gpt-5-5-instant; effort/canonicalEffort null; state calibrating;
seedProfileCount/seedMaxProfileCount 0; seedModel/seedCanonicalEffort/
seedTextFrontier/seedStateFrontier null**. Exact fields are preserved in
`fixtures/v22441/current-pressure-expected.json`.

The existing BATCH size vector remains unchanged, including all supplied metrics.
Pressure output keeps **model** separate from **currentSourceVector**, including
its existing sourceFamily/fullCapturedAt/snapshotRole. Snapshot topology's
currentModel remains gpt-5-6-thinking. No static snapshot or historical request
model is rewritten to manufacture agreement between identity and captured state.

## Explicit identity precedence

Only **pressureCurrent** changes behavior. Its isolated source is
`src/v22441/pressure-current.js`.

1. Search the current chat's current, last and retained attempts for authoritative
   requests: conversationId exactly matches the chat, any supplied raw
   requestConversationId also matches, trigger is network-generation-dispatch,
   requestParsed is true, and requestModel has a usable existing pressureLabel.
2. Select the latest by requestDetectedAt, falling back to startedAt; break equal
   times by higher attempt ID. Missing times sort as zero. Completion time and
   array position do not make an older request newer. Sort a temporary array;
   retained records are never reordered or rewritten.
3. Prefer that request model over static snapshot model metadata, including
   after completion or refresh. Request authority selects identity; snapshot
   capture time independently selects the size vector.
4. When no authoritative request exists, retain the accepted fallback order:
   current request model, snapshot/model inference, then last request model.
   Exclude known foreign-conversation records from fallback as well. Legacy
   fallback records without conversation metadata retain prior handling.

Effort selection keeps the accepted rule: UI hint first, otherwise the matching
request's raw effort through the unchanged canonical normalizer. The chosen
authoritative request supplies the matching request context. pressureCurrent's
identitySource explicitly labels the authoritative model source; pressureResult
and scorer schemas remain unchanged.

Unsupported gpt-5-5-instant with null/high/medium/max receives no thinking seed.
Returning to a parsed gpt-5-6-thinking request restores exact max/high/medium
lookup, three profiles, frontiers 847977/27151472 and LOW confidence.

## Exact changes and preservation

Behavioral function change: **pressureCurrent** only. Metadata-only changes:
**anonymousProjectSample, meterStorageFinalResult, eventDiagnostics, retryCapture
and copyStats**, plus userscript @name/@version, seven identity literals total.
Reversing this function replacement and metadata reconstructs every parent byte.

Seed registry and original Extra High constant are byte-identical to V2.24.4.
Canonical helper and aliases remain byte-identical: Extra High/max -> max,
High/extended -> high, Medium/standard -> medium; other supported labels retain
their existing handling. Raw requestModel/requestModelDetected, requestEffort,
requestEffortDetected and requestCanonicalEffort provenance remains unchanged.
No migration or destructive history rewrite is required.

Scorer/frontier formulas, local evidence tiering, numeric cap at 99, verified
current-MAX override, LOW confidence, anonymous privacy/schema/selection, storage
and migration behavior, parser/capture/MAX detection and offline builder are
unchanged. Storage prefix remains **cgpt-size-meter-v2101**. No seed persistence.
Anonymous sample selection is outside this narrowly scoped current-pressure fix.

**71 new files only**: one current-identity module, one expected fixture, one task
spec, six scripts and 62 release files. All **326** parent files are preserved:
**313** byte-identical files plus **13** older text files retaining pre-existing
checkout CRLF only. All prior sources, artifacts and harnesses remain untouched.

## Tests and artifacts

Node **v24.19.0**, Python **3.13.5**. All checks PASS. Full commands/output:
**VALIDATION.txt**, generated by `python scripts/validate-v22441.py`, with 56
individual suite transcripts.

- **27/27 new identity regressions**: exact-parent defect; completed/refreshed
  repaired fields; unchanged snapshots/vector/history; cross-chat isolation and
  explicit raw conversation mismatch; unsupported null/high/medium/max lookup;
  three returning-to-thinking profiles; active/incomplete restart; latest archive
  selection, delayed completion, shuffled pointers, start-time fallback and ID
  ties; invalid/non-generation records; exact no-request fallback comparison;
  newest DIRECT vector; verified MAX/numeric cap; read-only migration/storage;
  aliases/privacy/registry/provenance; cache invalidation and release metadata.
- **287/287 full-registry prior regressions** on the repair: unchanged
  120 + 59 + 31 + 34 foundation/local-only cases and 43 multi-effort cases.
  Only version/name metadata is projected. The inherited local-only cohorts
  retain their established seed-ineligible synthetic model.
- **145/145 legacy-registry fixture cases**: unchanged 40 seed + 45 anonymous +
  31 High + 29 Medium repair cases retain their explicit max-only registry
  configuration for historical High/Medium-unseeded assertions. No old
  pressureCurrent or scorer is substituted, and no cases are skipped.
- **2646/2646 frozen/prior executions** on their original candidates.
  **459 candidate executions; 3105 total recorded executions.**
- Baseline and syntax checks; exact-parent reconstruction; all protected checks:
  **67825** frozen V2.23.5 and **65401** immutable V2.22 bytes preserved. One-byte
  changes to identity, parser, migration, scorer, privacy, selection, registry and
  canonical aliases are rejected.
- Frozen storage/quota/recovery/retention and migration-idempotence suites;
  privacy tests; two deterministic ZIP/checksum builds match. Fixed 2026-10-02
  metadata; ZIP contains only the exact tested JS.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| chatgpt_chat_size_meter_v22441_current_model_identity.js | 351117 | deddd7b689a323799d21b49f002299956f47da8ea1e379a845471b57117bc7de |
| chatgpt_chat_size_meter_v22441_current_model_identity.zip | 81134 | 4a83311497a29110f6b7e924dc6d0537e59c6a2cf883722d034aa421dfe0fabf |

Artifact directory:
`C:\Users\bacon\.codex\worktrees\76e0\chatgpt-conversation-size-meter\releases\v2.24.4.1\`.
Checksums: SHA256SUMS. Review diff: SOURCE_DIFF.patch.
