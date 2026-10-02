const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process'),Module=require('node:module'),root=path.resolve(__dirname,'..');
const parent='decc7a38ad6a842015092c8c36bee09f7166289a',get=p=>execFileSync('git',['show',parent+':'+p]);
const file=process.argv[2] || path.join(root,'releases/v2.24.4/chatgpt_chat_size_meter_v2244_multi_effort_seeds.js');
const candidate=fs.readFileSync(file,'utf8'),original=get('releases/v2.24.3.2/chatgpt_chat_size_meter_v22432_medium_effort_repair.js');
assert.equal(crypto.createHash('sha256').update(original).digest('hex'),'a1e26197db6a6ad4a2344e79da2bf3798f4c1ab29e2b26ac6ebab68fc527dfa6');
const old=get('src/v2243/seed-registry.js').toString(),newer=fs.readFileSync(path.join(root,'src/v2244/seed-registry.js'),'utf8');
assert.equal(candidate.split(newer).length,2);
const reversed=candidate.replace(newer,()=>old).replaceAll('V2.24.4 MULTI-EFFORT ANONYMOUS SEEDS','V2.24.3.2 MEDIUM EFFORT REPAIR')
 .replaceAll("'2.24.4'","'2.24.3.2'").replace('// @version      2.24.4','// @version      2.24.3.2');
assert.equal(reversed,original.toString(),'every parent byte unchanged except static registry and identity metadata');
assert(candidate.includes(get('src/v2242/anonymous-seed.js').toString()));assert(candidate.includes(get('src/v22432/canonical-effort.js').toString()));
console.log('PASS exact parent reconstruction; original Extra High seed and canonical aliases unchanged; all scorer/privacy/parser/storage function bodies unchanged');
const build=fs.readFileSync(path.join(__dirname,'build-v2244.py'),'utf8');
const check=build.replace("target=root/'releases/v2.24.4/chatgpt_chat_size_meter_v2244_multi_effort_seeds.js'",'target=Path('+JSON.stringify(file)+')');
console.log(execFileSync('python',['-c',check.replace("root=Path(__file__).resolve().parent.parent",'root=Path('+JSON.stringify(root)+')'),'--check'],{encoding:'utf8'}).trim());
const checker=path.join(__dirname,'verify-v224-protected.js');
const code=fs.readFileSync(checker,'utf8').replace('const candidate=fs.readFileSync(file)',`const candidate=fs.readFileSync(${JSON.stringify(file)})`)
 .replaceAll("replaceAll(\"'2.23.5'\",\"'2.24.0'\")","replaceAll(\"'2.23.5'\",\"'2.24.4'\")");
const runner=new Module(checker,module);runner.filename=checker;runner.paths=module.paths;
const args=process.argv;process.argv=['node',checker,file];runner._compile(code,checker);process.argv=args;
if(!args[2]){
 const os=require('node:os'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'v2244-negative-')),bad=path.join(dir,'bad.js');
 try{for(const marker of ['function findBestCandidate(','function pressureMigrate(','function pressureCompute(',
  'function anonymousPrivacyValid(','function anonymousSampleForChat(','canonicalEffort:"high"']){
  const bytes=Buffer.from(candidate),i=bytes.indexOf(marker);assert(i>=0);bytes[i]^=1;fs.writeFileSync(bad,bytes);
  assert.throws(()=>execFileSync(process.execPath,[__filename,bad],{stdio:'pipe'}));console.log('PASS mutation rejected: '+marker);
 }}finally{fs.unlinkSync(bad);fs.rmdirSync(dir);}
}
