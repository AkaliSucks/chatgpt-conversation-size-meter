// Revision-specific synthetic calibration tests; no live account is contacted.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),candidate=path.join(root,'releases/v2.24.0-calibration-correctness/chatgpt_chat_size_meter_v2240_calibration_correctness.js');
const prefix=fs.readFileSync(path.join(__dirname,'test-v223.js'),'utf8').split('const cases=[];')[0];
const scope={require,process:{argv:['node','test',candidate]},__dirname,console,URL,TextEncoder,TextDecoder,
  ArrayBuffer,Request,Blob,AbortController,btoa,atob,Buffer};
vm.runInNewContext(prefix+'\nglobalThis.environmentForRevision=environment;',scope);
const environment=scope.environmentForRevision,plain=x=>JSON.parse(JSON.stringify(x));
const cases=[],check=(name,fn)=>cases.push([name,fn]);
const vector=(tokens,extra={})=>({sourceFamily:'batch',snapshotRole:'pre-dispatch',fullCapturedAt:900000,
  displayLikeTokens:tokens,mappingBytes:20000000,activeBranchBytes:19000000,retainedBytes:12000000,
  retainedShare:60,toolResultBytes:11000000,hot128:12800,hot256:25600,strongContextMarkers:3,
  branchNodes:4000,messageNodes:3900,...extra});
const row=(id,tokens,extra={})=>({conversationId:'capped-a',eventId:id,attemptId:id,outcome:'max',
  key:JSON.stringify(['capped-a','max',id]),timestamp:950000+id,model:'gpt-5-6-thinking',effort:'max',
  identitySource:'generation request',confirmationSource:'structured SSE error',provenance:'v224-observed',canonical:vector(tokens),...extra});
const current=(extra={})=>({model:'gpt-5-6-thinking',effort:'Extra High',canonical:vector(438000,{snapshotRole:'current'}),...extra});
const pair=()=>[row(1,840795),row(2,845331,{conversationId:'capped-b'})];
const compute=(samples,c=current())=>environment().test.pressureCompute(samples,c);

check('native-reported Extra High / max case selects exact-model-effort and canonical max',()=>{
  const result=compute(pair());assert.equal(result.canonicalEffort,'max');assert.equal(result.effort,'max');
  assert.equal(result.comparisonTier,'exact-model-effort');assert.equal(result.confidence,'medium');
});
check('known alias casing and spacing normalize safely; canonical backend values preserved',()=>{
  const h=environment();for(const input of ['Extra High','extra high',' EXTRA   HIGH ','Extra\tHigh','MAX',' max '])assert.equal(h.test.pressureEffort(input),'max');
  for(const input of ['max','high','medium','low','minimal','none','xhigh','thinking'])assert.equal(h.test.pressureEffort(input),input);
  for(const input of [null,undefined,'','   ',42,{}])assert.equal(h.test.pressureEffort(input),null);
});
check('unknown efforts remain distinguishable; no undocumented alias is guessed',()=>{
  const h=environment();for(const input of ['extra-high','extreme','xhigh','thinking'])assert.notEqual(h.test.pressureEffort(input),'max');
  assert.equal(h.test.pressureEffort('Future  Mode'),'future mode');assert.notEqual(h.test.pressureEffort('future mode'),h.test.pressureEffort('other mode'));
});
check('genuinely different and unknown effort retain explicit same-model fallback',()=>{
  for(const effort of ['medium','future mode',null]){const r=compute(pair(),current({effort}));assert.equal(r.comparisonTier,'same-model');assert.equal(r.confidence,'low');}
});
check('five MAX episodes in one unchanged chat are one effective threshold observation',()=>{
  const r=compute(Array.from({length:5},(_,i)=>row(i+1,840795)));
  assert.equal(r.rawComparableMaxEpisodeCount,5);assert.equal(r.effectiveMaxObservationCount,1);assert.equal(r.uniqueMaxConversationCount,1);
  assert.equal(r.comparableMaxCount,1);assert.equal(r.confidence,'low');assert.equal(r.anchorContributionSummary[0].distinctPreVectorCount,1);
});
check('two capped conversations contribute two independent observations',()=>{
  const r=compute(pair());assert.equal(r.rawComparableMaxEpisodeCount,2);assert.equal(r.effectiveMaxObservationCount,2);assert.equal(r.uniqueMaxConversationCount,2);
  assert.equal(r.anchorContributionSummary.length,2);assert.equal(r.empiricalMaxAnchor,840795);
});
check('native-style six MAX episodes on two conversations retain six raw and two effective events',()=>{
  const samples=Array.from({length:6},(_,i)=>row(i+1,i<3?840795:845331,{conversationId:i<3?'capped-a':'capped-b',effort:i%2?'extra high':'max'}));
  const r=compute(samples);assert.equal(r.rawComparableMaxEpisodeCount,6);assert.equal(r.effectiveMaxObservationCount,2);
  assert.equal(r.uniqueMaxConversationCount,2);assert.equal(r.confidence,'medium');assert.equal(r.comparisonTier,'exact-model-effort');
});
check('repeated identical retries cannot promote confidence or change anchor/score',()=>{
  const first=compute([row(1,840795)]),repeated=compute(Array.from({length:40},(_,i)=>row(i+1,840795)));
  assert.equal(first.confidence,repeated.confidence);assert.equal(first.empiricalMaxAnchor,repeated.empiricalMaxAnchor);assert.equal(first.score,repeated.score);
});
check('five distinct chats retain lower-quartile anchor despite many duplicate low-chat retries',()=>{
  const distinct=Array.from({length:5},(_,i)=>row(i+1,800000+i*10000,{conversationId:'capped-'+i}));
  const original=compute(distinct),repeated=compute([...distinct,...Array.from({length:40},(_,i)=>row(i+50,800000,{conversationId:'capped-0'}))]);
  assert.equal(original.empiricalMaxAnchor,810000);assert.equal(repeated.empiricalMaxAnchor,810000);assert.equal(repeated.effectiveMaxObservationCount,5);
  assert.equal(original.confidence,repeated.confidence);assert.equal(original.score,repeated.score);
});
check('materially distinct pre states in one chat are preserved diagnostically with one vote',()=>{
  const r=compute([row(1,840795),row(2,845331),row(3,840795)]),s=r.anchorContributionSummary[0];
  assert.equal(r.rawComparableMaxEpisodeCount,3);assert.equal(r.effectiveMaxObservationCount,1);assert.equal(s.distinctPreVectorCount,2);
  assert.deepEqual(plain(s.settings[0].preDisplayLikeRange),{min:840795,max:845331});assert.equal(s.anchorContribution,840795);
});
check('capture timestamps and snapshot role metadata do not create distinct feature vectors',()=>{
  const r=compute([row(1,840795),row(2,840795,{canonical:vector(840795,{fullCapturedAt:900001})})]);
  assert.equal(r.effectiveMaxObservationCount,1);assert.equal(r.anchorContributionSummary[0].distinctPreVectorCount,1);
});
check('secondary metric variation is diagnosed without giving one conversation extra weight',()=>{
  const r=compute([row(1,840795),row(2,840795,{canonical:vector(840795,{mappingBytes:21000000})})]);
  assert.equal(r.anchorContributionSummary[0].distinctPreVectorCount,2);assert.equal(r.effectiveMaxObservationCount,1);assert.equal(r.empiricalMaxAnchor,840795);
});
check('supporting post-MAX vector never becomes an independent MAX or anchor',()=>{
  const r=compute([row(1,840795,{postMax:vector(1000,{snapshotRole:'fresh-post-max',fullCapturedAt:980000})})]);
  assert.equal(r.rawComparableMaxEpisodeCount,1);assert.equal(r.effectiveMaxObservationCount,1);assert.equal(r.empiricalMaxAnchor,840795);
});
check('canonical pre supersedes repeated smaller post-MAX fallbacks within same conversation',()=>{
  const fallback=row(2,1000,{canonical:vector(1000,{snapshotRole:'fresh-post-max-fallback',fullCapturedAt:980000})});
  const r=compute([row(1,840795),fallback]);assert.equal(r.empiricalMaxAnchor,840795);assert.equal(r.postMaxFallbackPresent,false);
  assert.equal(r.anchorContributionSummary[0].selectedRole,'pre-dispatch');
});
check('post-only fallback remains one eligible low-confidence observation per conversation',()=>{
  const r=compute(Array.from({length:5},(_,i)=>row(i+1,847977,{canonical:vector(847977,{snapshotRole:'fresh-post-max-fallback',fullCapturedAt:980000})})));
  assert.equal(r.effectiveMaxObservationCount,1);assert.equal(r.empiricalMaxAnchor,847977);assert(r.postMaxFallbackPresent);assert.equal(r.confidence,'low');
});
check('aliases collapse one setting group while preserving all raw episodes',()=>{
  const r=compute([row(1,840795,{effort:'max'}),row(2,840795,{effort:'Extra High'})]);
  assert.equal(r.rawComparableMaxEpisodeCount,2);assert.equal(r.effectiveMaxObservationCount,1);assert.equal(r.anchorContributionSummary[0].settingGroupCount,1);
  assert.deepEqual(plain(r.anchorContributionSummary[0].canonicalEfforts),['max']);
});
check('same-model effort pooling still gives one chat only one vote across settings',()=>{
  const r=compute([row(1,840795,{effort:'max'}),row(2,845331,{effort:'medium'})],current({effort:null}));
  assert.equal(r.comparisonTier,'same-model');assert.equal(r.effectiveMaxObservationCount,1);assert.equal(r.anchorContributionSummary[0].settingGroupCount,2);
});
check('tier sufficiency is determined by independent chats rather than five same-effort retries',()=>{
  const samples=[...Array.from({length:5},(_,i)=>row(i+1,840795)),row(10,845331,{conversationId:'capped-b',effort:'medium'})];
  const r=compute(samples);assert.equal(r.comparisonTier,'same-model');assert.equal(r.confidence,'low');assert.equal(r.uniqueMaxConversationCount,2);
});
check('ten successes in one chat retain ten raw samples and only one success conversation',()=>{
  const samples=[...pair(),...Array.from({length:10},(_,i)=>row(20+i,100000,{conversationId:'healthy-a',outcome:'success'}))];
  const r=compute(samples);assert.equal(r.rawComparableSuccessCount,10);assert.equal(r.uniqueSuccessConversationCount,1);assert.equal(r.effectiveSuccessObservationCount,1);
});
check('five MAX chats plus repeated success in one chat cannot reach HIGH',()=>{
  const samples=Array.from({length:5},(_,i)=>row(i+1,840000+i*1000,{conversationId:'capped-'+i}));
  samples.push(...Array.from({length:20},(_,i)=>row(20+i,100000,{conversationId:'healthy-a',outcome:'success'})));
  const r=compute(samples);assert.equal(r.confidence,'medium');assert.equal(r.uniqueSuccessConversationCount,1);
});
check('HIGH requires five independent pre-MAX and ten independent success conversations',()=>{
  const samples=Array.from({length:5},(_,i)=>row(i+1,840000+i*1000,{conversationId:'capped-'+i}));
  samples.push(...Array.from({length:10},(_,i)=>row(20+i,100000,{conversationId:'healthy-'+i,outcome:'success'})));
  const r=compute(samples);assert.equal(r.confidence,'high');assert.equal(r.uniqueMaxConversationCount,5);assert.equal(r.uniqueSuccessConversationCount,10);
});
check('raw contradictory successes and unique contradictory conversation counts are separate',()=>{
  const r=compute([...pair(),...Array.from({length:12},(_,i)=>row(20+i,900000,{conversationId:'healthy-a',outcome:'success'}))]);
  assert.equal(r.contradictorySuccessCount,12);assert.equal(r.rawContradictorySuccessCount,12);assert.equal(r.effectiveContradictorySuccessConversationCount,1);assert.equal(r.confidence,'low');
});
check('contradictory repeats retain raw provenance without altering confidence or effective count',()=>{
  const single=compute([...pair(),row(20,900000,{conversationId:'healthy-a',outcome:'success'})]);
  const repeat=compute([...pair(),...Array.from({length:10},(_,i)=>row(i+20,900000,{conversationId:'healthy-a',outcome:'success'}))]);
  assert.equal(single.confidence,repeat.confidence);assert.equal(single.effectiveContradictorySuccessConversationCount,repeat.effectiveContradictorySuccessConversationCount);
});
check('effective calculation is deterministic under sample permutation including alias duplicates',()=>{
  const samples=[...pair(),row(3,840795,{effort:'Extra High'}),row(4,845500,{conversationId:'capped-b'}),row(5,100000,{outcome:'success',conversationId:'healthy-a'})];
  const reference=plain(compute(samples));for(const order of [samples.slice().reverse(),[samples[2],samples[4],samples[0],samples[3],samples[1]]])assert.deepEqual(plain(compute(order)),reference);
});
check('revised view preserves old store bytes and effort provenance when only read/migrated',()=>{
  const baseSource=fs.readFileSync(path.join(root,'releases/v2.24.0/chatgpt_chat_size_meter_v224_empirical_pressure.js'),'utf8');
  const old=environment(baseSource);old.test.pressureUpsert(row(1,840795,{effort:'Extra High'}));old.test.pressureLoad().migration.done=true;old.test.pressureSave('chat-a');
  const key='cgpt-size-meter-v2101:pressure-calibration-v224',text=old.storage.get(key),fresh=environment();for(const[k,v]of old.storage)fresh.storage.set(k,v);
  const store=fresh.test.pressureLoad();assert.equal(store.samples[0].effort,'extra high');fresh.test.pressureMigrate();fresh.test.pressureSummary();fresh.test.pressureCompute(store.samples,current());
  assert.equal(fresh.storage.get(key),text);assert.equal(store.samples.length,1);assert.equal(store.samples[0].effort,'extra high');
  assert.equal(fresh.test.pressureSummary().groupedByModelEffort['["gpt-5-6-thinking","max"]'].max,1);
});
check('new sample append canonicalizes alias without rewriting old raw effort rows',()=>{
  const baseSource=fs.readFileSync(path.join(root,'releases/v2.24.0/chatgpt_chat_size_meter_v224_empirical_pressure.js'),'utf8');
  const old=environment(baseSource);old.test.pressureUpsert(row(1,840795,{effort:'Extra High'}));old.test.pressureLoad().migration.done=true;old.test.pressureSave('chat-a');
  const fresh=environment();for(const[k,v]of old.storage)fresh.storage.set(k,v);const before=plain(fresh.test.pressureLoad().samples[0]);
  fresh.test.pressureUpsert(row(2,845331,{conversationId:'capped-b',effort:'Extra High'}));fresh.test.pressureSave('chat-a');
  const stored=fresh.test.eventStorageParse(fresh.storage.get('cgpt-size-meter-v2101:pressure-calibration-v224'));
  assert.deepEqual(plain(stored.samples[0]),before);assert.equal(stored.samples[1].effort,'max');assert.equal(stored.samples.length,2);
});
check('migration alias normalization remains idempotent and old event stores untouched',()=>{
  const h=environment(),attempt={id:1,conversationId:'chat-a',trigger:'network-generation-dispatch',startedAt:950000,requestDetectedAt:950000,
    requestModel:'gpt-5-6-thinking',requestEffort:'Extra High',effortHint:'Extra High',outcome:'max',pre:{batch:vector(840795)}};
  const old=new Map([['cgpt-size-meter-v2101:attempts-v223:chat-a',JSON.stringify({version:3,attempts:[attempt]})],
    ['cgpt-size-meter-v2101:max-episodes-v223:chat-a',JSON.stringify({episodes:[{id:1,conversationId:'chat-a',firstSeenAt:970000,
      relatedRealAttemptId:1,confirmationSource:'structured SSE error'}]})]]);
  for(const[k,v]of old)h.storage.set(k,v);h.test.pressureMigrate();const text=h.storage.get('cgpt-size-meter-v2101:pressure-calibration-v224');
  assert.equal(h.test.pressureLoad().samples[0].effort,'max');h.test.pressureMigrate();assert.equal(h.storage.get('cgpt-size-meter-v2101:pressure-calibration-v224'),text);
  for(const[k,v]of old)assert.equal(h.storage.get(k),v);
  const fresh=environment();for(const[k,v]of h.storage)fresh.storage.set(k,v);fresh.test.pressureMigrate();assert.equal(fresh.storage.get('cgpt-size-meter-v2101:pressure-calibration-v224'),text);
});
check('256 raw event cap is unchanged; effective view never deletes repeated research samples',()=>{
  const h=environment();for(let i=1;i<=256;i++)h.test.pressureUpsert(row(i,840795));const before=JSON.stringify(h.test.pressureLoad().samples);
  const r=h.test.pressureCompute(h.test.pressureLoad().samples,current());assert.equal(r.rawComparableMaxEpisodeCount,256);assert.equal(r.effectiveMaxObservationCount,1);
  assert.equal(JSON.stringify(h.test.pressureLoad().samples),before);assert.equal(h.test.pressureSummary().retentionCap,256);
});
check('normal contribution diagnostics have bounded conversation and setting previews',()=>{
  const distinct=Array.from({length:30},(_,i)=>row(i+1,840000+i*100,{conversationId:'capped-'+i}));
  const r=compute(distinct);assert.equal(r.anchorContributionSummary.length,16);assert.equal(r.anchorContributionSummaryOmittedCount,14);
  const pooled=compute(Array.from({length:20},(_,i)=>row(i+1,840000+i*100,{effort:'unknown-'+i})),current({effort:null}));
  assert.equal(pooled.anchorContributionSummary[0].settings.length,8);assert.equal(pooled.anchorContributionSummary[0].settingGroupsOmittedCount,12);
});
check('active verified MAX and numeric clamp preserve nonterminal semantics',()=>{
  const h=environment(),active=h.test.pressureCompute(pair(),current(),true);assert.equal(active.state,'current-max');assert.equal(h.test.pressureText(active),'PRESSURE MAX');
  const score=compute(pair(),current({canonical:vector(1000000)}));assert.equal(score.score,99);assert.equal(score.state,'scored');assert(score.currentExceedsAnchorWhileAlive);
});
check('new candidate metadata and diagnostics identify correctness model and raw/effective evidence',async()=>{
  const h=environment();pair().forEach(r=>h.test.pressureUpsert(r));const lines=h.test.eventDiagnostics('chat-a');
  assert.match(lines[0],/V2\.24 CALIBRATION CORRECTNESS/);const model=JSON.parse(lines[lines.indexOf('V2.24 PRESSURE CALIBRATION')+1]);
  assert.equal(model.modelVersion,'v224-display-ratio-2');for(const field of ['rawComparableMaxEpisodeCount','effectiveMaxObservationCount',
    'uniqueMaxConversationCount','rawComparableSuccessCount','effectiveSuccessObservationCount','uniqueSuccessConversationCount','canonicalEffort',
    'anchorContributionSummary','rawContradictorySuccessCount','effectiveContradictorySuccessConversationCount'])assert(field in model,field);
  h.test.setLatest(h.test.calculateStats());await h.test.copyStats();assert(h.state.clipboard.startsWith('Candidate userscript: V2.24 CALIBRATION CORRECTNESS'));
  assert.match(fs.readFileSync(candidate,'utf8'),/\/\/ @version\s+2\.24\.0/);
});
(async()=>{let failed=0;for(const[name,fn]of cases)try{await fn();console.log('PASS '+name);}catch(error){failed++;console.error('FAIL '+name+'\n'+error.stack);}
  console.log(`${cases.length-failed}/${cases.length} calibration-correctness synthetic tests passed; native candidate validation pending`);if(failed)process.exitCode=1;})();
