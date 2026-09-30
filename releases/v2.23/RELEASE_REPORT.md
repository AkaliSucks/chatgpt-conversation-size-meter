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
