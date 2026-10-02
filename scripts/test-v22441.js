// Exact parent failure and production identity repair in a synthetic VM only.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),root=path.resolve(__dirname,'..');
const candidate=path.join(root,'releases/v2.24.4.1/chatgpt_chat_size_meter_v22441_current_model_identity.js');
const source=fs.readFileSync(candidate,'utf8'),parent='904798397da384c1eee4190035647a22b521464f';
const original=execFileSync('git',['show',parent+':releases/v2.24.4/chatgpt_chat_size_meter_v2244_multi_effort_seeds.js'],{encoding:'utf8'});
const prefix=fs.readFileSync(path.join(__dirname,'test-v223.js'),'utf8').split('const cases=[];')[0];
const scope={require,process:{argv:['node','test',candidate]},__dirname,console,URL,TextEncoder,TextDecoder,ArrayBuffer,Request,Blob,AbortController,btoa,atob,Buffer};
vm.runInNewContext(prefix+'\nglobalThis.makeEnvironment=environment;',scope);
const environment=scope.makeEnvironment,plain=x=>JSON.parse(JSON.stringify(x)),model='gpt-5-6-thinking',unsupported='gpt-5-5-instant';
const expected=JSON.parse(fs.readFileSync(path.join(root,'fixtures/v22441/current-pressure-expected.json'),'utf8'));
const metrics=JSON.parse(fs.readFileSync(path.join(root,'fixtures/v2244/anonymous-registry-expected.json'),'utf8'))[0].profiles[0];
const vector=extra=>({sourceFamily:'batch',snapshotRole:'current',fullCapturedAt:900000,...metrics,...extra});
const storage=h=>JSON.stringify([...h.storage]),cases=[],check=(name,fn)=>cases.push([name,fn]);
function prepare(h,effort=null,id='chat-a'){
 const life=h.test.loadLifecycle(id);life.families.batch.lastStable=vector();life.families.batch.lastObservation=vector();h.test.saveLifecycle(id,life);
 const snap=h.test.loadSnapshot(id);snap.structure={contextTopology:{currentModel:model}};snap.fullCapturedAt=900000;h.test.saveSnapshot(id,snap);
 const query=h.document.querySelectorAll;h.document.querySelectorAll=q=>q==='button' && effort?[{innerText:effort}]:query(q);
 return {snapshot:snap,life};
}
function success(h,requestModel=unsupported,effort=null,id='chat-a'){
 h.navigate(id);const a=h.start({model:requestModel,reasoning_effort:effort,conversation_id:id});h.chunk(a,'data: [DONE]\n\n');return a;
}
function reload(h,bytes=source){const next=environment(bytes);for(const [k,v]of h.storage)next.storage.set(k,v);return next;}
function noSeed(p){assert.equal(p.state,'calibrating');for(const k of ['seedProfileCount','seedMaxProfileCount'])assert.equal(p[k],0);
 for(const k of ['seedModel','seedCanonicalEffort','seedTextFrontier','seedStateFrontier'])assert.equal(p[k],null);}
check('exact parent reproduces completed and refreshed stale current model despite correct SUCCESS storage',()=>{
 const h=environment(original);prepare(h);const a=success(h);assert.equal(a.requestModel,unsupported);assert.equal(a.requestEffort,null);assert.equal(a.requestCanonicalEffort,null);
 assert.equal(h.test.pressureSummary().groupedByModelEffort[JSON.stringify([unsupported,null])].success,1);
 assert.equal(h.test.pressureResult('chat-a').model,model);const r=reload(h,original).test.pressureResult('chat-a');assert.equal(r.model,model);assert.equal(r.effort,null);assert.equal(r.canonicalEffort,null);
});
check('completed latest parsed request overrides stale snapshot and matches exact native expected pressure fields',()=>{
 const h=environment();prepare(h);success(h);const p=h.test.pressureResult('chat-a');
 for(const [k,v]of Object.entries(expected))assert.deepEqual(plain(p[k]),v,k);noSeed(p);
 assert.match(h.test.pressureCurrent('chat-a').identitySource,/latest parsed current-chat generation request model/);
 assert.deepEqual(plain(p.currentSourceVector),vector());
});
check('successful request survives refresh with corrected unsupported null-effort current identity',()=>{
 const h=environment();prepare(h);success(h);const next=reload(h),before=storage(next),p=next.test.pressureResult('chat-a');
 for(const [k,v]of Object.entries(expected))assert.deepEqual(plain(p[k]),v,k);noSeed(p);assert.equal(storage(next),before);
 assert.equal(next.test.pressureSummary().groupedByModelEffort[JSON.stringify([unsupported,null])].success,1);
});
check('identity evaluation leaves static model metrics and persisted snapshot byte-identical',()=>{
 const h=environment();const {snapshot,life}=prepare(h);success(h);const snap=JSON.stringify(snapshot),oldLife=JSON.stringify(life),before=storage(h);
 h.test.pressureCurrent('chat-a');h.test.pressureResult('chat-a');assert.equal(JSON.stringify(snapshot),snap);assert.equal(JSON.stringify(life),oldLife);assert.equal(storage(h),before);
 assert.equal(snapshot.structure.contextTopology.currentModel,model);
});
check('identity evaluation never rewrites historical request model effort or raw provenance',()=>{
 const h=environment();prepare(h);success(h,model,'max');h.setNow(h.now()+100);success(h,unsupported,'extended');
 const store=h.test.loadAttemptState('chat-a'),before=JSON.stringify(store),saved=storage(h);
 for(let i=0;i<10;i++){h.test.pressureCurrent('chat-a');h.test.pressureResult('chat-a');}
 assert.equal(JSON.stringify(store),before);assert.equal(storage(h),saved);assert.equal(store.attempts[0].requestModel,model);assert.equal(store.attempts[1].requestModel,unsupported);
 assert.equal(store.attempts[1].requestEffort,'extended');assert.equal(store.attempts[1].requestCanonicalEffort,'high');
});
check('another conversation latest real request cannot override current chat identity',()=>{
 const h=environment();prepare(h,'High');success(h,model,'extended');h.setNow(h.now()+100);prepare(h,null,'chat-b');success(h,unsupported,null,'chat-b');h.navigate('chat-a');
 const p=h.test.pressureResult('chat-a');assert.equal(p.model,model);assert.equal(p.seedCanonicalEffort,'high');assert.equal(p.seedProfileCount,3);
});
check('foreign current last and archived records in current store cannot supply model or effort',()=>{
 const h=environment();prepare(h,'Medium');const foreign={id:999,conversationId:'chat-b',requestConversationId:'chat-b',trigger:'network-generation-dispatch',requestParsed:true,requestModel:unsupported,requestEffort:'extended',requestDetectedAt:2000000};
 const store=h.test.loadAttemptState('chat-a');store.current=foreign;store.last=foreign;store.attempts=[foreign];const before=JSON.stringify(store);
 const p=h.test.pressureResult('chat-a');assert.equal(p.model,model);assert.equal(p.seedCanonicalEffort,'medium');assert.equal(JSON.stringify(store),before);
});
check('parsed request explicitly naming another conversation cannot override local snapshot',()=>{
 const h=environment();prepare(h);const a=success(h);a.requestConversationId='chat-b';const p=h.test.pressureResult('chat-a');assert.equal(p.model,model);
});
for(const [label,raw,canonical]of [['High','extended','high'],['Medium','standard','medium'],['Extra High','max','max']]){
 check('unsupported model + '+canonical+' after SUCCESS and refresh never borrows corresponding thinking seed',()=>{
  const h=environment();prepare(h,label);success(h,unsupported,raw);for(const next of [h,reload(h)]){prepare(next,label);const p=next.test.pressureResult('chat-a');assert.equal(p.model,unsupported);assert.equal(p.effort,canonical);assert.equal(p.canonicalEffort,canonical);noSeed(p);}
 });
 check('returning to thinking '+canonical+' restores exact registry and independent frontiers',()=>{
  const h=environment();prepare(h,label);success(h,unsupported,raw);h.setNow(h.now()+100);success(h,model,raw);
  for(const next of [h,reload(h)]){prepare(next,label);const p=next.test.pressureResult('chat-a');assert.equal(p.model,model);assert.equal(p.seedModel,model);assert.equal(p.seedCanonicalEffort,canonical);
   assert.equal(p.seedProfileCount,3);assert.equal(p.seedMaxProfileCount,3);assert.equal(p.seedTextFrontier,847977);assert.equal(p.seedStateFrontier,27151472);assert.equal(p.confidence,'low');assert.equal(p.state,'scored');}
 });
}
check('in-flight parsed real request still wins immediately and after incomplete restart',()=>{
 const h=environment();prepare(h);h.start({model:unsupported,reasoning_effort:null});noSeed(h.test.pressureResult('chat-a'));assert.equal(h.test.pressureCurrent('chat-a').model,unsupported);
 const next=reload(h);assert.equal(next.test.pressureCurrent('chat-a').model,unsupported);assert.equal(next.test.loadAttemptState('chat-a').last.outcome,'unknown');
});
check('latest archived parsed request wins even if last/current pointers are older',()=>{
 const h=environment();prepare(h);const old=success(h,model,'max');h.setNow(h.now()+100);const latest=success(h,unsupported,null);
 const store=h.test.loadAttemptState('chat-a');store.current=old;store.last=old;store.attempts=[latest,old];assert.equal(h.test.pressureCurrent('chat-a').model,unsupported);
 assert.equal(h.test.pressureCurrent('chat-a').effort,null);
});
check('request chronology ignores delayed completion and history array ordering',()=>{
 const h=environment();prepare(h);const old=success(h,model,'max');h.setNow(h.now()+100);const latest=success(h,unsupported,null);
 old.outcomeConfirmedAt=latest.requestDetectedAt+500000;const store=h.test.loadAttemptState('chat-a');store.attempts.reverse();store.last=old;
 assert.equal(h.test.pressureCurrent('chat-a').model,unsupported);assert.equal(h.test.pressureCurrent('chat-a').effort,null);
});
check('missing request time uses dispatch start and tied times use higher attempt ID',()=>{
 const h=environment();prepare(h);const old=success(h,model,'max');h.setNow(h.now()+100);const latest=success(h,unsupported,null);latest.requestDetectedAt=null;
 assert.equal(h.test.pressureCurrent('chat-a').model,unsupported);old.requestDetectedAt=latest.startedAt;assert.equal(h.test.pressureCurrent('chat-a').model,unsupported);
});
check('authoritative older request remains selected when newer record has no usable parsed model',()=>{
 const h=environment();prepare(h);success(h,unsupported,null);h.setNow(h.now()+100);const bad=success(h,model,'max');bad.requestParsed=false;
 assert.equal(h.test.pressureCurrent('chat-a').model,unsupported);bad.requestParsed=true;bad.requestModel='   ';assert.equal(h.test.pressureCurrent('chat-a').model,unsupported);
});
check('non-generation preflight blocked-send and inferred model rows do not become authoritative',()=>{
 const h=environment();prepare(h);const store=h.test.loadAttemptState('chat-a');
 for(const trigger of ['preflight','send-intent','max-banner-without-generation-edge']){store.last={conversationId:'chat-a',requestParsed:true,requestModel:unsupported,trigger};store.attempts=[store.last];assert.equal(h.test.pressureCurrent('chat-a').model,model);}
 store.last={conversationId:'chat-a',requestParsed:false,requestModel:unsupported,trigger:'network-generation-dispatch'};store.attempts=[store.last];assert.equal(h.test.pressureCurrent('chat-a').model,model);
});
check('no-authoritative-request fallback preserves complete parent identity/vector outputs',()=>{
 for(const label of [null,'High','Medium','Extra High'])for(const kind of ['none','legacy-last','legacy-current','snapshot-missing']){
  const h=environment(),old=environment(original);for(const env of [h,old]){prepare(env,label);const store=env.test.loadAttemptState('chat-a');
   if(kind!=='none'){const a={conversationId:'chat-a',requestModel:unsupported,requestEffort:'standard',requestParsed:false,trigger:'network-generation-dispatch'};store.last=a;if(kind==='legacy-current')store.current=a;}
   if(kind==='snapshot-missing')env.test.loadSnapshot('chat-a').structure.contextTopology.currentModel=null;
  }assert.deepEqual(plain(h.test.pressureCurrent('chat-a')),plain(old.test.pressureCurrent('chat-a')));
 }
});
check('newest accepted DIRECT/BATCH vector choice stays separate from request identity',()=>{
 const h=environment();const {life}=prepare(h);success(h);life.families.direct.lastObservation=vector({sourceFamily:'direct',fullCapturedAt:1100000,displayLikeTokens:1234});
 const p=h.test.pressureResult('chat-a');assert.equal(p.model,unsupported);assert.equal(p.currentSourceVector.sourceFamily,'direct');assert.equal(p.currentDisplayLikeTokens,1234);
 assert.equal(h.test.loadSnapshot('chat-a').structure.contextTopology.currentModel,model);
});
check('unchanged verified current MAX override and numeric cap work with repaired identity',()=>{
 const h=environment();prepare(h,'High');const a=h.start({model:unsupported,reasoning_effort:'extended'});h.state.banners=[h.banner()];h.test.eventPollMax('chat-a');
 const p=h.test.pressureResult('chat-a');assert.equal(p.model,unsupported);assert.equal(p.state,'current-max');assert.equal(p.score,null);assert.equal(p.seedProfileCount,0);assert.equal(a.requestModel,unsupported);
 const old=environment(original),current={model,effort:'high',canonical:vector({displayLikeTokens:9999999,activeBranchBytes:99999999})};
 assert.deepEqual(plain(h.test.pressureCompute([],current,false)),plain(old.test.pressureCompute([],current,false)));assert.equal(h.test.pressureCompute([],current,false).score,99);
});
check('read-only identity and repeated completed migration do not append rewrite or persist seeds',()=>{
 const h=environment();prepare(h);success(h);h.test.pressureMigrate();const before=storage(h);for(let i=0;i<10;i++){h.test.pressureCurrent('chat-a');h.test.pressureResult('chat-a');h.test.pressureMigrate();}
 assert.equal(storage(h),before);assert.equal(h.test.pressureSummary().totalSamples,1);assert.equal(h.test.pressureSummary().uniqueMaxEvents,0);
});
check('canonical aliases raw request provenance privacy validator and full seed registry remain unchanged',()=>{
 const h=environment(),old=environment(original);for(const raw of ['max','Extra High','extended','High','standard','Medium','low',null])assert.equal(h.test.pressureEffort(raw),old.test.pressureEffort(raw));
 for(const effort of ['max','high','medium'])assert.deepEqual(plain(h.test.pressureSeed(model,effort)),plain(old.test.pressureSeed(model,effort)));
 for(const data of [{model}, {conversationId:'private'}, {nested:{filename:'private'}}, {prompt:'private'}])assert.equal(h.test.anonymousPrivacyValid(data),old.test.anonymousPrivacyValid(data));
 prepare(h);const a=success(h,unsupported,null);assert.equal(a.requestModel,unsupported);assert.equal(a.requestModelDetected,unsupported);assert.equal(a.requestEffort,null);assert.equal(a.requestCanonicalEffort,null);
});
check('repaired current identity invalidates pressure cache on successive model switches',()=>{
 const h=environment();prepare(h,'Medium');assert.equal(h.test.pressureResult('chat-a').seedProfileCount,3);success(h,unsupported,'standard');assert.equal(h.test.pressureResult('chat-a').seedProfileCount,0);
 h.setNow(h.now()+100);success(h,model,'standard');assert.equal(h.test.pressureResult('chat-a').seedProfileCount,3);
});
check('candidate identity metadata reports 2.24.4.1 consistently',async()=>{
 const h=environment();prepare(h,'High');success(h,model,'extended');assert.equal(h.test.anonymousSampleForChat().candidateVersion,'2.24.4.1');assert.equal(h.test.eventStorageHealth('chat-a').candidateVersion,'2.24.4.1');
 await h.test.retryCapture();assert.equal(h.test.loadDiagnostic('chat-a').lastRetry.version,'2.24.4.1');h.test.setLatest(h.test.calculateStats());await h.test.copyStats();assert(h.state.clipboard.startsWith('Candidate userscript: V2.24.4.1 CURRENT MODEL IDENTITY REPAIR'));
});
(async()=>{let passed=0;for(const [name,fn]of cases)try{await fn();console.log('PASS '+name);passed++;}catch(error){console.error('FAIL '+name+'\n'+error.stack);process.exitCode=1;}
 console.log(`${passed}/${cases.length} V2.24.4.1 identity synthetic tests passed; native review pending`);})();
