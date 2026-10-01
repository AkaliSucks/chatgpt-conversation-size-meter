// Exact frozen-parent and immutable-baseline region checks; no text normalization.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),file=process.argv[2] || path.join(root,'releases/v2.24.0/chatgpt_chat_size_meter_v224_empirical_pressure.js');
const candidate=fs.readFileSync(file),parent=execFileSync('git',['show',
  '7f02f4d8b9101a8ff481bda4af97e641e04e8ef0:releases/v2.23.5/chatgpt_chat_size_meter_v2235_reliability_hotfix.js']);
const baseline=fs.readFileSync(path.join(root,'src/baseline/chatgpt_chat_size_meter_v222_sse_outcome_post_correlation.js'));
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
assert.equal(sha(parent),'a6b4f536a79dcefba5abbb438eec8223b8eb95cc852529199400934e3c2ec506');
assert.equal(sha(baseline),'08bf10714deae924ced7716b5b63f873ba56b11d782289b92d55de62af343696');
function region(bytes,start,end){const a=bytes.indexOf(Buffer.from(start)),b=bytes.indexOf(Buffer.from(end),a);assert(a>=0 && b>a);return bytes.subarray(a,b);}
let protectedBytes=0;
for(const[start,end]of [
  ['function normalizeRole(','function lifecycleKey('],
  ['function mergeRecordsForChat(','function acceptCandidate('],
  ['function inspectJSON(','function inspectSSE('],
  ['function inspectRequestBody(','function attemptIsPreflightRequest(']
]){
  const old=region(parent,start,end);assert.deepEqual(region(candidate,start,end),old,start);protectedBytes+=old.length;
  console.log(`PASS frozen protected region ${start}: ${old.length} bytes; SHA-256 ${sha(old)}`);
}
let baselineBytes=0;
for(const[start,end]of [
  ['function normalizeRole(','function subtreeSize('],
  ['function analyzeBranchPoints(','function v212SubtreeSerializedStats('],
  ['function v212AnalyzeBranchRetention(','function lifecycleKey('],
  ['function mergeRecordsForChat(','function acceptCandidate('],
  ['function inspectJSON(','function inspectSSE('],
  ['function inspectRequestBody(','function attemptIsPreflightRequest(']
]){const old=region(baseline,start,end);assert.deepEqual(region(candidate,start,end),old,start);baselineBytes+=old.length;}
for(const[start,end]of [
  ['function installNetworkHooks(','function captureRouteKind('],
  ['function attemptStartFromNetwork(','function attemptEnrichRequestBody('],
  ['function sendComposer(','function eventComparison('],
  ['function recordLifecycleFullCapture(','function lifecyclePollPhase('],
  ['function getStatus(','function statusColor('],
  ['function attemptRecordStreamChunk(','function attemptDOMAssistantSignature('],
  ['function attemptMarkMax(','function attemptStatusLabel('],
  ['function eventStaticState(','function eventDiagnostics(']
])assert.deepEqual(region(candidate,start,end),region(parent,start,end),start);
// Only metadata differs in retention and Retry routing, never behavior.
for(const[start,end]of [
  ['function eventStorageError(','function eventEpisodes('],
  ['function captureRouteKind(','function compactBranchDetails(']
])assert.equal(region(candidate,start,end).toString(),region(parent,start,end).toString().replaceAll("'2.23.5'","'2.24.0'"));
for(const marker of ["const P = 'cgpt-size-meter-v2101';",'// @grant        unsafeWindow','// @run-at       document-start',
  'installNetworkHooks();\ninstallSendIntentHook();'])assert(candidate.includes(Buffer.from(marker)),marker);
console.log(`PASS ${protectedBytes} frozen V2.23.5 protected bytes; ${baselineBytes} immutable V2.22 bytes (inherited iterative helpers preserved)`);
console.log('PASS unchanged MAX detector/finalizer, transport, send, early hooks, status colors, capture publication, Retry and recovery behavior');
if(!process.argv[2]){
  console.log(execFileSync('python',[path.join(__dirname,'build-v224.py'),'--check'],{encoding:'utf8'}).trim());
  // Negative controls: arbitrary protected parser/Retry edits must fail.
  const os=require('node:os'),scratch=fs.mkdtempSync(path.join(os.tmpdir(),'cgpt-v224-protection-'));
  try{
    for(const marker of ['function findBestCandidate(','function captureRouteKind(']){
      const bad=Buffer.from(candidate),position=bad.indexOf(Buffer.from(marker));assert(position>=0);bad[position]=bad[position]===102?103:102;
      const target=path.join(scratch,'negative.js');fs.writeFileSync(target,bad);
      let rejected=false;try{execFileSync(process.execPath,[__filename,target],{stdio:'pipe'});}catch{rejected=true;}assert(rejected,marker);
      console.log('PASS negative one-byte edit rejected: '+marker);
    }
  }finally{fs.unlinkSync(path.join(scratch,'negative.js'));fs.rmdirSync(scratch);}
}
