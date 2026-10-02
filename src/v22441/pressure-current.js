function pressureCurrent(id) {
  const state=eventStaticState(id),store=loadAttemptState(id);
  const belongs=a=>a && (!a.conversationId || a.conversationId===id) && (!a.requestConversationId || a.requestConversationId===id);
  // Current identity follows the latest parsed real request for this chat,
  // including completed/persisted attempts. Snapshot labels describe captured
  // state and must not override that request after completion or refresh.
  // Request time (then attempt ID) orders requests; completion time cannot make
  // an older request newer. Sorting this temporary array never rewrites history.
  const request=[store.current,store.last,...(Array.isArray(store.attempts)?store.attempts:[])]
    .filter(a=>belongs(a) && a.conversationId===id && a.trigger==='network-generation-dispatch' && a.requestParsed===true && pressureLabel(a.requestModel))
    .sort((a,b)=>(Number(b.requestDetectedAt || b.startedAt) || 0)-(Number(a.requestDetectedAt || a.startedAt) || 0) ||
      (Number(b.id) || 0)-(Number(a.id) || 0))[0] || null;
  const current=belongs(store.current)?store.current:null,last=belongs(store.last)?store.last:null,a=request || current || last;
  // Visible pressure follows the newest accepted current state; unlike event
  // canonicalization, an older BATCH must not mask a newer DIRECT observation.
  const canonical=['batch','direct'].map(f=>pressureVector(state[f],'current')).filter(Boolean)
    .sort((a,b)=>b.fullCapturedAt-a.fullCapturedAt || Number(b.sourceFamily==='batch')-Number(a.sourceFamily==='batch'))[0] || null;
  const snapshotModel=pressureLabel(attemptSnapshotModel(id));
  const model=pressureLabel(request?.requestModel) || pressureLabel(current?.requestModel) || snapshotModel || pressureLabel(last?.requestModel);
  const hint=pressureEffort(attemptEffortHint());
  const effort=hint || (model===a?.requestModel ? pressureEffort(a?.requestEffort) : null);
  const identitySource=request?`latest parsed current-chat generation request model + ${hint?'UI effort hint':'matching request effort'}`:
    hint?'snapshot/request model + UI effort hint':'snapshot/request model + last matching request effort';
  return {model,effort,identitySource,canonical};
}
