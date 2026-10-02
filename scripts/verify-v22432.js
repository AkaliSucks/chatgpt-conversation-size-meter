const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process'),Module=require('node:module'),root=path.resolve(__dirname,'..');
const parent='849e75ac78c55d5359efa16003783bbb8228c83b',get=p=>execFileSync('git',['show',parent+':'+p]);
const file=process.argv[2] || path.join(root,'releases/v2.24.3.2/chatgpt_chat_size_meter_v22432_medium_effort_repair.js');
const candidate=fs.readFileSync(file,'utf8'),original=get('releases/v2.24.3.1/chatgpt_chat_size_meter_v22431_effort_normalization.js');
assert.equal(crypto.createHash('sha256').update(original).digest('hex'),'5ee71a060d08570073a202dcef25700d5eeb559472f872613206b37f6e98efde');
const old=get('src/v22431/canonical-effort.js').toString(),newer=fs.readFileSync(path.join(root,'src/v22432/canonical-effort.js'),'utf8');
assert.equal(candidate.split(newer).length,2);
const reversed=candidate.replace(newer,()=>old).replaceAll('V2.24.3.2 MEDIUM EFFORT REPAIR','V2.24.3.1 CANONICAL EFFORT REPAIR')
 .replaceAll("'2.24.3.2'","'2.24.3.1'").replace('// @version      2.24.3.2','// @version      2.24.3.1');
assert.equal(reversed,original.toString(),'every parent byte unchanged except normalizer and identity metadata');
const oldBuilder=get('scripts/build-anonymous-seeds-v22431.js').toString(),builder=fs.readFileSync(path.join(root,'scripts/build-anonymous-seeds-v22432.js'),'utf8');
assert.equal(builder,oldBuilder.replace('../src/v22431/canonical-effort.js','../src/v22432/canonical-effort.js'));
console.log('PASS exact parent reconstruction; shared normalizer source only; privacy, schema, request ingestion, grouping, seed, scoring, storage, migration and UI unchanged');
const build=fs.readFileSync(path.join(__dirname,'build-v22432.py'),'utf8');
const check=build.replace("target=root/'releases/v2.24.3.2/chatgpt_chat_size_meter_v22432_medium_effort_repair.js'",'target=Path('+JSON.stringify(file)+')');
console.log(execFileSync('python',['-c',check.replace("root=Path(__file__).resolve().parent.parent",'root=Path('+JSON.stringify(root)+')'),'--check'],{encoding:'utf8'}).trim());
const checker=path.join(__dirname,'verify-v224-protected.js');
const code=fs.readFileSync(checker,'utf8').replace('const candidate=fs.readFileSync(file)',`const candidate=fs.readFileSync(${JSON.stringify(file)})`)
 .replaceAll("replaceAll(\"'2.23.5'\",\"'2.24.0'\")","replaceAll(\"'2.23.5'\",\"'2.24.3.2'\")");
const runner=new Module(checker,module);runner.filename=checker;runner.paths=module.paths;
const args=process.argv;process.argv=['node',checker,file];runner._compile(code,checker);process.argv=args;
if(!args[2]){
 const os=require('node:os'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'v22432-negative-')),bad=path.join(dir,'bad.js');
 try{for(const marker of ['function findBestCandidate(','function pressureMigrate(','function pressureCompute(',
  'function anonymousPrivacyValid(','function anonymousSampleForChat(','displayLikeTokens:840795']){
  const bytes=Buffer.from(candidate),i=bytes.indexOf(marker);assert(i>=0);bytes[i]^=1;fs.writeFileSync(bad,bytes);
  assert.throws(()=>execFileSync(process.execPath,[__filename,bad],{stdio:'pipe'}));console.log('PASS mutation rejected: '+marker);
 }}finally{fs.unlinkSync(bad);fs.rmdirSync(dir);}
}
