// Focused dual-axis tests against actual candidate bytes and unchanged fake browser.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),candidate=path.join(root,'releases/v2.24.1/chatgpt_chat_size_meter_v2241_dual_axis_pressure.js');
const prefix=fs.readFileSync(path.join(__dirname,'test-v223.js'),'utf8').split('const cases=[];')[0];
const scope={require,process:{argv:['node','test',candidate]},__dirname,console,URL,TextEncoder,TextDecoder,
  ArrayBuffer,Request,Blob,AbortController,btoa,atob,Buffer};
vm.runInNewContext(prefix+'\nglobalThis.makeEnvironment=environment;',scope);
const environment=scope.makeEnvironment,plain=x=>JSON.parse(JSON.stringify(x));
const fixture=JSON.parse(fs.readFileSync(path.join(root,'fixtures/v2241/dual-axis-vectors.json'),'utf8'));
const cases=[],check=(name,fn)=>cases.push([name,fn]);
const vector=(extra={})=>({sourceFamily:'batch',snapshotRole:'pre-dispatch',fullCapturedAt:900000,
  displayLikeTokens:1000,activeBranchBytes:20000,mappingBytes:20000000,retainedBytes:null,retainedShare:null,
  toolResultBytes:null,hot128:null,hot256:null,strongContextMarkers:null,branchNodes:4000,messageNodes:3900,...extra});
const row=(id,extra={},overrides={})=>({key:JSON.stringify([extra.conversationId||'native-'+id,'max',id]),
  conversationId:extra.conversationId||'native-'+id,eventId:id,attemptId:id,outcome:'max',timestamp:950000+id,
  model:fixture.model,effort:fixture.effort,identitySource:'generation request',confirmationSource:'structured SSE error',
  provenance:'v224-observed',canonical:vector(extra),...overrides});
const maxima=()=>fixture.maxima.map((v,i)=>row(i+1,v));
const current=(v=fixture.healthyEarlier,extra={})=>({model:fixture.model,effort:'Extra High',canonical:vector({...v,snapshotRole:'current'}),...extra});
const compute=(rows=maxima(),c=current(),active=false)=>environment().test.pressureCompute(rows,c,active);

check('three independent native-reported MAX chats establish separate upper capacities',()=>{
  const r=compute();assert.equal(r.uniqueMaxConversationCount,3);assert.equal(r.effectiveMaxObservationCount,3);
  assert.equal(r.textAxis.anchor,845331);assert.equal(r.stateAxis.anchor,27149953);
  assert.equal(r.textAxis.independentMaxCount,3);assert.equal(r.stateAxis.independentMaxCount,3);
  assert.deepEqual(plain(r.textAxis.observedMaxRange),{min:571806,max:845331});
  assert.deepEqual(plain(r.stateAxis.observedMaxRange),{min:15320298,max:27149953});
});
for(const name of ['healthyEarlier','healthyNearBoundary','tinyHealthy'])check(name+' matches empirical dual score and remains non-MAX',()=>{
  const f=fixture[name],r=compute(maxima(),current(f));assert.equal(r.score,f.expectedScore);assert.equal(r.state,'scored');
  assert.equal(r.confidence,'low');assert(!r.currentExceedsAnchorWhileAlive);assert.notEqual(environment().test.pressureText(r),'PRESSURE MAX');
  if(f.expectedDominant)assert.equal(r.combined.dominantAxis,f.expectedDominant);
});
check('healthy state-heavy text 54 and state 73 produce visible PRESSURE 73 LOW',()=>{
  const h=environment(),r=h.test.pressureCompute(maxima(),current());
  assert.equal(Math.round(r.textAxis.ratio*100),54);assert.equal(Math.round(r.stateAxis.ratio*100),73);
  assert.equal(r.combined.ratio,Math.max(r.textAxis.ratio,r.stateAxis.ratio));assert.equal(h.test.pressureText(r),'PRESSURE 73 / 100 · LOW');
});
check('both successful states are retained as SUCCESS without MAX or contradictions',()=>{
  const rows=[...maxima(),row(4,fixture.healthyEarlier,{conversationId:fixture.maxima[2].conversationId,outcome:'success'}),
    row(5,fixture.healthyNearBoundary,{conversationId:fixture.maxima[2].conversationId,outcome:'success'})];
  const r=compute(rows,current(fixture.healthyNearBoundary));assert.equal(r.score,97);assert.equal(r.rawComparableSuccessCount,2);
  assert.equal(r.uniqueSuccessConversationCount,1);assert.equal(r.rawContradictorySuccessCount,0);assert.equal(r.uniqueMaxConversationCount,3);
});
check('state-heavy verified current MAX alone gives terminal PRESSURE MAX',()=>{
  const h=environment(),r=h.test.pressureCompute(maxima(),current(fixture.maxima[2]),true);
  assert.equal(r.state,'current-max');assert.equal(r.score,null);assert.equal(r.combined.score,null);
  assert.equal(r.combined.dominantAxis,'state');assert.equal(h.test.pressureText(r),'PRESSURE MAX');
  assert(!r.stateAxis.exceededWhileAlive);
});
check('same state-heavy vector without current verification remains numeric 99',()=>{
  const r=compute(maxima(),current(fixture.maxima[2]));assert.equal(r.score,99);assert.equal(r.state,'scored');
  assert(r.stateAxis.exceededWhileAlive);assert(!r.textAxis.exceededWhileAlive);
});
for(const i of [0,1])check('text-heavy MAX '+i+' approaches terminal through text axis',()=>{
  const r=compute(maxima(),current(fixture.maxima[i]));assert.equal(r.combined.dominantAxis,'text');assert.equal(r.score,99);
  assert.equal(r.state,'scored');assert.equal(r.uniqueMaxConversationCount,3);
});
check('fresh post-MAX is supporting evidence only and cannot increase either anchor',()=>{
  const rows=maxima();rows[2].postMax=vector({...fixture.freshMax,snapshotRole:'fresh-post-max',fullCapturedAt:980000});
  const r=compute(rows);assert.equal(r.rawComparableMaxEpisodeCount,3);assert.equal(r.uniqueMaxConversationCount,3);
  assert.equal(r.stateAxis.anchor,27149953);assert.equal(r.textAxis.anchor,845331);
  const h=environment();for(const s of rows)h.test.pressureUpsert(s);
  assert.equal(h.test.pressureSummary().totalSamples,3);assert.equal(h.test.pressureSummary().totalVectors,4);
});
check('live structured MAX and fresh capture keep one third-conversation episode',()=>{
  const h=environment(),life=h.test.loadLifecycle('chat-a');life.families.batch.lastStable=vector(fixture.maxima[2]);h.test.saveLifecycle('chat-a',life);
  const a=h.start({model:fixture.model,reasoning_effort:'max'});h.chunk(a,'data: {"error":{"code":"conversation_too_long"}}\n\n');
  h.test.eventCapture('chat-a',vector({...fixture.freshMax,fullCapturedAt:h.now()+1}),{chatId:'chat-a',episodeId:1});
  const s=h.test.pressureLoad().samples[0];assert.equal(s.canonical.activeBranchBytes,27149953);
  assert.equal(s.postMax.activeBranchBytes,27151472);assert.equal(h.test.pressureSummary().uniqueMaxEvents,1);
  assert.equal(h.test.pressureResult('chat-a').state,'current-max');
});
check('new state-heavy observation never collapses established text capacity',()=>{
  const before=compute(maxima().slice(0,2)),after=compute();assert.equal(before.textAxis.anchor,after.textAxis.anchor);
  assert(after.stateAxis.anchor>before.stateAxis.anchor);assert.equal(after.uniqueMaxConversationCount,3);
});
check('identical retries across three chats do not alter either axis or independent weighting',()=>{
  const rows=maxima(),repeats=[...rows,...Array.from({length:60},(_,i)=>row(10+i,fixture.maxima[i%3]))];
  const a=compute(rows),b=compute(repeats);assert.equal(b.rawComparableMaxEpisodeCount,63);
  for(const field of ['textAxis','stateAxis']){assert.equal(b[field].anchor,a[field].anchor);assert.equal(b[field].independentMaxCount,3);}
  assert.equal(a.score,b.score);assert.equal(a.confidence,b.confidence);
});
check('distinct canonical states of one chat select upper value independently per axis',()=>{
  const rows=[row(1,{conversationId:'one',displayLikeTokens:800000,activeBranchBytes:20000000}),
    row(2,{conversationId:'one',displayLikeTokens:700000,activeBranchBytes:30000000})];
  const r=compute(rows);assert.equal(r.uniqueMaxConversationCount,1);assert.equal(r.textAxis.anchor,800000);assert.equal(r.stateAxis.anchor,30000000);
  assert.equal(r.textAxis.contributions[0].eventId,1);assert.equal(r.stateAxis.contributions[0].eventId,2);
  assert.equal(r.anchorContributionSummary[0].distinctPreVectorCount,2);assert.match(r.anchorContributionSummaryRole,/diagnostics only/);
});
check('pre-MAX canonical evidence excludes larger fallback and supporting post on both axes',()=>{
  const rows=[row(1,{conversationId:'one',displayLikeTokens:800000,activeBranchBytes:20000000}),
    row(2,{conversationId:'one',displayLikeTokens:900000,activeBranchBytes:30000000,snapshotRole:'fresh-post-max-fallback',fullCapturedAt:980000})];
  rows[0].postMax=vector({displayLikeTokens:1000000,activeBranchBytes:40000000});
  const r=compute(rows);assert.equal(r.textAxis.anchor,800000);assert.equal(r.stateAxis.anchor,20000000);assert(!r.postMaxFallbackPresent);
});
check('canonical fallback contributes only when that axis has no valid pre contribution',()=>{
  const rows=[row(1,{conversationId:'one',displayLikeTokens:800000,activeBranchBytes:null}),
    row(2,{conversationId:'one',displayLikeTokens:900000,activeBranchBytes:30000000,snapshotRole:'fresh-post-max-fallback',fullCapturedAt:980000})];
  const r=compute(rows);assert.equal(r.textAxis.anchor,800000);assert.equal(r.stateAxis.anchor,30000000);
  assert.equal(r.textAxis.fallbackContributionCount,0);assert.equal(r.stateAxis.fallbackContributionCount,1);assert(r.postMaxFallbackPresent);
});
check('missing state evidence is explicit calibrating without silent text-only scoring',()=>{
  const rows=maxima();rows.forEach(s=>s.canonical.activeBranchBytes=null);const r=compute(rows);
  assert.equal(r.textAxis.independentMaxCount,3);assert.equal(r.stateAxis.independentMaxCount,0);assert.equal(r.stateAxis.anchor,null);
  assert.equal(r.state,'calibrating');assert.equal(r.score,null);assert.equal(r.combined.ratio,null);
});
check('invalid current state metric never coerces to zero or hides missing axis',()=>{
  for(const activeBranchBytes of [null,undefined,'19686898',NaN,Infinity,-1]){
    const r=compute(maxima(),current({displayLikeTokens:453725,activeBranchBytes}));
    assert.equal(r.state,'calibrating');assert.equal(r.stateAxis.currentValue,null);assert.match(r.unscoredReason,/axis value/);
  }
});
check('known zero state current contributes zero ratio while missing/zero capacities remain uncalibrated',()=>{
  const r=compute(maxima(),current({displayLikeTokens:1000,activeBranchBytes:0}));assert.equal(r.stateAxis.ratio,0);assert.equal(r.score,0);
  const rows=maxima();rows.forEach(s=>s.canonical.activeBranchBytes=0);assert.equal(compute(rows).state,'calibrating');
});
check('state exceedance alone clamps 99, stays nonterminal, and flags the state axis',()=>{
  const r=compute(maxima(),current({displayLikeTokens:1000,activeBranchBytes:30000000}));
  assert.equal(r.score,99);assert.equal(r.state,'scored');assert(r.stateAxis.exceededWhileAlive);assert(!r.textAxis.exceededWhileAlive);
  assert(r.currentExceedsAnchorWhileAlive);assert.equal(r.combined.dominantAxis,'state');assert(r.combined.ratio>1);
});
check('text exceedance alone clamps 99 and leaves the state axis below capacity',()=>{
  const r=compute(maxima(),current({displayLikeTokens:1000000,activeBranchBytes:1000}));
  assert.equal(r.score,99);assert(r.textAxis.exceededWhileAlive);assert(!r.stateAxis.exceededWhileAlive);assert.equal(r.state,'scored');
});
check('secondary nine metrics can be huge without changing either axis score',()=>{
  const extra=Object.fromEntries(['mappingBytes','retainedBytes','retainedShare','toolResultBytes','hot128','hot256','strongContextMarkers','branchNodes','messageNodes'].map(k=>[k,999999999]));
  const a=compute(),b=compute(maxima(),current({...fixture.healthyEarlier,...extra}));assert.equal(b.score,73);assert.equal(a.score,b.score);
  for(const field of Object.keys(extra))assert.equal(b.secondaryMetricComparison[field].current,999999999);
});
check('SUCCESS exceeding either capacity counted once with raw and independent accounting',()=>{
  const rows=[...maxima(),row(4,{displayLikeTokens:1000,activeBranchBytes:30000000},{outcome:'success',conversationId:'healthy'}),
    row(5,{displayLikeTokens:1000000,activeBranchBytes:30000000},{outcome:'success',conversationId:'healthy'})];
  const r=compute(rows);assert.equal(r.rawContradictorySuccessCount,2);assert.equal(r.effectiveContradictorySuccessConversationCount,1);
  assert.equal(r.uniqueSuccessConversationCount,1);assert.equal(r.confidence,'low');
});
check('confidence stays LOW even with a large homogeneous synthetic frontier',()=>{
  const rows=Array.from({length:20},(_,i)=>row(i+1,{displayLikeTokens:845331,activeBranchBytes:27149953}));
  rows.push(...Array.from({length:20},(_,i)=>row(i+50,{displayLikeTokens:1000},{outcome:'success'})));
  const r=compute(rows);assert.equal(r.confidence,'low');assert.equal(r.textAxis.confidence,'low');assert.equal(r.stateAxis.confidence,'low');
  assert.match(r.confidenceReason,/V2.24.1 confidence held LOW/);
});
check('deterministic repeated calculation and sample permutations include equal-value contribution ties',()=>{
  const rows=[...maxima(),row(20,fixture.maxima[0]),row(21,fixture.maxima[2],{effort:'Extra High'})],reference=plain(compute(rows));
  for(const order of [rows.slice().reverse(),[rows[3],rows[0],rows[4],rows[2],rows[1]]])assert.deepEqual(plain(compute(order)),reference);
  for(let i=0;i<10;i++)assert.deepEqual(plain(compute(rows)),reference);
});
check('equal axis ratios produce explicit tie with a deterministic combined score',()=>{
  const r=compute(maxima(),current({displayLikeTokens:845331/2,activeBranchBytes:27149953/2}));
  assert.equal(r.combined.dominantAxis,'tie');assert.equal(r.combined.ratio,.5);assert.equal(r.score,50);
});
check('comparison tier and demonstrated effort alias remain exact-model-effort',()=>{
  const r=compute();assert.equal(r.comparisonTier,'exact-model-effort');assert.equal(r.canonicalEffort,'max');
  assert.equal(compute(maxima(),current(undefined,{effort:'future mode'})).comparisonTier,'same-model');
  assert.equal(compute(maxima(),current(undefined,{model:'different'})).state,'calibrating');
});
check('old compact event store loads without byte rewrite and new model identity is in memory',()=>{
  const oldSource=fs.readFileSync(path.join(root,'releases/v2.24.0-calibration-correctness/chatgpt_chat_size_meter_v2240_calibration_correctness.js'),'utf8');
  const old=environment(oldSource);for(const s of maxima())old.test.pressureUpsert(s);old.test.pressureLoad().migration.done=true;old.test.pressureSave('chat-a');
  const h=environment(),key='cgpt-size-meter-v2101:pressure-calibration-v224';for(const[k,v]of old.storage)h.storage.set(k,v);
  const before=h.storage.get(key);h.test.pressureMigrate();const r=h.test.pressureCompute(h.test.pressureLoad().samples,current());
  assert.equal(r.score,73);assert.equal(h.storage.get(key),before);assert.equal(h.test.pressureLoad().modelVersion,'v2241-dual-frontier-1');
});
check('axis diagnostics remain bounded without losing total contribution counts',()=>{
  const r=compute(Array.from({length:40},(_,i)=>row(i+1,{displayLikeTokens:800000+i,activeBranchBytes:20000000+i})));
  for(const axis of [r.textAxis,r.stateAxis]){assert.equal(axis.contributions.length,16);assert.equal(axis.contributionsOmittedCount,24);assert.equal(axis.independentMaxCount,40);}
  assert.equal(r.anchorContributionSummary.length,16);
});
check('actual render shows 73 LOW and current MAX uses preserved red theme, then clears',()=>{
  const h=environment(),life=h.test.loadLifecycle('chat-a');life.families.batch.lastStable=vector(fixture.healthyEarlier);h.test.saveLifecycle('chat-a',life);
  h.start({model:fixture.model,reasoning_effort:'max'});for(const s of maxima())h.test.pressureUpsert(s);h.test.setUI();h.test.render();
  assert.match(h.test.ui().compact.innerHTML,/PRESSURE 73 \/ 100 · LOW/);
  h.state.banners=[h.banner()];h.test.render();assert.match(h.test.ui().compact.innerHTML,/PRESSURE MAX/);assert.match(h.test.ui().panel.className,/theme-maximum/);
  h.state.banners=[];h.test.render();assert(!h.test.ui().compact.innerHTML.includes('PRESSURE MAX'));assert(!h.test.ui().panel.className.includes('theme-maximum'));
});
check('actual diagnostics include both axes/combined and real V2.24.1 metadata and Retry identity',async()=>{
  const h=environment();for(const s of maxima())h.test.pressureUpsert(s);const lines=h.test.eventDiagnostics('chat-a');
  assert.match(lines[0],/V2\.24\.1 DUAL AXIS PRESSURE/);const model=JSON.parse(lines[lines.indexOf('V2.24 PRESSURE CALIBRATION')+1]);
  for(const axis of ['textAxis','stateAxis'])for(const field of ['anchor','ratio','independentMaxCount','observedMaxRange','currentValue','exceededWhileAlive'])assert(field in model[axis],axis+'.'+field);
  assert('combined' in model);assert.equal(model.modelVersion,'v2241-dual-frontier-1');assert(!JSON.stringify(model).includes('"samples"'));
  h.start({model:fixture.model});assert.equal(h.test.eventStorageHealth('chat-a').candidateVersion,'2.24.1');
  await h.test.retryCapture();assert.equal(h.test.loadDiagnostic('chat-a').lastRetry.version,'2.24.1');
  h.test.setLatest(h.test.calculateStats());await h.test.copyStats();assert(h.state.clipboard.startsWith('Candidate userscript: V2.24.1 DUAL AXIS PRESSURE'));
  assert.match(fs.readFileSync(candidate,'utf8'),/\/\/ @version\s+2\.24\.1/);
});
check('production model has no fixed native numbers, changed storage prefix, or recursive pressure helper',()=>{
  const source=fs.readFileSync(path.join(root,'src/v2241/pressure-calibration.js'),'utf8');
  for(const value of ['845331','571806','27149953','453725','26245630','6abc71ed'])assert(!source.includes(value));
  assert(source.includes('pressure-calibration-v224'));assert(source.includes('PRESSURE_CAP = 256'));
  assert.equal((source.match(/pressureAxis\(/g)||[]).length,3); // declaration + two independent calls
});
check('verified current MAX overrides both missing axes and missing comparison identity',()=>{
  const h=environment(),r=h.test.pressureCompute([],{model:null,effort:null,canonical:null},true);
  assert.equal(r.state,'current-max');assert.equal(r.score,null);assert.equal(r.unscoredReason,null);assert.equal(h.test.pressureText(r),'PRESSURE MAX');
});
(async()=>{let failed=0;for(const[name,fn]of cases)try{await fn();console.log('PASS '+name);}catch(error){failed++;console.error('FAIL '+name+'\n'+error.stack);}
  console.log(`${cases.length-failed}/${cases.length} V2.24.1 dual-axis synthetic tests passed; native candidate review pending`);if(failed)process.exitCode=1;})();
