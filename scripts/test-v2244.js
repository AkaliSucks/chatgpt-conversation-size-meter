// Full shipped three-entry registry. USER-REPORTED data; synthetic VM only.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),{buildAnonymousSeeds}=require('./build-anonymous-seeds-v22432');
const root=path.resolve(__dirname,'..'),candidate=path.join(root,'releases/v2.24.4/chatgpt_chat_size_meter_v2244_multi_effort_seeds.js');
const source=fs.readFileSync(candidate,'utf8'),prefix=fs.readFileSync(path.join(__dirname,'test-v223.js'),'utf8').split('const cases=[];')[0];
const scope={require,process:{argv:['node','test',candidate]},__dirname,console,URL,TextEncoder,TextDecoder,ArrayBuffer,Request,Blob,AbortController,btoa,atob,Buffer};
vm.runInNewContext(prefix+'\nglobalThis.makeEnvironment=environment;',scope);
const environment=scope.makeEnvironment,plain=x=>JSON.parse(JSON.stringify(x)),model='gpt-5-6-thinking',efforts=['max','high','medium'];
const registryText=fs.readFileSync(path.join(root,'src/v2244/seed-registry.js'),'utf8');
const seedBytes=execFileSync('git',['show','be93e49e6c69bf8bd87a7de8e830382afb71f810:src/v2242/anonymous-seed.js']);
const s={};vm.createContext(s);vm.runInContext(seedBytes.toString()+'\n'+registryText+'\nglobalThis.entries=ANONYMOUS_PRESSURE_SEEDS;',s);
const entries=s.entries,expected=JSON.parse(fs.readFileSync(path.join(root,'fixtures/v2244/anonymous-registry-expected.json'),'utf8'));
const parentSource=execFileSync('git',['show','decc7a38ad6a842015092c8c36bee09f7166289a:releases/v2.24.3.2/chatgpt_chat_size_meter_v22432_medium_effort_repair.js'],{encoding:'utf8'});
const vector=(extra={})=>({sourceFamily:'batch',snapshotRole:'pre-dispatch',fullCapturedAt:900000,...expected[0].profiles[0],...extra});
const current=(effort='max',extra={},identity={})=>({model,effort,canonical:vector({displayLikeTokens:453725,activeBranchBytes:19686898,snapshotRole:'current',...extra}),...identity});
const row=(id,effort='max',extra={},identity={})=>({conversationId:'test-local-'+id,eventId:id,attemptId:id,outcome:'max',timestamp:950000+id,model,effort,
 identitySource:'generation request',confirmationSource:'structured SSE error',provenance:'v224-observed',canonical:vector(extra),...identity});
const store=h=>JSON.stringify([...h.storage]),cases=[],check=(name,fn)=>cases.push([name,fn]);
function prepare(h,effort='max'){
 const life=h.test.loadLifecycle('chat-a');life.families.batch.lastStable=vector();life.families.batch.lastObservation=vector({displayLikeTokens:453725,activeBranchBytes:19686898});
 const snap=h.test.loadSnapshot('chat-a');snap.structure={contextTopology:{currentModel:model}};h.test.saveSnapshot('chat-a',snap);
 const labels={max:'Extra High',high:'High',medium:'Medium'},query=h.document.querySelectorAll;
 h.document.querySelectorAll=q=>q==='button'?[{innerText:labels[effort]}]:query(q);return life;
}
check('exact registry contains only the three supplied identities with all 99 numeric aggregates',()=>{
 assert(source.includes(registryText));assert.deepEqual(plain(entries),expected);assert.equal(entries.length,3);
 for(const e of entries){assert.deepEqual(Object.keys(e).sort(),['model','canonicalEffort','seedVersion','profiles'].sort());assert.equal(e.profiles.length,3);
  for(const p of e.profiles){assert.equal(Object.keys(p).length,11);assert(Object.values(p).every(v=>typeof v==='number' && Number.isFinite(v) && v>0));}}
});
check('registry entries profile arrays and every vector are immutable distinct objects',()=>{
 assert(Object.isFrozen(entries));assert(entries.every(e=>Object.isFrozen(e) && Object.isFrozen(e.profiles) && e.profiles.every(Object.isFrozen)));
 assert.equal(new Set(entries.map(e=>e.profiles)).size,3);assert.equal(new Set(entries.flatMap(e=>Array.from(e.profiles))).size,9);
 assert.throws(()=>vm.runInContext("'use strict'; ANONYMOUS_PRESSURE_SEEDS[1].profiles[0].displayLikeTokens=1;",s));
});
check('identical metrics never collapse or alias identities or nine profile observations',()=>{
 assert.deepEqual(plain(entries[0].profiles),plain(entries[1].profiles));assert.deepEqual(plain(entries[1].profiles),plain(entries[2].profiles));
 assert.equal(new Set(entries.map(e=>JSON.stringify([e.model,e.canonicalEffort]))).size,3);
 assert.equal(entries.reduce((n,e)=>n+e.profiles.length,0),9);
});
for(const effort of efforts){
 check(effort+' selects exactly its own three profiles and expected independent frontiers',()=>{
  const h=environment(),seed=h.test.pressureSeed(model,effort),r=h.test.pressureCompute([],current(effort),false);
  assert.equal(seed.canonicalEffort,effort);assert.equal(seed.profileCount,3);assert.equal(seed.textFrontier,847977);assert.equal(seed.stateFrontier,27151472);
  assert.equal(r.seedCanonicalEffort,effort);assert.equal(r.seedProfileCount,3);assert.equal(r.seedMaxProfileCount,3);assert.equal(r.seedModel,model);
  assert.equal(r.effectiveTextFrontier,847977);assert.equal(r.effectiveStateFrontier,27151472);assert.equal(r.calibrationSource,'seed-only');assert.equal(r.score,73);assert.equal(r.confidence,'low');
 });
 check(effort+' cannot borrow either other seed when its entry is absent',()=>{
  const others=plain(entries).filter(e=>e.canonicalEffort!==effort);
  const testOnly=source.replace(registryText,()=>`const ANONYMOUS_PRESSURE_SEEDS = Object.freeze(${JSON.stringify(others)});\n`);
  const h=environment(testOnly);assert.equal(h.test.pressureSeed(model,effort),null);
  assert.equal(h.test.pressureCompute([],current(effort),false).state,'calibrating');assert.equal(h.test.pressureCompute([],current(effort),false).seedProfileCount,0);
 });
 check(effort+' lower exact local MAX cannot shrink either bundled frontier',()=>{
  const r=environment().test.pressureCompute([row(1,effort,{displayLikeTokens:1000,activeBranchBytes:2000})],current(effort),false);
  assert.equal(r.effectiveTextFrontier,847977);assert.equal(r.effectiveStateFrontier,27151472);assert.equal(r.effectiveTextFrontierSource,'seed');assert.equal(r.effectiveStateFrontierSource,'seed');assert.equal(r.calibrationSource,'seed+local');
 });
 check(effort+' exact local evidence independently extends text and state',()=>{
  const h=environment();for(const extra of [{displayLikeTokens:1000000},{activeBranchBytes:30000000},{displayLikeTokens:1000000,activeBranchBytes:30000000}]){
   const r=h.test.pressureCompute([row(1,effort,extra)],current(effort),false);
   assert.equal(r.effectiveTextFrontier,extra.displayLikeTokens || 847977);assert.equal(r.effectiveStateFrontier,extra.activeBranchBytes || 27151472);assert.equal(r.confidence,'low');assert.equal(r.seedCanonicalEffort,effort);
  }
 });
 check(effort+' local extensions stay isolated with sufficient exact evidence in every profile',()=>{
  const rows=efforts.flatMap((e,i)=>[row(i*2+1,e,{displayLikeTokens:10000,activeBranchBytes:20000}),row(i*2+2,e,{displayLikeTokens:20000,activeBranchBytes:30000})]);
  const changed=rows.map(r=>r.effort===effort?{...r,canonical:vector({displayLikeTokens:1000000,activeBranchBytes:30000000})}:r);
  const h=environment();for(const selected of efforts){const p=h.test.pressureCompute(changed,current(selected),false);assert.equal(p.comparisonTier,'exact-model-effort');
   assert.equal(p.effectiveTextFrontier,selected===effort?1000000:847977);assert.equal(p.effectiveStateFrontier,selected===effort?30000000:27151472);assert.equal(p.seedCanonicalEffort,selected);
   assert(p.textAxis.contributions.every(c=>c.canonicalEffort===selected));assert(p.stateAxis.contributions.every(c=>c.canonicalEffort===selected));}
 });
 check(effort+' numeric pressure caps at 99 until existing current MAX is verified',()=>{
  const h=environment(),c=current(effort,{displayLikeTokens:9999999,activeBranchBytes:99999999});
  const alive=h.test.pressureCompute([],c,false);assert.equal(alive.score,99);assert.equal(alive.state,'scored');assert.equal(h.test.pressureText(alive),'PRESSURE 99 / 100 · LOW');
  const max=h.test.pressureCompute([],c,true);assert.equal(max.score,null);assert.equal(max.state,'current-max');assert.equal(h.test.pressureText(max),'PRESSURE MAX');
 });
 check(effort+' zero current metrics stay zero and missing primary data stays calibrating',()=>{
  const h=environment();assert.equal(h.test.pressureCompute([],current(effort,{displayLikeTokens:0,activeBranchBytes:0}),false).score,0);
  for(const extra of [{displayLikeTokens:null},{activeBranchBytes:null}]){const p=h.test.pressureCompute([],current(effort,extra),false);assert.equal(p.state,'calibrating');assert.equal(p.seedProfileCount,3);}
 });
 check(effort+' production view immediately scores fresh captured state without dispatch or persistence',()=>{
  const h=environment();prepare(h,effort);const before=store(h),p=h.test.pressureResult('chat-a');assert.equal(p.score,73);assert.equal(p.seedCanonicalEffort,effort);assert.equal(p.localIndependentMaxConversationCount,0);assert.equal(store(h),before);
 });
}
check('supported aliases select corresponding seed through authoritative normalization only',()=>{
 const h=environment();for(const [raw,effort]of [['max','max'],['Extra High','max'],['extended','high'],['High','high'],['standard','medium'],['Medium','medium']]){
  const r=h.test.pressureCompute([],current(raw),false);assert.equal(r.seedCanonicalEffort,effort);assert.equal(r.seedProfileCount,3);assert.equal(r.score,73);}
});
check('unsupported efforts never receive a seed or another effort fallback',()=>{
 const h=environment();for(const effort of ['low','minimal','instant','none','thinking','xhigh','extra-high','standard-plus','future',null,'']){
  const r=h.test.pressureCompute([],current(effort),false);assert.equal(r.seedProfileCount,0);assert.equal(r.state,'calibrating');assert.equal(r.score,null);}
});
check('unsupported and similar models never receive any of the three seeds',()=>{
 const h=environment();for(const other of ['other','gpt-5-6','gpt-5-6-thinking-mini','GPT-5-6-thinking',null,''])for(const effort of efforts){
  assert.equal(h.test.pressureSeed(other,effort),null);const r=h.test.pressureCompute([],current(effort,{}, {model:other}),false);assert.equal(r.state,'calibrating');assert.equal(r.seedProfileCount,0);}
});
check('unsupported exact model with valid local evidence retains local-only scoring',()=>{
 const h=environment(),r=h.test.pressureCompute([row(1,'medium',{displayLikeTokens:900000,activeBranchBytes:30000000},{model:'other'})],current('medium',{}, {model:'other'}),false);
 assert.equal(r.state,'scored');assert.equal(r.seedProfileCount,0);assert.equal(r.calibrationSource,'local-only');assert.equal(r.effectiveTextFrontier,900000);
});
check('all nine secondary metrics are diagnostics only and cannot alter score',()=>{
 const h=environment();for(const effort of efforts){const p=h.test.pressureCompute([],current(effort),false),extra={};
  for(const k of ['mappingBytes','retainedBytes','toolResultBytes','branchNodes','messageNodes','retainedShare','hot128','hot256','strongContextMarkers'])extra[k]=1e14;
  const q=h.test.pressureCompute([],current(effort,extra),false);assert.equal(q.score,p.score);assert.equal(q.textAxis.ratio,p.textAxis.ratio);assert.equal(q.stateAxis.ratio,p.stateAxis.ratio);}
});
check('seed metadata and values do not include prohibited identifiers or private source data',()=>{
 const h=environment();assert(h.test.anonymousPrivacyValid(entries));const text=JSON.stringify(entries);
 for(const key of ['conversationId','messageId','attemptId','episodeId','timestamp','fullCapturedAt','url','prompt','response','filename','rawMapping'])assert(!text.includes(key));
 assert(!/https?:|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(text));
});
check('seed-only compute lookup summaries and empty migration never persist seeds or count local observations',()=>{
 const h=environment();let writes=0;h.context.localStorage.setItem=()=>{writes++;throw Error('readonly');};
 for(let i=0;i<10;i++)for(const effort of efforts){h.test.pressureSeed(model,effort);h.test.pressureCompute(h.test.pressureLoad().samples,current(effort),false);h.test.pressureSummary();}
 h.test.pressureMigrate();h.test.pressureMigrate();assert.equal(writes,0);assert.equal(h.storage.size,0);assert.equal(h.test.pressureSummary().uniqueMaxEvents,0);assert.equal(h.test.pressureSummary().totalSamples,0);
});
check('necessary local save contains only local event rows rather than nine seed profiles',()=>{
 const h=environment();h.test.pressureUpsert(row(1,'extended',{displayLikeTokens:1000,activeBranchBytes:2000}));h.test.pressureSave('chat-a');
 const data=h.test.eventStorageParse(h.storage.get('cgpt-size-meter-v2101:pressure-calibration-v224'));assert.equal(data.schemaVersion,1);assert.equal(data.samples.length,1);assert.equal(data.samples[0].effort,'high');
 const text=JSON.stringify(data);for(const marker of ['ANONYMOUS_PRESSURE_SEEDS','profiles','v2244-high-anonymous-seed-1','847977','27151472'])assert(!text.includes(marker));
});
check('historical raw extended and standard provenance stays unchanged on evaluation/migration',()=>{
 const old=environment(parentSource);old.test.pressureUpsert(row(1));old.test.pressureLoad().samples[0].effort='standard';old.test.pressureLoad().migration.done=true;old.test.pressureSave('chat-a');
 const h=environment();for(const [k,v]of old.storage)h.storage.set(k,v);const before=store(h);h.test.pressureMigrate();h.test.pressureMigrate();
 const r=h.test.pressureCompute(h.test.pressureLoad().samples,current('standard'),false);assert.equal(r.seedCanonicalEffort,'medium');assert.equal(h.test.pressureLoad().samples[0].effort,'standard');assert.equal(store(h),before);
});
check('Extra High original constant and all max scorer behavior remain byte/value equivalent',()=>{
 assert(source.includes(seedBytes.toString()));const old=environment(parentSource),h=environment();
 const matrix=[[],[row(1)],[row(1,'max',{displayLikeTokens:1000000,activeBranchBytes:30000000})],
  [row(1,'extended',{displayLikeTokens:1100000,activeBranchBytes:35000000}),row(2,'extended')]];
 for(const rows of matrix)for(const active of [false,true])assert.deepEqual(plain(h.test.pressureCompute(rows,current('Extra High'),active)),plain(old.test.pressureCompute(rows,current('Extra High'),active)));
 assert.equal(h.test.pressureSeed(model,'max').version,'v2242-anonymous-seed-1');
});
check('raw backend provenance and seeded anonymous MAX/SUCCESS export work for each effort',()=>{
 const raw={max:'max',high:'extended',medium:'standard'};
 for(const effort of efforts)for(const outcome of ['max','success']){const h=environment();prepare(h,effort);const a=h.start({model,reasoning_effort:raw[effort]});
  if(outcome==='max'){h.state.banners=[h.banner()];h.test.eventPollMax('chat-a');}else h.chunk(a,'data: [DONE]\n\n');
  assert.equal(a.requestEffort,raw[effort]);assert.equal(a.requestEffortDetected,raw[effort]);assert.equal(a.requestCanonicalEffort,effort);
  const p=h.test.anonymousSampleForChat();assert(p);assert.equal(p.canonicalEffort,effort);assert.equal(p.outcome,outcome);assert.equal(p.pressureState,outcome==='max'?'current-max':'scored');assert.equal(p.candidateVersion,'2.24.4');
 }
});
check('anonymous privacy contract remains closed for every seeded effort',()=>{
 const h=environment();for(const effort of efforts){const p=h.test.anonymousProjectSample({model,effort,outcome:'max',role:'pre-max',pressureState:'current-max'},vector());assert(p);assert(h.test.anonymousPrivacyValid(p));
  for(const k of ['conversationId','messageId','attemptId','episodeId','timestamp','url','prompt','response','accountId','userId','assetId','filename','rawMapping'])assert.equal(h.test.anonymousSampleValid({...p,[k]:'SECRET'}),false);}
});
check('offline builder does not collapse identical observations across effort identities',()=>{
 const h=environment(),samples=efforts.flatMap(e=>expected[0].profiles.map(p=>plain(h.test.anonymousProjectSample({model,effort:e,outcome:'max',role:'pre-max',pressureState:'current-max'},vector(p)))));
 const r=buildAnonymousSeeds(samples);assert.equal(r.seeds.length,3);assert(r.seeds.every(e=>e.profiles.length===3));assert(r.summaries.every(e=>e.textFrontier===847977 && e.stateFrontier===27151472));
 assert.deepEqual(buildAnonymousSeeds(samples),buildAnonymousSeeds(samples.toReversed()));
});
check('registry lookup and full pressure are deterministic under registry and row permutations',()=>{
 const reverse=source.replace(registryText,()=>`const ANONYMOUS_PRESSURE_SEEDS = Object.freeze(${JSON.stringify(plain(entries).toReversed())});\n`),a=environment(),b=environment(reverse);
 const rows=efforts.flatMap((e,i)=>[row(i*2+1,e),row(i*2+2,e)]);for(const effort of efforts)assert.deepEqual(plain(a.test.pressureCompute(rows,current(effort),false)),plain(b.test.pressureCompute(rows.toReversed(),current(effort),false)));
});
check('all three profiles retain LOW confidence regardless of local sample population',()=>{
 const h=environment(),rows=efforts.flatMap((e,i)=>Array.from({length:12},(_,j)=>row(i*20+j+1,e)));for(const effort of efforts){const p=h.test.pressureCompute(rows,current(effort),false);assert.equal(p.confidence,'low');assert.equal(p.seedMaxProfileCount,3);assert.equal(p.localIndependentMaxConversationCount,12);}
});
check('release identity agrees in metadata anonymous copy health Retry and diagnostics',async()=>{
 const h=environment();prepare(h,'medium');const a=h.start({model,reasoning_effort:'standard'});h.chunk(a,'data: [DONE]\n\n');
 assert.equal(h.test.anonymousSampleForChat().candidateVersion,'2.24.4');assert.equal(h.test.eventStorageHealth('chat-a').candidateVersion,'2.24.4');
 await h.test.retryCapture();assert.equal(h.test.loadDiagnostic('chat-a').lastRetry.version,'2.24.4');h.test.setLatest(h.test.calculateStats());await h.test.copyStats();assert(h.state.clipboard.startsWith('Candidate userscript: V2.24.4 MULTI-EFFORT ANONYMOUS SEEDS'));
});
(async()=>{let passed=0;for(const [name,fn]of cases)try{await fn();console.log('PASS '+name);passed++;}catch(error){console.error('FAIL '+name+'\n'+error.stack);process.exitCode=1;}
 console.log(`${passed}/${cases.length} V2.24.4 full-registry synthetic tests passed; native review pending`);})();
