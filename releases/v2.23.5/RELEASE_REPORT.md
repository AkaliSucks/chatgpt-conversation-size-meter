# V2.23.5 reliability hotfix candidate

Prepared 2026-09-30 on `codex/v235-reliability-hotfix`, directly from exact
parent `3337f1bd41dea2577ea2e6329783b81ea7466e00`. The commit containing this
report is the new candidate checkpoint. V2.23.4 source, ZIP, reports and checkpoint
branch remain unchanged. No push, merge, PR or V2.24 work.

The three normal-use defects in the task are USER-REPORTED NATIVE evidence.
This hotfix's validation is synthetic only; this assistant did not run a native
ChatGPT browser session or claim reproduction of a real server HTTP 500.

## Changes and boundaries

1. `getStatus`: a current-chat active verified MAX episode selects the existing
   `maximum` theme before the ordinary status/color logic. No CSS or new UI is
   added. The status text is unchanged. Banner clearance/recovery continues to
   use the existing episode model, restoring the ordinary color; historical
   snapshot phase and old attempt outcomes cannot independently force red.
   A transport-only verified episode keeps the existing active-until-recovery
   semantics. A different chat's episode cannot change this chat's theme.
2. `v212SubtreeSerializedStats`: replace recursive descent with explicit DFS
   frames. Children are visited in the same order, totals/cache insertion order
   and caller visiting-set/cycle semantics are preserved. No depth cap, metric
   redefinition or truncation. The related `subtreeSize` helper needs the same
   repair: the 12,000-node alternate-branch fixture otherwise overflows there
   before reaching the V2.12 profiler. This dependency was reproduced and
   explained before that second protected helper was changed.
3. Completed non-2xx generation responses use the existing terminal `error`
   category and `outcomeConfirmedBy = HTTP generation failure (<status>)`.
   There is no new outcome category. `attemptFinishStream` terminalizes when the
   clone body closes; `attemptRecordStreamChunk` prevents success-marker
   finalization on non-2xx responses. The whole-body/XHR observer uses the same
   reason. `inspectResponse` lets empty non-2xx generation bodies reach that
   observer. Structured MAX retains precedence through the unchanged matcher;
   generic failures never create an episode or SUCCESS. Request metadata,
   response status/type/bytes and transport timing remain in the archived
   attempt; current clears and a later Retry/resend starts an independent attempt.

The stream tail was previously fed back while still retained in the buffer,
joining an unterminated JSON envelope to itself. The narrowly changed finalizer
clears that retained tail before its existing zero-byte flush so structured JSON
MAX remains recognizable. No error/banner matching was broadened. The flush's
existing telemetry/chunk-count behavior is retained; response byte totals remain
exact. Read errors and telemetry closure remain visible.

Candidate name/version, storage-health label, copied diagnostic identity/core
header and retry trace version now identify 2.23.5. Retention and routing change
only their version literals. The storage prefix remains exactly
`const P = 'cgpt-size-meter-v2101';`. No unrelated runtime change is allowed.

## Exact function and byte impact

The table compares complete LF function regions through the next function
boundary (including intervening whitespace). `SOURCE_DIFF.patch` contains the
complete userscript diff against the parent.

| Function region | Parent bytes | Hotfix bytes | Line diff (- / +) |
| --- | ---: | ---: | ---: |
| subtreeSize | 581 | 1072 | 24 / 25 |
| v212SubtreeSerializedStats | 880 | 1352 | 49 / 32 |
| inspectResponse | 3083 | 3192 | 1 / 2 |
| attemptRecordStreamChunk | 2175 | 2249 | 1 / 1 |
| attemptFinishStream | 2538 | 2840 | 1 / 9 |
| attemptObserveGenerationResponse | 1255 | 1335 | 2 / 2 |
| getStatus | 317 | 384 | 1 / 1 |

There are also six exact version/name string substitutions, outside those
regions. JS size increases by 1,589 bytes. Each function exception has pinned
parent/replacement sizes and SHA-256 in `scripts/verify-v2235-protected.js`;
arbitrary replacement code is rejected. The original V2.23.4 verifier is unchanged.

The new verifier reconstructs the entire expected userscript from exact parent
bytes using only those pinned exceptions and literal version updates, then
compares the complete candidate byte-for-byte. It independently verifies
65,401 immutable V2.22 parser/extraction/topology/profiler bytes: the original
66,862-byte coverage minus only the two authorized stack-safe helper regions.
All named parser/candidate-selection, message extraction, topology calculations
and other profiler functions are byte-identical. Explicit parent checks also
cover send/dispatch, generation/preflight classifier, MAX model/finalization,
source caches/publication, acceptance, early hooks, persistent quick-action UI,
Retry routing/cancellation and origin-wide retention/accounting. Only exact
version literals are allowed within storage/retry/diagnostic checks.

Negative checks prove that an arbitrary one-byte edit in the protected parser,
validated Retry routing, or even one of the pinned changed functions fails the
checker. Protection checks were not disabled or normalized.

## Validation

- Exact original checkpoint suite: **99/99 PASS** against unchanged V2.23.4.
- Hotfix suite: **120/120 PASS**: all 99 existing cases plus 21 hotfix cases.
  The former empty-503 pending expectation is updated to the requested terminal
  behavior; the Copy identity assertion is updated to V2.23.5. No case is skipped.
- Active verified MAX overrides orange/warning; real clearance restores ordinary
  color; historical MAX phase/outcomes, quoted/streamed phrases and other-chat
  state do not force red. Existing structured MAX identity/dedup tests pass.
- Both iterative helpers count all 12,000 ancestry nodes and all 24,000 nodes in
  a 12,000-deep branched tree. Exact serialized byte totals are checked, not just
  absence of an exception. Full parsing succeeds with 12,000 active and 12,000
  alternate nodes, valid topology and retained profiler. Both recursive parent
  helpers overflow on the reproduced deep fixture.
- Eighty deterministic shallow graph fixtures compare both helpers' exact
  metrics, cache order and visiting sets to the parent, including cycles/shared
  edges. Complete shallow parsed/topology/retained metrics serialize identically
  at depths 2, 8, 32 and 80.
- The native-style synthetic 54-byte JSON HTTP 500 is terminal ERROR at body close,
  preserving response status/type/bytes, request metadata and timing. Resend
  produces a separate SUCCESS. Non-2xx success markers cannot produce SUCCESS;
  structured MAX precedence, empty failure bodies, XHR, delayed chunks, late
  callbacks, diagnostic distinctions and exclusion of raw bodies are checked.
- Existing healthy SUCCESS, both native-style send/correlation paths, Retry
  success/repeat/cancellation, persistent feedback, static publication and full
  quota-pressure/storage-recovery tests pass. Storage reports successful saves
  in the healthy hotfix fixture.
- `scripts/verify-baseline.sh`, new byte verifier and negative protection checks
  PASS. `node --check` PASS for candidate, baseline, harness and both verifiers.
- Two package builds produce identical ZIP and checksum bytes; the ZIP has one
  member equal to the exact LF candidate JS. Full commands/results are recorded
  in `VALIDATION.txt`.

The immutable baseline remains 289,994 bytes with SHA-256
`08bf10714deae924ced7716b5b63f873ba56b11d782289b92d55de62af343696`.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| chatgpt_chat_size_meter_v2235_reliability_hotfix.js | 307606 | `a6b4f536a79dcefba5abbb438eec8223b8eb95cc852529199400934e3c2ec506` |
| chatgpt_chat_size_meter_v2235_reliability_hotfix.zip | 69420 | `f9e97baeaa1e19aef60ca849e0b15a0436fe6997d86ff30506989574d00530cf` |

## Changed files

- `scripts/test-v223.js`: updated active candidate input/identity and empty HTTP
  error expectation; 21 new regressions and stress/equivalence checks.
- `scripts/verify-v2235-protected.js`: new exact whole-source/region checker with
  hash-pinned authorized exceptions.
- `scripts/package-v2235.py`: new deterministic packager; the V2.23.4 packager
  remains unchanged.
- `releases/v2.23.5/chatgpt_chat_size_meter_v2235_reliability_hotfix.js`
- `releases/v2.23.5/chatgpt_chat_size_meter_v2235_reliability_hotfix.zip`
- `releases/v2.23.5/SHA256SUMS`
- `releases/v2.23.5/VALIDATION.txt`
- `releases/v2.23.5/RELEASE_REPORT.md`
- `releases/v2.23.5/SOURCE_DIFF.patch`

## Next native retest

1. Install only this ZIP's userscript, disable previous copies and hard-reload.
   Copy diagnostics and verify V2.23.5 metadata/header/storage health. Preserve
   existing origin data; no giant prompt is needed.
2. Load the existing deep conversation that failed profiling. Wait for naturally
   accepted DIRECT/BATCH mapping traffic, then Copy diagnostics. Require valid
   topology/retained profiler and successful required-key saves, with no stack
   overflow or newly fabricated generation attempt. Synthetic counts prove
   stack safety at the tested depths, not real-browser performance at all sizes.
3. Load the existing currently capped chat without sending again. Require active
   verified episode plus explicit red/MAX overlay and stable episode identity.
   When the live banner genuinely clears, require the ordinary theme again.
   Navigate to a healthy chat to check chat binding and historical-state isolation.
4. Retry Capture once and repeat once on the same active episode. Confirm fresh
   accepted observations, persistent completion feedback, same episode and zero
   new attempts. Copy results before a later retry overwrites latest-only
   `lastRetry`. Test navigation cancellation as in the validated V2.23.4 sequence.
   Natural observations also count in captureHistory; it is not a Retry counter.
5. In an isolated healthy chat, submit an ordinary small prompt and confirm one
   intent/attempt and SUCCESS. If a completed real non-2xx generation response
   occurs during normal use, immediately Copy diagnostics: ERROR with exact HTTP
   reason/status/type/bytes, current cleared, no MAX episode. Resend once and
   require a new independent attempt. Do not claim native HTTP-500 validation
   unless such a response is actually observed; its reproducibility is unresolved.
6. Hard-reload and confirm persisted attempt/episode/source state and final save
   result. Native rendering, clipboard permissions, large-chat profiling latency
   and server/cross-tab timing still require browser observations.
