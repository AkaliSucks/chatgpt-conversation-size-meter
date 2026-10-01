// V2.23.5 exact byte preservation: narrowly authorized, hash-pinned function exceptions.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname,'..');
const sourcePath = 'releases/v2.23.5/chatgpt_chat_size_meter_v2235_reliability_hotfix.js';
const candidate = fs.readFileSync(process.argv[2] || path.join(root,sourcePath));
const baseline = fs.readFileSync(path.join(root,'src/baseline/chatgpt_chat_size_meter_v222_sse_outcome_post_correlation.js'));
const parent = execFileSync('git',['show','3337f1bd41dea2577ea2e6329783b81ea7466e00:releases/v2.23/chatgpt_chat_size_meter_v223_event_model_cleanup.js']);
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
assert.equal(baseline.length,289994);
assert.equal(sha(baseline),'08bf10714deae924ced7716b5b63f873ba56b11d782289b92d55de62af343696');
function region(bytes,start,end) {
  const a=bytes.indexOf(Buffer.from(start)), b=bytes.indexOf(Buffer.from(end),a);
  assert(a>=0 && b>a,`boundaries ${start} / ${end}`);
  return bytes.subarray(a,b);
}
function replaceExact(bytes,old,replacement) {
  old=Buffer.from(old);replacement=Buffer.from(replacement);
  const a=bytes.indexOf(old);
  assert(a>=0 && bytes.indexOf(old,a+old.length)===-1,'exactly one replacement boundary');
  return Buffer.concat([bytes.subarray(0,a),replacement,bytes.subarray(a+old.length)]);
}
const authorized = [
  [
    "subtreeSize",
    "analyzeBranchPoints",
    581,
    1072,
    "38c5bc624097a14bfd01e05f21bd29922a9cacea65e3fd1fce43ae0dc0a4d718",
    "3c8be97af2998c0ba99792d640d6a8f6a1c361bc131f9aa1d54aacd51590adda"
  ],
  [
    "v212SubtreeSerializedStats",
    "v212AnalyzeBranchRetention",
    880,
    1352,
    "345385403cb2d3c1cad1a19d22444ed45d959970ef392f450667eb9a364b635e",
    "3378126fcbf02756d4084e0b78d38e71736e262cc98b7a1033b07bf3fda933d4"
  ],
  [
    "inspectResponse",
    "inspectRequestBody",
    3083,
    3192,
    "b7b1836d90b956899d48f71f9bea645537fd93d0efce44541eccdb0ea999104d",
    "a722aee5ce6f7d2346886fe3b6f97b2509144c791c56bca5aeaf0d2d5254000d"
  ],
  [
    "attemptRecordStreamChunk",
    "attemptFinishStream",
    2175,
    2249,
    "c0b0adb77b7300cb225119129829424aa446b14d5120537569c0828baec273ce",
    "9bdcc3c8b35f3d5259068437d034bbc288659ee543a29047d7ecf6ebbeba7712"
  ],
  [
    "attemptFinishStream",
    "attemptInspectResponseStream",
    2538,
    2840,
    "9034a04c36626e0b00b56f55053b0e34938d3f6123f4c98cce2682a7757c6fbe",
    "c47090d0658648de9307c2e687f6f195ddac039fa69f456a50220e76eb66c586"
  ],
  [
    "attemptObserveGenerationResponse",
    "attemptObserveXHRGenerationResponse",
    1255,
    1335,
    "b068c390160d31f55af4a3cbdd2651e3dfbaa8196d0ef97b44587e4ebd13601a",
    "262e71c051bd10fd412b4ffaebeec8e7e14f672fc9e7d828ec9379521d89cb98"
  ],
  [
    "getStatus",
    "statusColor",
    317,
    384,
    "585d26f7b69387f4095749bcbb44978dcf1785df63ca5f04720fec3a70c30461",
    "98708339deb4fdf506d1192c05f7ba1316c1c3184fb80801e0004b12de4241cd"
  ]
];
let expected = parent;
for(const [name,next,oldSize,newSize,oldHash,newHash] of authorized) {
  const old=region(parent,'function '+name+'(','function '+next+'(');
  const changed=region(candidate,'function '+name+'(','function '+next+'(');
  assert.equal(old.length,oldSize);assert.equal(changed.length,newSize);
  assert.equal(sha(old),oldHash,`parent exception identity: ${name}`);
  assert.equal(sha(changed),newHash,`exact authorized replacement: ${name}`);
  expected=replaceExact(expected,old,changed);
  console.log(`PASS pinned exception ${name}: ${oldSize} -> ${newSize} bytes; ${newHash}`);
}
const versions = [
  ['// @name         ChatGPT Conversation Size Meter V2.23 EVENT MODEL CLEANUP','// @name         ChatGPT Conversation Size Meter V2.23.5 RELIABILITY HOTFIX'],
  ['// @version      2.23.4','// @version      2.23.5'],
  ["health.candidateVersion = '2.23.4';","health.candidateVersion = '2.23.5';"],
  ["const trace = {version:'2.23.4'","const trace = {version:'2.23.5'"],
  ['ChatGPT Conversation Size Meter V2.23.2 EVENT MODEL CLEANUP','ChatGPT Conversation Size Meter V2.23.5 EVENT MODEL CLEANUP'],
  ['Candidate userscript: V2.23.4 ROUTE-AWARE RETRY CAPTURE','Candidate userscript: V2.23.5 RELIABILITY HOTFIX']
];
for(const [old,replacement] of versions) expected=replaceExact(expected,old,replacement);
assert.deepEqual(candidate,expected,'all userscript bytes outside pinned functions and version literals unchanged');
console.log(`PASS entire ${candidate.length}-byte userscript: only 7 pinned function changes and 6 exact version literals`);
let protectedBytes=0;
for(const [start,end] of [
  ['function normalizeRole(','function subtreeSize('],
  ['function analyzeBranchPoints(','function v212SubtreeSerializedStats('],
  ['function v212AnalyzeBranchRetention(','function lifecycleKey('],
  ['function mergeRecordsForChat(','function acceptCandidate('],
  ['function inspectJSON(','function inspectSSE('],
  ['function inspectRequestBody(','function attemptIsPreflightRequest(']
]) {
  const old=region(baseline,start,end);
  assert.deepEqual(region(candidate,start,end),old,`immutable baseline protected bytes ${start}`);
  protectedBytes+=old.length;
}
console.log(`PASS ${protectedBytes} immutable baseline parser/extraction/topology/profiler bytes; only the two pinned stack-safe helpers excepted`);
for(const [label,start,end] of [
  ['send-intent','function sendComposer(','function eventComparison('],
  ['send/dispatch correlation','function attemptStartFromNetwork(','function attemptEnrichRequestBody('],
  ['MAX classification/episode dedup','function eventEpisodes(','function sendComposer('],
  ['MAX finalization','function attemptMarkMax(','function attemptStatusLabel('],
  ['generation/preflight classification','function attemptIsPreflightRequest(','function attemptSSEEventNames('],
  ['static publication','function eventStaticState(','function eventDiagnostics('],
  ['static caches','function loadSnapshot(','function esc('],
  ['capture publication','function recordLifecycleFullCapture(','function lifecyclePollPhase('],
  ['parser acceptance','function acceptCandidate(','function inspectJSON('],
  ['early network hooks','function installNetworkHooks(','function captureRouteKind('],
  ['persistent Copy/Retry UI','const quickActionState =','function render(']
]) {
  const old=region(parent,start,end);
  assert.deepEqual(region(candidate,start,end),old,`unchanged ${label}`);
  console.log(`PASS unchanged ${label} (${old.length} bytes)`);
}
for(const [label,start,end] of [
  ['diagnostic publication','function eventDiagnostics(','function attemptKey('],
  ['storage retention/accounting','function eventStorageError(','function eventEpisodes('],
  ['route-aware Retry/navigation cancellation','function captureRouteKind(','function compactBranchDetails(']
]) {
  let old=region(parent,start,end);
  for(const [before,after] of versions)if(old.includes(Buffer.from(before)))old=replaceExact(old,before,after);
  assert.deepEqual(region(candidate,start,end),old,`unchanged ${label} except exact version literal`);
  console.log(`PASS unchanged ${label} except version literal (${old.length} bytes)`);
}
for(const marker of ["const P = 'cgpt-size-meter-v2101';",'// @grant        unsafeWindow','// @run-at       document-start',
  'const page = (typeof unsafeWindow','installNetworkHooks();\ninstallSendIntentHook();',
  'const reader = body.getReader();','const decoder = new TextDecoder();'])assert(candidate.includes(Buffer.from(marker)),marker);
console.log('PASS immutable baseline identity, storage prefix, unsafeWindow/document-start and early capture lineage');
