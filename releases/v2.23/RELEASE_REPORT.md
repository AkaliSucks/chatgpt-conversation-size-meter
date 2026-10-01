# Final V2.23.4 candidate — Bookkeeping and native validation closeout

Prepared 2026-09-30 on `codex/v234-final-bookkeeping`, directly from preserved
native-validation checkpoint `4cdafae0e34f4e9c68b77ba06791201e3dbe17b9`.
The commit containing this report is the final child candidate. The checkpoint
and `codex/v234-route-aware-retry` remain unchanged. No merge, PR, push or V2.24.

The only userscript change is `storageHealth.candidateVersion` from `2.23.3`
to `2.23.4`. An exact whole-file byte comparison against the checkpoint proves
that all other bytes, including parser, send/correlation, MAX classification,
retry routing, storage retention, static publication and completion UI, are
unchanged. The protected core diagnostic header still has its inherited 2.23.2
label; userscript metadata, Copy's first line, lastRetry.version and storage
health identify this candidate as V2.23.4.

## Capture-history and retry-result semantics

MAX episode `captureHistory` includes accepted natural/app-state observations
as well as accepted manual Retry observations. It records accepted full source
observations attached to the episode, with one record per accepted observation;
it is **not a manual-Retry counter**. Natural traffic can increase the history
before or during a Retry. Compare the retry trace, source family and capture
timestamps when attributing a particular observation to that action. The
existing history bound is thirty observations per episode. No historical
records were relabelled and no new origin labels were invented.

`lastRetry` remains **latest-only**. A later manual or automatic retry can
replace an earlier result, including cancellation. To retain a cancellation
trace, copy diagnostics before another retry completes. This cleanup adds no
retry-result history and changes no capture/classification behavior or storage
mutations.

## Native validation provenance

The user reports that native validation at exact checkpoint `4cdafae` passed:

- Route-aware Retry success with a fresh accepted snapshot.
- Repeat Retry stability.
- Navigation cancellation.
- Persistent Copy/Retry completion feedback.
- MAX episode identity preservation.
- Storage durability.

These are **USER-REPORTED NATIVE** results, not browser observations made by
this assistant. No additional native timings, response sizes, source families
or diagnostic files were supplied with this closeout. The historical report's
open native-validation status and pending sequence below describe the earlier
checkpoint preparation and are superseded by these reported passes. This
child preserves all validated behavior by exact bytes, so no new behavior
retest is introduced by the bookkeeping change. Real route availability,
clipboard permissions and concurrent-tab/server timing remain environmental
conditions rather than new claims from the synthetic harness.

## Verification and release identity

The complete existing suite passes **99/99 synthetic tests**, including native-
style send paths, DIRECT/BATCH publication, quota-pressure retention, route-aware
retry success/failure/cancellation, episode dedup and completion UI. The harness
itself is unchanged. Baseline verification and `node --check` on the candidate,
baseline, harness and byte verifier all pass. JavaScript and shell sources
retain LF checkout policy.

Byte verification passes for 66,862 baseline parser/extraction/topology/profiler
bytes, 8,807 validated send/correlation bytes and 15,435 static-publication/cache
bytes. The 72,454-byte storage/MAX/classifier/transport/acceptance comparison
allows only the exact authorized version-label substitution; all other bytes
match their validated checkpoints. The prior plural source-family extension is
unchanged. Independently, all 306,017 candidate bytes match `4cdafae` with only
that single-byte substitution. No protected parser function was modified.

The immutable baseline remains 289,994 bytes, SHA-256
`08bf10714deae924ced7716b5b63f873ba56b11d782289b92d55de62af343696`.
Two deterministic package builds produce identical ZIP and checksum files;
the ZIP contains only the exact candidate JS. Commands and complete results
are retained in `VALIDATION.txt`.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| JS | 306017 | `0148b5aa5dac3aa2743c6f6c52f3b14147acb0d29980a262ad3e38fd2c2f275f` |
| ZIP | 69016 | `011ffa5526ad7b99e789caa143bff6e56c0b39bfdfc00cccd703bbb5df168072` |

Changed files: release JS/ZIP, SHA256SUMS, VALIDATION.txt, this report and
`scripts/verify-v223-protected.js`. Runtime diff: one byte. The verifier adds
an exact version-label allowance and a whole-source comparison to the native
checkpoint. The spec, baseline, regression harness, line-ending policy and
package builder are unchanged.

---

## Historical V2.23.4 preparation report (4cdafae; superseded closeout status)

# V2.23.4 candidate — Route-aware Retry Capture and completion feedback

Prepared 2026-09-30 on `codex/v234-route-aware-retry`, directly from preserved
checkpoint `ccdd1b97485d59cdc7d4f92735cca5b1ada7e431`. The commit containing this
report is the V2.23.4 child candidate. No merge, PR, push or V2.24 work.

The user reports native Lian Li MAX validation of V2.23.3: two real MAX attempts
created episodes #1/#2; attempt #2 had generation dispatch, structured SSE MAX
and independent native UI confirmation. Retry did not create another attempt or
episode, but its singular-route requests returned ~168 bytes and supplied no
fresh episode snapshot. Current app traffic included a ~72 KB plural per-chat
response and a ~20.26 MB BATCH response. These are user-reported native findings.
No new native response bodies/request forms were in this repository; only the
older false-MAX regression diagnostics were present. Their sizes alone cannot
establish which response is a parser-valid full mapping.

## Route audit and repair

The former retry tried only `/backend-api/conversation/<id>`, an invented
`include_messages=true` variant, and singular resource URLs. Its HTTP result
was not proof of a full capture. The new implementation observes same-origin
read routes through the existing early fetch hook, including exact singular and
plural per-chat GET forms and GET/POST BATCH forms. Request forms stay ephemeral
in memory, with at most twelve entries and a ten-minute replay eligibility
window. POST forms exceeding 16,384 characters are unavailable for replay.
Bodies, headers and credentials are never serialized into diagnostics/storage.

Normal app responses still run through the unchanged parser/candidate path.
A route proof records whether that specific response actually advanced full
capture publication for the bound current chat, along with status, bytes,
content type and published source family. Copy Diagnostics exposes a live
`OBSERVED CAPTURE ROUTES` audit; every Retry stores a bounded, body/header-free
`lastRetry` result with the observed proofs and each attempted path/method,
status, response bytes/type, acceptance, resulting family and final result.
Paths omit query values. No response bodies are persisted.

Parser-accepted, successful observed forms are preferred. A retry tries at most
two distinct per-chat GET paths, then at most one observed BATCH form. A BATCH
replay requires a naturally observed 2xx response that the unchanged parser
accepted as a full snapshot for this chat. It preserves the observed method,
body and request headers in memory; it does not invent a BATCH POST schema or
parameters. Resource timing alone cannot supply a BATCH method/body. Per-chat
resource URLs and one legacy singular GET remain bounded fallbacks. The
`include_messages` guess and duplicate singular resource retries are removed.

BATCH replay is **manual-only**. Initial, SPA, new-MAX, post-outcome and background
capture reasons cannot replay BATCH; the background timer now uses its explicit
reason and existing controlled-workflow coalescing. Repeated timers cannot cause
repeated large meter BATCH fetches. Every retry has a thirty-second total deadline,
with cancellation/abort and a 64 MiB accepted-response ceiling. HTTP failures,
empty/small metadata, partial messages, read errors and rejected requests remain
failed captures, and fallback continues within these bounds.

Success requires an attributable **new parser-valid full snapshot** produced by
that retry response, with a new capture sequence and full-capture time at/after
the retry start. An old full snapshot or a concurrent app capture cannot supply
success. The response-body await rechecks chat and active episode identity before
parser writes. Navigation, episode replacement and timeout cancel attachment;
a late response cannot become a successful fresh capture. The unchanged
`recordLifecycleFullCapture -> eventCapture` path attaches each accepted source
observation once to the existing episode. Requests use the original unwrapped
fetch and are recorded once in METER CAPTURE NETWORK, including failures/timeouts;
late completion cannot duplicate a timed-out row. Generation/app telemetry is
not inflated, and no real attempt or MAX episode is fabricated.

One narrowly demonstrated dependency changed: `lifecycleSourceFamily` previously
returned OTHER for `/backend-api/conversations/<id>`, even after the parser
accepted its mapping. It now recognizes that exact plural per-chat source as
DIRECT. All old singular/BATCH classifications are preserved. This is source
labelling after parser acceptance, not a rule that a 72 KB response is full.
The mapping parser, candidate selection and publication functions are unchanged.

## Completion UI

Copy and Retry retain the existing press animation and now have a compact sticky
`Last action` status beside their quick-action buttons, with `aria-live=polite`.
Running labels are `Copying…` / `Capturing…`; repeat clicks are disabled. Completed
labels are `Copied ✓`, `Copy failed ✕`, `Captured ✓` or `No fresh mapping ✕`.
After 2.2 seconds the normal labels return while the persistent result remains.
Successful capture status identifies DIRECT/BATCH and response bytes; HTTP
completion alone never produces a success cue.

Quick-action state survives ordinary panel redraws. UI state/timer updates patch
only the button/status nodes: they do not call lifecycle polling/render feedback,
make requests, create events/captures, or write storage. Copy failure uses this
status instead of opening a large diagnostic alert. A newer quick action owns
the persistent status if an older action completes asynchronously.

Copy begins with an explicit V2.23.4 identity line and includes live route proofs
and the last retry result. The protected core diagnostic header and storage
health candidateVersion still contain their inherited 2.23.2 / 2.23.3 labels;
those regions were preserved byte-for-byte. Use userscript metadata, Copy's first
line and `lastRetry.version=2.23.4` to identify this candidate.

## Verification and artifacts

**99/99 synthetic tests PASS**: all 77 V2.23.3 tests plus 22 new cases covering
168-byte singular failure, full plural fallback, episode #2 identity, repeated
retry dedup, a non-full 72 KB response followed by one observed POST BATCH,
no invented BATCH form, manual-only BATCH, wrong-chat rejection, old/concurrent
snapshot rejection, navigation/episode cancellation, HTTP/partial/empty failures,
timeout and late-response safety, bounded route selection/request forms,
credential exclusion, and Copy/Retry success/failure/persistent UI states.
Production click handlers and retained tactile animation are exercised in the VM.

The heavy synthetic fixture rejected 72,000-byte metadata and a 168-byte singular
payload, then accepted one 20,260,000-byte BATCH response into the same active MAX
episode: one capture-history observation and zero new attempts/episodes. The
large response contains a synthetic valid mapping plus padding; this is not a
native ChatGPT payload or native topology validation. A separate fixture accepts
72,123 bytes from a full plural mapping into existing episode #2. Size is never
the acceptance criterion.

Byte verification passes independently for:

- 66,862 immutable V2.22 parser/extraction/topology/profiler bytes.
- 8,807 validated send/correlation bytes against `4b14425`.
- 15,435 source cache/capture/static-vector/diagnostic bytes against `3be6a30`.
- 72,454 storage retention, MAX episode, generation classifier/transport and
  acceptance bytes against `ccdd1b9`; some independent check regions overlap.
- The source-family classifier differs only by its explicit plural per-chat
  extension, verified against the checkpoint's expected expression.

Baseline verification and candidate/harness/verifier/baseline `node --check` pass.
Baseline remains 289994 bytes, SHA-256
`08bf10714deae924ced7716b5b63f873ba56b11d782289b92d55de62af343696`.
Two deterministic ZIP builds match exactly; the sole member equals the LF source.
Complete commands/results are in `VALIDATION.txt`.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| JS | 306017 | `892f728202e785baab8ccb4b020759c28a2f293fa747558474ba2d115a0ac771` |
| ZIP | 69016 | `00ddc8dd95da1af068f6c783d971b10ac96c4c26c986e55924d33143734eb8c2` |

Changed files: release JS/ZIP, SHA256SUMS, VALIDATION.txt, this report,
`scripts/test-v223.js` and `scripts/verify-v223-protected.js`. Spec, baseline,
line-ending policy and package builder are unchanged.

## Exact next native browser sequence

1. Preserve the V2.23.3 Lian Li diagnostics and existing origin storage. Install
   this ZIP's JS as 2.23.4, disable older copies and hard-reload the same MAX chat.
   Do not send another prompt. Let its normal per-chat/BATCH app-state traffic
   finish. Retest within ten minutes of those naturally observed forms.
2. Expand the meter and Copy diagnostics. Confirm `Copying…`, then `Copied ✓`,
   then the normal label after ~2.2 seconds; `Last action: Diagnostics copied ✓`
   must remain. Verify the copied first line identifies V2.23.4. Inspect live
   OBSERVED CAPTURE ROUTES: method/path, 2xx status and parserAcceptedFull establish
   route viability. The ~72 KB route may be metadata; only actual parser
   acceptance makes it full. A BATCH form must show parserAcceptedFull=true and
   replayEligible=true before it can be replayed. If unavailable, retain that
   diagnostic; do not invent a BATCH body/parameters.
3. Record current attempt IDs/outcomes, active episode ID (#2 if still active)
   and capture-history count C. Natural reload captures may already have
   increased C; distinguish those app observations from the manual retry.
4. While the native MAX alert remains visible, click Retry Capture once. Verify
   `Capturing…`, disabled repeat clicks, and completion within the bounded
   workflow. A successful result must show `Captured ✓` and persistent
   `Fresh DIRECT/BATCH captured ✓ · <bytes>`; the normal label returns after
   ~2.2 seconds. No-fresh-mapping results must stay visibly failed.
5. Copy diagnostics. Require a new lastRetry started/finished time, acceptedFull
   only for the actual new full response, correct source family/bytes, and final
   result captured. The same episode must have one new corresponding fresh
   source/capture-history record per accepted observation, with capture time
   at/after retry start. Account separately for any concurrent natural app
   capture. Attempt IDs/counts, episode ID/counts and structured/native MAX
   outcome evidence must remain unchanged. All meter requests belong to METER
   CAPTURE NETWORK; generation/app counters must exclude those requests.
6. Repeat Retry once on the same visibly active episode. Require unchanged
   identity and one additional accepted-source record, without a new attempt or
   episode. Inspect Network/lastRetry: at most two distinct per-chat GET paths
   and one manual BATCH request per action. Observe for at least one background
   timer interval: it must not issue a meter BATCH poll.
7. During a separate retry, navigate away before its response finishes. Require
   cancellation/no attachment to the destination chat or another episode. On
   any HTTP/error/metadata-only failure, require No fresh mapping and a failed
   lastRetry, even if an older full snapshot remains displayed. Do not submit
   a new MAX attempt just to exercise this capture repair.
8. Verify storage health still reports complete saves for required current keys.
   Hard-reload and check durability of accepted episode evidence. Copy failure
   feedback can be checked by temporarily denying clipboard permission; it must
   show Copy failed and remain visible without another network request.

Native route schemas, authentication/header replay and the real 20.26 MB mapping
shape have not been validated for this child. A fresh naturally observed BATCH
form may be absent/expired, or its response may fail the unchanged current-chat
candidate selection; those conditions remain explicit failures. The VM does not
validate browser clipboard permissions, actual layout/readability, server timing,
large native topology performance or cross-tab timing. Native validation of this
candidate remains open until the sequence above passes.

---

## Historical V2.23.3 report (ccdd1b9; not this child build)

# V2.23.3 candidate — Version-aware meter retention

Prepared 2026-09-30 on `codex/v223-version-aware-retention`, directly from
`3be6a3004172c2aca2e51b0e0cc0e49d9f86e407`. The commit containing this report is
the child candidate. The V2.23.2 checkpoint and its branch are preserved.
No merge, PR, push, or V2.24 work.

The user reports that V2.23.2 clean-reload native validation passed DIRECT/BATCH
publication, full snapshot, topology and retained-state profiling without a new
generation. This child preserves that implementation, as well as the validated
button/Enter send path. No new native diagnostic files were available in this
checkout; the supplied 65-key / ~7.13 MB UTF-16 audit is native evidence from the
user. All new results below are deterministic synthetic evidence.

## Retention and save recovery

The 30-day eligibility requirement excluded recently written obsolete histories.
Under unrecovered quota pressure, exact `cgpt-size-meter-v2101:` ownership and an
explicit namespace allowlist now select superseded `attempts-v218` through
`attempts-v222` histories regardless of their age or legacy format. This includes
obsolete versions for the current chat; its active V2.23 history stays intact.

Obsolete attempts precede rebuildable snapshot/diag/lifecycle-v216..v222 caches;
within each category non-current chats precede current legacy histories, then
older known activity precedes newer activity. Non-current source caches can be
reclaimed without an age gate only when no active/pending/unfinalized V2.23
attempt, unmatched recent send intent, active MAX episode, or unknown/corrupt
V2.23 ownership needs them. Undated/malformed/future source caches fail closed.
Both on-disk and in-memory owners are checked, with values/owners rechecked
before deletion to avoid observed cross-tab changes.

The current/writing chat's snapshot, lifecycle and diagnostics are protected.
All V2.23 attempt and MAX-episode stores, settings, positions, verified-MAX
samples, manual MAX settings, notification keys and unknown namespaces are
retained. Closed historical V2.23 attempt/episode identity, outcome, confirmation
and attached metric evidence remain stored even when redundant external source
caches are reclaimed. Unrelated ChatGPT keys and lookalike prefixes are never
deleted; their values are not read by the meter audit/cleanup.

Each pass removes at most 12 keys and stops after reaching a 512 KiB UTF-8 target
(one large key can exceed this target). One recovery coordinates up to four
passes (48 keys maximum). Its subsequent passes bypass the 30-second cooldown;
a new recovery still observes that cooldown. Cleanup occurs only after quota
failure remains unrecovered by lossless compaction. No background age-based
purge was added.

Recovery retries **all four required current keys**: attempts, snapshot,
lifecycle and diagnostics; an existing/active MAX episode key is also required.
The writing chat and current URL chat are both covered when different. Pending
writes retain their latest logical state. Successful setters must pass readback;
missing or failed required keys keep overall `finalSaveResult=failed` and
`lastSaveSuccessful=false`. A later successful single write cannot hide an older
failed key. Failures, compact recovery and quota recovery remain visible.

Storage health includes origin totals (`meterOwnedKeyCount`, `meterOwnedBytes`,
`meterOwnedUtf16Bytes`, `meterOwnedNamespaces`, `lastAuditAt`), cumulative
`bytesReclaimed`/`reclaimedNamespaceTotals`, last-pass `cleanupAt`, eligibility,
removed counts/bytes, `cleanupNamespaceTotals` and exact bounded `cleanupEntries`.
`recoveryPasses` and `recoveryNamespaceTotals` identify every removed key/category
and its UTF-8/UTF-16 bytes across the last bounded recovery. `requiredCurrentKeys`,
`saveResultsByKey`, `unsavedKeyCount`, `pendingWriteCount`, `recoveryPassCount`,
`recoveryBytesReclaimed` and `finalSaveResult` distinguish complete recovery from
partial writes. Counters are session-scoped; totals are refreshed on reload.

The lossless storage codec and bounded attempt/event histories are unchanged.
No new raw request, stream or response payload is persisted. This is a retention
repair, not a new compression format or a reduction of required research fields.

## Verification

**77/77 complete synthetic tests PASS**: the existing suite plus seven new tests
for a recent multi-megabyte 65-key origin, current-chat obsolete versions,
active/closed V2.23 source dependencies, cleanup order, bounded exhaustion,
partial failure followed by all-key retry, silent setters and externally missing
keys. Old GC expectations were updated to the requested eligibility policy.
Quota compaction tests now budget for the entire required working set and verify
complete save success instead of only the most recently written key.

The recent-origin fixture began at 3,384,875 meter-owned UTF-8 bytes / 6,769,750
UTF-16 bytes. Unrelated app storage occupied another ~3.4 MB UTF-16. With a
synthetic 5,500,000-byte UTF-16 origin budget, current writes initially exceeded
quota. Three bounded passes reclaimed these recently created histories:

| Namespace | Keys | UTF-8 bytes (key + value) | UTF-16 bytes |
| --- | ---: | ---: | ---: |
| attempts-v218 | 1 | 150115 | 300230 |
| attempts-v219 | 1 | 499115 | 998230 |
| attempts-v220 | 1 | 323115 | 646230 |
| attempts-v221 | 1 | 402115 | 804230 |
| attempts-v222 | 1 | 1130115 | 2260230 |
| **Total** | **5** | **2504575** | **5009150** |

All five required current keys then saved, with `unsavedKeyCount=0`,
`pendingWriteCount=0` and overall success. Origin totals ended at 60 meter-owned
keys / 890,164 UTF-8 bytes / 1,780,328 UTF-16 bytes, including newly saved captures.
The orphan snapshot remained because further reclamation was unnecessary.
Attempt/MAX IDs, outcome evidence, settings, verified metadata and active
other-chat state survived; unrelated app values were byte-unchanged. A fresh VM
reloaded the saved DIRECT/BATCH state, full snapshot and attempt/MAX evidence.
Current value sizes were attempts 4439, snapshot 7141, lifecycle 1584, diag 277,
MAX episodes 1330 bytes. These fixture sizes are not native measurements.

Representative codec sizes remain: ten attempts 259873 original JSON / 37807
packed / 17706 compact retry bytes; one attempt 60295 / 25466 / 11258 bytes.
The required research data roundtrips losslessly.

- 66,862 protected parser/extraction/topology/profiler bytes match immutable V2.22.
- 8,807 send/correlation bytes match validated `4b14425`.
- 15,435 source cache/capture/static-vector/diagnostic bytes match `3be6a30`.
  The copied diagnostic header still says V2.23.2 to preserve those bytes; the
  userscript metadata and `storageHealth.candidateVersion` identify 2.23.3.
- `scripts/verify-baseline.sh` and candidate/harness/verifier/baseline
  `node --check`: PASS. Baseline: 289994 bytes,
  SHA-256 `08bf10714deae924ced7716b5b63f873ba56b11d782289b92d55de62af343696`.
- Two ZIP builds are byte-identical; the sole JS member equals the LF source.
  Complete commands/results are recorded in `VALIDATION.txt`.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| JS | 295749 | `1d5de3edec497ad35bbd74c0a8d97062d45622d87425604d4bbd85170a83adc0` |
| ZIP | 65904 | `781e023afc4142026f36df9dad2580dd1c0bc3554091dbf5e37f19585d527524` |

Changed files: release JS/ZIP, SHA256SUMS, VALIDATION.txt, this report,
`scripts/test-v223.js`, `scripts/verify-v223-protected.js`.

## Exact next native browser retest

1. Keep the existing quota-pressure origin intact. Save its previous diagnostics
   externally and record a read-only storage inventory of owned categories and
   unrelated key/value hashes. Close other meter-enabled ChatGPT tabs so older
   script copies cannot repopulate the obsolete namespaces during this test.
2. Install this ZIP's JS as version 2.23.3 and disable older copies. Hard-reload
   the same V2.23.2 test conversation. Do not submit a new prompt yet. Let normal
   full conversation loading finish, then Copy diagnostics. Retry Capture may
   refresh DIRECT; wait for an actual app BATCH response if needed, rather than
   claiming an invented BATCH observation.
3. Verify `candidateVersion=2.23.3`; valid DIRECT/BATCH state, full snapshot,
   topology and retained profiler; and zero new generation attempts on reload.
   Check cleanup timestamps, eligible counts, exact namespace/key lists and
   reclaimed bytes against the before/after inventory. Recent v218-v222 histories
   should be eligible; unrelated values and settings/position/verified metadata
   must be unchanged. Current attempt/MAX identity and outcomes must survive.
4. Require `finalSaveResult=saved`, `lastSaveSuccessful=true`,
   `unsavedKeyCount=0`, `pendingWriteCount=0`, and every `requiredCurrentKeys`
   entry marked saved. That must include attempts, diag, snapshot, lifecycle and
   any existing/active MAX episode key. A historical `lastError`/failure counter
   can remain after recovery; it must not be mistaken for the final result.
   If four passes exhaust headroom, retain the failure diagnostics and retest
   after the 30-second cooldown; do not manually delete unrelated storage.
5. Hard-reload again. Confirm saved snapshots, DIRECT/BATCH metrics and research
   identity/outcome evidence reload durably. Copy diagnostics again. Any new
   attempt must correspond to an actual subsequent generation, not this reload.
6. In a healthy isolated test chat send `Reply with one short sentence.` once by
   button, wait for SUCCESS and Copy diagnostics; send the same prompt once by
   Enter, wait for SUCCESS and Copy again. Require one new intent/attempt per
   submission, explicit method, dispatch correlation, latency, SUCCESS and all
   required saves successful after each. No giant prompt is needed.

Native browser quota accounting, cross-tab timing and the original site's exact
working set are not reproduced by the VM. Native cleanup and durability therefore
remain unvalidated until this sequence passes. The synthetic UTF-16 budget is a
controlled test model, not an assertion of a universal browser quota. Quota
occupied by unrelated storage or protected meter evidence can still produce a
visible unrecovered failure; four-pass exhaustion remains bounded and honest.

---

## Historical V2.23.2 report (3be6a30; not this child build)

# V2.23.2 candidate — Shared-origin storage and static publication

Prepared 2026-09-30 on `codex/v223-storage-static-state-fixes`, directly from
`4b14425c50ff62b093082908c5861ae796fa7a7d`. The child commit containing this report
is the new candidate. The parent is preserved on `codex/v223-native-validation-fixes`.
No V2.24 work, merge to main, push or PR.

The user reports native confirmation of the parent's send path: button produced
one intent/attempt with 183 ms latency; Enter produced one intent/attempt with
170 ms latency. Those results are user-supplied native evidence. This child keeps
the send observation and dispatch correlation implementation byte-identical.
New native diagnostic files were not present in the checkout. This repair uses
the supplied quota and null-vector findings; it does not claim native validation
of the new storage cleanup or publication behavior.

## Two repairs

Current-chat bounded histories and serialization health did not inventory the
whole origin. The new runtime audit enumerates every exact
`cgpt-size-meter-v2101:` key, including all conversations and legacy/unknown
namespaces. It reads values only after that ownership check. Diagnostics expose
`meterOwnedKeyCount`, `meterOwnedBytes`, `meterOwnedUtf16Bytes`, per-namespace
key/byte totals and `lastAuditAt`. UTF-8 bytes include key and value; UTF-16 bytes
are a separate estimate, not a claim about the browser's internal quota accounting.
Copy performs a fresh audit; routine health refresh is throttled to five seconds.
Actual native origin-wide totals still need collection after installation.

After an unrecovered compact save retry caused by quota pressure, bounded GC may reclaim dated conversation
data inactive for **over 30 days**. It groups recognized snapshot/diagnostic/
lifecycle/attempt/MAX-episode namespaces by conversation, using the newest date
across that conversation. New writes timestamp the existing key-table/LZW
envelopes, so old research observations in a recently used chat are not stale.
Old plain/packed data uses its observation/event timestamps; unknown or
incompletely examined dates fail closed. The validated parent can still decode
the timestamped formats.

GC preserves the current/writing conversation, known in-memory active attempts,
recent/future/undated/malformed data, settings, positions, verified samples,
manual MAX settings, notification keys and unknown namespaces. Unrelated ChatGPT
keys and lookalike prefixes are never selected or read for their values. It
rechecks values for cross-tab changes before deletion. Each run removes at most
**12 keys across 3 stale conversations**, stops after reaching **512 KiB** reclaimed
(one large key can exceed this target), and has a **30-second cooldown**. It then
retries the pending save. Cleanup is pressure-triggered, not a background deletion
of recent research history.

Health exposes cumulative session `bytesReclaimed`, last-run reclaimed bytes/key
count, `cleanupAt`, eligible bytes/key count, namespace removal counts/errors,
`cleanupRetryRecoveredAt`, `finalSaveResult`, per-key save results and
`unsavedKeyCount`. Later successful writes cannot hide another key's unsaved
state. These counters are session-scoped; origin totals are re-audited on reload.
No eligible stale headroom means the final failure remains visible. GC never
tries to make room by clearing unrelated app storage or recent evidence.

The publication failure was downstream of the protected parser:
`inspectJSON → acceptCandidate → mergeRecordsForChat → saveSnapshot →
recordLifecycleFullCapture → lifecycleMetrics/loadSnapshot → saveLifecycle →
diagnostics/loadLifecycle`. Previously these reads depended on successful
localStorage writes. Quota failure could discard/re-read stale source state even
though parsing/topology/profiling had succeeded. Separately, publication selected
only `lastStable`, hiding valid in-flight source captures.

Snapshot, lifecycle and diagnostic state now remain authoritative in memory
before saving. Each family tracks its latest accepted full observation; the
STATIC STATE VECTOR publishes DIRECT/BATCH separately with original phase labels
and a latest observation. In-flight/MAX captures are not relabelled stable, and
missing BATCH stays null. Accepted metrics come from the unchanged parser result.
Explicit snapshot clear also invalidates its cache. Storage failure does not
erase valid in-memory metrics; a failed save still cannot guarantee durability
across a page reload.

## Verification and candidate artifacts

- **70/70 synthetic tests PASS**: all 54 previous cases plus 16 new cases for
  healthy DIRECT/BATCH responses through network hooks; total/partial/lifecycle-only
  persistence failure; in-flight publication; explicit cache clear; origin-wide
  accounting and ownership; safe GC exclusions/bounds/cooldown/change detection;
  new-write age protection; parent-reader compatibility; unrecoverable cleanup;
  and non-quota failures that must never trigger deletion.
- Deterministic quota fixture reclaimed **8,162 meter-owned bytes from 2 stale
  keys**, then saved the current attempt state successfully. Required current
  attempt/MAX identity and outcomes, verified samples and unrelated app values
  were preserved. This is synthetic evidence, not a native origin measurement.
- All **66,862 protected parser/extraction/topology/profiler bytes** match V2.22.
- All **8,807 validated send/correlation bytes** match `4b14425`.
- Candidate, harness, verifier and immutable baseline `node --check`: PASS.
  `scripts/verify-baseline.sh`: PASS. Baseline remains 289,994 bytes, SHA-256
  `08bf10714deae924ced7716b5b63f873ba56b11d782289b92d55de62af343696`.
- Two deterministic ZIP builds are byte-identical, with one JS member exactly
  matching the LF-only source. Full outputs are in `VALIDATION.txt`.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `chatgpt_chat_size_meter_v223_event_model_cleanup.js` | 289872 | `135db44a19b8b410e3aeae27e4ff2e7694854b13ffdc74c554f9afcd9f88fce4` |
| `chatgpt_chat_size_meter_v223_event_model_cleanup.zip` | 64425 | `ef13191e39f57225d19536d779a746226b0c928c584892e053b129e0993bb3b7` |

Changed files: release JS/ZIP, checksums, validation log, this report,
`scripts/test-v223.js`, and `scripts/verify-v223-protected.js`. Baseline, protected
functions, send implementation, spec, package script and line-ending policy are
unchanged. UI changes are limited to the requested static-vector/storage-health
publication; no layout or unrelated controls changed.

## Next native retest

1. Preserve the current diagnostics and install only **2.23.2**. Keep origin
   storage intact. Hard reload an established `/c/<id>` test chat, wait for its
   full conversation response, and copy diagnostics. Record origin-wide owned
   key/byte totals, namespace breakdown, current-chat bytes and the audit timestamp.
2. Compare STATIC STATE VECTOR against the valid full snapshot/topology/profiler.
   DIRECT must have source/phase/time and corresponding scalar metrics after its
   parsed GET. If necessary press Retry Capture once, wait 2–3 seconds and copy.
   BATCH must populate separately when its real response arrives naturally; if
   no BATCH response occurs, null BATCH is expected. Do not replay a BATCH POST.
3. Send exactly `Reply with one short sentence.` by button, copy after SUCCESS,
   then repeat by Enter and copy separately. Expect one new intent/attempt each,
   positive recorded latency, and unchanged send behavior. Wait for closure and
   post-capture jobs; confirm source metrics remain published.
4. Under the existing natural quota pressure, retain before/after copies. Inspect
   cleanup timestamp, eligible count/bytes, removed namespace counts, reclaimed
   bytes, final result, per-key results and unsaved count. Successful recovery
   requires final saved results with no remaining failed keys. If none of the
   owned data is eligible, retain the visible failure; do not clear unrelated
   storage or fabricate quota pressure. Even then valid in-memory DIRECT/BATCH
   metrics must remain available and update on later accepted full captures.
5. After a successful save, copy, hard reload and copy again to verify persisted
   attempt/MAX identities and source metrics. For a failed save, copy before
   reload: in-memory evidence is not a durability claim. Confirm a new full
   capture republishes metrics even if quota continues failing. Native cleanup,
   shared-origin headroom and cross-tab behavior remain validation-open until
   these samples are supplied.

---

## Historical V2.23.1 report (4b14425; not this child build)

The remaining text preserves earlier checkpoint reports, hashes and test counts.
Current V2.23.2 evidence and retest instructions are above.

# V2.23.1 candidate — Native validation fixes

Prepared 2026-09-30 on `codex/v223-native-validation-fixes`, directly from
`ab2b19bfec736dc03cbdd2d1ad3c363bfe87b67a`. The original checkpoint remains
unchanged on `codex/v223-event-model-cleanup`. The new candidate is the child
commit containing this report. No merge to main, V2.24 work, push or PR.

The two new native diagnostic files were absent from this checkout; the user's
reported failures supplied the regression requirements. A read-only live DOM
inspection found a DIV with `contenteditable="true"`, `role="textbox"`, and
`aria-label="Ask ChatGPT"` inside a form, without the old composer ID/test ID.
The empty composer showed file/model/dictation/voice controls, so active Send
markup was not established. No candidate browser runtime validation was performed.

## Repair and storage audit

The old observer used obsolete composer selectors, narrow Send selectors and
late UI boot. Observation now uses window capture at document-start, semantic
visible composer/form detection and semantic submit controls, including nested
SVG click targets. Disabled/voice/Stop/meter controls, turns and search fields
are excluded. No handler prevents submission or changes the composer.

Enter remains provisional until form submission, submit-control activation,
classified generation dispatch, handled Enter that clears the composer, or
handled Enter followed by a newly visible native MAX. Newline input cancels it;
modifiers, repeats and IME/keyCode 229 do not stage it. Provisional keys expire
after five seconds and cannot attach across navigation. Submit/click callbacks
share one intent. Intent fields include original timestamp, conversation ID,
safe text length, explicit method, confirmation evidence, dispatch/attempt ID
and latency. Existing 2.5-second blocked classification, unresolved-POST gating
and correction after late dispatch remain intact.

Plain JSON duplicated `last` with the latest attempt and repeated pre/first/peak/
last/post source observations and event field names. Array bounds alone did not
make the serialized store small. Lossless field-name and nested-value interning
now stores these once. On failure, a smaller lossless LZW/base64 encoding is
tried once where useful. The error/failure count stay visible after recovery;
recovery adds timestamp/bytes/count. Unrecovered failure remains
`lastSaveSuccessful:false`, with tracking continuing in memory. No retained
attempt, episode, metric or trace row is discarded by compaction or retry.

Bounds: ten full attempts/episodes/preflights; twenty intents/unclassified POSTs;
forty app/meter/unowned-WebSocket rows; sixty per-attempt network/transport rows;
forty recent SSE events; thirty episode capture rows. The SSE-event bound is
also enforced at save time. Raw bodies/stream text, composer text, auth tokens
and WebSocket previews are not added. Matching readers cover attempt, episode,
lifecycle, snapshot and diagnostic keys; old plain JSON still loads and copied
diagnostics retain their logical schema.

Identical synthetic logical states, using real constructors, DIRECT/BATCH scalar
metrics, repeated snapshot slots, sixty network/transport rows per attempt and
forty app/meter/unowned-WebSocket rows. Original means the checkpoint's plain JSON
format; these are not measurements of the unavailable native files.

| Fixture | Original bytes | Compact bytes | Quota retry bytes |
| --- | ---: | ---: | ---: |
| One completed attempt with bounded traces | 60,295 | 25,466 | 11,243 |
| Ten completed attempts with bounded traces | 259,873 | 37,807 | 17,691 |

The ten-attempt store is 85.5% smaller normally and 93.2% smaller on retry.
Other ChatGPT, conversation and historical meter allocations share origin quota;
they were neither measured nor cleared. No headroom guarantee is claimed.

## Current verification and artifacts

- **54/54 synthetic tests PASS**: all existing 45 cases plus nine cases covering
  native-style button/tap/Enter paths, duplicate callbacks, newline/modifier/IME/
  search exclusions, blocked MAX, clear/navigation, lossless sizes/roundtrip,
  quota pressure and reload through production readers.
- Quota tests prove every history bound, deep equality of all retained fields,
  attempt/MAX identity/outcome and DIRECT/BATCH metrics, visible failure,
  recovered retry, and unrecovered failure without losing memory evidence.
- Candidate/harness `node --check`, baseline verifier and baseline syntax: PASS.
- All four protected regions: **66,862 bytes identical** (64,982 extraction/
  topology/profiler; 1,190 merge; 282 inspectJSON; 408 inspectRequestBody).
  Baseline is **289,994 bytes**, SHA-256
  `08bf10714deae924ced7716b5b63f873ba56b11d782289b92d55de62af343696`.
- Release JS is LF-only; two ZIP builds are byte-identical. One member, with
  exact release JS bytes. Complete output: `VALIDATION.txt`.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `chatgpt_chat_size_meter_v223_event_model_cleanup.js` | 281660 | `5040718bbd964b33a80b33757c64cdfb0697962fe537bd36f6130c38458134f5` |
| `chatgpt_chat_size_meter_v223_event_model_cleanup.zip` | 62182 | `26ee7bc9a7cf8d548e7303ffc9b21f5e45d9e45bf25104ee768d7d5f81ca827d` |

Changed files: release JS, ZIP, `SHA256SUMS`, `VALIDATION.txt`, this report and
`scripts/test-v223.js`. No baseline/protected parser, UI layout, spec, package
script or line-ending policy changes.

## Exact next native browser retest

1. Replace the existing meter entry with **2.23.1** from this ZIP and run only
   one meter. Preserve storage. Open an established healthy `/c/<id>` test chat,
   hard reload, and copy diagnostics before sending. Record version, timestamp,
   chat label/ID, attempt/intent counts and storage health. Enable Network Preserve
   log locally; do not export secrets.
2. **A, button:** enter exactly `Reply with one short sentence.` (30 characters),
   click the real Send arrow once, wait for SUCCESS/stream closure, then copy
   before another send. Expect exactly one new `button` intent and one generation
   `/backend-api/f/conversation` attempt. Verify original timestamp/length/chat,
   `dispatchAt`, matching `attemptId`, nonnegative `intentToDispatchMs` equal to
   attempt `sendIntentToDispatchMs`, no duplicate, and successful storage health.
3. **B, Enter:** use the same prompt and plain Enter once. Wait/copy separately.
   Expect exactly one further `enter` intent and one further attempt, same field
   checks, no implicit-click/form duplicate. If touch is available, repeat A with
   one tap as a separately labelled sample.
4. **Negative keys:** type `line one`, Shift+Enter, `line two`. Confirm a newline,
   no dispatch and unchanged intent count after over five seconds. Test modifier
   keys that do nothing/insert newline in this browser, and IME if available.
   Record actual behavior: a modifier that really submits may produce an explicit
   form intent. Clear unsent text; verify one plain Enter submission still works.
5. **Persistence:** complete twelve small sends, alternating button and Enter.
   Record counts/health after each; await closure and 1.2/3.2-second post-captures.
   Expect ten retained attempts with IDs/outcomes/timing/source metrics and bounded
   traces. Copy, reload, copy again; evidence must survive. If retry occurs, retain
   error/failure count and recovery timestamp/bytes. Do not clear storage to hide a
   failure. Preserve any unrecovered error and locally inspect origin occupancy
   without copying other app contents/tokens.
6. **Blocked MAX:** open the established MAX-prone chat and copy before sending.
   Prefer a banner-cleared start. Send one ordinary small prompt by button, wait
   at least three seconds and copy before Retry. No dispatch plus native MAX after
   intent must mean blocked-before-dispatch with an episode ID and no fake attempt.
   A classified dispatch means a real attempt; unknown POST means correlation
   incomplete. If possible repeat with Enter from a banner-cleared start, keeping
   separate samples. An already-visible banner and ignored Enter alone are not
   submission proof.
7. Retry Capture once; wait 2–3 seconds and copy. Verify unchanged episode identity,
   fresh DIRECT and separate meter traffic. BATCH must arrive naturally or remain
   pending. Expand/collapse through updates: no flooded attempts/episodes. Reload
   and verify episode IDs/linkage/blocked evidence survive. Banner clearance alone
   is not confirmed recovery; a later real SUCCESS is required.
8. Retain prior transport checks: a longer healthy response quoting
   `You've reached the maximum length for this conversation` must stay SUCCESS
   without a quote-induced MAX. Navigate immediately after completion to check
   canceled old capture jobs. Preserve naturally occurring post-completion clone
   abort evidence as benign SUCCESS; do not manufacture it by stopping generation.

Copy each controlled sample before the next send/upload; ordinary discussion and
diagnostic-upload turns are separate real attempts, not controlled A/B cases.

Candidate native validation remains open: active Send markup, real React timing,
blocked Enter, touch/IME, shared-origin quota headroom and compression cost,
natural BATCH/WebSocket ownership need browser evidence. New-chat routes without
`/c/<id>` still cannot own event traces. Older builds cannot decode packed storage;
export diagnostics before rollback and preserve the original checkpoint as
history. No native MAX or browser quota recovery is claimed from this harness.

---

## Historical original checkpoint report (ab2b19b; not this child build)

The remaining text records the original checkpoint, including its original
hashes, 45-test count and original manual sequence. Current results are above.

# V2.23 candidate — Event Model Cleanup

Prepared 2026-09-30. Candidate for manual browser validation; not merged to main.
Branch: `codex/v223-event-model-cleanup`. The candidate commit is the commit
containing this report (`git rev-parse HEAD` on that branch).

## Verified starting state

The LF policy commit is `b15e7fd` on `codex/lf-checkout-policy`, based on
`9d8a7e7`. That commit changes only `.gitattributes`:

```gitattributes
*.js text eol=lf
*.sh text eol=lf
*.zip binary
```

The two source files were refreshed from Git, without editing baseline content.
Git's index normalization metadata was refreshed with named-file staging; there
was no staged source diff. Policy-branch status was clean before returning to
the implementation branch, whose parent is the policy commit.

The baseline is exactly **289,994 bytes**, SHA-256:
`08bf10714deae924ced7716b5b63f873ba56b11d782289b92d55de62af343696`.
`scripts/verify-baseline.sh` and baseline `node --check` pass.

## Changes

- Only observed, classified generation dispatches create real attempts. MAX
  conditions have their own persisted, bounded, deduplicated episodes.
- Send intent records lengths and timing, without storing composer content.
  A 2.5-second observation window can classify blocked-before-dispatch only
  with a scoped visible MAX banner and no dispatch or unresolved conversation
  POST. A later correlated dispatch corrects the provisional blocked label.
- MAX detection excludes turns, message containers, the meter, hidden regions
  and containers wrapping conversation messages. Structured transport errors
  are separate from ordinary streamed assistant text. SSE framing handles split
  lines; quoted MAX and completion text do not establish outcomes.
- Outcomes and transport closure are separate. Cloned incremental readers keep
  the originating conversation/attempt IDs. Archived attempts receive late
  chunks, final bytes and benign post-completion BodyStreamBuffer errors.
- Meter captures use the original fetch and are parsed once. Generation HTTP/SSE,
  app-state HTTP, correlated WebSocket activity and meter capture traffic have
  separate diagnostics. HTTP summaries and SSE byte totals are not summed.
  Unowned WebSocket traffic stays outside generation telemetry.
- Post-outcome and MAX capture jobs carry immutable chat/event identities and
  cancel after navigation or episode clearance. Fresh episode sources start
  pending; historical MAX snapshots are never substituted. Real network
  attempts supply INFLIGHT phase even without a Stop button.
- Preflight matching prefers conversation/parent identities, rejects explicit
  identity/action conflicts and exposes fallback provenance. Stable preflight
  IDs preserve late response ownership after dispatch consumes the match.
- URLs lose credentials, query values and fragments before persistence.
  No arbitrary WebSocket payload previews or auth/dispatch hint values are saved.
- Histories retain ten full attempts and ten episodes, with bounded event rows.
  Storage failures are visible and event tracking continues in memory. A page
  restart closes lost-reader correlation as unknown, preserving prior evidence.
- The compact card keeps the real attempt headline separate from episode state.
  Expanded/copy diagnostics put event evidence and descriptive source vectors
  before deep topology diagnostics. Predictive risk bands/meters are removed
  from presentation, and missing numeric helper values remain unavailable.

The immutable baseline remains tracked as the reference. The release is a copy
derived from it (797 added / 1,963 removed lines in a direct source comparison,
chiefly event functions and obsolete UI/diagnostics sections).
The parser/extraction/profiler region and `mergeRecordsForChat`,
`inspectJSON`, `inspectRequestBody` are byte-identical; no protected function was
modified. `unsafeWindow`, `document-start`, the P prefix, early fetch/XHR/WS hooks,
DIRECT/BATCH parsing and cloned incremental SSE capture remain present.

## Validation

- `node --check` candidate and both JavaScript verification scripts: PASS.
- `node scripts/verify-v223-protected.js`: PASS, **66,862 bytes** across four
  protected regions, plus baseline identity and lineage markers.
- `node scripts/test-v223.js`: **45/45 PASS**. The harness instruments the actual
  shipped script only in memory. It uses a deterministic fake clock, DOM,
  localStorage, fetch, Request, XHR and WebSocket surfaces, without a server.
- All ten specified acceptance scenarios are covered synthetically: short/long
  SUCCESS, banner at load, capped Send, Retry during MAX, quoted DOM/SSE phrases,
  post-SUCCESS abort, SPA cancellation and persistent-banner deduplication.
- Additional cases cover split completion frames, request/response identity
  races, quota errors, bounded histories, telemetry timeout, XHR/fetch errors,
  recovery provenance, provisional blocked-label correction and unknown POSTs.
- Both saved `diagnostics/false-max/` files are replayed as quoted page content
  and as repeated synthetic observations. Their historical V2.22 labels are
  not promoted to native MAX evidence. These text fixtures cannot reconstruct
  their original browser DOM or server traffic.
- Packaging checks the ZIP has exactly one member and that its JS bytes match
  the release. Repackaging is deterministic for the verified Python runtime.

Full command results are in `VALIDATION.txt`. No native-browser validation was
performed. No official limit, universal threshold, capacity percentage or
causative metric is asserted.

## Artifacts

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `chatgpt_chat_size_meter_v223_event_model_cleanup.js` | 272063 | `deff5a557eed8836e3cb996c09332741de0f7c417c9fb8902f96713fca0f0836` |
| `chatgpt_chat_size_meter_v223_event_model_cleanup.zip` | 59316 | `bc6c97cfe16e4f2e0b3095a99edce9ee6f297e56709246c9808a17ee9096145e` |

The exact sums also appear in `SHA256SUMS`. The ZIP contains the JS only.

## Runtime uncertainties and next manual browser sequence

Native alert/composer selectors, generation body variants, real capped-send
behavior, WebSocket ownership signals and natural BATCH arrivals remain
unverified. A bare new-chat route with no `/c/<id>` cannot yet own event traces;
use established conversation URLs for this validation. Unknown request shapes
remain correlation incomplete. Conservative banner scoping may miss a changed
native UI. A clone read error without completion evidence does not prove model
failure. No successful native MAX classification is claimed for this build.

1. Disable V2.22/other meter scripts. Install the JS from this ZIP in
   Tampermonkey. Open an existing healthy `/c/<id>` conversation and hard reload.
   Confirm V2.23, usable Copy/Retry buttons, a scrollable expanded panel, no
   predictive risk bands, and no invented running attempt. Keep browser Network
   logging available locally; do not export unsanitized headers/tokens.
2. Send **“Reply with one short sentence.”** Wait for the answer and transport
   closure, then Copy diagnostics. Expect exactly one new real attempt, SSE
   SUCCESS, an attributed confirmation source, final bytes/chunks and no MAX
   episode. A still-open clone may reach its 60-second telemetry timeout; report
   that distinctly from an observed stream close.
3. Send **“Write six short paragraphs explaining how to organize a project.
   Include the exact quoted sentence: You've reached the maximum length for
   this conversation.”** After completion, Copy diagnostics. Expect one further
   successful attempt and no episode from the quote. Neither quoted DOM text
   nor streamed assistant content should mark MAX.
4. Open **Cat Co-op Prompt Drafter**, hard reload, and send one ordinary real
   development prompt. Copy diagnostics after completion. Confirm one actual
   dispatch, SUCCESS and transport closure; check any observed mid-generation
   DIRECT/BATCH captures have INFLIGHT phase. Do not paste a giant test prompt.
5. Open the **Lian Li** MAX-prone conversation. If the banner is already visible,
   Copy diagnostics before sending. Expect one active episode and zero new real
   attempts from loading, rendering or expanding the meter. An initial episode
   capture may run automatically; Copy-before-Retry means no manual Retry yet.
6. If possible begin with its banner cleared. Send **“What's the next step from
   here?”** Wait at least three seconds, then Copy diagnostics **before pressing
   Retry**. Compare actual browser Network dispatch with the recorded intent:
   a classified dispatch must create one real attempt; no dispatch plus the
   native MAX banner should mark blocked-before-dispatch without a fake attempt.
   An unsupported POST must show correlation incomplete. Preserve this first
   sample even if capture sources are still pending.
7. Press **Retry Capture exactly once**, wait 2–3 seconds, then Copy again.
   Expect the same episode ID/count, fresh DIRECT attribution and meter traffic
   separate from generation totals. BATCH may arrive naturally from ChatGPT;
   if it does not, keep **No fresh BATCH capture for this MAX episode**. The
   meter must not replay a BATCH POST. After closed telemetry, Retry must not
   change the generation bytes or create an attempt/episode.
8. While the same banner remains visible, expand/collapse the meter and wait
   through several updates. Copy again: same episode. Optionally make one more
   small capped Send; record whether it dispatches rather than assuming it is
   blocked. The earlier SUCCESS headline must remain a real-attempt headline.
9. In a healthy chat, complete a small generation and immediately navigate to a
   different existing chat before the 1.2/3.2-second post-capture jobs run.
   Inspect Network/diagnostics: old jobs must not fetch the newly selected chat
   or attach its snapshots to the old attempt. Repeat around a newly observed
   MAX episode if practical. Normal app traffic and the new chat's own initial
   capture are distinct from the canceled old jobs.
10. If the cloned BodyStreamBuffer abort occurs naturally after completion,
    preserve diagnostics showing SUCCESS, its archived final bytes/error and
    the benign label. Do not fabricate it by stopping model generation; this
    scenario remains harness-only until naturally observed. When a MAX banner
    clears, recovery must remain unconfirmed until a later real SUCCESS in that
    conversation. Optionally repeat the MAX sequence on the GPU MAX chat.

For each native sample, retain version, chat label, test step, timestamp, visible
native outcome and sanitized copied diagnostics. Label actual evidence as
healthy SUCCESS, confirmed native MAX, blocked-before-dispatch or correlation
incomplete. Keep old V2.22 inferred/false-MAX fixtures in their original category.
