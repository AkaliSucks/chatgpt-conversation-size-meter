const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),Module=require('node:module'),root=path.resolve(__dirname,'..');
const parent='913458c7be3a07a2cdadb73736170d591500a52c',get=p=>execFileSync('git',['show',parent+':'+p]);
const file=process.argv[2] || path.join(root,'releases/v2.24.3.1/chatgpt_chat_size_meter_v22431_effort_normalization.js');
const candidate=fs.readFileSync(file,'utf8');
const functions=text=>{const matches=[...text.matchAll(/^function (\w+)\(/gm)],map=new Map();
 for(let i=0;i<matches.length;i++)map.set(matches[i][1],text.slice(matches[i].index,matches[i+1]?.index??text.length));return map;};
const a=functions(get('src/v2243/pressure-calibration.js').toString()),b=functions(fs.readFileSync(path.join(root,'src/v22431/pressure-calibration.js'),'utf8'));
assert.equal(a.size,b.size);for(const [name,bytes]of a)if(name!=='pressureEffort')assert.equal(b.get(name),bytes,name);
assert.equal(b.get('pressureEffort'),fs.readFileSync(path.join(root,'src/v22431/canonical-effort.js'),'utf8'));
const old=functions(get('src/v2243/anonymous-schema.js').toString()),revised=functions(fs.readFileSync(path.join(root,'src/v22431/anonymous-schema.js'),'utf8'));
assert.equal(old.get('anonymousPrivacyValid'),revised.get('anonymousPrivacyValid'));
for(const name of ['anonymous-seed','seed-registry','anonymous-export'])assert(candidate.includes(get('src/v2243/'+name+'.js').toString()),name);
console.log('PASS authoritative effort module identity; privacy, seed, registry, export selection, scorer, storage, migration byte-identical');
const build=fs.readFileSync(path.join(__dirname,'build-v22431.py'),'utf8');
const check=build.replace("target=root/'releases/v2.24.3.1/chatgpt_chat_size_meter_v22431_effort_normalization.js'",'target=Path('+JSON.stringify(file)+')');
console.log(execFileSync('python',['-c',check.replace("root=Path(__file__).resolve().parent.parent",'root=Path('+JSON.stringify(root)+')'),'--check'],{encoding:'utf8'}).trim());
const checker=path.join(__dirname,'verify-v224-protected.js');
const code=fs.readFileSync(checker,'utf8').replace('const candidate=fs.readFileSync(file)',`const candidate=fs.readFileSync(${JSON.stringify(file)})`)
 .replaceAll("replaceAll(\"'2.23.5'\",\"'2.24.0'\")","replaceAll(\"'2.23.5'\",\"'2.24.3.1'\")");
const runner=new Module(checker,module);runner.filename=checker;runner.paths=module.paths;
const args=process.argv;process.argv=['node',checker,file];runner._compile(code,checker);process.argv=args;
if(!args[2]){
 const os=require('node:os'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'v22431-negative-')),bad=path.join(dir,'bad.js');
 try{for(const marker of ['function findBestCandidate(','function pressureMigrate(','function pressureCompute(',
  'function anonymousPrivacyValid(','function anonymousSampleForChat(','displayLikeTokens:840795']){
  const bytes=Buffer.from(candidate),i=bytes.indexOf(marker);assert(i>=0);bytes[i]^=1;fs.writeFileSync(bad,bytes);
  assert.throws(()=>execFileSync(process.execPath,[__filename,bad],{stdio:'pipe'}));console.log('PASS mutation rejected: '+marker);
 }}finally{fs.unlinkSync(bad);fs.rmdirSync(dir);}
}
