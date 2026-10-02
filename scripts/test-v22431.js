// USER-REPORTED native vector, reproduced in a synthetic VM. No live server.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),{buildAnonymousSeeds}=require('./build-anonymous-seeds-v22431');
const root=path.resolve(__dirname,'..'),candidate=path.join(root,'releases/v2.24.3.1/chatgpt_chat_size_meter_v22431_effort_normalization.js');
const prefix=fs.readFileSync(path.join(__dirname,'test-v223.js'),'utf8').split('const cases=[];')[0];
const scope={require,process:{argv:['node','test',candidate]},__dirname,console,URL,TextEncoder,TextDecoder,ArrayBuffer,Request,Blob,AbortController,btoa,atob,Buffer};
vm.runInNewContext(prefix+'\nglobalThis.makeEnvironment=environment;',scope);
const environment=scope.makeEnvironment,plain=x=>JSON.parse(JSON.stringify(x)),model='gpt-5-6-thinking';
const expected=JSON.parse(fs.readFileSync(path.join(root,'fixtures/v22431/high-max-anonymous-expected.json'),'utf8'));
const parentSource=execFileSync('git',['show','913458c7be3a07a2cdadb73736170d591500a52c:releases/v2.24.3/chatgpt_chat_size_meter_v2243_anonymous_seed_builder.js'],{encoding:'utf8'});
const fields=['displayLikeTokens','activeBranchBytes','mappingBytes','retainedBytes','toolResultBytes','branchNodes','messageNodes','retainedShare','hot128','hot256','strongContextMarkers'];
const vector=(extra={})=>({sourceFamily:'batch',snapshotRole:'pre-dispatch',fullCapturedAt:900000,...Object.fromEntries(fields.map(k=>[k,expected[k]])),...extra});
const current=(effort='high')=>({model,effort,canonical:vector({snapshotRole:'current'})});
const row=(id,effort='extended',extra={})=>({conversationId:'test-local-'+id,eventId:id,attemptId:id,outcome:'max',timestamp:950000+id,
 model,effort,identitySource:'generation request',confirmationSource:'structured SSE error',provenance:'v224-observed',canonical:vector(),...extra});
function prepare(h,ui='High'){
 const life=h.test.loadLifecycle('chat-a');life.families.batch.lastStable=vector();life.families.batch.lastObservation=vector();
 const snap=h.test.loadSnapshot('chat-a');snap.structure={contextTopology:{currentModel:model}};h.test.saveSnapshot('chat-a',snap);
 const query=h.document.querySelectorAll;h.document.querySelectorAll=s=>s==='button'?[{innerText:ui}]:query(s);return life;
}
function reproduce(source,raw='extended',ui='High',outcome='max'){
 const h=environment(source);prepare(h,ui);const a=h.start({model,reasoning_effort:raw});
 if(outcome==='max'){h.state.banners=[h.banner()];h.test.eventPollMax('chat-a');}
 else h.chunk(a,'data: [DONE]\n\n');
 return {h,a};
}
const store=h=>JSON.stringify([...h.storage]),cases=[],check=(name,fn)=>cases.push([name,fn]);
check('exact parent reproduces reported cause: High UI versus extended request rejects valid MAX pre vector',async()=>{
 const {h,a}=reproduce(parentSource);assert.equal(h.test.pressureEffort('extended'),'extended');assert.equal(a.effortHint,'High');
 assert.equal(a.requestEffort,'extended');assert.equal(a.requestEffortDetected,'extended');assert.equal(a.pre.batch.displayLikeTokens,840795);
 assert.equal(h.test.pressureResult('chat-a').canonicalEffort,'high');assert.equal(h.test.pressureResult('chat-a').state,'current-max');
 assert.equal(h.test.pressureSummary().groupedByModelEffort[JSON.stringify([model,'extended'])].max,1);
 assert.equal(h.test.anonymousSampleForChat(),null);assert.equal(await h.test.copyAnonymousSample(),false);
});
for(const [input,output]of [['extended','high'],['High','high'],['high','high'],['max','max'],['Extra High','max'],[' MAX ','max'],[' EXTRA   HIGH ','max'],[' EXTENDED ','high']])
 check('authoritative effort alias '+JSON.stringify(input)+' resolves to '+output,()=>assert.equal(environment().test.pressureEffort(input),output));
check('every previously supported effort label preserves parent normalization except the evidenced new alias',()=>{
 const old=environment(parentSource),fresh=environment();for(const x of ['medium','low','minimal','none','thinking','xhigh','extra-high','future',null,undefined,0,{},'', '  ','Max',' Extra High ', 'HIGH','a'.repeat(200)])
  assert.equal(fresh.test.pressureEffort(x),old.test.pressureEffort(x));
});
check('ingestion preserves raw effort and detected provenance and adds canonical effort separately',()=>{
 const {h,a}=reproduce();assert.equal(a.requestEffort,'extended');assert.equal(a.requestEffortDetected,'extended');
 assert.equal(a.effortHint,'High');assert.equal(a.requestCanonicalEffort,'high');
 const raw=h.test.attemptRequestMeta('/backend-api/f/conversation','POST',JSON.stringify({reasoning_effort:'extended'}));assert.equal(raw.requestEffort,'extended');
});
check('raw extended MAX matches current canonical high and exports exact reported pre-MAX BATCH vector',async()=>{
 const {h}=reproduce();assert.deepEqual(plain(h.test.anonymousSampleForChat()),expected);
 assert.equal(await h.test.copyAnonymousSample(),true);assert.deepEqual(JSON.parse(h.state.clipboard),expected);
});
check('new local High MAX rows and summary groups are stored as high rather than extended',()=>{
 const {h}=reproduce(),rows=h.test.pressureLoad().samples;assert.equal(rows.length,1);assert.equal(rows[0].effort,'high');
 const groups=plain(h.test.pressureSummary().groupedByModelEffort);assert.deepEqual(Object.keys(groups),[JSON.stringify([model,'high'])]);
 const stored=h.test.eventStorageParse(h.storage.get('cgpt-size-meter-v2101:pressure-calibration-v224'));assert.equal(stored.samples[0].effort,'high');
});
check('local High and max identities stay separate including raw extended history',()=>{
 const h=environment();for(const r of [row(1),row(2,'High'),row(3,'max'),row(4,'Extra High')])h.test.pressureUpsert(r);
 const groups=plain(h.test.pressureSummary().groupedByModelEffort);assert.equal(groups[JSON.stringify([model,'high'])].max,2);assert.equal(groups[JSON.stringify([model,'max'])].max,2);
 assert.equal(Object.keys(groups).length,2);assert.notEqual(h.test.pressureEffort('extended'),h.test.pressureEffort('max'));
 const r=h.test.pressureCompute(h.test.pressureLoad().samples,current(),false);assert.equal(r.comparisonTier,'exact-model-effort');assert.equal(r.rawComparableMaxEpisodeCount,2);assert.equal(r.seedProfileCount,0);
});
function historical(){
 const old=environment(parentSource);old.test.pressureUpsert(row(1));old.test.pressureUpsert(row(2,'max'));
 old.test.pressureLoad().migration.done=true;old.test.pressureSave('chat-a');const h=environment();for(const [k,v]of old.storage)h.storage.set(k,v);return h;
}
check('historical extended rows normalize for read evaluation without rewriting raw rows or stored bytes',()=>{
 const h=historical(),before=store(h),rows=h.test.pressureLoad().samples;assert.equal(rows[0].effort,'extended');
 const r=h.test.pressureCompute(rows,current(),false);assert.equal(r.canonicalEffort,'high');
 // Preserve the inherited sparse same-model tier; canonical setting groups
 // stay distinct even when that explicitly labelled tier pools local evidence.
 assert.deepEqual(plain(r),plain(h.test.pressureCompute(rows.map(s=>({...s,effort:h.test.pressureEffort(s.effort)})),current(),false)));
 assert.equal(r.textAxis.contributions.find(s=>s.conversationId==='test-local-1').canonicalEffort,'high');
 const groups=h.test.pressureSummary().groupedByModelEffort;assert.equal(groups[JSON.stringify([model,'high'])].max,1);assert(!groups[JSON.stringify([model,'extended'])]);assert.equal(store(h),before);
});
check('historical data needs no destructive migration and repeated migration is idempotent',()=>{
 const h=historical(),before=store(h);h.test.pressureMigrate();h.test.pressureMigrate();assert.equal(store(h),before);
 assert.equal(h.test.pressureLoad().samples[0].effort,'extended');assert.equal(h.test.pressureLoad().samples[1].effort,'max');
});
check('necessary append preserves historical extended provenance while adding canonical high event',()=>{
 const h=historical(),first=plain(h.test.pressureLoad().samples[0]);h.test.pressureUpsert(row(3));h.test.pressureSave('chat-a');
 const stored=h.test.eventStorageParse(h.storage.get('cgpt-size-meter-v2101:pressure-calibration-v224'));
 assert.deepEqual(plain(stored.samples[0]),first);assert.equal(stored.samples[2].effort,'high');
});
check('historical attempt lacking canonical metadata still yields High MAX without writes on export',async()=>{
 const old=reproduce(parentSource).h,h=environment();for(const [k,v]of old.storage)h.storage.set(k,v);prepare(h);h.state.banners=[h.banner()];
 const before=store(h);assert.equal(await h.test.copyAnonymousSample(),true);assert.deepEqual(JSON.parse(h.state.clipboard),expected);assert.equal(store(h),before);
});
check('confirmed High SUCCESS with extended backend label becomes eligible and remains non-MAX',()=>{
 const {h}=reproduce(undefined,'extended','High','success'),s=h.test.anonymousSampleForChat();assert(s);assert.equal(s.outcome,'success');
 assert.equal(s.snapshotRole,'success-pre');assert.equal(s.canonicalEffort,'high');assert.equal(s.verifiedCurrentMax,false);assert.equal(s.pressureState,'calibrating');
});
check('supported max SUCCESS export is otherwise identical to parent including all metric fields',()=>{
 const old=reproduce(parentSource,'max','Extra High','success').h,newer=reproduce(undefined,'max','Extra High','success').h;
 const a=plain(old.test.anonymousSampleForChat()),b=plain(newer.test.anonymousSampleForChat());assert(a && b);a.candidateVersion='2.24.3.1';assert.deepEqual(b,a);
});
check('canonical export projection normalizes aliases but validation requires canonical exported identity',()=>{
 const h=environment();for(const [raw,effort]of [['extended','high'],['High','high'],['Extra High','max'],['max','max']]){
  const s=h.test.anonymousProjectSample({model,effort:raw,outcome:'max',role:'pre-max',pressureState:'current-max'},vector());assert.equal(s.canonicalEffort,effort);}
 assert.equal(h.test.anonymousSampleValid({...expected,canonicalEffort:'extended'}),false);
 assert.equal(h.test.anonymousSampleValid({...expected,candidateVersion:'2.24.3.1'}),true);assert.equal(h.test.anonymousSampleValid({...expected,candidateVersion:'2.24.3.1.1'}),false);
});
check('builder canonicalizes backend UI and canonical labels using the identical authoritative normalizer',()=>{
 const inputs=['extended','High','high','max','Extra High'].map(canonicalEffort=>({...expected,canonicalEffort}));
 const r=buildAnonymousSeeds(inputs);assert.equal(r.seeds.length,2);assert.deepEqual(r.seeds.map(s=>s.canonicalEffort),['high','max']);
 assert.equal(r.summaries.find(s=>s.canonicalEffort==='high').maxInputSampleCount,3);assert.equal(r.summaries.find(s=>s.canonicalEffort==='max').maxInputSampleCount,2);
 assert(r.summaries.every(s=>s.contributingMaxVectors.every(v=>v.canonicalEffort===s.canonicalEffort)));
});
check('builder normalized duplicate vectors do not create independence and SUCCESS is diagnostic only',()=>{
 const r=buildAnonymousSeeds([{...expected,canonicalEffort:'extended'},expected,{...expected,canonicalEffort:'High',outcome:'success',snapshotRole:'success-pre',verifiedCurrentMax:false,pressureState:'calibrating'}],{groupKeys:['one','two','three']});
 assert.equal(r.seeds.length,1);assert.equal(r.seeds[0].profiles.length,1);assert.equal(r.summaries[0].declaredLogicalObservationCount,1);assert.equal(r.summaries[0].successSampleCount,1);
});
check('normalization cannot scrub away private input fields or weaken recursive validator refusal',()=>{
 const h=environment();for(const name of ['conversationId','timestamp','url','prompt','response','messageId','attemptId','episodeId','accountId','userId','assetId','filename','rawMapping']){
  assert.equal(h.test.anonymousPrivacyValid({safe:[{[name]:'SECRET'}]}),false);
  const r=buildAnonymousSeeds([{...expected,canonicalEffort:'extended',[name]:'SECRET'}]);assert.equal(r.rejectedSampleCount,1);assert.equal(r.seeds.length,0);assert(!JSON.stringify(r).includes('SECRET'));
 }
});
check('copy is read-only with unchanged counts keys and private-source exclusions',async()=>{
 const {h,a}=reproduce();a.pre.batch.prompt='SECRET';a.pre.batch.url='https://secret.invalid';a.pre.batch.messageId='SECRET';
 const before=store(h),counts=JSON.stringify(h.test.pressureSummary());let writes=0;h.context.localStorage.setItem=()=>{writes++;throw Error('must not write');};
 for(let i=0;i<3;i++)assert.equal(await h.test.copyAnonymousSample(),true);assert.equal(writes,0);assert.equal(store(h),before);assert.equal(JSON.stringify(h.test.pressureSummary()),counts);
 assert.deepEqual(JSON.parse(h.state.clipboard),expected);assert(!/SECRET|chat-a|fullCapturedAt|requestCanonicalEffort|https:/.test(h.state.clipboard));
});
check('pressure diagnostics show canonical high while real attempt diagnostics keep raw extended and canonical field',()=>{
 const {h}=reproduce(),parts=h.test.eventDiagnostics('chat-a');const attempts=JSON.parse(parts[parts.indexOf('REAL ATTEMPTS')+1]);
 const a=attempts.history.at(-1) || attempts.current;assert.equal(a.requestEffort,'extended');assert.equal(a.requestEffortDetected,'extended');assert.equal(a.requestCanonicalEffort,'high');
 const p=JSON.parse(parts[parts.indexOf('V2.24 PRESSURE CALIBRATION')+1]);assert.equal(p.canonicalEffort,'high');
 const summary=JSON.parse(parts[parts.indexOf('CALIBRATION SAMPLE SUMMARY')+1]);assert.equal(summary.groupedByModelEffort[JSON.stringify([model,'high'])].max,1);
});
check('registry keeps only max and immutable V2.24.2 seed source/value bytes remain exact',()=>{
 const h=environment();assert.equal(h.test.pressureSeed(model,'high'),null);assert.equal(h.test.pressureSeed(model,'medium'),null);
 const seed=h.test.pressureSeed(model,h.test.pressureEffort('Extra High'));assert.equal(seed.textFrontier,847977);assert.equal(seed.stateFrontier,27151472);assert.equal(seed.profileCount,3);
 const bytes=execFileSync('git',['show','be93e49e6c69bf8bd87a7de8e830382afb71f810:src/v2242/anonymous-seed.js']);assert(fs.readFileSync(candidate).includes(bytes));
});
check('unsupported and fresh High/extended pressure still calibrate without local anchors or a new seed',()=>{
 const h=environment();for(const effort of ['high','extended','medium','xhigh','extra-high','future',null]){
  const r=h.test.pressureCompute([],current(effort),false);assert.equal(r.state,'calibrating');assert.equal(r.seedProfileCount,0);}
});
check('High UI with true max backend remains mismatched and never aliases max to high',()=>{
 const {h}=reproduce(undefined,'max','High');assert.equal(h.test.anonymousSampleForChat(),null);assert.equal(h.test.pressureLoad().samples[0].effort,'max');
});
check('structured SSE MAX uses identical canonical match without changing native detection',()=>{
 const h=environment();prepare(h);const a=h.start({model,reasoning_effort:'extended'});h.chunk(a,'data: {"type":"error","error":{"code":"conversation_too_long"}}\n\n');
 assert.equal(a.outcome,'max');assert.equal(h.test.eventActiveEpisode('chat-a').confirmationSource,'structured SSE error');assert.deepEqual(plain(h.test.anonymousSampleForChat()),expected);
});
check('four-part release identity is consistent in health Retry and copy diagnostics',async()=>{
 const {h}=reproduce();assert.equal(h.test.eventStorageHealth('chat-a').candidateVersion,'2.24.3.1');
 await h.test.retryCapture();assert.equal(h.test.loadDiagnostic('chat-a').lastRetry.version,'2.24.3.1');
 h.test.setLatest(h.test.calculateStats());await h.test.copyStats();assert(h.state.clipboard.startsWith('Candidate userscript: V2.24.3.1 CANONICAL EFFORT REPAIR'));
});
(async()=>{let passed=0;for(const [name,fn]of cases)try{await fn();console.log('PASS '+name);passed++;}catch(error){console.error('FAIL '+name+'\n'+error.stack);process.exitCode=1;}
 console.log(`${passed}/${cases.length} V2.24.3.1 effort-normalization synthetic tests passed; native review pending`);})();
