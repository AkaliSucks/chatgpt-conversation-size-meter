// Complete parent reconstruction, unchanged pressure functions, and byte protection.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process'),Module=require('node:module'),root=path.resolve(__dirname,'..');
const parent='34195fa83942beb8b5e335833634295abb85898b',get=p=>execFileSync('git',['show',parent+':'+p]);
const old=get('src/v224-correctness/pressure-calibration.js').toString(),revised=fs.readFileSync(path.join(root,'src/v2241/pressure-calibration.js'),'utf8');
const file=process.argv[2] || path.join(root,'releases/v2.24.1/chatgpt_chat_size_meter_v2241_dual_axis_pressure.js');
const candidate=fs.readFileSync(file,'utf8'),original=get('releases/v2.24.0-calibration-correctness/chatgpt_chat_size_meter_v2240_calibration_correctness.js');
assert.equal(crypto.createHash('sha256').update(original).digest('hex'),'106cf0e897c3a20d60e968de50702df22bf3b1b1934dc8e0611d68b7c1f82ca5');
assert.equal(original.toString().split(old).length,2);
let expected=original.toString().replace(old,()=>revised).replaceAll('V2.24 CALIBRATION CORRECTNESS','V2.24.1 DUAL AXIS PRESSURE');
for(const [before,after]of [["// @version      2.24.0","// @version      2.24.1"],
  ["health.candidateVersion = '2.24.0'","health.candidateVersion = '2.24.1'"],["version:'2.24.0'","version:'2.24.1'"]]){
  assert.equal(expected.split(before).length,2);expected=expected.replace(before,after);
}
assert.equal(candidate,expected,'all bytes outside pressure fragment and six identity fields unchanged');
const functions=text=>{const matches=[...text.matchAll(/^function (\w+)\(/gm)],map=new Map();
  for(let i=0;i<matches.length;i++)map.set(matches[i][1],text.slice(matches[i].index,matches[i+1]?.index??text.length));return map;};
const a=functions(old),b=functions(revised);assert.equal(b.size,a.size+1);assert(b.has('pressureAxis'));
for(const[name,bytes]of a)if(!['pressureBlank','pressureCompute'].includes(name))assert.equal(b.get(name),bytes,name);
console.log('PASS exact validated parent; only pressureBlank/pressureCompute, new iterative pressureAxis and six identity fields changed');
// Execute the frozen protected checker against the actual candidate, changing
// only its expected identity literal. Region buffers are never normalized.
const checker=path.join(__dirname,'verify-v224-protected.js');
const code=fs.readFileSync(checker,'utf8').replace('const candidate=fs.readFileSync(file)',`const candidate=fs.readFileSync(${JSON.stringify(file)})`)
  .replaceAll("replaceAll(\"'2.23.5'\",\"'2.24.0'\")","replaceAll(\"'2.23.5'\",\"'2.24.1'\")");
const runner=new Module(checker,module);runner.filename=checker;runner.paths=module.paths;
const args=process.argv;process.argv=['node',checker,file];runner._compile(code,checker);process.argv=args;
if(!args[2]){
  console.log(execFileSync('python',[path.join(__dirname,'build-v2241.py'),'--check'],{encoding:'utf8'}).trim());
  const os=require('node:os'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'v2241-negative-')),bad=path.join(dir,'bad.js');
  try{for(const marker of ['function findBestCandidate(','function pressureMigrate(','function getStatus(','function captureRouteKind(']){
    const bytes=Buffer.from(candidate),i=bytes.indexOf(marker);assert(i>=0);bytes[i]^=1;fs.writeFileSync(bad,bytes);
    assert.throws(()=>execFileSync(process.execPath,[__filename,bad],{stdio:'pipe'}));console.log('PASS one-byte mutation rejected: '+marker);
  }}finally{fs.unlinkSync(bad);fs.rmdirSync(dir);}
}
