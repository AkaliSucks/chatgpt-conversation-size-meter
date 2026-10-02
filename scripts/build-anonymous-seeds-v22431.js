// Offline candidate builder. Anonymous inputs only; no writes or seed admission.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const scope={};vm.createContext(scope);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/v22431/canonical-effort.js'),'utf8')+'\n'+
  fs.readFileSync(path.join(__dirname,'../src/v22431/anonymous-schema.js'),'utf8')+
  '\nglobalThis.valid=anonymousSampleValid;globalThis.privacy=anonymousPrivacyValid;globalThis.effort=pressureEffort;globalThis.fields=[...ANONYMOUS_SAMPLE_HEADERS,...ANONYMOUS_SAMPLE_METRICS];',scope);
function buildAnonymousSeeds(samples,{groupKeys=[]}={}) {
  if(!Array.isArray(samples) || !Array.isArray(groupKeys) || groupKeys.length>samples.length)throw Error('Invalid anonymous input');
  const groups=new Map();let rejectedSampleCount=0;
  samples.forEach((raw,i)=>{
    if(!raw || Array.isArray(raw) || !scope.privacy(raw)){rejectedSampleCount++;return;}
    const sample={...raw,canonicalEffort:scope.effort(raw.canonicalEffort)};
    const key=groupKeys[i];
    if(!scope.valid(sample) || key!=null && (typeof key!=='string' || !/^[a-z][a-z0-9_-]{0,63}$/i.test(key))){rejectedSampleCount++;return;}
    const identity=JSON.stringify([sample.model,sample.canonicalEffort]);
    if(!groups.has(identity))groups.set(identity,{model:sample.model,canonicalEffort:sample.canonicalEffort,max:[],success:[]});
    groups.get(identity)[sample.outcome].push({sample,key});
  });
  const seeds=[],summaries=[];
  for(const [,group]of [...groups].sort(([a],[b])=>a<b?-1:a>b?1:0)) {
    const vectors=new Map(),observations=new Map(),contributors=new Map();
    for(const {sample,key}of group.max){
      const pair=JSON.stringify([sample.displayLikeTokens,sample.activeBranchBytes]);
      vectors.set(pair,{displayLikeTokens:sample.displayLikeTokens,activeBranchBytes:sample.activeBranchBytes});
      const anonymous=Object.fromEntries(scope.fields.map(field=>[field,sample[field] ?? null]));
      contributors.set(JSON.stringify(anonymous),anonymous);
      if(key!=null){if(!observations.has(key))observations.set(key,new Set());observations.get(key).add(pair);}
    }
    // Caller labels are declarations, never proof of independence. Merge labels
    // sharing a vector transitively so duplicates cannot inflate that count.
    const clusters=[];
    for(const pairs of observations.values()){
      const overlaps=clusters.filter(c=>[...pairs].some(p=>c.has(p)));
      const merged=new Set(pairs);for(const c of overlaps)for(const p of c)merged.add(p);
      for(const c of overlaps)clusters.splice(clusters.indexOf(c),1);clusters.push(merged);
    }
    const profiles=[...vectors.values()].sort((a,b)=>a.displayLikeTokens-b.displayLikeTokens || a.activeBranchBytes-b.activeBranchBytes);
    const range=(rows,field)=>rows.length?{min:Math.min(...rows.map(r=>r.sample[field])),max:Math.max(...rows.map(r=>r.sample[field]))}:null;
    if(profiles.length)seeds.push({model:group.model,canonicalEffort:group.canonicalEffort,seedVersion:'candidate-anonymous-builder-1',profiles});
    summaries.push({model:group.model,canonicalEffort:group.canonicalEffort,maxInputSampleCount:group.max.length,
      uniqueMaxVectorCount:profiles.length,declaredLogicalObservationCount:observations.size?clusters.length:null,
      independenceVerified:false,textFrontier:profiles.length?Math.max(...profiles.map(p=>p.displayLikeTokens)):null,
      stateFrontier:profiles.length?Math.max(...profiles.map(p=>p.activeBranchBytes)):null,
      contributingMaxVectors:[...contributors].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([,s])=>s),
      successSampleCount:group.success.length,successTextRange:range(group.success,'displayLikeTokens'),successStateRange:range(group.success,'activeBranchBytes')});
  }
  return {seeds,summaries,rejectedSampleCount};
}
module.exports={buildAnonymousSeeds};
if(require.main===module){
  try {const input=JSON.parse(fs.readFileSync(process.argv[2] || 0,'utf8'));
    const result=Array.isArray(input)?buildAnonymousSeeds(input):buildAnonymousSeeds(input.samples,{groupKeys:input.groupKeys});
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
  }catch{process.stderr.write('Invalid anonymous input\n');process.exitCode=1;}
}
