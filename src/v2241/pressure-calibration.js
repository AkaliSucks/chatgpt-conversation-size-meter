// V2.24 empirical pressure, schema 1. No raw mappings, requests, or diagnostic objects.
// 256 event rows, at most two vectors/row. Eviction watermark prevents replay of old events.
const PRESSURE_KEY = `${P}:pressure-calibration-v224`;
const PRESSURE_CAP = 256;
const PRESSURE_FIELDS = ['displayLikeTokens','activeBranchBytes','mappingBytes','retainedBytes',
  'retainedShare','toolResultBytes','hot128','hot256','strongContextMarkers','branchNodes','messageNodes'];
let pressureStore = null, pressureRevision = 0, pressureBusy = false, pressureWriteBlocked = false;
const pressureResults = new Map();

function pressureNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}
function pressureLabel(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0,120) : null;
}
function pressureEffort(value) {
  const effort=pressureLabel(value)?.toLowerCase().replace(/\s+/g,' ') || null;
  // Demonstrated UI/backend alias: Extra High / requestEffort=max. No guesses
  // for Thinking, xhigh, or other labels without paired repository evidence.
  return effort==='extra high' ? 'max' : effort;
}
function pressureVector(obs, role, before = Infinity, after = 0) {
  if (!obs || !['direct','batch'].includes(obs.sourceFamily)) return null;
  const time = pressureNumber(obs.fullCapturedAt);
  if (!time || time > before || time < after || !(pressureNumber(obs.mappingBytes) > 0) ||
      !(pressureNumber(obs.branchNodes) > 0) || !(pressureNumber(obs.displayLikeTokens) > 0)) return null;
  return {sourceFamily:obs.sourceFamily,snapshotRole:role,fullCapturedAt:time,
    ...Object.fromEntries(PRESSURE_FIELDS.map(k=>[k,pressureNumber(obs[k])]))};
}
function pressureBest(vectors) {
  // Prefer complete BATCH representation, then most recent accepted observation.
  return vectors.filter(Boolean).sort((a,b)=>Number(b.sourceFamily==='batch')-Number(a.sourceFamily==='batch') ||
    b.fullCapturedAt-a.fullCapturedAt)[0] || null;
}
function pressureOrder(a,b) {
  return a.timestamp-b.timestamp || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
}
function pressureCleanRow(row, preserveEffort = false) {
  if (!row || !['success','max'].includes(row.outcome) || !pressureLabel(row.conversationId) ||
      !Number.isSafeInteger(row.eventId) || row.eventId < 1 || !(pressureNumber(row.timestamp)>0)) return null;
  const conversationId = pressureLabel(row.conversationId), outcome = row.outcome;
  const canonical = pressureVector(row.canonical,row.canonical?.snapshotRole);
  const postMax = outcome === 'max' ? pressureVector(row.postMax,'fresh-post-max',Infinity,row.timestamp) : null;
  if (canonical && (!['pre-dispatch','fresh-post-max-fallback'].includes(canonical.snapshotRole) ||
      canonical.snapshotRole==='pre-dispatch' && canonical.fullCapturedAt>row.timestamp ||
      canonical.snapshotRole==='fresh-post-max-fallback' && canonical.fullCapturedAt<row.timestamp)) return null;
  if (!canonical || outcome === 'success' && canonical.snapshotRole !== 'pre-dispatch') return null;
  return {key:JSON.stringify([conversationId,outcome,row.eventId]),conversationId,eventId:row.eventId,outcome,
    timestamp:row.timestamp,attemptId:Number.isSafeInteger(row.attemptId)?row.attemptId:null,
    episodeId:outcome==='max'?row.eventId:null,model:pressureLabel(row.model),
    effort:preserveEffort ? (typeof row.effort==='string' ? row.effort.slice(0,120) : null) : pressureEffort(row.effort),
    identitySource:pressureLabel(row.identitySource),confirmationSource:pressureLabel(row.confirmationSource),
    provenance:row.provenance==='v223-migration'?'v223-migration':'v224-observed',canonical,postMax};
}
function pressureBlank() {
  return {schemaVersion:1,modelVersion:'v2241-dual-frontier-1',samples:[],watermark:null,
    retentionCount:0,migration:{done:false,examinedKeys:0,skippedKeys:0,admittedEvents:0},lastError:null};
}
function pressureLoad() {
  if (pressureStore) return pressureStore;
  pressureStore = pressureBlank();
  try {
    const text = localStorage.getItem(PRESSURE_KEY);
    if (!text) return pressureStore;
    if (text.length > 1500000) throw Error('Oversize pressure store');
    const data = eventStorageParse(text);
    if (data?.schemaVersion !== 1 || !Array.isArray(data.samples) || data.samples.length > PRESSURE_CAP)
      throw Error('Unsupported pressure schema');
    const unique = new Map();
    for (const raw of data.samples) {const row=pressureCleanRow(raw,true);if(row)unique.set(row.key,row);}
    pressureStore.samples = [...unique.values()].sort(pressureOrder);
    if (pressureNumber(data.watermark?.timestamp)>0 && typeof data.watermark.key==='string')
      pressureStore.watermark = {timestamp:data.watermark.timestamp,key:data.watermark.key.slice(0,400)};
    pressureStore.retentionCount = pressureNumber(data.retentionCount) || 0;
    if (data.migration?.done === true) pressureStore.migration = {done:true,
      examinedKeys:pressureNumber(data.migration.examinedKeys)||0,skippedKeys:pressureNumber(data.migration.skippedKeys)||0,
      admittedEvents:pressureNumber(data.migration.admittedEvents)||0};
  } catch (error) {pressureWriteBlocked=true;pressureStore.lastError=String(error.message).slice(0,200);}
  return pressureStore;
}
function pressureUpsert(raw) {
  const store = pressureLoad(), row = pressureCleanRow(raw);
  if (!row) return false;
  const index = store.samples.findIndex(s=>s.key===row.key), old = store.samples[index];
  if (!old && store.watermark && pressureOrder(row,store.watermark)<=0) return false;
  if (old) {
    // Stable first evidence; promote fallback to pre-dispatch or DIRECT to BATCH once.
    row.timestamp=old.timestamp;row.provenance=old.provenance;
    row.model=old.model || row.model;row.effort=old.effort || row.effort;
    row.identitySource=old.identitySource || row.identitySource;
    const improve=(a,b)=>!a ? b : b && ((a.snapshotRole!=='pre-dispatch' && b.snapshotRole==='pre-dispatch') ||
      (a.snapshotRole===b.snapshotRole && a.sourceFamily==='direct' && b.sourceFamily==='batch')) ? b : a;
    row.canonical=improve(old.canonical,row.canonical);row.postMax=improve(old.postMax,row.postMax);
    if (JSON.stringify(old)===JSON.stringify(row)) return false;
    store.samples[index]=row;
  } else store.samples.push(row);
  store.samples.sort(pressureOrder);
  while (store.samples.length>PRESSURE_CAP) {
    const removed=store.samples.shift();store.watermark={timestamp:removed.timestamp,key:removed.key};store.retentionCount++;
  }
  pressureRevision++;pressureResults.clear();return true;
}
function pressureDerive(id, attempts, episodes, provenance, live = false) {
  if (!Array.isArray(attempts?.attempts)) return 0;
  const rows=[attempts.current,attempts.last,...attempts.attempts.slice(-10)].filter(Boolean);
  const byId=new Map(rows.filter(a=>Number.isSafeInteger(a.id)).map(a=>[a.id,a]));
  let changed=0;
  const pre=a=>pressureBest(['batch','direct'].map(f=>pressureVector(a?.pre?.[f],'pre-dispatch',
    a?.requestDetectedAt || a?.startedAt || 0)));
  for (const a of byId.values()) {
    if (a.conversationId!==id || a.trigger!=='network-generation-dispatch' || a.outcome!=='success' ||
        !a.outcomeConfirmedBy || !pressureLabel(a.requestModel)) continue;
    changed+=Number(pressureUpsert({conversationId:id,eventId:a.id,attemptId:a.id,outcome:'success',
      timestamp:a.outcomeConfirmedAt,model:a.requestModel,effort:a.requestEffort,identitySource:'generation request',
      confirmationSource:a.outcomeConfirmedBy,provenance,canonical:pre(a)}));
  }
  for (const e of (Array.isArray(episodes?.episodes)?episodes.episodes:[]).slice(-10)) {
    if (!e || e.conversationId!==id || !['UI MAX banner','structured SSE error','HTTP generation error','blocked before dispatch']
      .includes(e.confirmationSource)) continue;
    const a=byId.get(e.relatedRealAttemptId), linked=a?.conversationId===id && a.trigger==='network-generation-dispatch';
    // Unlinked historical episodes have no trustworthy model/effort identity: skip.
    const liveIdentity=live && e.active && id===chatIdFromURL();
    const model=linked ? a.requestModel : liveIdentity ? attemptSnapshotModel(id) : null;
    if (!pressureLabel(model)) continue;
    const postMax=pressureBest(['batch','direct'].map(f=>pressureVector(e[f],'fresh-post-max',Infinity,e.firstSeenAt)));
    const canonical=linked ? pre(a) : null;
    changed+=Number(pressureUpsert({conversationId:id,eventId:e.id,attemptId:linked?a.id:null,outcome:'max',
      timestamp:e.firstSeenAt,model,effort:linked?a.requestEffort:attemptEffortHint(),
      identitySource:linked?'generation request':'live MAX snapshot model / UI effort hint',
      confirmationSource:e.confirmationSource,provenance,
      canonical:canonical || (postMax ? {...postMax,snapshotRole:'fresh-post-max-fallback'} : null),postMax}));
  }
  return changed;
}
function pressureSave(id) {
  const store=pressureLoad();
  if(pressureWriteBlocked){store.lastError='Existing pressure store unreadable/unsupported; preserved, writes blocked';return;}
  const result=meterStorageWrite(id || 'pressure-v224',PRESSURE_KEY,store);
  store.lastError=result.saved ? null : 'Pressure calibration persistence failed; in-memory evidence retained';
}
function pressureMigrate() {
  const store=pressureLoad();if(store.migration.done)return;
  // One origin-name scan; read only V2.23 event stores, <=128 keys / 4 MiB total,
  // <=1 MiB/key. Legacy inferred V2.22 MAX is never admitted. Old bytes untouched.
  const groups=new Map();let budget=4*1024*1024;
  for(let i=0;i<localStorage.length && store.migration.examinedKeys<128;i++) {
    const key=localStorage.key(i),match=key?.match(new RegExp(`^${P}:(attempts-v223|max-episodes-v223):([^:]+)$`));
    if(!match)continue;store.migration.examinedKeys++;
    const text=localStorage.getItem(key);
    if(!text || text.length>1024*1024 || text.length>budget){store.migration.skippedKeys++;continue;}
    budget-=text.length;
    try {
      const data=eventStorageParse(text),group=groups.get(match[2]) || {};
      if(match[1]==='attempts-v223' && data?.version!==3)throw Error('Unsupported historical attempt schema');
      group[match[1]==='attempts-v223'?'attempts':'episodes']=data;groups.set(match[2],group);
    }catch{store.migration.skippedKeys++;}
  }
  for(const [id,group]of groups) store.migration.admittedEvents+=pressureDerive(id,group.attempts,group.episodes,'v223-migration');
  store.migration.done=true;
  // An empty derivation leaves storage unchanged; its marker stays in memory
  // until first useful evidence is persisted (a later empty reload may rescan).
  if(store.samples.length)pressureSave(chatIdFromURL());
}
function pressureCollect(id) {
  // Observation taps never control the validated lifecycle and never throw into it.
  if(pressureBusy || !id)return;
  pressureBusy=true;
  try {
    pressureMigrate();
    const attempts=attemptCache.get(id),episodes=episodeCache.get(id);
    if(pressureDerive(id,attempts,episodes,'v224-observed',true))pressureSave(id);
  }catch(error){pressureLoad().lastError=String(error.message).slice(0,200);}
  finally{pressureBusy=false;}
}
function pressureCurrent(id) {
  const state=eventStaticState(id),store=loadAttemptState(id),a=store.current || store.last;
  // Visible pressure follows the newest accepted current state; unlike event
  // canonicalization, an older BATCH must not mask a newer DIRECT observation.
  const canonical=['batch','direct'].map(f=>pressureVector(state[f],'current')).filter(Boolean)
    .sort((a,b)=>b.fullCapturedAt-a.fullCapturedAt || Number(b.sourceFamily==='batch')-Number(a.sourceFamily==='batch'))[0] || null;
  const snapshotModel=pressureLabel(attemptSnapshotModel(id));
  const model=pressureLabel(store.current?.requestModel) || snapshotModel || pressureLabel(a?.requestModel);
  const hint=pressureEffort(attemptEffortHint());
  const effort=hint || (model===a?.requestModel ? pressureEffort(a?.requestEffort) : null);
  return {model,effort,identitySource:hint?'snapshot/request model + UI effort hint':'snapshot/request model + last matching request effort',canonical};
}
function pressureEffectiveMax(rows) {
  const settings=new Map();
  for(const row of rows) {
    if(row.outcome!=='max' || !pressureLabel(row.conversationId) || !(row.canonical?.displayLikeTokens>0))continue;
    const key=JSON.stringify([row.conversationId,pressureLabel(row.model),pressureEffort(row.effort)]);
    const group=settings.get(key) || {conversationId:row.conversationId,effort:pressureEffort(row.effort),rows:[]};
    group.rows.push(row);settings.set(key,group);
  }
  const byChat=new Map(),lex=(a,b)=>a<b?-1:a>b?1:0;
  for(const group of settings.values()) {
    const pre=group.rows.filter(s=>s.canonical.snapshotRole==='pre-dispatch');
    // Supporting postMax is never another observation. Fallback canonical state
    // is eligible only when this setting has no canonical pre-MAX vector.
    const selected=pre.length ? pre : group.rows;
    const distinct=new Map();
    for(const row of selected) {
      const signature=JSON.stringify([row.canonical.sourceFamily,...PRESSURE_FIELDS.map(k=>row.canonical[k]??null)]);
      if(!distinct.has(signature) || pressureOrder(row,distinct.get(signature).row)<0)distinct.set(signature,{row,signature});
    }
    const states=[...distinct.values()].sort((a,b)=>a.row.canonical.displayLikeTokens-b.row.canonical.displayLikeTokens || lex(a.signature,b.signature));
    const chat=byChat.get(group.conversationId) || {conversationId:group.conversationId,groups:[]};
    chat.groups.push({effort:group.effort,rawEpisodes:group.rows.length,distinctPreVectorCount:pre.length?states.length:0,
      distinctFallbackVectorCount:pre.length?0:states.length,preDisplayLikeRange:pre.length?
        {min:states[0].row.canonical.displayLikeTokens,max:states.at(-1).row.canonical.displayLikeTokens}:null,
      representative:states[0].row});
    byChat.set(group.conversationId,chat);
  }
  const observations=[],summary=[];
  for(const chat of [...byChat.values()].sort((a,b)=>lex(a.conversationId,b.conversationId))) {
    chat.groups.sort((a,b)=>lex(JSON.stringify(a.effort),JSON.stringify(b.effort)));
    const pre=chat.groups.filter(g=>g.representative.canonical.snapshotRole==='pre-dispatch');
    // Even same-model effort pooling cannot give one chat multiple statistical
    // votes. Preserve setting/state variation in the compact summary instead.
    const group=(pre.length?pre:chat.groups).slice().sort((a,b)=>
      a.representative.canonical.displayLikeTokens-b.representative.canonical.displayLikeTokens ||
      lex(JSON.stringify(a.effort),JSON.stringify(b.effort)))[0];
    observations.push(group.representative);
    summary.push({conversationId:chat.conversationId,canonicalEfforts:chat.groups.slice(0,8).map(g=>g.effort),
      settingGroupCount:chat.groups.length,settingGroupsOmittedCount:Math.max(0,chat.groups.length-8),
      rawMaxEpisodeCount:chat.groups.reduce((n,g)=>n+g.rawEpisodes,0),
      distinctPreVectorCount:chat.groups.reduce((n,g)=>n+g.distinctPreVectorCount,0),
      selectedCanonicalEffort:group.effort,selectedRole:group.representative.canonical.snapshotRole,
      selectedSourceFamily:group.representative.canonical.sourceFamily,anchorContribution:group.representative.canonical.displayLikeTokens,
      settings:chat.groups.slice(0,8).map(g=>({canonicalEffort:g.effort,rawEpisodes:g.rawEpisodes,
        distinctPreVectorCount:g.distinctPreVectorCount,distinctFallbackVectorCount:g.distinctFallbackVectorCount,
        preDisplayLikeRange:g.preDisplayLikeRange}))});
  }
  return {observations,summary};
}
function pressureAxis(rows, vector, field, activeMax) {
  const chats=new Map(),lex=(a,b)=>a<b?-1:a>b?1:0;
  for(const row of rows) {
    if(row.outcome!=='max' || !(pressureNumber(row.canonical?.[field])>0))continue;
    const group=chats.get(row.conversationId) || [];group.push(row);chats.set(row.conversationId,group);
  }
  const contributions=[];
  for(const [conversationId,group]of [...chats].sort((a,b)=>lex(a[0],b[0]))) {
    // One upper contribution per independent chat, using only this axis's valid
    // canonical values. Pre-MAX wins over fallback; supporting postMax is unused.
    const pre=group.filter(r=>r.canonical.snapshotRole==='pre-dispatch');
    const selected=(pre.length?pre:group).slice().sort((a,b)=>b.canonical[field]-a.canonical[field] ||
      pressureOrder(a,b) || lex(JSON.stringify([pressureEffort(a.effort),a.canonical]),JSON.stringify([pressureEffort(b.effort),b.canonical])))[0];
    contributions.push({conversationId,value:selected.canonical[field],eventId:selected.eventId,
      canonicalEffort:pressureEffort(selected.effort),snapshotRole:selected.canonical.snapshotRole,
      sourceFamily:selected.canonical.sourceFamily,fullCapturedAt:selected.canonical.fullCapturedAt});
  }
  const values=contributions.map(c=>c.value),n=values.length,anchor=n?Math.max(...values):null;
  const currentValue=pressureNumber(vector?.[field]),ratio=anchor && currentValue!=null?currentValue/anchor:null;
  return {field,anchor,ratio,independentMaxCount:n,observedMaxRange:n?{min:Math.min(...values),max:anchor}:null,
    currentValue,exceededWhileAlive:!activeMax && ratio!=null && ratio>=1,
    anchorRule:'maximum of per-conversation maximum positive canonical axis values; prefer pre-MAX over fallback',
    confidence:'low',contributions:contributions.slice(0,16),contributionsOmittedCount:Math.max(0,n-16),
    fallbackContributionCount:contributions.filter(c=>c.snapshotRole!=='pre-dispatch').length,
    sourceFamilyMismatch:contributions.some(c=>c.sourceFamily!==vector?.sourceFamily)};
}
function pressureCompute(samples, current, activeMax = false) {
  const vector=current?.canonical,model=pressureLabel(current?.model),effort=pressureEffort(current?.effort);
  const same=samples.filter(s=>pressureLabel(s.model)===model && s.canonical?.displayLikeTokens>0);
  const exact=effort ? same.filter(s=>pressureEffort(s.effort)===effort) : [];
  const maxCount=rows=>pressureEffectiveMax(rows).observations.length;
  // Preserve independent-conversation tier sufficiency and canonical effort.
  const useExact=effort && (maxCount(exact)>=2 || maxCount(same)<2 && maxCount(exact)>0);
  const rows=useExact?exact:same,tier=!model || !maxCount(rows)?'insufficient':useExact?'exact-model-effort':'same-model';
  const rawMaxima=rows.filter(s=>s.outcome==='max'),successes=rows.filter(s=>s.outcome==='success');
  const effective=pressureEffectiveMax(rows),maxima=effective.observations,n=maxima.length;
  const successConversations=new Set(successes.map(s=>s.conversationId));
  const textAxis=pressureAxis(rows,vector,'displayLikeTokens',activeMax);
  const stateAxis=pressureAxis(rows,vector,'activeBranchBytes',activeMax);
  const reason=!vector?'No valid current parser vector':!model?'Current model unknown':
    !textAxis.anchor || !stateAxis.anchor?'No comparable empirical MAX anchor for both axes':
    textAxis.ratio==null || stateAxis.ratio==null?'Current axis value missing or invalid':null;
  // Do not silently score a partial model when one primary axis is unknown.
  const ratio=reason?null:Math.max(textAxis.ratio,stateAxis.ratio);
  const dominantAxis=ratio==null?null:textAxis.ratio===stateAxis.ratio?'tie':textAxis.ratio>stateAxis.ratio?'text':'state';
  const score=activeMax || reason?null:Math.max(0,Math.min(99,Math.round(ratio*100)));
  const confidence='low',confidenceReason='Provisional heterogeneous dual-axis MAX frontier; V2.24.1 confidence held LOW';
  const anchor=textAxis.anchor,range=textAxis.observedMaxRange,spread=anchor?(range.max-range.min)/anchor:null;
  const contradictory=successes.filter(s=>textAxis.anchor && s.canonical.displayLikeTokens>=textAxis.anchor ||
    stateAxis.anchor && pressureNumber(s.canonical.activeBranchBytes)!=null && s.canonical.activeBranchBytes>=stateAxis.anchor);
  const contradictorySuccessCount=contradictory.length,effectiveContradictorySuccessConversationCount=new Set(contradictory.map(s=>s.conversationId)).size;
  const currentExceedsAnchorWhileAlive=textAxis.exceededWhileAlive || stateAxis.exceededWhileAlive;
  const secondary={};
  // Retain the old activeBranchBytes comparison for diagnostics compatibility;
  // it is now explicitly scored by stateAxis. All other fields are unweighted.
  for(const field of PRESSURE_FIELDS.filter(k=>k!=='displayLikeTokens')) {
    const xs=maxima.map(s=>s.canonical[field]).filter(x=>pressureNumber(x)!=null);
    secondary[field]={current:vector?.[field]??null,min:xs.length?Math.min(...xs):null,max:xs.length?Math.max(...xs):null};
  }
  return {modelVersion:'v2241-dual-frontier-1',state:activeMax?'current-max':reason?'calibrating':'scored',
    score,confidence,confidenceReason,textAxis,stateAxis,
    combined:{dominantAxis,ratio,score,reason:activeMax?'Verified current MAX overrides numeric pressure':reason ||
      'Maximum of text and serialized-state ratios; rounded whole score clamped to 0..99'},
    currentSourceVector:vector || null,currentDisplayLikeTokens:vector?.displayLikeTokens??null,
    model:model || null,effort:effort || null,canonicalEffort:effort || null,comparisonTier:tier,
    comparableMaxCount:n,comparableSuccessCount:successConversations.size,
    rawComparableMaxEpisodeCount:rawMaxima.length,effectiveMaxObservationCount:n,uniqueMaxConversationCount:n,
    rawComparableSuccessCount:successes.length,effectiveSuccessObservationCount:successConversations.size,uniqueSuccessConversationCount:successConversations.size,
    anchorContributionSummary:effective.summary.slice(0,16),anchorContributionSummaryOmittedCount:Math.max(0,effective.summary.length-16),
    anchorContributionSummaryRole:'Legacy low-side representatives for provenance diagnostics only; axis contributions determine capacity',
    empiricalMaxAnchor:anchor,anchorRange:range,anchorSpread:spread,anchorRule:textAxis.anchorRule,
    ratioBeforeClamping:ratio,secondaryMetricComparison:secondary,currentExceedsAnchorWhileAlive,
    contradictorySuccessCount,rawContradictorySuccessCount:contradictorySuccessCount,effectiveContradictorySuccessConversationCount,
    postMaxFallbackPresent:!!(textAxis.fallbackContributionCount || stateAxis.fallbackContributionCount),
    sourceFamilyMismatch:textAxis.sourceFamilyMismatch || stateAxis.sourceFamilyMismatch,unscoredReason:activeMax?null:reason};
}
function pressureResult(id) {
  const current=pressureCurrent(id),active=!!eventActiveEpisode(id),key=JSON.stringify([pressureRevision,current,active]);
  const cached=pressureResults.get(id);if(cached?.key===key)return cached.result;
  const result=pressureCompute(pressureLoad().samples,current,active);
  if(pressureResults.size>=16)pressureResults.delete(pressureResults.keys().next().value);
  pressureResults.set(id,{key,result});return result;
}
function pressureSummary() {
  const store=pressureLoad(),rows=store.samples,groups=Object.create(null);
  for(const row of rows){const key=JSON.stringify([pressureLabel(row.model),pressureEffort(row.effort)]);const g=groups[key] ||= {success:0,max:0};g[row.outcome]++;}
  return {schemaVersion:1,totalSamples:rows.length,totalVectors:rows.reduce((n,s)=>n+!!s.canonical+!!s.postMax,0),
    successSamples:rows.filter(s=>s.outcome==='success').length,uniqueMaxEvents:rows.filter(s=>s.outcome==='max').length,
    pendingMaxVectors:rows.filter(s=>s.outcome==='max' && !s.canonical).length,groupedByModelEffort:groups,
    oldestTimestamp:rows[0]?.timestamp??null,newestTimestamp:rows.at(-1)?.timestamp??null,
    retentionCap:PRESSURE_CAP,retentionCount:store.retentionCount,watermark:store.watermark,
    dedupPolicy:'conversation + outcome + event ID; stable first evidence, fallback/source promotion only',
    migration:store.migration,writeBlocked:pressureWriteBlocked,lastError:store.lastError};
}
function pressureText(result) {
  return result.state==='current-max'?'PRESSURE MAX':result.state==='calibrating'?'PRESSURE — / 100 · CALIBRATING':
    `PRESSURE ${result.score} / 100 · ${result.confidence.toUpperCase()}`;
}
