function anonymousReadState(id, namespace, cache) {
  const cached=cache?.get(id);if(cached)return cached;
  try {
    const text=localStorage.getItem(`${P}:${namespace}${namespace==='pressure-calibration-v224'?'':':'+id}`);
    return text && text.length<=1500000?eventStorageParse(text):null;
  }catch{return null;}
}
function anonymousSampleForChat(id = chatIdFromURL()) {
  // Read caches or persisted bytes directly, without normal load/restart paths:
  // export cannot finalize an attempt, migrate, persist, or admit calibration.
  if(!id || id!==chatIdFromURL())return null;
  const attempts=anonymousReadState(id,'attempts-v223',attemptCache),episodes=anonymousReadState(id,'max-episodes-v223',episodeCache);
  const life=anonymousReadState(id,'lifecycle-v216',lifecycleCache),snapshot=anonymousReadState(id,'snapshot',snapshotCache);
  const local=pressureStore || anonymousReadState(id,'pressure-calibration-v224');
  const samples=local?.schemaVersion===1 && Array.isArray(local.samples) && local.samples.length<=PRESSURE_CAP?
    local.samples.map(s=>pressureCleanRow(s,true)).filter(Boolean):[];
  const latestAttempt=attempts?.current || attempts?.last;
  const model=pressureLabel(attempts?.current?.requestModel) || pressureLabel(snapshot?.structure?.contextTopology?.currentModel) || pressureLabel(latestAttempt?.requestModel);
  const effort=pressureEffort(attemptEffortHint()) || (model===latestAttempt?.requestModel?pressureEffort(latestAttempt?.requestEffort):null);
  if(!model || !effort)return null;
  const rows=[attempts?.current,attempts?.last,...(Array.isArray(attempts?.attempts)?attempts.attempts:[])].filter(Boolean);
  const matching=a=>a.conversationId===id && a.trigger==='network-generation-dispatch' && pressureLabel(a.requestModel)===model && pressureEffort(a.requestEffort)===effort;
  const sourceVectors=(role,stableOnly=false)=>['batch','direct'].flatMap(f=>{
    const family=life?.families?.[f];return (stableOnly?[family?.lastStable]:[family?.lastObservation,family?.lastStable,family?.lastInflight]).map(v=>pressureVector(v,role));
  }).filter(Boolean).sort((a,b)=>b.fullCapturedAt-a.fullCapturedAt || Number(b.sourceFamily==='batch')-Number(a.sourceFamily==='batch'));
  const current=sourceVectors('current')[0] || null;
  const episode=Array.isArray(episodes?.episodes)?episodes.episodes.find(e=>e.id===episodes.activeId && e.active===true && e.conversationId===id && pressureNumber(e.firstSeenAt)>0 &&
    Number.isSafeInteger(e.id) && e.id>0 && ['UI MAX banner','structured SSE error','HTTP generation error','blocked before dispatch'].includes(e.confirmationSource)):null;
  let vector=null,role=null,outcome=null;
  if(episode) {
    const related=rows.find(a=>a.id===episode.relatedRealAttemptId);
    if(related && !matching(related))return null;
    const linked=related;
    const compact=samples.filter(s=>s.conversationId===id && s.eventId===episode.id && s.outcome==='max' && s.model===model && pressureEffort(s.effort)===effort);
    const pre=pressureBest([
      ...compact.filter(s=>s.canonical.snapshotRole==='pre-dispatch').map(s=>pressureVector(s.canonical,'pre-dispatch',episode.firstSeenAt)),
      ...['batch','direct'].map(f=>pressureVector(linked?.pre?.[f],'pre-dispatch',linked?.requestDetectedAt || linked?.startedAt || 0))
    ]);
    const fallback=pressureBest([
      ...compact.filter(s=>s.canonical.snapshotRole==='fresh-post-max-fallback').map(s=>pressureVector(s.canonical,'fresh-post-max-fallback',Infinity,episode.firstSeenAt)),
      ...['batch','direct'].map(f=>pressureVector(episode[f],'fresh-post-max-fallback',Infinity,episode.firstSeenAt))
    ]);
    vector=pre || fallback || sourceVectors('current-max').find(v=>v.fullCapturedAt>=episode.firstSeenAt) || null;
    role=pre?'pre-max':fallback?'fallback':'current-max';outcome='max';
  }else {
    if(visibleHardMax() || attempts?.current && !attempts.current.outcome)return null;
    const success=rows.filter(a=>a.conversationId===id && a.trigger==='network-generation-dispatch')
      .sort((a,b)=>b.id-a.id)[0];
    if(!success || !matching(success) || success.outcome!=='success' || !success.outcomeConfirmedBy || !(pressureNumber(success.outcomeConfirmedAt)>0))return null;
    const pre=pressureBest(['batch','direct'].map(f=>pressureVector(success.pre?.[f],'pre-dispatch',success.requestDetectedAt || success.startedAt || 0)));
    const stable=sourceVectors('current',true).find(v=>v.fullCapturedAt>=success.outcomeConfirmedAt);
    vector=stable || pre;role=stable?'current':'success-pre';outcome='success';
  }
  const pressure=pressureCompute(samples,{model,effort,canonical:current},!!episode);
  return anonymousProjectSample({model,effort,outcome,role,pressureState:pressure.state},vector);
}
async function copyAnonymousSample() {
  const id=chatIdFromURL(),sample=anonymousSampleForChat(id);
  if(!sample || !anonymousSampleValid(sample) || !anonymousPrivacyValid(sample))return false;
  const text=JSON.stringify(sample,null,2);
  if(text.length>4096 || chatIdFromURL()!==id)return false;
  try {await navigator.clipboard.writeText(text);return true;}catch{return false;}
}
async function runAnonymousCopy() {
  const state=quickActionState.anon;if(state.running)return false;
  const serial=++quickActionState.serial,token=++state.token;
  state.running=true;state.label='Copying…';quickActionState.last='Copying anonymous sample…';quickActionState.type='busy';paintQuickActions();
  let ok=false;try{ok=await copyAnonymousSample();}catch{}
  state.running=false;state.label=ok?'Copied ✓':'No safe sample ✕';
  if(quickActionState.serial===serial){quickActionState.last=ok?'Anonymous sample copied ✓':'Anonymous copy unavailable or failed ✕';quickActionState.type=ok?'ok':'error';}
  paintQuickActions();setTimeout(()=>{if(state.token!==token || state.running)return;state.label='Copy anon sample';paintQuickActions();},2200);
  return ok;
}
