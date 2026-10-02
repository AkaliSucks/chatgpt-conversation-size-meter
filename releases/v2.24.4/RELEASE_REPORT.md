# V2.24.4 — Bundled multi-effort anonymous seed calibration

Branch: **codex/v244-multi-effort-seeds**. Direct parent:
**decc7a38ad6a842015092c8c36bee09f7166289a**. The candidate commit is the commit
containing this report; its exact hash is returned in the delivery message.
**STOP pending native review.** No push, merge or PR. The base's native validation
and the independent max/high/medium observations are USER-REPORTED. Verification
in this run is synthetic/offline; the candidate was not installed into ChatGPT.

## Registry and resulting behavior

The accepted registry previously contained only gpt-5-6-thinking/max. Its static
replacement is an Object.freeze array of three separately frozen objects, each
with exactly **model, canonicalEffort, seedVersion, profiles**. Each profiles
array and all nine distinct vector objects are frozen. No profile objects or
arrays are shared across effort identities, and equal metrics are not deduplicated
across efforts. Exact structure and all supplied values:
`src/v2244/seed-registry.js` and `fixtures/v2244/anonymous-registry-expected.json`.

| Model | Canonical effort | Seed version | MAX profiles | Text frontier | State frontier | Confidence |
| --- | --- | --- | ---: | ---: | ---: | --- |
| gpt-5-6-thinking | max | v2242-anonymous-seed-1 | 3 | 847977 | 27151472 | LOW |
| gpt-5-6-thinking | high | v2244-high-anonymous-seed-1 | 3 | 847977 | 27151472 | LOW |
| gpt-5-6-thinking | medium | v2244-medium-anonymous-seed-1 | 3 | 847977 | 27151472 | LOW |

Each effort contains the user's full A/B/C vectors, with these eleven numeric
fields: displayLikeTokens, activeBranchBytes, mappingBytes, retainedBytes,
toolResultBytes, branchNodes, messageNodes, retainedShare, hot128, hot256 and
strongContextMarkers. There are **99 supplied numeric aggregate values**, nine
observations and three independent registry identities. Only the existing two
primary axes participate in scoring; secondary aggregates do not add scoring
weights, confidence or independent local evidence.

pressureSeed remains byte-identical and uses exact model/canonical-effort .find
lookup. Removing one entry leaves that effort unseeded even when both other
entries contain identical metrics. Unsupported models/efforts receive no seed
and remain CALIBRATING without usable local evidence. Entries are read-only code;
they never become calibration rows, local conversations or localStorage data.

The scorer and frontier formula remain byte-identical: max(seed frontier, local
frontier) on each axis; local evidence can extend but cannot shrink a seed.
Sufficient exact local evidence selects separate max/high/medium tiers, and
extending one such profile leaves the other two unchanged. The inherited sparse
same-model **local** evidence tier is preserved to retain accepted Extra High
scoring behavior. It may pool local rows across efforts when exact evidence is
sparse. Bundled seed lookup never pools or borrows a different effort/model seed.
An exact-only sparse local policy would require a separate scorer change.

## Changes and preservation

The behavioral change is solely **ANONYMOUS_PRESSURE_SEEDS** static data. No
algorithmic function changes. Metadata-only version/name literal changes occur
in **anonymousProjectSample, meterStorageFinalResult, eventDiagnostics,
retryCapture and copyStats**, plus userscript @name/@version: seven identity
literals in total. The new builder reconstructs the exact pinned parent plus
this registry and these literals; the verifier reverses them to exact parent
bytes and rejects negative mutations.

The original V2.24.2 PRESSURE_SEED constant remains embedded byte-identically;
max's seed version, three primary vectors, frontiers and all scorer outputs
remain value-equivalent to the parent, including inherited local pooling cases.
The max registry now also retains the supplied secondary numeric aggregates.
pressureCompute, pressureSeedAxis, storage/migration, privacy validator/schema,
anonymous selection, parser/capture/MAX detection and offline builder algorithms
are unchanged. Existing `scripts/build-anonymous-seeds-v22432.js` still groups
identical vectors into three separate effort identities when given all nine
anonymous samples; no new builder implementation is necessary.

Canonical normalizer **src/v22432/canonical-effort.js** is unchanged:

| Input after existing trim/case/whitespace normalization | Canonical effort |
| --- | --- |
| Extra High / max | max |
| High / extended | high |
| Medium / standard | medium |
| other existing labels | unchanged normalized label |
| absent/non-string/blank | null |

Raw requestEffort/requestEffortDetected provenance is preserved. Existing
historical extended/standard records normalize during evaluation without
destructive rewriting. No schema change, migration rewrite or new namespace.
Storage prefix remains **cgpt-size-meter-v2101**. Verified current MAX still
overrides numeric scoring; otherwise numeric pressure is capped at 99.
Confidence remains LOW. Anonymous export retains its exact privacy contract.

**61 new files only**: one registry, one aggregate fixture, one task spec, six
scripts and 52 release files. All **265** parent files are preserved: **252**
byte-identical files and **13** older text files retaining pre-existing checkout
CRLF only. Prior artifacts and suites are untouched.

## Tests and artifacts

Node **v24.19.0**, Python **3.13.5**. All checks PASS, recorded by
`python scripts/validate-v2244.py` in **VALIDATION.txt** and 46 suite transcripts:

- **43/43 new full-registry cases**: exact counts/frontiers/full aggregates,
  immutable independent identities, pairwise no borrowing, unsupported lookup,
  local extension/non-shrinkage, independent exact tiers, LOW, numeric/current
  MAX, production pressure view, raw aliases, SUCCESS/MAX anonymous export,
  privacy, no persistence, historical evaluation/migration, builder grouping,
  deterministic ordering, max equivalence and candidate metadata.
- **244/244 full-registry foundation/local-only regressions**: unchanged
  120 + 59 + 31 + 34 cases with identity projection only. The inherited local-only
  cohorts retain their established seed-ineligible synthetic model.
- **145/145 legacy-registry regressions**: unchanged 40 seed + 45 anonymous +
  31 High repair + 29 Medium repair cases. Their historical High/Medium-unseeded
  assertions require an explicit max-only registry fixture. The adapter changes
  only registry data and identity; it does not substitute an older scorer or
  skip cases. These are distinguished from full three-entry coverage.
- **2214/2214 frozen/prior case executions** on their original candidates.
  **432 candidate executions; 2646 total recorded executions.**
- Syntax; immutable baseline; exact-parent reconstruction; all protected-byte
  checks. **67825** frozen V2.23.5 and **65401** immutable V2.22 protected bytes
  remain intact. Parser, migration, scorer, privacy, selection and registry
  one-byte mutations are rejected.
- Frozen storage/quota/recovery/retention checks, migration idempotence and
  anonymous privacy checks; two deterministic ZIP/checksum builds match.
  The ZIP has only the exact tested JS, with fixed 2026-10-02 metadata.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| chatgpt_chat_size_meter_v2244_multi_effort_seeds.js | 349864 | 6904e1095b94109dcfda934fe0b54ae78b5b3a869c00b5b454f33ffd9f4983e3 |
| chatgpt_chat_size_meter_v2244_multi_effort_seeds.zip | 80781 | 030633da25f61d9b66f1a6eaed92293b9214cd772d1e7e1adb3dfc7a3c132f81 |

Artifact directory:
`C:\Users\bacon\.codex\worktrees\76e0\chatgpt-conversation-size-meter\releases\v2.24.4\`.
Checksums: SHA256SUMS. Review diff: SOURCE_DIFF.patch.
These empirical observations do not establish an official or universal limit.
