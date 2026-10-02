// Schema 1 is an allowlisted anonymous metric projection, never a diagnostic dump.
const ANONYMOUS_SAMPLE_METRICS = Object.freeze(['displayLikeTokens','activeBranchBytes','mappingBytes',
  'retainedBytes','toolResultBytes','branchNodes','messageNodes','retainedShare','hot128','hot256','strongContextMarkers']);
const ANONYMOUS_SAMPLE_HEADERS = Object.freeze(['schemaVersion','candidateVersion','model','canonicalEffort',
  'outcome','snapshotRole','sourceFamily','verifiedCurrentMax','pressureState']);
function anonymousPrivacyValid(value) {
  // Inspect nested objects/arrays iteratively. Cycles, accessors, unusual values
  // and excessive structure fail closed instead of being serialized accidentally.
  const pending=[{value,depth:0}],seen=new Set();let count=0;
  try {
    while(pending.length) {
      const item=pending.pop(),x=item.value;if(++count>1024 || item.depth>32)return false;
      if(x==null || typeof x==='boolean')continue;
      if(typeof x==='number'){if(!Number.isFinite(x))return false;continue;}
      if(typeof x==='string'){
        if(x.length>160 || /(?:https?:\/\/|www\.|[a-z]+:\/\/|\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b|\d{4}-\d{2}-\d{2}T\d{2}:)/i.test(x))return false;
        continue;
      }
      if(typeof x!=='object' || seen.has(x) || !['[object Object]','[object Array]'].includes(Object.prototype.toString.call(x)))return false;
      seen.add(x);
      for(const key of Reflect.ownKeys(x)) {
        if(typeof key!=='string')return false;
        const normalized=key.replace(/[^a-z0-9]/gi,'').toLowerCase();
        if(/(?:conversationid|messageid|attemptid|episodeid|accountid|userid|assetid|timestamp|prompt|response|screenshot|filename|rawmapping|rawdiagnostic)/.test(normalized) ||
          /(?:id|ids|url|urls|uri|uris|href|title|mapping|mappings|diagnostics|diagnosticblobs|rawbody|content|text)$/.test(normalized) ||
          /(?:started|ended|created|updated|confirmed|completed|observed|captured)at$/.test(normalized) ||
          ['time','date','capturedat','fullcapturedat','firstseenat','lastseenat','requestdetectedat','outcomeconfirmedat','rawdiagnosticblob','rawdiagnosticblobs','account','user','asset','file'].includes(normalized))return false;
        const descriptor=Object.getOwnPropertyDescriptor(x,key);
        if(!descriptor || descriptor.get || descriptor.set)return false;
        pending.push({value:descriptor.value,depth:item.depth+1});
      }
    }
    return true;
  }catch{return false;}
}
function anonymousSampleValid(sample) {
  if(!sample || Array.isArray(sample) || !anonymousPrivacyValid(sample))return false;
  const allowed=[...ANONYMOUS_SAMPLE_HEADERS,...ANONYMOUS_SAMPLE_METRICS];
  if(Object.keys(sample).some(k=>!allowed.includes(k)) || ANONYMOUS_SAMPLE_HEADERS.some(k=>!Object.hasOwn(sample,k)))return false;
  if(sample.schemaVersion!==1 || !/^\d+\.\d+\.\d+$/.test(sample.candidateVersion) || typeof sample.candidateVersion!=='string' ||
    typeof sample.model!=='string' || !/^[a-z][a-z0-9._-]{0,119}$/i.test(sample.model) ||
    typeof sample.canonicalEffort!=='string' || !/^[a-z][a-z0-9 ._-]{0,39}$/.test(sample.canonicalEffort) ||
    sample.canonicalEffort!==sample.canonicalEffort.trim().replace(/\s+/g,' ') || sample.canonicalEffort==='extra high' ||
    !['direct','batch'].includes(sample.sourceFamily) || !['scored','calibrating','current-max'].includes(sample.pressureState))return false;
  const max=sample.outcome==='max',success=sample.outcome==='success';
  if(!max && !success || sample.verifiedCurrentMax!==max || max && sample.pressureState!=='current-max' || success && sample.pressureState==='current-max' ||
    !(max?['pre-max','fallback','current-max']:['success-pre','current']).includes(sample.snapshotRole))return false;
  for(const field of ANONYMOUS_SAMPLE_METRICS) {
    const x=sample[field];
    if(x==null){if(['displayLikeTokens','activeBranchBytes','mappingBytes','branchNodes'].includes(field))return false;continue;}
    if(typeof x!=='number' || !Number.isFinite(x) || x<0)return false;
  }
  return sample.displayLikeTokens>0 && sample.activeBranchBytes>0 && sample.mappingBytes>0 && sample.branchNodes>0;
}
function anonymousProjectSample(identity, vector) {
  if(!vector)return null;
  const sample={schemaVersion:1,candidateVersion:'2.24.3',model:identity.model,canonicalEffort:identity.effort,
    outcome:identity.outcome,snapshotRole:identity.role,sourceFamily:vector.sourceFamily,
    ...Object.fromEntries(ANONYMOUS_SAMPLE_METRICS.map(k=>[k,typeof vector[k]==='number' && Number.isFinite(vector[k]) && vector[k]>=0?vector[k]:null])),
    verifiedCurrentMax:identity.outcome==='max',pressureState:identity.pressureState};
  return anonymousSampleValid(sample)?sample:null;
}
