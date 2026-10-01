// Separate V2.24 tests reuse the unchanged V2.23 fake browser environment.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),candidate=path.join(root,'releases/v2.24.0/chatgpt_chat_size_meter_v224_empirical_pressure.js');
const harness=fs.readFileSync(path.join(__dirname,'test-v223.js'),'utf8').split('const cases=[];')[0];
const scope={require,process:{argv:['node','test',candidate]},__dirname,console,URL,TextEncoder,TextDecoder,
  ArrayBuffer,Request,Blob,AbortController,btoa,atob,Buffer};
vm.runInNewContext(harness+'\nglobalThis.makeEnvironment=environment;',scope);
const environment=scope.makeEnvironment;
const fixtures=JSON.parse(fs.readFileSync(path.join(root,'fixtures/v224/pressure-vectors.json'),'utf8'));
const cases=[],check=(name,fn)=>cases.push([name,fn]),plain=x=>JSON.parse(JSON.stringify(x));
const vector=(tokens,extra={})=>({sourceFamily:'batch',fullCapturedAt:900000,snapshotRole:'pre-dispatch',
  displayLikeTokens:tokens,mappingBytes:20000000,activeBranchBytes:19000000,retainedBytes:12000000,
  retainedShare:60,toolResultBytes:11000000,hot128:12800,hot256:25600,strongContextMarkers:3,
  branchNodes:4000,messageNodes:3900,...extra});
const row=(id,tokens,extra={})=>({conversationId:'chat-a',eventId:id,attemptId:id,outcome:'max',
  timestamp:950000+id,model:'test-model',effort:'high',identitySource:'generation request',
  confirmationSource:'structured SSE error',provenance:'v224-observed',canonical:vector(tokens),...extra});
const current=(tokens,extra={})=>({model:'test-model',effort:'high',canonical:vector(tokens,{snapshotRole:'current'}),...extra});
const anchors=()=>[row(1,840795),row(2,845331)];
function deriveFixture(h,fixture,id=1) {
  const canonical=vector(fixture.displayLikeTokens,fixture),a={id,conversationId:'chat-a',trigger:'network-generation-dispatch',
    startedAt:950000,requestDetectedAt:950000,requestModel:'test-model',requestEffort:'high',
    outcome:fixture.outcome || 'max',outcomeConfirmedAt:970000,outcomeConfirmedBy:'SSE completion',pre:{batch:canonical}};
  const e={id,conversationId:'chat-a',firstSeenAt:970000,relatedRealAttemptId:id,confirmationSource:'structured SSE error',
    batch:fixture.postTokens?vector(fixture.postTokens,{fullCapturedAt:980000}):null};
  return {attempts:{version:3,attempts:[a],last:a},episodes:{episodes:[e]},a,e};
}
for(const f of fixtures.filter(f=>['tiny','medium','healthy-large','large-raw-low-display'].includes(f.name))) {
  check('fixture '+f.name+' scores from display-like tokens alone',()=>{
    const h=environment(),r=h.test.pressureCompute(anchors(),current(f.displayLikeTokens));
    assert.equal(r.state,'scored');assert.equal(r.score,Math.min(99,Math.round(f.displayLikeTokens/840795*100)));
    assert.notEqual(h.test.pressureText(r),'PRESSURE MAX');
  });
}
check('D/E are two MAX events and E post-MAX remains supporting evidence',()=>{
  const h=environment(),d=deriveFixture(h,fixtures.find(f=>f.name==='max-a'),1),e=deriveFixture(h,fixtures.find(f=>f.name==='max-b'),2);
  h.test.pressureDerive('chat-a',{attempts:[d.a,e.a]},{episodes:[d.e,e.e]},'v223-migration');
  const store=h.test.pressureLoad(),summary=h.test.pressureSummary();assert.equal(store.samples.length,2);
  assert.equal(summary.uniqueMaxEvents,2);assert.equal(summary.totalVectors,3);
  assert.equal(store.samples[1].canonical.displayLikeTokens,845331);assert.equal(store.samples[1].postMax.displayLikeTokens,847977);
});
check('repeated fresh post captures and diagnostics cannot manufacture events or change first evidence',()=>{
  const h=environment(),f=deriveFixture(h,{displayLikeTokens:845331,postTokens:847977});
  h.test.pressureDerive('chat-a',f.attempts,f.episodes,'v224-observed');const before=JSON.stringify(h.test.pressureLoad());
  for(let i=0;i<50;i++){f.e.batch.fullCapturedAt++;h.test.pressureDerive('chat-a',f.attempts,f.episodes,'v224-observed');h.test.pressureSummary();}
  assert.equal(JSON.stringify(h.test.pressureLoad()),before);
});
check('healthy 438k SUCCESS uses pre-generation instead of giant post vector',()=>{
  const h=environment(),f=deriveFixture(h,{displayLikeTokens:438000,outcome:'success'});
  f.a.postCorrelation={snapshotsByFamily:{batch:vector(900000)}};
  h.test.pressureDerive('chat-a',f.attempts,{episodes:[]},'v224-observed');
  assert.equal(h.test.pressureLoad().samples[0].canonical.displayLikeTokens,438000);assert.equal(h.test.pressureSummary().successSamples,1);
});
check('parser-valid BATCH pre preferred over DIRECT and future/invalid vectors excluded',()=>{
  const h=environment(),f=deriveFixture(h,{displayLikeTokens:845331});
  f.a.pre.direct=vector(450000,{sourceFamily:'direct',fullCapturedAt:940000});
  h.test.pressureDerive('chat-a',f.attempts,f.episodes,'v224-observed');assert.equal(h.test.pressureLoad().samples[0].canonical.sourceFamily,'batch');
  const second=environment();f.a.pre.batch.fullCapturedAt=960000;
  second.test.pressureDerive('chat-a',f.attempts,f.episodes,'v224-observed');assert.equal(second.test.pressureLoad().samples[0].canonical.sourceFamily,'direct');
});
check('missing pre falls back to fresh post and lowers confidence',()=>{
  const h=environment(),f=deriveFixture(h,{displayLikeTokens:845331,postTokens:847977});f.a.pre={};
  h.test.pressureDerive('chat-a',f.attempts,f.episodes,'v224-observed');const s=h.test.pressureLoad().samples[0];
  assert.equal(s.canonical.snapshotRole,'fresh-post-max-fallback');assert.equal(s.canonical.displayLikeTokens,847977);
  const r=h.test.pressureCompute([s,row(2,840795)],current(438000));assert.equal(r.confidence,'low');assert(r.postMaxFallbackPresent);
});
check('pre arrival promotes fallback within same event; DIRECT can promote to BATCH',()=>{
  const h=environment();h.test.pressureUpsert(row(1,847977,{canonical:vector(847977,{fullCapturedAt:980000,snapshotRole:'fresh-post-max-fallback'})}));
  h.test.pressureUpsert(row(1,840000,{canonical:vector(840000,{sourceFamily:'direct'})}));
  h.test.pressureUpsert(row(1,845331));const rows=h.test.pressureLoad().samples;
  assert.equal(rows.length,1);assert.equal(rows[0].canonical.displayLikeTokens,845331);assert.equal(rows[0].canonical.snapshotRole,'pre-dispatch');
});
check('stale historical MAX remains numeric and never terminal/red',()=>{
  const h=environment(),r=h.test.pressureCompute(anchors(),current(1000),false);
  assert.equal(r.state,'scored');assert.notEqual(h.test.pressureText(r),'PRESSURE MAX');
  assert.notEqual(h.test.getStatus({id:'chat-a',full:true,liveMaximum:false}).cls,'maximum');
});
check('verified current MAX overrides missing vector, absent anchor and any numeric estimate',()=>{
  const h=environment();for(const c of [current(1),current(900000),{model:null,canonical:null}]){
    const r=h.test.pressureCompute([],c,true);assert.equal(r.state,'current-max');assert.equal(r.score,null);assert.equal(h.test.pressureText(r),'PRESSURE MAX');
  }
  h.state.banners=[h.banner()];h.test.eventPollMax('chat-a');assert.equal(h.test.pressureResult('chat-a').state,'current-max');
  assert.equal(h.test.getStatus({id:'chat-a'}).cls,'maximum');h.state.banners=[];h.test.eventPollMax('chat-a');
  assert.notEqual(h.test.pressureResult('chat-a').state,'current-max');
});
check('ratio above 1 clamps 99 and records non-MAX exceedance',()=>{
  const h=environment(),r=h.test.pressureCompute(anchors(),current(1200000));
  assert.equal(r.score,99);assert.equal(r.state,'scored');assert(r.ratioBeforeClamping>1);assert(r.currentExceedsAnchorWhileAlive);assert.equal(r.confidence,'low');
});
check('different model never borrows unrelated MAX anchors',()=>{
  const h=environment(),r=h.test.pressureCompute(anchors(),current(438000,{model:'other-model'}));
  assert.equal(r.state,'calibrating');assert.equal(r.score,null);assert.equal(r.comparableMaxCount,0);assert.match(h.test.pressureText(r),/CALIBRATING/);
});
check('different effort with sufficient same-model events explicitly pools and lowers confidence',()=>{
  const h=environment(),r=h.test.pressureCompute(anchors(),current(438000,{effort:'medium'}));
  assert.equal(r.comparisonTier,'same-model');assert.equal(r.confidence,'low');assert.equal(r.comparableMaxCount,2);
});
check('exact model/effort with 2 anchors preferred over pooled effort',()=>{
  const h=environment(),samples=[...anchors(),row(3,200000,{effort:'medium'})];
  const r=h.test.pressureCompute(samples,current(438000));assert.equal(r.empiricalMaxAnchor,840795);assert.equal(r.comparisonTier,'exact-model-effort');
});
check('one exact MAX preferred when total model evidence is still sparse',()=>{
  const h=environment(),r=h.test.pressureCompute([row(1,840795)],current(438000));
  assert.equal(r.comparisonTier,'exact-model-effort');assert.equal(r.confidence,'low');assert.equal(r.score,52);
});
check('one exact MAX yields to 2+ same-model anchors while effort calibration is insufficient',()=>{
  const h=environment(),r=h.test.pressureCompute([row(1,840795),row(2,845331,{effort:'medium'})],current(438000));
  assert.equal(r.comparisonTier,'same-model');assert.equal(r.confidence,'low');
});
check('unknown current effort uses explicit same-model tier',()=>{
  const h=environment(),r=h.test.pressureCompute(anchors(),current(438000,{effort:null}));assert.equal(r.comparisonTier,'same-model');assert.equal(r.confidence,'low');
});
check('effort comparison normalizes case/whitespace without inventing model or effort aliases',()=>{
  const h=environment();assert.equal(h.test.pressureEffort(' HIGH '),'high');assert.equal(h.test.pressureEffort('Extra   High'),'extra high');
  assert.notEqual(h.test.pressureEffort('extra high'),h.test.pressureEffort('xhigh'));
  h.test.pressureUpsert(row(1,840795,{effort:' HIGH '}));assert.equal(h.test.pressureLoad().samples[0].effort,'high');
});
check('two recent close MAX examples produce medium and never high confidence',()=>{
  const h=environment(),r=h.test.pressureCompute(anchors(),current(438000));assert.equal(r.confidence,'medium');assert.equal(r.score,52);
});
check('wide MAX disagreement forces low confidence',()=>{
  const h=environment(),r=h.test.pressureCompute([row(1,500000),row(2,900000)],current(1000));assert.equal(r.confidence,'low');assert(r.anchorSpread>.10);
});
check('5 close pre-MAX plus 10 successes permit high confidence',()=>{
  const h=environment(),samples=Array.from({length:5},(_,i)=>row(i+1,840000+i*1000));
  samples.push(...Array.from({length:10},(_,i)=>row(i+20,10000+i*1000,{outcome:'success'})));
  const r=h.test.pressureCompute(samples,current(438000));assert.equal(r.confidence,'high');assert.equal(r.empiricalMaxAnchor,841000);
});
check('5 MAX without a meaningful SUCCESS population cannot produce high confidence',()=>{
  const h=environment(),r=h.test.pressureCompute(Array.from({length:5},(_,i)=>row(i+1,840000+i*1000)),current(438000));assert.equal(r.confidence,'medium');
});
check('success at/above anchor is retained and explicitly weakens confidence',()=>{
  const h=environment(),r=h.test.pressureCompute([...anchors(),row(3,900000,{outcome:'success'})],current(438000));
  assert.equal(r.contradictorySuccessCount,1);assert.equal(r.confidence,'low');assert.equal(r.comparableSuccessCount,1);
});
check('secondary bytes do not affect score; their comparison is visible',()=>{
  const h=environment(),a=h.test.pressureCompute(anchors(),current(438000)),b=h.test.pressureCompute(anchors(),
    current(438000,{canonical:vector(438000,{mappingBytes:999999999,retainedBytes:900000000})}));
  assert.equal(a.score,b.score);assert.equal(b.secondaryMetricComparison.mappingBytes.current,999999999);
});
check('mismatched representation lowers confidence without inventing heavy metric weights',()=>{
  const h=environment(),r=h.test.pressureCompute(anchors(),current(438000,{canonical:vector(438000,{sourceFamily:'direct'})}));
  assert.equal(r.confidence,'low');assert(r.sourceFamilyMismatch);assert.equal(r.score,52);
});
check('pressure is deterministic across sample insertion order and repeated evaluations',()=>{
  const h=environment(),a=h.test.pressureCompute(anchors(),current(438000)),b=h.test.pressureCompute(anchors().reverse(),current(438000));
  assert.deepEqual(plain(a),plain(b));for(let i=0;i<20;i++)assert.deepEqual(plain(a),plain(h.test.pressureCompute(anchors(),current(438000))));
});
check('model uses minimum with 1-4 MAX and lower quartile with 5+',()=>{
  const h=environment();for(const [values,expected]of [[[10,20,30,40],10],[[10,20,30,40,50],20],[[1,10,11,12,13,14,15,16],10]]){
    const r=h.test.pressureCompute(values.map((v,i)=>row(i+1,v)),current(1));assert.equal(r.empiricalMaxAnchor,expected);
  }
});
check('missing/null/string/nonfinite metrics never coerce to zero or score',()=>{
  const h=environment();for(const invalid of [null,undefined,'438000',NaN,Infinity,-1]){
    assert.equal(h.test.pressureNumber(invalid),null);assert.equal(h.test.pressureVector(vector(invalid),'pre-dispatch'),null);
  }
  const r=h.test.pressureCompute(anchors(),{model:'test-model',effort:'high',canonical:null});assert.equal(r.state,'calibrating');assert.match(r.unscoredReason,/current parser/);
});
check('malformed vectors, zero/missing parser structure and other family rejected',()=>{
  const h=environment();for(const extra of [{mappingBytes:0},{branchNodes:null},{sourceFamily:'other'},{fullCapturedAt:0}])assert.equal(h.test.pressureVector(vector(1000,extra),'pre-dispatch'),null);
});
check('new storage contains only allowlisted compact fields; giant diagnostic objects discarded',()=>{
  const h=environment();h.test.pressureUpsert(row(1,840795,{mapping:{private:'SECRET'},diagnostics:'x'.repeat(1000000),
    canonical:{...vector(840795),rawBody:'SECRET'}}));h.test.pressureSave('chat-a');
  const text=h.storage.get('cgpt-size-meter-v2101:pressure-calibration-v224');assert(!text.includes('SECRET'));assert(text.length<5000);
  const saved=h.test.eventStorageParse(text);assert.equal(saved.schemaVersion,1);assert.equal(saved.samples.length,1);
});
check('reload deduplicates existing event and preserves compact schema',()=>{
  const h=environment();h.test.pressureUpsert(row(1,840795));h.test.pressureSave('chat-a');const fresh=environment();for(const [k,v]of h.storage)fresh.storage.set(k,v);
  assert.equal(fresh.test.pressureUpsert(row(1,840795)),false);assert.equal(fresh.test.pressureLoad().samples.length,1);
});
check('unsupported/corrupt store fails safely without claiming calibrated pressure',()=>{
  for(const value of ['{',JSON.stringify({schemaVersion:99,samples:[]}),JSON.stringify({schemaVersion:1,samples:Array(257).fill({})})]){
    const h=environment();h.storage.set('cgpt-size-meter-v2101:pressure-calibration-v224',value);
    assert.equal(h.test.pressureLoad().samples.length,0);assert(h.test.pressureSummary().lastError);
  }
});
check('unsupported existing pressure data is preserved byte-for-byte and writes fail closed',()=>{
  const h=environment(),key='cgpt-size-meter-v2101:pressure-calibration-v224',old=JSON.stringify({schemaVersion:99,samples:[]});
  h.storage.set(key,old);h.test.pressureUpsert(row(1,840795));h.test.pressureSave('chat-a');
  assert.equal(h.storage.get(key),old);assert.equal(h.test.pressureSummary().writeBlocked,true);assert.match(h.test.pressureSummary().lastError,/writes blocked/);
});
check('retention cap keeps newest 256 events deterministically and rejects evicted replay',()=>{
  const h=environment();for(let i=1;i<=300;i++)h.test.pressureUpsert(row(i,840795));
  const store=h.test.pressureLoad();assert.equal(store.samples.length,256);assert.equal(store.samples[0].eventId,45);assert.equal(store.samples.at(-1).eventId,300);
  assert.equal(h.test.pressureUpsert(row(1,840795)),false);assert.equal(h.test.pressureUpsert(row(44,840795)),false);assert.equal(store.samples.length,256);
  assert.equal(store.retentionCount,44);h.test.pressureSave('chat-a');const fresh=environment();for(const[k,v]of h.storage)fresh.storage.set(k,v);
  assert.equal(fresh.test.pressureUpsert(row(1,840795)),false);assert.equal(fresh.test.pressureLoad().samples.length,256);
});
check('same event number in separate conversations is independent evidence',()=>{
  const h=environment();h.test.pressureUpsert(row(1,840795));h.test.pressureUpsert(row(1,845331,{conversationId:'chat-b'}));assert.equal(h.test.pressureSummary().uniqueMaxEvents,2);
});
check('migration preserves old record bytes and is idempotent across calls and reload',()=>{
  const h=environment(),f=deriveFixture(h,{displayLikeTokens:845331,postTokens:847977});
  const old=new Map([['cgpt-size-meter-v2101:attempts-v223:chat-a',JSON.stringify(f.attempts)],['cgpt-size-meter-v2101:max-episodes-v223:chat-a',JSON.stringify(f.episodes)]]);
  for(const[k,v]of old)h.storage.set(k,v);h.test.pressureMigrate();const before=h.storage.get('cgpt-size-meter-v2101:pressure-calibration-v224');
  h.test.pressureMigrate();assert.equal(h.storage.get('cgpt-size-meter-v2101:pressure-calibration-v224'),before);
  for(const[k,v]of old)assert.equal(h.storage.get(k),v);assert.equal(h.test.pressureSummary().migration.admittedEvents,1);
  const fresh=environment();for(const[k,v]of h.storage)fresh.storage.set(k,v);fresh.test.pressureMigrate();assert.equal(fresh.storage.get('cgpt-size-meter-v2101:pressure-calibration-v224'),before);
});
check('migration reads compressed historical records through compatible codec',()=>{
  const h=environment(),f=deriveFixture(h,{displayLikeTokens:438000,outcome:'success'});
  h.storage.set('cgpt-size-meter-v2101:attempts-v223:chat-a',h.test.eventStorageRetryText(h.test.eventStorageSavedText(f.attempts)));
  h.test.pressureMigrate();assert.equal(h.test.pressureSummary().successSamples,1);
});
check('migration skips legacy inferred MAX, malformed, wrong-schema and incomplete evidence',()=>{
  const h=environment();h.storage.set('cgpt-size-meter-v2101:attempts-v222:chat-a',JSON.stringify({attempts:[row(1,840795)]}));
  h.storage.set('cgpt-size-meter-v2101:attempts-v223:bad','{');h.storage.set('cgpt-size-meter-v2101:attempts-v223:wrong',JSON.stringify({version:4,attempts:[]}));
  h.storage.set('cgpt-size-meter-v2101:max-episodes-v223:unknown',JSON.stringify({episodes:[{id:1,confirmationSource:'UI MAX banner'}]}));
  h.test.pressureMigrate();assert.equal(h.test.pressureSummary().totalSamples,0);assert.equal(h.test.pressureSummary().migration.skippedKeys,2);
});
check('migration bounds key reads and oversize input',()=>{
  const h=environment();for(let i=0;i<150;i++)h.storage.set('cgpt-size-meter-v2101:attempts-v223:c'+i,i===0?'x'.repeat(1048577):JSON.stringify({version:3,attempts:[]}));
  h.test.pressureMigrate();assert.equal(h.test.pressureSummary().migration.examinedKeys,128);assert.equal(h.test.pressureSummary().migration.skippedKeys,1);
});
check('live SUCCESS is collected from real generation hook with its pre vector',()=>{
  const h=environment(),life=h.test.loadLifecycle('chat-a');life.families.batch.lastStable=vector(438000);h.test.saveLifecycle('chat-a',life);
  const a=h.start({reasoning_effort:'high'});h.chunk(a,'data: [DONE]\n\n');
  assert.equal(h.test.pressureSummary().successSamples,1);assert.equal(h.test.pressureLoad().samples[0].canonical.displayLikeTokens,438000);
});
check('live structured MAX links pre vector and later post capture to one event',()=>{
  const h=environment(),life=h.test.loadLifecycle('chat-a');life.families.batch.lastStable=vector(845331);h.test.saveLifecycle('chat-a',life);
  const a=h.start({reasoning_effort:'high'});h.chunk(a,'data: {"error":{"code":"conversation_too_long"}}\n\n');
  h.test.eventCapture('chat-a',vector(847977,{fullCapturedAt:h.now()+1}),{chatId:'chat-a',episodeId:1});
  const s=h.test.pressureLoad().samples[0];assert.equal(h.test.pressureSummary().uniqueMaxEvents,1);assert.equal(s.canonical.displayLikeTokens,845331);assert.equal(s.postMax.displayLikeTokens,847977);
});
check('generic ERROR, unknown and quoted MAX never enter calibration',()=>{
  const h=environment(),life=h.test.loadLifecycle('chat-a');life.families.batch.lastStable=vector(438000);h.test.saveLifecycle('chat-a',life);
  const a=h.start();h.test.eventFinalizeError('chat-a',a,'HTTP generation failure (500)');
  const b=h.start();h.test.eventFinalizeError('chat-a',b,'correlation incomplete: restart');
  assert.equal(h.test.pressureSummary().totalSamples,0);
});
check('persistence failure is visible while in-memory calibration remains usable',()=>{
  const h=environment();h.test.pressureUpsert(row(1,840795));h.state.quota=true;h.test.pressureSave('chat-a');
  assert.match(h.test.pressureSummary().lastError,/persistence failed/);assert.equal(h.test.pressureLoad().samples.length,1);
  h.state.quota=false;h.test.pressureSave('chat-a');assert.equal(h.test.pressureSummary().lastError,null);
});
check('Copy diagnostics includes concise pressure model and summary, never raw arrays',()=>{
  const h=environment();h.test.pressureUpsert(row(1,840795));const lines=h.test.eventDiagnostics('chat-a');
  const i=lines.indexOf('V2.24 PRESSURE CALIBRATION'),j=lines.indexOf('CALIBRATION SAMPLE SUMMARY');assert(i>0 && j>i);
  assert.equal(JSON.parse(lines[i+1]).modelVersion,'v224-display-ratio-1');assert.equal(JSON.parse(lines[j+1]).uniqueMaxEvents,1);
  assert(!lines[j+1].includes('"samples"'));assert(!lines[i+1].includes('"samples"'));
});
check('render and diagnostics use cached model and never scan/write storage repeatedly',()=>{
  const h=environment();h.test.pressureMigrate();h.test.pressureUpsert(row(1,840795));
  let scans=0,writes=0;const key=h.context.localStorage.key,set=h.context.localStorage.setItem;
  h.context.localStorage.key=i=>{scans++;return key(i);};h.context.localStorage.setItem=(k,v)=>{writes++;return set(k,v);};
  const first=h.test.pressureResult('chat-a');for(let i=0;i<40;i++){assert.equal(h.test.pressureResult('chat-a'),first);h.test.pressureSummary();}
  assert.equal(scans,0);assert.equal(writes,0);assert.equal(h.fetches.length,0);
});
check('current source/vector changes invalidate cached pressure result',()=>{
  const h=environment();anchors().forEach(s=>h.test.pressureUpsert(s));const life=h.test.loadLifecycle('chat-a');
  life.families.batch.lastObservation=vector(438000);const snap=h.test.loadSnapshot('chat-a');snap.structure={contextTopology:{currentModel:'test-model'}};h.test.saveSnapshot('chat-a',snap);
  const r=h.test.pressureResult('chat-a');life.families.batch.lastObservation=vector(1000,{fullCapturedAt:900001});
  const next=h.test.pressureResult('chat-a');assert.notEqual(r,next);assert.notEqual(r.score,next.score);
});
check('visible pressure follows newest accepted source instead of older BATCH',()=>{
  const h=environment(),life=h.test.loadLifecycle('chat-a');life.families.batch.lastObservation=vector(438000);
  life.families.direct.lastObservation=vector(1000,{sourceFamily:'direct',fullCapturedAt:900001});
  assert.equal(h.test.pressureCurrent('chat-a').canonical.sourceFamily,'direct');
  assert.equal(h.test.pressureCurrent('chat-a').canonical.displayLikeTokens,1000);
});
check('production pressure module has no fixture MAX values or fixed token anchors',()=>{
  const source=fs.readFileSync(path.join(root,'src/v224/pressure-calibration.js'),'utf8');
  for(const value of ['840795','845331','847977','438000'])assert(!source.includes(value));
  assert(source.includes('values[n<5?0:Math.ceil(n*.25)-1]'));
});
check('UI keeps existing themes and shows whole-number pressure without capacity terminology',()=>{
  const source=fs.readFileSync(candidate,'utf8');assert(source.includes('const st = getStatus(latest);'));
  assert(source.includes('<strong>${esc(pressureText(pressure))}</strong>'));assert(source.includes('display-like tok'));
  assert(!source.includes('percent context used'));assert(!source.includes('context remaining'));
});
check('production render displays calibrating, numeric and verified MAX states with existing color',()=>{
  const h=environment();h.test.setUI();h.test.render();assert.match(h.test.ui().compact.innerHTML,/PRESSURE — \/ 100 · CALIBRATING/);
  const life=h.test.loadLifecycle('chat-a');life.families.batch.lastStable=vector(438000);h.test.saveLifecycle('chat-a',life);
  h.start({reasoning_effort:'high'});anchors().forEach(s=>h.test.pressureUpsert(s));h.test.render();
  assert.match(h.test.ui().compact.innerHTML,/PRESSURE 52 \/ 100 · MEDIUM/);assert.match(h.test.ui().compact.innerHTML,/display-like tok/);
  h.state.banners=[h.banner()];h.test.render();assert.match(h.test.ui().compact.innerHTML,/PRESSURE MAX/);assert.match(h.test.ui().panel.className,/theme-maximum/);
  h.state.banners=[];h.test.render();assert(!h.test.ui().compact.innerHTML.includes('PRESSURE MAX'));assert(!h.test.ui().panel.className.includes('theme-maximum'));
});
check('V2.24 metadata, storage health and retry trace consistently identify 2.24.0',async()=>{
  const h=environment(),source=fs.readFileSync(candidate,'utf8');assert.match(source,/\/\/ @version\s+2\.24\.0/);
  assert.match(h.test.eventDiagnostics('chat-a')[0],/V2\.24 EMPIRICAL PRESSURE/);
  const a=h.start();h.chunk(a,'data: [DONE]\n\n');assert.equal(h.test.eventStorageHealth('chat-a').candidateVersion,'2.24.0');
  await h.test.retryCapture();assert.equal(h.test.loadDiagnostic('chat-a').lastRetry.version,'2.24.0');
  h.test.setLatest(h.test.calculateStats());await h.test.copyStats();assert(h.state.clipboard.startsWith('Candidate userscript: V2.24 EMPIRICAL PRESSURE'));
});
check('live unlinked blocked MAX admits fresh fallback with explicit UI identity provenance',()=>{
  const h=environment(),snap=h.test.loadSnapshot('chat-a');snap.structure={contextTopology:{currentModel:'test-model'}};h.test.saveSnapshot('chat-a',snap);
  h.state.banners=[h.banner()];h.test.eventPollMax('chat-a');assert.equal(h.test.pressureSummary().totalSamples,0);
  h.test.eventCapture('chat-a',vector(847977,{fullCapturedAt:h.now()+1}),{chatId:'chat-a',episodeId:1});
  const s=h.test.pressureLoad().samples[0];assert.equal(s.canonical.snapshotRole,'fresh-post-max-fallback');assert.match(s.identitySource,/live MAX snapshot/);
  assert.equal(s.attemptId,null);assert.equal(s.effort,null);assert.equal(h.test.pressureSummary().uniqueMaxEvents,1);
});
check('distinct MAX episodes after clearance count independently within same chat',()=>{
  const h=environment(),life=h.test.loadLifecycle('chat-a');life.families.batch.lastStable=vector(845331);h.test.saveLifecycle('chat-a',life);
  let a=h.start({reasoning_effort:'high'});h.state.banners=[h.banner()];h.test.eventPollMax('chat-a');
  h.state.banners=[];h.test.eventPollMax('chat-a');a=h.start({reasoning_effort:'high'});h.state.banners=[h.banner()];h.test.eventPollMax('chat-a');
  assert.equal(h.test.pressureSummary().uniqueMaxEvents,2);assert.equal(h.test.pressureLoad().samples[1].episodeId,2);
});
check('historical episode without trustworthy request identity is skipped',()=>{
  const h=environment(),f=deriveFixture(h,{displayLikeTokens:845331,postTokens:847977});f.e.relatedRealAttemptId=null;
  h.test.pressureDerive('chat-a',f.attempts,f.episodes,'v223-migration');assert.equal(h.test.pressureSummary().totalSamples,0);
});
check('at full cap compact persisted store stays small and retains both MAX vectors',()=>{
  const h=environment();for(let i=1;i<=256;i++)h.test.pressureUpsert(row(i,840795,{postMax:vector(847977,{fullCapturedAt:980000,snapshotRole:'fresh-post-max'})}));
  h.test.pressureSave('chat-a');const text=h.storage.get('cgpt-size-meter-v2101:pressure-calibration-v224');
  assert(Buffer.byteLength(text)<200000);assert.equal(h.test.pressureSummary().totalVectors,512);assert.equal(h.test.pressureSummary().totalSamples,256);
  console.log('PRESSURE storage cap: '+Buffer.byteLength(text)+' serialized bytes, 256 events / 512 vectors');
});
check('reversed retention order yields identical retained evidence and watermark',()=>{
  const a=environment(),b=environment();for(let i=1;i<=300;i++)a.test.pressureUpsert(row(i,840795));for(let i=300;i>=1;i--)b.test.pressureUpsert(row(i,840795));
  assert.deepEqual(plain(a.test.pressureLoad().samples),plain(b.test.pressureLoad().samples));assert.deepEqual(plain(a.test.pressureLoad().watermark),plain(b.test.pressureLoad().watermark));
});
check('cross-chat pressure uses each current model and does not transfer active MAX',()=>{
  const h=environment();h.state.banners=[h.banner()];h.test.eventPollMax('chat-a');assert.equal(h.test.pressureResult('chat-a').state,'current-max');
  h.navigate('chat-b');h.state.banners=[];assert.equal(h.test.pressureResult('chat-b').state,'calibrating');assert.notEqual(h.test.getStatus({id:'chat-b'}).cls,'maximum');
});
(async()=>{let failed=0;for(const[name,fn]of cases)try{await fn();console.log('PASS '+name);}catch(error){failed++;console.error('FAIL '+name+'\n'+error.stack);}
  console.log(`${cases.length-failed}/${cases.length} V2.24 synthetic tests passed; native validation pending`);if(failed)process.exitCode=1;})();
