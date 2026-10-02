// Seed-specific synthetic tests against exact release bytes; no native browser.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),candidate=path.join(root,'releases/v2.24.2/chatgpt_chat_size_meter_v2242_anonymous_seed_calibration.js');
const prefix=fs.readFileSync(path.join(__dirname,'test-v223.js'),'utf8').split('const cases=[];')[0];
const scope={require,process:{argv:['node','test',candidate]},__dirname,console,URL,TextEncoder,TextDecoder,
  ArrayBuffer,Request,Blob,AbortController,btoa,atob,Buffer};
vm.runInNewContext(prefix+'\nglobalThis.makeEnvironment=environment;',scope);
const environment=scope.makeEnvironment,plain=x=>JSON.parse(JSON.stringify(x));
const seedSource=fs.readFileSync(path.join(root,'src/v2242/anonymous-seed.js'),'utf8'),seedScope={};
vm.createContext(seedScope);vm.runInContext(seedSource+'\nglobalThis.reference=PRESSURE_SEED;',seedScope);
const reference=seedScope.reference,model='gpt-5-6-thinking',key='cgpt-size-meter-v2101:pressure-calibration-v224';
const vector=(extra={})=>({sourceFamily:'batch',snapshotRole:'pre-dispatch',fullCapturedAt:900000,
  displayLikeTokens:453725,activeBranchBytes:19686898,mappingBytes:20000000,branchNodes:4000,messageNodes:3999,
  retainedBytes:null,retainedShare:null,toolResultBytes:null,hot128:null,hot256:null,strongContextMarkers:null,...extra});
const current=(extra={},identity={})=>({model,effort:'max',canonical:vector({...extra,snapshotRole:'current'}),...identity});
const row=(id,extra={},identity={})=>({conversationId:'local-'+id,eventId:id,attemptId:id,outcome:'max',
  key:JSON.stringify(['local-'+id,'max',id]),timestamp:950000+id,model,effort:'max',
  identitySource:'generation request',confirmationSource:'structured SSE error',provenance:'v224-observed',canonical:vector(extra),...identity});
const compute=(samples=[],c=current(),active=false)=>environment().test.pressureCompute(samples,c,active);
const cases=[],check=(name,fn)=>cases.push([name,fn]);
function freshUI(h,extra={}){
  const life=h.test.loadLifecycle('chat-a');life.families.batch.lastObservation=vector(extra);
  const snap=h.test.loadSnapshot('chat-a');snap.structure={contextTopology:{currentModel:model}};
  h.test.saveSnapshot('chat-a',snap);
  const query=h.document.querySelectorAll;h.document.querySelectorAll=s=>s==='button'?[{innerText:'Extra High'}]:query(s);
}

check('fresh supported install immediately uses anonymous seed with numeric LOW pressure',()=>{
  const h=environment(),r=h.test.pressureCompute([],current());assert.equal(r.state,'scored');assert.equal(r.score,73);
  assert.equal(r.calibrationSource,'seed-only');assert.equal(r.confidence,'low');assert.equal(h.test.pressureText(r),'PRESSURE 73 / 100 · LOW');
  assert.equal(r.seedTextFrontier,847977);assert.equal(r.seedStateFrontier,27151472);
});
check('Extra High alias and canonical max select the same seed without extra aliases',()=>{
  for(const effort of ['Extra High',' EXTRA   HIGH ','Max',' max ']){
    const r=compute([],current(undefined,{effort}));assert.equal(r.canonicalEffort,'max');assert.equal(r.seedProfileCount,3);assert.equal(r.score,73);
  }
});
check('unrelated or merely similar model slugs never borrow the bundled profile',()=>{
  for(const other of ['test-model','gpt-5-6','gpt-5-6-thinking-mini','gpt-5-6-thinking-v2',null,'']){
    const r=compute([],current(undefined,{model:other}));assert.equal(r.state,'calibrating');assert.equal(r.calibrationSource,'calibrating');
    assert.equal(r.seedProfileCount,0);assert.equal(r.seedTextFrontier,null);assert.equal(r.score,null);
  }
});
check('unsupported missing or unpaired effort never silently selects max seed',()=>{
  for(const effort of ['high','medium','low','minimal','none','thinking','xhigh','extra-high','future',null,'']){
    const r=compute([],current(undefined,{effort}));assert.equal(r.state,'calibrating');assert.equal(r.seedProfileCount,0);assert.equal(r.score,null);
  }
});
check('seed profile schema contains exactly the supplied anonymous numeric pairs',()=>{
  assert.deepEqual(Object.keys(reference).sort(),['canonicalEffort','model','profiles','version']);
  assert.equal(reference.model,model);assert.equal(reference.canonicalEffort,'max');assert.equal(reference.version,'v2242-anonymous-seed-1');
  assert.deepEqual(plain(reference.profiles),[
    {displayLikeTokens:840795,activeBranchBytes:20075510},
    {displayLikeTokens:847977,activeBranchBytes:15645053},
    {displayLikeTokens:571836,activeBranchBytes:27151472}]);
  for(const profile of reference.profiles){assert.deepEqual(Object.keys(profile).sort(),['activeBranchBytes','displayLikeTokens']);
    for(const value of Object.values(profile))assert(typeof value==='number' && Number.isFinite(value) && value>0);}
});
check('static seed has no identifying fields values UUIDs URLs timestamps or text payloads',()=>{
  const json=JSON.stringify(reference);
  for(const word of ['conversationId','accountId','userId','attemptId','episodeId','timestamp','fullCapturedAt','title','prompt','response','mapping','diagnostics','screenshot','http','://'])assert(!json.includes(word),word);
  assert(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(seedSource));
  assert(fs.readFileSync(candidate,'utf8').includes(seedSource),'tested exact static seed bytes must be embedded in candidate');
});
check('seed object array and all profile vectors are immutable',()=>{
  assert(Object.isFrozen(reference));assert(Object.isFrozen(reference.profiles));assert(reference.profiles.every(Object.isFrozen));
  assert.throws(()=>vm.runInContext("'use strict'; PRESSURE_SEED.profiles[0].displayLikeTokens=1;",seedScope));
  assert.throws(()=>vm.runInContext("'use strict'; PRESSURE_SEED.profiles.push({});",seedScope));
  assert.equal(reference.profiles[0].displayLikeTokens,840795);
});
check('compute result summary and repeated reads never seed local events or write storage',()=>{
  const h=environment();let writes=0;const set=h.context.localStorage.setItem;
  h.context.localStorage.setItem=(k,v)=>{writes++;return set(k,v);};
  for(let i=0;i<20;i++){h.test.pressureCompute(h.test.pressureLoad().samples,current());h.test.pressureSummary();}
  assert.equal(writes,0);assert.equal(h.storage.size,0);assert.equal(h.test.pressureLoad().samples.length,0);
  assert.equal(h.test.pressureSummary().uniqueMaxEvents,0);assert.equal(h.test.pressureSummary().totalVectors,0);
});
check('seed-only migration is idempotent empty and never creates persistent namespace',()=>{
  const h=environment();h.test.pressureMigrate();h.test.pressureMigrate();
  assert.equal(h.storage.size,0);assert.equal(h.test.pressureSummary().migration.admittedEvents,0);
  const next=environment();next.test.pressureMigrate();assert.equal(next.storage.size,0);
});
check('explicit persistence contains only local rows and no bundled profiles or seed diagnostics',()=>{
  const h=environment();h.test.pressureUpsert(row(1,{displayLikeTokens:10000,activeBranchBytes:200000}));
  const r=h.test.pressureCompute(h.test.pressureLoad().samples,current());assert.equal(r.seedProfileCount,3);
  h.test.pressureSave('chat-a');const stored=h.test.eventStorageParse(h.storage.get(key));
  assert.equal(stored.samples.length,1);assert.equal(stored.samples[0].canonical.displayLikeTokens,10000);
  assert.equal(stored.samples[0].canonical.activeBranchBytes,200000);
  for(const field of ['profiles','seedProfileCount','seedVersion','seedTextFrontier','seedStateFrontier','calibrationSource'])assert(!(field in stored));
  assert(!JSON.stringify(stored).includes('847977'));assert(!JSON.stringify(stored).includes('27151472'));
});
check('seed profiles are never locally observed conversations or confidence votes',()=>{
  const r=compute();assert.equal(r.seedMaxProfileCount,3);assert.equal(r.seedProfileCount,3);
  for(const field of ['localIndependentMaxConversationCount','uniqueMaxConversationCount','effectiveMaxObservationCount','comparableMaxCount','rawComparableMaxEpisodeCount'])assert.equal(r[field],0,field);
  for(const axis of [r.textAxis,r.stateAxis]){assert.equal(axis.independentMaxCount,0);assert.equal(axis.seedMaxProfileCount,3);assert.equal(axis.contributions.length,0);}
  assert.equal(r.anchorContributionSummary.length,0);assert.equal(r.confidence,'low');
});
check('sparse lower local MAX preserves both seed upper frontiers',()=>{
  const r=compute([row(1,{displayLikeTokens:10000,activeBranchBytes:200000})]);
  assert.equal(r.calibrationSource,'seed+local');assert.equal(r.localIndependentMaxConversationCount,1);
  assert.equal(r.localTextFrontier,10000);assert.equal(r.localStateFrontier,200000);
  assert.equal(r.effectiveTextFrontier,847977);assert.equal(r.effectiveStateFrontier,27151472);
  assert.equal(r.effectiveTextFrontierSource,'seed');assert.equal(r.effectiveStateFrontierSource,'seed');assert.equal(r.score,73);
});
check('higher local text frontier extends text alone with explicit source',()=>{
  const r=compute([row(1,{displayLikeTokens:900000,activeBranchBytes:1000000})]);
  assert.equal(r.effectiveTextFrontier,900000);assert.equal(r.effectiveTextFrontierSource,'local');
  assert.equal(r.effectiveStateFrontier,27151472);assert.equal(r.effectiveStateFrontierSource,'seed');
  assert.equal(r.textAxis.localAnchor,900000);assert.equal(r.textAxis.seedAnchor,847977);
});
check('higher local state frontier extends state alone with explicit source',()=>{
  const r=compute([row(1,{displayLikeTokens:600000,activeBranchBytes:30000000})]);
  assert.equal(r.effectiveTextFrontier,847977);assert.equal(r.effectiveTextFrontierSource,'seed');
  assert.equal(r.effectiveStateFrontier,30000000);assert.equal(r.effectiveStateFrontierSource,'local');assert.equal(r.score,66);
});
check('independent local contributions can extend both axes from different chats',()=>{
  const r=compute([row(1,{displayLikeTokens:900000,activeBranchBytes:1000000}),row(2,{displayLikeTokens:600000,activeBranchBytes:30000000})]);
  assert.equal(r.effectiveTextFrontier,900000);assert.equal(r.effectiveStateFrontier,30000000);assert.equal(r.localIndependentMaxConversationCount,2);
  assert.equal(r.seedMaxProfileCount,3);assert.equal(r.uniqueMaxConversationCount,2);assert.equal(r.confidence,'low');
});
check('equal local seed frontier ties retain seed source and separate local count',()=>{
  const r=compute([row(1,{displayLikeTokens:847977,activeBranchBytes:27151472})]);
  assert.equal(r.effectiveTextFrontierSource,'seed');assert.equal(r.effectiveStateFrontierSource,'seed');assert.equal(r.localIndependentMaxConversationCount,1);
});
check('same-chat repeated local episodes collapse by conversation without seed contamination',()=>{
  const rows=Array.from({length:40},(_,i)=>row(i+1,{displayLikeTokens:900000,activeBranchBytes:30000000},{conversationId:'same-chat'}));
  const r=compute(rows);assert.equal(r.rawComparableMaxEpisodeCount,40);assert.equal(r.localIndependentMaxConversationCount,1);
  assert.equal(r.textAxis.independentMaxCount,1);assert.equal(r.stateAxis.independentMaxCount,1);assert.equal(r.seedProfileCount,3);
  const single=compute(rows.slice(0,1));assert.equal(r.score,single.score);assert.equal(r.confidence,single.confidence);
});
check('fresh supporting post-MAX cannot extend local or effective seed frontier',()=>{
  const s=row(1,{displayLikeTokens:700000,activeBranchBytes:20000000});
  s.postMax=vector({displayLikeTokens:1000000,activeBranchBytes:40000000,snapshotRole:'fresh-post-max',fullCapturedAt:980000});
  const r=compute([s]);assert.equal(r.effectiveTextFrontier,847977);assert.equal(r.effectiveStateFrontier,27151472);assert.equal(r.localIndependentMaxConversationCount,1);
});
check('local canonical fallback still obeys inherited pre preference and independent counts',()=>{
  const pre=row(1,{displayLikeTokens:700000,activeBranchBytes:20000000},{conversationId:'same'}),
    fallback=row(2,{displayLikeTokens:1000000,activeBranchBytes:40000000,snapshotRole:'fresh-post-max-fallback',fullCapturedAt:980000},{conversationId:'same'});
  const r=compute([pre,fallback]);assert.equal(r.effectiveTextFrontier,847977);assert.equal(r.effectiveStateFrontier,27151472);
  assert(!r.postMaxFallbackPresent);assert.equal(r.localIndependentMaxConversationCount,1);
});
check('seed does not cross model or effort boundaries even with other local evidence',()=>{
  const rows=[row(1,{displayLikeTokens:1000000,activeBranchBytes:40000000})];
  const r=compute(rows,current(undefined,{model:'unsupported'}));assert.equal(r.seedProfileCount,0);assert.equal(r.state,'calibrating');
  const effort=compute(rows,current(undefined,{effort:'high'}));assert.equal(effort.seedProfileCount,0);
  assert.equal(effort.calibrationSource,'local-only');assert.equal(effort.comparisonTier,'same-model');
});
check('unsupported model with valid local evidence retains local-only dual scoring',()=>{
  const r=compute([row(1,{displayLikeTokens:800000,activeBranchBytes:25000000},{model:'unsupported'})],current(undefined,{model:'unsupported'}));
  assert.equal(r.state,'scored');assert.equal(r.calibrationSource,'local-only');assert.equal(r.seedVersion,null);
  assert.equal(r.effectiveTextFrontier,800000);assert.equal(r.effectiveStateFrontier,25000000);assert.equal(r.effectiveTextFrontierSource,'local');
});
check('seed fills absent local axis but missing current primary metric still calibrates',()=>{
  const r=compute([row(1,{displayLikeTokens:900000,activeBranchBytes:null})]);
  assert.equal(r.localStateFrontier,null);assert.equal(r.effectiveStateFrontier,27151472);assert.equal(r.state,'scored');
  for(const activeBranchBytes of [null,undefined,'19686898',NaN,Infinity,-1]){
    const missing=compute([],current({activeBranchBytes}));assert.equal(missing.state,'calibrating');assert.equal(missing.calibrationSource,'seed-only');
  }
});
check('known zero current metrics remain zero ratios rather than unknown',()=>{
  const r=compute([],current({displayLikeTokens:0,activeBranchBytes:0}));assert.equal(r.score,0);assert.equal(r.textAxis.ratio,0);assert.equal(r.stateAxis.ratio,0);
});
check('verified current MAX overrides supported unsupported or missing calibration',()=>{
  const h=environment();for(const c of [current(),current(undefined,{model:'unsupported'}),{model:null,effort:null,canonical:null}]){
    const r=h.test.pressureCompute([],c,true);assert.equal(r.state,'current-max');assert.equal(r.score,null);assert.equal(h.test.pressureText(r),'PRESSURE MAX');
  }
});
check('stale local MAX and ratios above either seed frontier stay nonterminal',()=>{
  const h=environment();for(const v of [{displayLikeTokens:1000000},{activeBranchBytes:30000000}]){
    const r=h.test.pressureCompute([row(1)],current(v),false);assert.equal(r.score,99);assert.equal(r.state,'scored');
    assert(r.currentExceedsAnchorWhileAlive);assert.notEqual(h.test.pressureText(r),'PRESSURE MAX');
  }
});
for(const [name,v,score,dominant]of [
  ['tiny',{displayLikeTokens:1000,activeBranchBytes:20000},0,'text'],
  ['state-heavy healthy',{displayLikeTokens:453725,activeBranchBytes:19686898},73,'state'],
  ['near-state-boundary SUCCESS',{displayLikeTokens:561842,activeBranchBytes:26245630},97,'state'],
  ['state boundary',{displayLikeTokens:571836,activeBranchBytes:27151472},99,'state'],
  ['text boundary A',{displayLikeTokens:840795,activeBranchBytes:20075510},99,'text'],
  ['text boundary B',{displayLikeTokens:847977,activeBranchBytes:15645053},99,'text']
])check(name+' has expected seeded approximate pressure without terminal MAX',()=>{
  const r=compute([],current(v));assert.equal(r.score,score);assert.equal(r.combined.dominantAxis,dominant);assert.equal(r.state,'scored');assert.equal(r.confidence,'low');
});
check('secondary metrics never enter seeded score or capacity calculation',()=>{
  const v={mappingBytes:999999999,retainedBytes:999999999,retainedShare:99,toolResultBytes:999999999,hot128:999999999,hot256:999999999,strongContextMarkers:999999999,branchNodes:999999999,messageNodes:999999999};
  assert.equal(compute([],current(v)).score,73);assert.equal(compute([],current(v)).effectiveStateFrontier,27151472);
});
check('seed ratios and local extensions are deterministic under permutation and repeated calculation',()=>{
  const rows=[row(1,{displayLikeTokens:900000,activeBranchBytes:1000000}),row(2,{displayLikeTokens:600000,activeBranchBytes:30000000}),
    row(3,{displayLikeTokens:600000,activeBranchBytes:30000000},{conversationId:'local-2'})],a=plain(compute(rows));
  assert.deepEqual(plain(compute(rows.slice().reverse())),a);for(let i=0;i<20;i++)assert.deepEqual(plain(compute(rows)),a);
});
check('pure seed calculator works when localStorage is inaccessible and performs no network',()=>{
  const h=environment();h.context.localStorage.getItem=()=>{throw Error('blocked storage');};
  const r=h.test.pressureCompute([],current());assert.equal(r.score,73);assert.equal(h.fetches.length,0);assert.equal(h.storage.size,0);
});
check('cached production view immediately scores current captured state and observed Extra High without a dispatch',()=>{
  const h=environment();freshUI(h);h.test.pressureMigrate();const before=new Map(h.storage);
  const r=h.test.pressureResult('chat-a');assert.equal(r.calibrationSource,'seed-only');assert.equal(r.canonicalEffort,'max');assert.equal(r.score,73);
  assert.equal(h.test.loadAttemptState('chat-a').attempts.length,0);assert.equal(h.test.pressureSummary().totalSamples,0);
  for(let i=0;i<20;i++)assert.equal(h.test.pressureResult('chat-a'),r);assert.deepEqual(plain([...h.storage]),plain([...before]));assert.equal(h.fetches.length,0);
});
check('actual compact UI displays immediate seed pressure, then verified red MAX and clearance',()=>{
  const h=environment();freshUI(h);h.test.setUI();h.test.render();assert.match(h.test.ui().compact.innerHTML,/PRESSURE 73 \/ 100 · LOW/);
  assert.equal(h.test.pressureSummary().totalSamples,0);h.state.banners=[h.banner()];h.test.render();
  assert.match(h.test.ui().compact.innerHTML,/PRESSURE MAX/);assert.match(h.test.ui().panel.className,/theme-maximum/);
  h.state.banners=[];h.test.render();assert.match(h.test.ui().compact.innerHTML,/PRESSURE 73 \/ 100 · LOW/);assert(!h.test.ui().panel.className.includes('theme-maximum'));
});
check('seed-aware diagnostics compactly separate anonymous local and effective frontiers',()=>{
  const h=environment();freshUI(h);const lines=h.test.eventDiagnostics('chat-a'),r=JSON.parse(lines[lines.indexOf('V2.24 PRESSURE CALIBRATION')+1]);
  for(const field of ['calibrationSource','seedVersion','seedProfileCount','seedMaxProfileCount','seedModel','seedCanonicalEffort','seedTextFrontier',
    'seedStateFrontier','localIndependentMaxConversationCount','localTextFrontier','localStateFrontier','effectiveTextFrontier','effectiveStateFrontier',
    'effectiveTextFrontierSource','effectiveStateFrontierSource'])assert(field in r,field);
  assert.equal(r.seedProfileCount,3);assert.equal(r.localIndependentMaxConversationCount,0);assert.equal(r.localTextFrontier,null);
  assert(!JSON.stringify(r).includes('"profiles"'));assert(!JSON.stringify(r).includes('"samples"'));
  const summary=JSON.parse(lines[lines.indexOf('CALIBRATION SAMPLE SUMMARY')+1]);assert.equal(summary.totalSamples,0);
});
check('V2.24.1 store is read without rewrite or seed injection then new local append preserves old provenance',()=>{
  const old=environment(fs.readFileSync(path.join(root,'releases/v2.24.1/chatgpt_chat_size_meter_v2241_dual_axis_pressure.js'),'utf8'));
  old.test.pressureUpsert(row(1,{displayLikeTokens:10000,activeBranchBytes:200000},{effort:'Extra High'}));old.test.pressureLoad().migration.done=true;old.test.pressureSave('chat-a');
  const h=environment();for(const[k,v]of old.storage)h.storage.set(k,v);const before=h.storage.get(key);
  h.test.pressureMigrate();h.test.pressureCompute(h.test.pressureLoad().samples,current());assert.equal(h.storage.get(key),before);
  const oldRow=plain(h.test.pressureLoad().samples[0]);h.test.pressureUpsert(row(2,{displayLikeTokens:900000,activeBranchBytes:30000000}));h.test.pressureSave('chat-a');
  const saved=h.test.eventStorageParse(h.storage.get(key));assert.equal(saved.samples.length,2);assert.deepEqual(plain(saved.samples[0]),oldRow);
});
check('local retention cap remains 256 despite seed-only and seeded diagnostics reads',()=>{
  const h=environment();for(let i=1;i<=300;i++)h.test.pressureUpsert(row(i,{displayLikeTokens:10000,activeBranchBytes:200000},{conversationId:'one-chat'}));
  const r=h.test.pressureCompute(h.test.pressureLoad().samples,current());assert.equal(h.test.pressureLoad().samples.length,256);
  assert.equal(h.test.pressureSummary().retentionCap,256);assert.equal(r.rawComparableMaxEpisodeCount,256);assert.equal(r.localIndependentMaxConversationCount,1);assert.equal(r.seedProfileCount,3);
});
check('actual candidate metadata Copy storage health and Retry consistently identify 2.24.2',async()=>{
  const h=environment();freshUI(h);const source=fs.readFileSync(candidate,'utf8');assert.match(source,/\/\/ @version\s+2\.24\.2/);
  assert.match(h.test.eventDiagnostics('chat-a')[0],/V2\.24\.2 ANONYMOUS SEED CALIBRATION/);
  assert.equal(h.test.pressureResult('chat-a').modelVersion,'v2242-seeded-dual-frontier-1');
  h.start({model,reasoning_effort:'max'});assert.equal(h.test.eventStorageHealth('chat-a').candidateVersion,'2.24.2');
  await h.test.retryCapture();assert.equal(h.test.loadDiagnostic('chat-a').lastRetry.version,'2.24.2');
  h.test.setLatest(h.test.calculateStats());await h.test.copyStats();assert(h.state.clipboard.startsWith('Candidate userscript: V2.24.2 ANONYMOUS SEED CALIBRATION'));
});
(async()=>{let failed=0;for(const[name,fn]of cases)try{await fn();console.log('PASS '+name);}catch(error){failed++;console.error('FAIL '+name+'\n'+error.stack);}
  console.log(`${cases.length-failed}/${cases.length} V2.24.2 anonymous-seed synthetic tests passed; native candidate review pending`);if(failed)process.exitCode=1;})();
