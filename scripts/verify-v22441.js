const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process'),Module=require('node:module'),root=path.resolve(__dirname,'..');
const parent='904798397da384c1eee4190035647a22b521464f',get=p=>execFileSync('git',['show',parent+':'+p]);
const file=process.argv[2] || path.join(root,'releases/v2.24.4.1/chatgpt_chat_size_meter_v22441_current_model_identity.js');
const candidate=fs.readFileSync(file,'utf8'),original=get('releases/v2.24.4/chatgpt_chat_size_meter_v2244_multi_effort_seeds.js');
assert.equal(crypto.createHash('sha256').update(original).digest('hex'),'6904e1095b94109dcfda934fe0b54ae78b5b3a869c00b5b454f33ffd9f4983e3');
const start=original.indexOf('function pressureCurrent('),end=original.indexOf('function pressureEffectiveMax(',start);
assert(start>=0 && end>start);const old=original.subarray(start,end).toString(),newer=fs.readFileSync(path.join(root,'src/v22441/pressure-current.js'),'utf8');
assert.equal(candidate.split(newer).length,2);
const reversed=candidate.replace(newer,()=>old).replaceAll('V2.24.4.1 CURRENT MODEL IDENTITY REPAIR','V2.24.4 MULTI-EFFORT ANONYMOUS SEEDS')
 .replaceAll("'2.24.4.1'","'2.24.4'").replace('// @version      2.24.4.1','// @version      2.24.4');
assert.equal(reversed,original.toString(),'every parent byte unchanged except pressureCurrent and identity metadata');
for(const name of ['src/v2244/seed-registry.js','src/v2242/anonymous-seed.js','src/v22432/canonical-effort.js'])assert(candidate.includes(get(name).toString()),name);
console.log('PASS exact parent reconstruction; current identity only; scorer/registry/privacy/aliases/storage/parser/capture/MAX bytes unchanged');
const build=fs.readFileSync(path.join(__dirname,'build-v22441.py'),'utf8');
const check=build.replace("target=root/'releases/v2.24.4.1/chatgpt_chat_size_meter_v22441_current_model_identity.js'",'target=Path('+JSON.stringify(file)+')');
console.log(execFileSync('python',['-c',check.replace("root=Path(__file__).resolve().parent.parent",'root=Path('+JSON.stringify(root)+')'),'--check'],{encoding:'utf8'}).trim());
const checker=path.join(__dirname,'verify-v224-protected.js');
const code=fs.readFileSync(checker,'utf8').replace('const candidate=fs.readFileSync(file)',`const candidate=fs.readFileSync(${JSON.stringify(file)})`)
 .replaceAll("replaceAll(\"'2.23.5'\",\"'2.24.0'\")","replaceAll(\"'2.23.5'\",\"'2.24.4.1'\")");
const runner=new Module(checker,module);runner.filename=checker;runner.paths=module.paths;
const args=process.argv;process.argv=['node',checker,file];runner._compile(code,checker);process.argv=args;
if(!args[2]){
 const os=require('node:os'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'v22441-negative-')),bad=path.join(dir,'bad.js');
 try{for(const marker of ['function pressureCurrent(','function findBestCandidate(','function pressureMigrate(','function pressureCompute(',
  'function anonymousPrivacyValid(','function anonymousSampleForChat(','canonicalEffort:"medium"','function pressureEffort(']){
  const bytes=Buffer.from(candidate),i=bytes.indexOf(marker);assert(i>=0);bytes[i]^=1;fs.writeFileSync(bad,bytes);
  assert.throws(()=>execFileSync(process.execPath,[__filename,bad],{stdio:'pipe'}));console.log('PASS mutation rejected: '+marker);
 }}finally{fs.unlinkSync(bad);fs.rmdirSync(dir);}
}
