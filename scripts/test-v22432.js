// USER-REPORTED Medium vector reproduced in a synthetic VM, not live ChatGPT.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),{buildAnonymousSeeds}=require('./build-anonymous-seeds-v22432');
const root=path.resolve(__dirname,'..'),candidate=path.join(root,'releases/v2.24.3.2/chatgpt_chat_size_meter_v22432_medium_effort_repair.js');
const prefix=fs.readFileSync(path.join(__dirname,'test-v223.js'),'utf8').split('const cases=[];')[0];
const scope={require,process:{argv:['node','test',candidate]},__dirname,console,URL,TextEncoder,TextDecoder,ArrayBuffer,Request,Blob,AbortController,btoa,atob,Buffer};
vm.runInNewContext(prefix+'\nglobalThis.makeEnvironment=environment;',scope);
const environment=scope.makeEnvironment,plain=x=>JSON.parse(JSON.stringify(x)),model='gpt-5-6-thinking';
const expected=JSON.parse(fs.readFileSync(path.join(root,'fixtures/v22432/medium-max-anonymous-expected.json'),'utf8'));
const parentSource=execFileSync('git',['show','849e75ac78c55d5359efa16003783bbb8228c83b:releases/v2.24.3.1/chatgpt_chat_size_meter_v22431_effort_normalization.js'],{encoding:'utf8'});
const fields=['displayLikeTokens','activeBranchBytes','mappingBytes','retainedBytes','toolResultBytes','branchNodes','messageNodes','retainedShare','hot128','hot256','strongContextMarkers'];
const vector=(extra={})=>({sourceFamily:'batch',snapshotRole:'pre-dispatch',fullCapturedAt:900000,...Object.fromEntries(fields.map(k=>[k,expected[k]])),...extra});
const current=(effort='medium')=>({model,effort,canonical:vector({snapshotRole:'current'})});
const row=(id,effort='standard')=>({conversationId:'test-local-'+id,eventId:id,attemptId:id,outcome:'max',timestamp:950000+id,
 model,effort,identitySource:'generation request',confirmationSource:'structured SSE error',provenance:'v224-observed',canonical:vector()});
function prepare(h,ui='Medium'){
 const life=h.test.loadLifecycle('chat-a');life.families.batch.lastStable=vector();life.families.batch.lastObservation=vector();
 const snap=h.test.loadSnapshot('chat-a');snap.structure={contextTopology:{currentModel:model}};h.test.saveSnapshot('chat-a',snap);
 const query=h.document.querySelectorAll;h.document.querySelectorAll=s=>s==='button'?[{innerText:ui}]:query(s);return life;
}
function reproduce(source,raw='standard',ui='Medium',outcome='max'){
 const h=environment(source);prepare(h,ui);const a=h.start({model,reasoning_effort:raw});
 if(outcome==='max'){h.state.banners=[h.banner()];h.test.eventPollMax('chat-a');}else h.chunk(a,'data: [DONE]\n\n');
 return {h,a};
}
const store=h=>JSON.stringify([...h.storage]),cases=[],check=(name,fn)=>cases.push([name,fn]);
check('exact V2.24.3.1 reproduces Medium mismatch despite verified MAX and valid BATCH pre vector',async()=>{
 const {h,a}=reproduce(parentSource);assert.equal(a.effortHint,'Medium');assert.equal(a.requestEffort,'standard');assert.equal(a.requestCanonicalEffort,'standard');
 assert.equal(a.pre.batch.displayLikeTokens,840795);assert.equal(h.test.pressureResult('chat-a').canonicalEffort,'medium');assert.equal(h.test.pressureResult('chat-a').state,'current-max');
 assert.equal(h.test.pressureSummary().groupedByModelEffort[JSON.stringify([model,'standard'])].max,1);
 assert.equal(h.test.anonymousSampleForChat(),null);assert.equal(await h.test.copyAnonymousSample(),false);
});
for(const [input,output]of [['standard','medium'],['Medium','medium'],['medium','medium'],[' STANDARD ','medium'],['extended','high'],['High','high'],['max','max'],['Extra High','max']])
 check('canonical alias '+JSON.stringify(input)+' -> '+output,()=>assert.equal(environment().test.pressureEffort(input),output));
check('all unrelated labels and existing normalization match parent behavior',()=>{
 const old=environment(parentSource),h=environment();for(const x of ['low','minimal','none','thinking','xhigh','extra-high','future','standard-plus',null,undefined,0,{},'', '  ',' Extra   High ', 'HIGH','a'.repeat(200)])assert.equal(h.test.pressureEffort(x),old.test.pressureEffort(x));
});
check('request ingestion keeps raw standard and sets canonical medium separately',()=>{
 const {a}=reproduce();assert.equal(a.requestEffort,'standard');assert.equal(a.requestEffortDetected,'standard');assert.equal(a.requestCanonicalEffort,'medium');assert.equal(a.effortHint,'Medium');
});
check('Medium MAX matches standard request and copies exact supplied pre-MAX BATCH metrics',async()=>{
 const {h}=reproduce();assert.deepEqual(plain(h.test.anonymousSampleForChat()),expected);assert.equal(await h.test.copyAnonymousSample(),true);assert.deepEqual(JSON.parse(h.state.clipboard),expected);
});
check('new Medium MAX calibration rows persist and group as medium rather than standard',()=>{
 const {h}=reproduce();assert.equal(h.test.pressureLoad().samples[0].effort,'medium');
 const groups=plain(h.test.pressureSummary().groupedByModelEffort);assert.deepEqual(Object.keys(groups),[JSON.stringify([model,'medium'])]);
 const stored=h.test.eventStorageParse(h.storage.get('cgpt-size-meter-v2101:pressure-calibration-v224'));assert.equal(stored.samples[0].effort,'medium');
});
check('medium high and max remain separate canonical identities and exact local tiers',()=>{
 const h=environment();for(const [i,e]of ['standard','Medium','extended','High','max','Extra High'].entries())h.test.pressureUpsert(row(i+1,e));
 const groups=plain(h.test.pressureSummary().groupedByModelEffort);assert.equal(Object.keys(groups).length,3);
 for(const e of ['medium','high','max']){assert.equal(groups[JSON.stringify([model,e])].max,2);const p=h.test.pressureCompute(h.test.pressureLoad().samples,current(e),false);assert.equal(p.comparisonTier,'exact-model-effort');assert.equal(p.rawComparableMaxEpisodeCount,2);}
 assert.notEqual(h.test.pressureEffort('standard'),h.test.pressureEffort('extended'));assert.notEqual(h.test.pressureEffort('standard'),h.test.pressureEffort('max'));
});
function historical(){
 const old=environment(parentSource);old.test.pressureUpsert(row(1));old.test.pressureUpsert(row(2,'extended'));old.test.pressureUpsert(row(3,'max'));
 old.test.pressureLoad().migration.done=true;old.test.pressureSave('chat-a');const h=environment();for(const [k,v]of old.storage)h.storage.set(k,v);return h;
}
check('historical standard evaluates as medium without modifying stored or loaded raw rows',()=>{
 const h=historical(),before=store(h),rows=h.test.pressureLoad().samples;assert.equal(rows[0].effort,'standard');
 const p=h.test.pressureCompute(rows,current(),false);assert.equal(p.canonicalEffort,'medium');
 assert.deepEqual(plain(p),plain(h.test.pressureCompute(rows.map(s=>({...s,effort:h.test.pressureEffort(s.effort)})),current(),false)));
 assert.equal(p.textAxis.contributions.find(s=>s.conversationId==='test-local-1').canonicalEffort,'medium');
 const groups=h.test.pressureSummary().groupedByModelEffort;assert.equal(groups[JSON.stringify([model,'medium'])].max,1);assert(!groups[JSON.stringify([model,'standard'])]);assert.equal(store(h),before);
});
check('migration is idempotent and necessary append preserves unrelated historical raw rows',()=>{
 const h=historical(),before=store(h);h.test.pressureMigrate();h.test.pressureMigrate();assert.equal(store(h),before);
 const old=plain(h.test.pressureLoad().samples);h.test.pressureUpsert(row(4));h.test.pressureSave('chat-a');
 const stored=h.test.eventStorageParse(h.storage.get('cgpt-size-meter-v2101:pressure-calibration-v224'));assert.deepEqual(plain(stored.samples.slice(0,3)),old);assert.equal(stored.samples[3].effort,'medium');
});
check('persisted attempt with stale canonical standard exports by normalizing raw effort without writes',async()=>{
 const old=reproduce(parentSource).h,h=environment();for(const [k,v]of old.storage)h.storage.set(k,v);prepare(h);h.state.banners=[h.banner()];
 const before=store(h);assert.equal(await h.test.copyAnonymousSample(),true);assert.deepEqual(JSON.parse(h.state.clipboard),expected);assert.equal(store(h),before);
});
check('SUCCESS export for canonical medium high and max is identical apart from version',()=>{
 for(const [raw,ui]of [['medium','Medium'],['extended','High'],['max','Extra High']]){
  const a=plain(reproduce(parentSource,raw,ui,'success').h.test.anonymousSampleForChat()),b=plain(reproduce(undefined,raw,ui,'success').h.test.anonymousSampleForChat());assert(a && b);a.candidateVersion='2.24.3.2';assert.deepEqual(b,a);}
});
check('standard SUCCESS now matches medium and stays nonterminal without calibration',()=>{
 const {h}=reproduce(undefined,'standard','Medium','success'),s=h.test.anonymousSampleForChat();assert(s);assert.equal(s.canonicalEffort,'medium');assert.equal(s.outcome,'success');assert.equal(s.verifiedCurrentMax,false);assert.equal(s.snapshotRole,'success-pre');assert.equal(s.pressureState,'calibrating');
});
check('projection canonicalizes standard but final schema refuses raw aliases',()=>{
 const h=environment(),s=h.test.anonymousProjectSample({model,effort:'standard',outcome:'max',role:'pre-max',pressureState:'current-max'},vector());assert.deepEqual(plain(s),expected);assert.equal(h.test.anonymousSampleValid({...expected,canonicalEffort:'standard'}),false);
});
check('builder uses shared normalizer and keeps medium high max groups separate',()=>{
 const r=buildAnonymousSeeds(['standard','Medium','medium','extended','high','max','Extra High'].map(canonicalEffort=>({...expected,canonicalEffort})));
 assert.deepEqual(r.seeds.map(s=>s.canonicalEffort),['high','max','medium']);assert.equal(r.summaries.find(s=>s.canonicalEffort==='medium').maxInputSampleCount,3);
 assert(r.summaries.every(s=>s.contributingMaxVectors.every(v=>v.canonicalEffort===s.canonicalEffort)));
});
check('builder duplicate Medium aliases cannot manufacture independent observations',()=>{
 const r=buildAnonymousSeeds([{...expected,canonicalEffort:'standard'},expected],{groupKeys:['one','two']});assert.equal(r.seeds.length,1);assert.equal(r.seeds[0].profiles.length,1);assert.equal(r.summaries[0].declaredLogicalObservationCount,1);assert.equal(r.summaries[0].independenceVerified,false);
});
check('copy and normalization retain privacy exclusions and unchanged storage/counts',async()=>{
 const {h,a}=reproduce();Object.assign(a.pre.batch,{conversationId:'SECRET',timestamp:1,url:'https://secret.invalid',prompt:'SECRET',response:'SECRET',messageId:'SECRET'});
 const before=store(h),counts=JSON.stringify(h.test.pressureSummary());let writes=0;h.context.localStorage.setItem=()=>{writes++;throw Error('readonly');};
 assert.equal(await h.test.copyAnonymousSample(),true);assert.deepEqual(JSON.parse(h.state.clipboard),expected);assert.equal(writes,0);assert.equal(store(h),before);assert.equal(JSON.stringify(h.test.pressureSummary()),counts);
 assert(!/SECRET|chat-a|fullCapturedAt|requestCanonicalEffort|https:/.test(h.state.clipboard));
 for(const key of ['conversationId','timestamp','url','prompt','response','messageId','attemptId','episodeId','accountId','userId','assetId','filename','rawMapping']){
  assert.equal(h.test.anonymousPrivacyValid({safe:[{[key]:'SECRET'}]}),false);assert.equal(buildAnonymousSeeds([{...expected,canonicalEffort:'standard',[key]:'SECRET'}]).rejectedSampleCount,1);}
});
check('diagnostics preserve raw standard while canonical request pressure and summary show medium',()=>{
 const {h}=reproduce(),parts=h.test.eventDiagnostics('chat-a'),attempts=JSON.parse(parts[parts.indexOf('REAL ATTEMPTS')+1]),a=attempts.history.at(-1) || attempts.current;
 assert.equal(a.requestEffort,'standard');assert.equal(a.requestEffortDetected,'standard');assert.equal(a.requestCanonicalEffort,'medium');
 assert.equal(JSON.parse(parts[parts.indexOf('V2.24 PRESSURE CALIBRATION')+1]).canonicalEffort,'medium');
 assert.equal(JSON.parse(parts[parts.indexOf('CALIBRATION SAMPLE SUMMARY')+1]).groupedByModelEffort[JSON.stringify([model,'medium'])].max,1);
});
check('seed registry and pressure scores match parent for established canonical identities',()=>{
 const old=environment(parentSource),h=environment();for(const e of ['medium','high','max','Extra High','future',null])assert.deepEqual(plain(h.test.pressureCompute([],current(e),false)),plain(old.test.pressureCompute([],current(e),false)));
 assert.deepEqual(plain(h.test.pressureCompute([],current('standard'),false)),plain(old.test.pressureCompute([],current('medium'),false)));
 assert.equal(h.test.pressureSeed(model,'medium'),null);assert.equal(h.test.pressureSeed(model,'high'),null);assert.equal(h.test.pressureSeed(model,'max').profileCount,3);
 const bytes=execFileSync('git',['show','be93e49e6c69bf8bd87a7de8e830382afb71f810:src/v2242/anonymous-seed.js']);assert(fs.readFileSync(candidate).includes(bytes));
});
check('fresh medium standard and other unsupported settings remain calibrating without invented seeds',()=>{
 const h=environment();for(const e of ['medium','standard','high','extended','low','xhigh','future',null]){const p=h.test.pressureCompute([],current(e),false);assert.equal(p.state,'calibrating');assert.equal(p.seedProfileCount,0);}
});
check('structured SSE MAX accepts Medium while genuine high or max mismatch still refuses',()=>{
 const h=environment();prepare(h);const a=h.start({model,reasoning_effort:'standard'});h.chunk(a,'data: {"type":"error","error":{"code":"conversation_too_long"}}\n\n');assert.equal(a.outcome,'max');assert.deepEqual(plain(h.test.anonymousSampleForChat()),expected);
 for(const raw of ['extended','max'])assert.equal(reproduce(undefined,raw,'Medium').h.test.anonymousSampleForChat(),null);
});
check('runtime normalizer is the exact shared module used by offline builder',()=>{
 const h=environment(),text=fs.readFileSync(path.join(root,'src/v22432/canonical-effort.js'),'utf8');assert.equal(h.test.pressureEffort.toString(),text.trim());assert.equal(fs.readFileSync(candidate,'utf8').split(text).length,2);
});
check('candidate identity agrees in metadata anonymous copy health Retry and diagnostics',async()=>{
 const {h}=reproduce();assert.equal(h.test.anonymousSampleForChat().candidateVersion,'2.24.3.2');assert.equal(h.test.eventStorageHealth('chat-a').candidateVersion,'2.24.3.2');
 await h.test.retryCapture();assert.equal(h.test.loadDiagnostic('chat-a').lastRetry.version,'2.24.3.2');h.test.setLatest(h.test.calculateStats());await h.test.copyStats();assert(h.state.clipboard.startsWith('Candidate userscript: V2.24.3.2 MEDIUM EFFORT REPAIR'));
});
(async()=>{let passed=0;for(const [name,fn]of cases)try{await fn();console.log('PASS '+name);passed++;}catch(error){console.error('FAIL '+name+'\n'+error.stack);process.exitCode=1;}
 console.log(`${passed}/${cases.length} V2.24.3.2 Medium-normalization synthetic tests passed; native review pending`);})();
