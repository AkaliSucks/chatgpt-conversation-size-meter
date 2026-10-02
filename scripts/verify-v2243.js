const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),Module=require('node:module'),root=path.resolve(__dirname,'..');
const parent='be93e49e6c69bf8bd87a7de8e830382afb71f810',get=p=>execFileSync('git',['show',parent+':'+p]);
const file=process.argv[2] || path.join(root,'releases/v2.24.3/chatgpt_chat_size_meter_v2243_anonymous_seed_builder.js');
const candidate=fs.readFileSync(file,'utf8');
const functions=text=>{const matches=[...text.matchAll(/^function (\w+)\(/gm)],map=new Map();
 for(let i=0;i<matches.length;i++)map.set(matches[i][1],text.slice(matches[i].index,matches[i+1]?.index??text.length));return map;};
const a=functions(get('src/v2242/pressure-calibration.js').toString()),b=functions(fs.readFileSync(path.join(root,'src/v2243/pressure-calibration.js'),'utf8'));
assert.equal(a.size,b.size);for(const [name,bytes]of a)if(name!=='pressureSeed')assert.equal(b.get(name),bytes,name);
assert.deepEqual(fs.readFileSync(path.join(root,'src/v2243/anonymous-seed.js')),get('src/v2242/anonymous-seed.js'));
console.log('PASS seed byte identity; only pressureSeed lookup changed; scorer, confidence, local accounting, migration, storage unchanged');
// Reconstruction independently enforces all unchanged bytes, including compact UI.
const build=fs.readFileSync(path.join(__dirname,'build-v2243.py'),'utf8');
const check=build.replace("target=root/'releases/v2.24.3/chatgpt_chat_size_meter_v2243_anonymous_seed_builder.js'",'target=Path('+JSON.stringify(file)+')');
console.log(execFileSync('python',['-c',check.replace("root=Path(__file__).resolve().parent.parent",'root=Path('+JSON.stringify(root)+')'),'--check'],{encoding:'utf8'}).trim());
const checker=path.join(__dirname,'verify-v224-protected.js');
const code=fs.readFileSync(checker,'utf8').replace('const candidate=fs.readFileSync(file)',`const candidate=fs.readFileSync(${JSON.stringify(file)})`)
 .replaceAll("replaceAll(\"'2.23.5'\",\"'2.24.0'\")","replaceAll(\"'2.23.5'\",\"'2.24.3'\")");
const runner=new Module(checker,module);runner.filename=checker;runner.paths=module.paths;
const args=process.argv;process.argv=['node',checker,file];runner._compile(code,checker);process.argv=args;
if(!args[2]){
 const os=require('node:os'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'v2243-negative-')),bad=path.join(dir,'bad.js');
 try{for(const marker of ['function findBestCandidate(','function pressureMigrate(','function pressureCompute(',
  'function runQuickAction(','function anonymousSampleForChat(','displayLikeTokens:840795']){
  const bytes=Buffer.from(candidate),i=bytes.indexOf(marker);assert(i>=0);bytes[i]^=1;fs.writeFileSync(bad,bytes);
  assert.throws(()=>execFileSync(process.execPath,[__filename,bad],{stdio:'pipe'}));console.log('PASS mutation rejected: '+marker);
 }}finally{fs.unlinkSync(bad);fs.rmdirSync(dir);}
}
