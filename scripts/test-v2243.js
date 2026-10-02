// Actual candidate bytes, fake browser/clock. No native ChatGPT observations.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),{buildAnonymousSeeds}=require('./build-anonymous-seeds');
const root=path.resolve(__dirname,'..'),candidate=path.join(root,'releases/v2.24.3/chatgpt_chat_size_meter_v2243_anonymous_seed_builder.js');
const prefix=fs.readFileSync(path.join(__dirname,'test-v223.js'),'utf8').split('const cases=[];')[0];
const scope={require,process:{argv:['node','test',candidate]},__dirname,console,URL,TextEncoder,TextDecoder,ArrayBuffer,Request,Blob,AbortController,btoa,atob,Buffer};
vm.runInNewContext(prefix+'\nglobalThis.makeEnvironment=environment;',scope);
const environment=scope.makeEnvironment,plain=x=>JSON.parse(JSON.stringify(x)),model='gpt-5-6-thinking';
const vector=(extra={})=>({sourceFamily:'batch',snapshotRole:'pre-dispatch',fullCapturedAt:900000,displayLikeTokens:453725,
 activeBranchBytes:19686898,mappingBytes:20000000,branchNodes:4000,messageNodes:3999,retainedBytes:2000000,
 toolResultBytes:100000,retainedShare:0.1,hot128:100,hot256:200,strongContextMarkers:3,...extra});
const current=(identity={})=>({model,effort:'max',canonical:vector({...identity,snapshotRole:'current'})});
const row=(id,extra={})=>({conversationId:'local-'+id,eventId:id,attemptId:id,outcome:'max',timestamp:950000+id,
 model,effort:'max',identitySource:'generation request',confirmationSource:'structured SSE error',provenance:'v224-observed',canonical:vector(extra)});
const store=h=>JSON.stringify([...h.storage]),counts=h=>JSON.stringify(h.test.pressureSummary());
function prepare(h,extra={}){
 const life=h.test.loadLifecycle('chat-a');life.families.batch.lastStable=vector(extra);life.families.batch.lastObservation=vector(extra);
 const snap=h.test.loadSnapshot('chat-a');snap.structure={contextTopology:{currentModel:model}};h.test.saveSnapshot('chat-a',snap);
 return life;
}
function success(extra={}){const h=environment();prepare(h);const a=h.start({model,reasoning_effort:'max',...extra});h.chunk(a,'data: [DONE]\n\n');return h;}
function max(extra={}){const h=environment();prepare(h);h.start({model,reasoning_effort:'max',...extra});h.state.banners=[h.banner()];h.test.eventPollMax('chat-a');return h;}
const sample=(extra={})=>plain(environment().test.anonymousProjectSample({model,effort:'max',outcome:'max',role:'pre-max',pressureState:'current-max'},vector(extra)));
const cases=[],check=(name,fn)=>cases.push([name,fn]);
check('static seed is byte-identical to exact frozen parent and embedded unchanged',()=>{
 const seed=fs.readFileSync(path.join(root,'src/v2243/anonymous-seed.js'));
 assert.deepEqual(seed,execFileSync('git',['show','be93e49e6c69bf8bd87a7de8e830382afb71f810:src/v2242/anonymous-seed.js']));
 assert(fs.readFileSync(candidate,'utf8').includes(seed.toString()));
});
check('registry has only accepted exact immutable max entry and all three original pairs',()=>{
 const s={};vm.createContext(s);vm.runInContext(fs.readFileSync(path.join(root,'src/v2243/anonymous-seed.js'),'utf8')+'\n'+
  fs.readFileSync(path.join(root,'src/v2243/seed-registry.js'),'utf8')+'\nglobalThis.entries=ANONYMOUS_PRESSURE_SEEDS;',s);
 assert(Object.isFrozen(s.entries));assert.equal(s.entries.length,1);assert(Object.isFrozen(s.entries[0]));
 assert.deepEqual(plain(s.entries),[{model,canonicalEffort:'max',seedVersion:'v2242-anonymous-seed-1',profiles:[
  {displayLikeTokens:840795,activeBranchBytes:20075510},{displayLikeTokens:847977,activeBranchBytes:15645053},{displayLikeTokens:571836,activeBranchBytes:27151472}]}]);
});
check('exact supported registry lookup derives existing text and state frontiers',()=>{
 const seed=environment().test.pressureSeed(model,'max');assert.equal(seed.textFrontier,847977);assert.equal(seed.stateFrontier,27151472);assert.equal(seed.profileCount,3);
});
for(const effort of ['high','medium','low','instant','xhigh',null])check(effort+' has no seed and fresh pressure remains calibrating',()=>{
 const h=environment();assert.equal(h.test.pressureSeed(model,effort),null);
 assert.equal(h.test.pressureCompute([],{...current(),effort},false).state,'calibrating');assert.equal(h.storage.size,0);
});
check('unrelated and similar model IDs do not borrow a seed',()=>{
 const h=environment();for(const other of ['other-model','gpt-5-6-thinking-mini','GPT-5-6-thinking']){
  assert.equal(h.test.pressureSeed(other,'max'),null);assert.equal(h.test.pressureCompute([],{...current(),model:other},false).state,'calibrating');}
});
check('future entries can use the existing scorer lookup with no shipped synthetic profiles',()=>{
 const text=fs.readFileSync(path.join(root,'src/v2243/pressure-calibration.js'),'utf8');
 const lookup=text.slice(text.indexOf('function pressureSeed('),text.indexOf('function pressureSeedAxis(')),s={};vm.createContext(s);
 vm.runInContext('const ANONYMOUS_PRESSURE_SEEDS=[{model:"test-only-model",canonicalEffort:"high",seedVersion:"synthetic-test",profiles:[{displayLikeTokens:10,activeBranchBytes:20}]}];'+lookup+'globalThis.lookup=pressureSeed;',s);
 assert.equal(s.lookup('test-only-model','high').stateFrontier,20);assert.equal(s.lookup('test-only-model','medium'),null);
});
check('actual verified MAX exports complete numeric aggregates with pre-max provenance',()=>{
 const h=max(),s=h.test.anonymousSampleForChat();assert(s);assert.equal(s.outcome,'max');assert.equal(s.snapshotRole,'pre-max');
 assert.equal(s.verifiedCurrentMax,true);assert.equal(s.pressureState,'current-max');assert.equal(s.candidateVersion,'2.24.3');
 for(const k of ['displayLikeTokens','activeBranchBytes','mappingBytes','retainedBytes','toolResultBytes','branchNodes','messageNodes'])assert.equal(typeof s[k],'number',k);
});
check('actual confirmed SUCCESS exports full metrics with success-pre provenance',()=>{
 const h=success(),s=h.test.anonymousSampleForChat();assert(s);assert.equal(s.outcome,'success');assert.equal(s.snapshotRole,'success-pre');
 assert.equal(s.verifiedCurrentMax,false);assert.equal(s.pressureState,'scored');assert.equal(s.displayLikeTokens,453725);assert.equal(s.messageNodes,3999);
});
check('SUCCESS current role requires stable capture at or after success confirmation',()=>{
 const h=success(),life=h.test.loadLifecycle('chat-a');life.families.batch.lastStable=vector({fullCapturedAt:h.now()+1,displayLikeTokens:500000});
 const s=h.test.anonymousSampleForChat();assert.equal(s.snapshotRole,'current');assert.equal(s.displayLikeTokens,500000);
});
check('MAX prefers complete canonical BATCH pre vector over a newer DIRECT vector',()=>{
 const h=max(),a=h.test.loadAttemptState('chat-a').last || h.test.loadAttemptState('chat-a').current;
 a.pre.direct=vector({sourceFamily:'direct',fullCapturedAt:999999,displayLikeTokens:9999});
 const s=h.test.anonymousSampleForChat();assert.equal(s.sourceFamily,'batch');assert.equal(s.displayLikeTokens,453725);
});
check('MAX without pre uses accepted fresh post-MAX fallback with explicit role',()=>{
 const h=environment();prepare(h,{fullCapturedAt:0});h.start({model,reasoning_effort:'max'});h.state.banners=[h.banner()];h.test.eventPollMax('chat-a');
 const e=h.test.eventActiveEpisode('chat-a');e.batch=vector({fullCapturedAt:h.now()+1});
 const s=h.test.anonymousSampleForChat();assert(s);assert.equal(s.snapshotRole,'fallback');assert.equal(s.outcome,'max');
});
check('MAX last resort requires current capture after MAX and labels current-max',()=>{
 const h=environment();const life=prepare(h,{fullCapturedAt:0});h.start({model,reasoning_effort:'max'});h.state.banners=[h.banner()];h.test.eventPollMax('chat-a');
 life.families.batch.lastObservation=vector({fullCapturedAt:h.now()+1});
 const s=h.test.anonymousSampleForChat();assert(s);assert.equal(s.snapshotRole,'current-max');
});
check('MAX cannot reuse an old current or fallback capture',()=>{
 const h=environment();const life=prepare(h,{fullCapturedAt:0});h.start({model,reasoning_effort:'max'});h.state.banners=[h.banner()];h.test.eventPollMax('chat-a');
 life.families.batch.lastObservation=vector();h.test.eventActiveEpisode('chat-a').batch=vector();assert.equal(h.test.anonymousSampleForChat(),null);
});
check('linked MAX model or effort mismatch refuses export',()=>{
 const h=max();const query=h.document.querySelectorAll;h.document.querySelectorAll=s=>s==='button'?[{innerText:'High'}]:query(s);
 assert.equal(h.test.anonymousSampleForChat(),null);
});
check('no confirmed generation SUCCESS does not fabricate a healthy sample',async()=>{
 const h=environment();prepare(h);assert.equal(h.test.anonymousSampleForChat(),null);assert.equal(await h.test.copyAnonymousSample(),false);assert.equal(h.state.clipboard,null);
});
check('running attempt and failed latest attempt cannot borrow older SUCCESS',()=>{
 const h=success();h.start({model,reasoning_effort:'max'});assert.equal(h.test.anonymousSampleForChat(),null);
 const a=h.test.loadAttemptState('chat-a').current;a.outcome='error';a.outcomeConfirmedAt=h.now();a.outcomeConfirmedBy='HTTP generation failure';
 assert.equal(h.test.anonymousSampleForChat(),null);
});
check('untracked visible native MAX cannot be silently exported as SUCCESS',()=>{
 const h=success();h.state.banners=[h.banner()];assert.equal(h.test.anonymousSampleForChat(),null);
});
check('quoted MAX text remains normal SUCCESS through unchanged detector',()=>{
 const h=success();h.state.banners=[h.banner({turn:true})];assert.equal(h.test.anonymousSampleForChat().outcome,'success');
});
check('stale cleared MAX is not exported as current verified MAX',()=>{
 const h=max();h.state.banners=[];h.test.eventPollMax('chat-a');assert.equal(h.test.anonymousSampleForChat(),null);
});
check('zero unknown or invalid primary axes fail closed for anonymous calibration',()=>{
 const h=environment();for(const extra of [{activeBranchBytes:0},{activeBranchBytes:null},{displayLikeTokens:NaN},{mappingBytes:0},{branchNodes:0}]){
  assert.equal(h.test.anonymousProjectSample({model,effort:'max',outcome:'max',role:'pre-max',pressureState:'current-max'},vector(extra)),null);}
});
check('optional unknown secondary aggregates stay explicit null',()=>{
 const s=sample({retainedBytes:null,toolResultBytes:null,messageNodes:null});assert.equal(s.retainedBytes,null);assert.equal(s.toolResultBytes,null);assert.equal(s.messageNodes,null);
});
check('clipboard whitelist excludes IDs timestamps contents URLs file names and diagnostics',async()=>{
 const h=max(),a=h.test.loadAttemptState('chat-a').last || h.test.loadAttemptState('chat-a').current;
 Object.assign(a.pre.batch,{conversationId:'SECRETCHAT',messageId:'SECRETMSG',attemptId:88,episodeId:77,timestamp:123,
  title:'SECRET_TITLE',prompt:'SECRET_PROMPT',response:'SECRET_RESPONSE',url:'https://secret.invalid',filename:'SECRET.txt',rawMapping:{secret:1}});
 assert.equal(await h.test.copyAnonymousSample(),true);const s=JSON.parse(h.state.clipboard);assert(h.test.anonymousSampleValid(s));
 assert(h.state.clipboard.length<1500);assert(!/SECRET|https?:|chat-a|fullCapturedAt|conversationId|messageId|attemptId|episodeId|timestamp|prompt|response|filename|rawMapping/.test(h.state.clipboard));
 assert.deepEqual(Object.keys(s).sort(),['schemaVersion','candidateVersion','model','canonicalEffort','outcome','snapshotRole','sourceFamily',
  'displayLikeTokens','activeBranchBytes','mappingBytes','retainedBytes','toolResultBytes','branchNodes','messageNodes','retainedShare','hot128','hot256','strongContextMarkers','verifiedCurrentMax','pressureState'].sort());
});
check('recursive privacy validator refuses forbidden nested keys at array depths',()=>{
 const h=environment();for(const key of ['conversationId','message_id','attemptIds','episodeId','timestamp','fullCapturedAt','started_at','createdAt',
  'chatTitle','promptText','responseText','content','url','assetId','accountId','userId','fileName','screenshot','rawMapping','rawDiagnostics'])
  assert.equal(h.test.anonymousPrivacyValid({safe:[{nested:{[key]:'secret'}}]}),false,key);
 assert.equal(h.test.anonymousPrivacyValid({safe:[{count:2}]}),true);
});
check('privacy rejects URLs UUIDs timestamps cycles accessors symbols and excessive structure',()=>{
 const h=environment();for(const value of ['https://secret.invalid','www.secret.invalid','abc://secret','aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee','2026-10-01T12:00:00'])
  assert.equal(h.test.anonymousPrivacyValid({safe:value}),false);
 const cycle={};cycle.safe=cycle;assert.equal(h.test.anonymousPrivacyValid(cycle),false);
 const access={};Object.defineProperty(access,'safe',{get(){throw Error('must never execute');}});assert.equal(h.test.anonymousPrivacyValid(access),false);
 assert.equal(h.test.anonymousPrivacyValid({[Symbol('safe')]:1}),false);assert.equal(h.test.anonymousPrivacyValid({safe:new Array(2000).fill(1)}),false);
});
check('schema rejects unknown fields nonfinite metrics and outcome contradictions',()=>{
 const h=environment(),s=sample();for(const bad of [{...s,unknown:1},{...s,activeBranchBytes:Infinity},{...s,verifiedCurrentMax:false},
  {...s,outcome:'success'},{...s,canonicalEffort:'extra high'},{...s,canonicalEffort:' Max '},{...s,sourceFamily:'unknown'},{...s,snapshotRole:'pre-dispatch'}])assert.equal(h.test.anonymousSampleValid(bad),false);
});
check('repeated manual export cannot write storage or change local calibration counts',async()=>{
 const h=max(),before=store(h),count=counts(h);let writes=0,removes=0;
 h.context.localStorage.setItem=()=>{writes++;throw Error('readonly');};h.context.localStorage.removeItem=()=>{removes++;throw Error('readonly');};
 for(let i=0;i<10;i++)assert.equal(await h.test.copyAnonymousSample(),true);
 assert.equal(writes,0);assert.equal(removes,0);assert.equal(store(h),before);assert.equal(counts(h),count);
});
check('persisted export path cannot finalize pending attempts or migrate storage',async()=>{
 const h=success(),next=environment();for(const [k,v]of h.storage)next.storage.set(k,v);const before=store(next);
 assert.equal(await next.test.copyAnonymousSample(),true);assert.equal(store(next),before);
 const running=environment();prepare(running);running.start({model,reasoning_effort:'max'});
 const restarted=environment();for(const [k,v]of running.storage)restarted.storage.set(k,v);const original=store(restarted);
 assert.equal(restarted.test.anonymousSampleForChat(),null);assert.equal(store(restarted),original);
});
check('clipboard denial and navigation refusal leave calibration and storage unchanged',async()=>{
 const h=success(),before=store(h);h.context.navigator.clipboard.writeText=async()=>{throw Error('denied');};
 assert.equal(await h.test.copyAnonymousSample(),false);assert.equal(store(h),before);h.navigate('other');assert.equal(h.test.anonymousSampleForChat('chat-a'),null);
});
check('anonymous action binds separate runner and keeps collapsed controls unchanged',async()=>{
 const h=success(),handlers={},node=()=>({textContent:'',setAttribute(){},addEventListener(){},classList:{add(){},remove(){}}});
 const buttons={anon:node(),copy:node(),retry:node()},status=node(),hdr=node();
 h.test.setQuickUI({querySelector:s=>s==='[data-quick-status]'?status:buttons[s.match(/data-action="(\w+)"/)?.[1]] || hdr,
  addEventListener:(name,fn)=>handlers[name]=fn});h.test.bindUI();
 const before=store(h);await handlers.click({target:{closest:()=>({dataset:{action:'anon'}})},stopPropagation(){},preventDefault(){}});
 assert(h.state.clipboard);assert.equal(h.test.quick().anon.label,'Copied ✓');assert.equal(h.test.quick().copy.label,'Copy diagnostics');assert.equal(store(h),before);
 assert.match(h.test.quickActionsMarkup(),/data-action="anon"/);
});
check('anonymous action coalesces concurrent copies and resets only its own label',async()=>{
 const h=success();let resolve,n=0;h.context.navigator.clipboard.writeText=()=>{n++;return new Promise(r=>resolve=r);};
 const first=h.test.runAnonymousCopy();assert.equal(await h.test.runAnonymousCopy(),false);assert.equal(n,1);resolve();assert.equal(await first,true);
 await h.advance(2200);assert.equal(h.test.quick().anon.label,'Copy anon sample');assert.equal(h.test.quick().retry.label,'Retry capture');
});
check('seed-only score current MAX and seed-plus-local scores remain exact parent behavior',()=>{
 const h=environment(),c=current();assert.equal(h.test.pressureCompute([],c,false).score,73);
 const r=h.test.pressureCompute([row(1,{displayLikeTokens:1000000})],c,false);assert.equal(r.effectiveTextFrontier,1000000);assert.equal(r.effectiveStateFrontier,27151472);assert.equal(r.calibrationSource,'seed+local');
 const max=h.test.pressureCompute([],c,true);assert.equal(max.state,'current-max');assert.equal(h.test.pressureText(max),'PRESSURE MAX');
});
check('builder groups only exact model plus canonical effort and ignores success for MAX frontier',()=>{
 const a=sample(),b={...a,canonicalEffort:'high'},c={...a,model:'other-exact-model'},d={...a,outcome:'success',snapshotRole:'success-pre',verifiedCurrentMax:false,pressureState:'scored',displayLikeTokens:9999999};
 const r=buildAnonymousSeeds([a,b,c,d]);assert.equal(r.seeds.length,3);assert.equal(r.summaries.find(s=>s.model===model && s.canonicalEffort==='max').textFrontier,453725);
 assert.equal(r.summaries.find(s=>s.canonicalEffort==='max' && s.model===model).successSampleCount,1);
});
check('builder retains heterogeneous vectors including different vectors within one observation',()=>{
 const a=sample(),b=sample({displayLikeTokens:600000,activeBranchBytes:10000000});
 const r=buildAnonymousSeeds([a,b],{groupKeys:['obs-a','obs-a']});assert.equal(r.seeds[0].profiles.length,2);assert.equal(r.summaries[0].declaredLogicalObservationCount,1);
 assert.equal(r.summaries[0].textFrontier,600000);assert.equal(r.summaries[0].stateFrontier,19686898);
});
check('duplicate vectors never manufacture independent observations even with different labels',()=>{
 const a=sample();for(const groupKeys of [[],['one','one','one'],['one','two','three']]){
  const r=buildAnonymousSeeds([a,a,a],{groupKeys});assert.equal(r.seeds[0].profiles.length,1);assert.equal(r.summaries[0].independenceVerified,false);
  assert.equal(r.summaries[0].declaredLogicalObservationCount,groupKeys.length?1:null);assert.equal(r.summaries[0].maxInputSampleCount,3);}
});
check('secondary MAX heterogeneity is retained without new scoring profiles or independence',()=>{
 const a=sample(),b=sample({retainedBytes:5000000,sourceFamily:'direct'});
 const r=buildAnonymousSeeds([a,b],{groupKeys:['one','two']});assert.equal(r.seeds[0].profiles.length,1);
 assert.equal(r.summaries[0].contributingMaxVectors.length,2);assert.equal(r.summaries[0].declaredLogicalObservationCount,1);
 assert.equal(r.summaries[0].contributingMaxVectors.find(s=>s.sourceFamily==='direct').retainedBytes,5000000);
 assert(environment().test.anonymousPrivacyValid(r.summaries[0].contributingMaxVectors));
});
check('overlapping observation labels merge transitively without losing heterogeneous vectors',()=>{
 const a=sample(),b=sample({displayLikeTokens:500000}),c=sample({displayLikeTokens:600000});
 const r=buildAnonymousSeeds([a,b,b,c],{groupKeys:['one','one','two','two']});assert.equal(r.summaries[0].declaredLogicalObservationCount,1);assert.equal(r.seeds[0].profiles.length,3);
});
check('builder scalar frontiers and ordered retained vectors are deterministic under permutation',()=>{
 const samples=[sample(),sample({displayLikeTokens:600000,activeBranchBytes:10000000}),sample({displayLikeTokens:1000,activeBranchBytes:30000000})];
 assert.deepEqual(buildAnonymousSeeds(samples),buildAnonymousSeeds(samples.toReversed()));assert.equal(buildAnonymousSeeds(samples).summaries[0].textFrontier,600000);assert.equal(buildAnonymousSeeds(samples).summaries[0].stateFrontier,30000000);
});
check('success-only groups bracket diagnostics but produce no seed entries',()=>{
 const a={...sample(),outcome:'success',snapshotRole:'current',verifiedCurrentMax:false,pressureState:'scored'};
 const r=buildAnonymousSeeds([a]);assert.equal(r.seeds.length,0);assert.equal(r.summaries[0].textFrontier,null);assert.equal(r.summaries[0].successTextRange.max,453725);
});
check('builder rejects private malformed and contradictory samples without echoing raw inputs',()=>{
 const a=sample(),r=buildAnonymousSeeds([{...a,conversationId:'SECRET'}, {...a,activeBranchBytes:-1}, {...a,verifiedCurrentMax:false},a],{groupKeys:[null,null,null,'obs-safe']});
 assert.equal(r.rejectedSampleCount,3);assert.equal(r.seeds.length,1);assert(!JSON.stringify(r).includes('SECRET'));assert(!JSON.stringify(r).includes('obs-safe'));
});
check('builder CLI only returns anonymous candidates and never auto-admits them',()=>{
 const output=execFileSync(process.execPath,[path.join(__dirname,'build-anonymous-seeds.js')],{input:JSON.stringify([sample()]),encoding:'utf8'});
 assert.equal(JSON.parse(output).seeds.length,1);assert(!output.includes('conversationId'));assert(!fs.readFileSync(candidate,'utf8').includes('function buildAnonymousSeeds('));
});
(async()=>{let passed=0;for(const [name,fn]of cases){try{await fn();console.log('PASS '+name);passed++;}catch(error){console.error('FAIL '+name+'\n'+error.stack);process.exitCode=1;}}
 console.log(`${passed}/${cases.length} V2.24.3 registry/export/builder synthetic tests passed; native review pending`);})();
