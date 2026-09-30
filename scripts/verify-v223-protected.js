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
