// Byte comparisons cover the entire extraction/topology/profiler region and
// named parser boundaries. No normalization is allowed in these comparisons.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const base = fs.readFileSync(path.join(root, 'src/baseline/chatgpt_chat_size_meter_v222_sse_outcome_post_correlation.js'));
const candidate = fs.readFileSync(process.argv[2] || path.join(root,'releases/v2.23/chatgpt_chat_size_meter_v223_event_model_cleanup.js'));
assert.equal(base.length,289994);
assert.equal(crypto.createHash('sha256').update(base).digest('hex'),'08bf10714deae924ced7716b5b63f873ba56b11d782289b92d55de62af343696');
function region(bytes,start,end) {
  const a = bytes.indexOf(Buffer.from(start)), b = bytes.indexOf(Buffer.from(end),a);
  assert(a >= 0 && b > a, `${start} / ${end} boundaries`);
  return bytes.subarray(a,b);
}
let total = 0;
for (const [start,end] of [
  ['function normalizeRole(', 'function lifecycleKey('],
  ['function mergeRecordsForChat(', 'function acceptCandidate('],
  ['function inspectJSON(', 'function inspectSSE('],
  ['function inspectRequestBody(', 'function attemptIsPreflightRequest(']
]) {
  const original = region(base,start,end);
  assert.deepEqual(region(candidate,start,end),original,`protected bytes: ${start}`);
  total += original.length;
  console.log(`PASS protected region ${start} (${original.length} bytes)`);
}
for (const marker of ["const P = 'cgpt-size-meter-v2101';",'// @grant        unsafeWindow','// @run-at       document-start',
  'const page = (typeof unsafeWindow', 'installNetworkHooks();','function installWebSocketHook()',
  'const reader = body.getReader();','const decoder = new TextDecoder();']) {
  assert(candidate.includes(Buffer.from(marker)),marker);
}
console.log(`PASS ${total} protected bytes; baseline identity and capture-lineage markers`);
const checkpoint = require('node:child_process').execFileSync('git',['show',
  '4b14425c50ff62b093082908c5861ae796fa7a7d:releases/v2.23/chatgpt_chat_size_meter_v223_event_model_cleanup.js']);
let sendBytes = 0;
for (const [start,end] of [
  ['function sendComposer(', 'function eventComparison('],
  ['function attemptStartFromNetwork(', 'function attemptEnrichRequestBody(']
]) {
  const original = region(checkpoint,start,end);
  assert.deepEqual(region(candidate,start,end),original,`validated send path: ${start}`);
  sendBytes += original.length;
}
for (const marker of ['let pendingComposerEnter = null;','let lastComposerSubmission = null;',
  'installNetworkHooks();\ninstallSendIntentHook();']) assert(candidate.includes(Buffer.from(marker)),marker);
console.log(`PASS ${sendBytes} validated send/correlation bytes unchanged from 4b14425`);
const staticCheckpoint = require('node:child_process').execFileSync('git',['show',
  '3be6a3004172c2aca2e51b0e0cc0e49d9f86e407:releases/v2.23/chatgpt_chat_size_meter_v223_event_model_cleanup.js']);
let staticBytes = 0;
for (const [start,end] of [
  ['function loadSnapshot(', 'function esc('],
  ['function loadLifecycle(', 'function visibleGenerationActive('],
  ['function lifecycleMetrics(', 'function chooseHigher('],
  ['function recordLifecycleFullCapture(', 'function lifecyclePollPhase('],
  ['function eventStaticState(', 'function attemptKey(']
]) {
  const original = region(staticCheckpoint,start,end);
  assert.deepEqual(region(candidate,start,end),original,`validated static publication: ${start}`);
  staticBytes += original.length;
}
console.log(`PASS ${staticBytes} validated source cache/capture/static vector/diagnostic bytes unchanged from 3be6a30`);
const validated = require('node:child_process').execFileSync('git',['show',
  'ccdd1b97485d59cdc7d4f92735cca5b1ada7e431:releases/v2.23/chatgpt_chat_size_meter_v223_event_model_cleanup.js']);
let eventBytes = 0;
for (const [start,end] of [
  ['function eventStorageError(', 'function eventEpisodes('],
  ['function eventEpisodes(', 'function sendComposer('],
  ['function eventAttempt(', 'function eventStorageError('],
  ['function attemptMarkMax(', 'function attemptStatusLabel('],
  ['function acceptCandidate(', 'function inspectJSON('],
  ['function attemptIsPreflightRequest(', 'function installNetworkHooks(']
]) {
  const original = region(validated,start,end);
  assert.deepEqual(region(candidate,start,end),original,`validated storage/MAX path: ${start}`);
  eventBytes += original.length;
}
console.log(`PASS ${eventBytes} storage retention/MAX episode/generation classifier/transport/acceptance bytes unchanged from ccdd1b9`);
const oldFamily = region(validated,'function lifecycleSourceFamily(', 'function lifecycleFamilyLabel(');
const newFamily = region(candidate,'function lifecycleSourceFamily(', 'function lifecycleFamilyLabel(');
const allowed = oldFamily.toString().replace('/\\/backend-api\\/conversation\\/[^/?#]+/i.test(s) &&\n    !s.includes(\'/backend-api/conversations/\')',
  '(/\\/backend-api\\/conversation\\/[^/?#]+/i.test(s) &&\n    !s.includes(\'/backend-api/conversations/\')) ||\n    /\\/backend-api\\/conversations\\/[^/?#]+(?:[?#]|$)/i.test(s)');
assert.deepEqual(newFamily,Buffer.from(allowed),'only source-family change: accepted per-chat plural route support');
console.log('PASS source-family classifier has only the demonstrated plural per-chat route extension');
