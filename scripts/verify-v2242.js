// Exact reconstruction and unchanged parser/capture/local-calibration regions.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process'),Module=require('node:module'),root=path.resolve(__dirname,'..');
const parent='2658874a7acf71c8805677098c08f7e79c7422cc',get=p=>execFileSync('git',['show',parent+':'+p]);
const old=get('src/v2241/pressure-calibration.js').toString(),revised=fs.readFileSync(path.join(root,'src/v2242/pressure-calibration.js'),'utf8');
const seed=fs.readFileSync(path.join(root,'src/v2242/anonymous-seed.js'),'utf8')+'\n';
const file=process.argv[2] || path.join(root,'releases/v2.24.2/chatgpt_chat_size_meter_v2242_anonymous_seed_calibration.js');
const candidate=fs.readFileSync(file,'utf8'),original=get('releases/v2.24.1/chatgpt_chat_size_meter_v2241_dual_axis_pressure.js');
assert.equal(crypto.createHash('sha256').update(original).digest('hex'),'4466fffc8040905d367c3d4acad05a7108d16599b62c5143e8fbeda5488abac5');
assert.equal(original.toString().split(old).length,2);
let expected=original.toString().replace(old,()=>seed+revised).replaceAll('V2.24.1 DUAL AXIS PRESSURE','V2.24.2 ANONYMOUS SEED CALIBRATION');
for(const[before,after]of [["// @version      2.24.1","// @version      2.24.2"],
  ["health.candidateVersion = '2.24.1'","health.candidateVersion = '2.24.2'"],["version:'2.24.1'","version:'2.24.2'"]]){
  assert.equal(expected.split(before).length,2);expected=expected.replace(before,after);
}
assert.equal(candidate,expected,'only static seed, seeded pressure view, and six identity fields change');
const functions=text=>{const matches=[...text.matchAll(/^function (\w+)\(/gm)],map=new Map();
  for(let i=0;i<matches.length;i++)map.set(matches[i][1],text.slice(matches[i].index,matches[i+1]?.index??text.length));return map;};
const a=functions(old),b=functions(revised);assert.equal(b.size,a.size+2);assert(b.has('pressureSeed'));assert(b.has('pressureSeedAxis'));
for(const[name,bytes]of a)if(!['pressureBlank','pressureCompute'].includes(name))assert.equal(b.get(name),bytes,name);
console.log('PASS exact frozen V2.24.1; local pressureAxis/effective MAX accounting and every storage/migration/capture helper unchanged');
const checker=path.join(__dirname,'verify-v224-protected.js');
const code=fs.readFileSync(checker,'utf8').replace('const candidate=fs.readFileSync(file)',`const candidate=fs.readFileSync(${JSON.stringify(file)})`)
  .replaceAll("replaceAll(\"'2.23.5'\",\"'2.24.0'\")","replaceAll(\"'2.23.5'\",\"'2.24.2'\")");
const runner=new Module(checker,module);runner.filename=checker;runner.paths=module.paths;
const args=process.argv;process.argv=['node',checker,file];runner._compile(code,checker);process.argv=args;
if(!args[2]){
  console.log(execFileSync('python',[path.join(__dirname,'build-v2242.py'),'--check'],{encoding:'utf8'}).trim());
  const os=require('node:os'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'v2242-negative-')),bad=path.join(dir,'bad.js');
  try{for(const marker of ['function findBestCandidate(','function pressureMigrate(','function pressureAxis(','function getStatus(',
    'function captureRouteKind(','displayLikeTokens:840795']){
    const bytes=Buffer.from(candidate),i=bytes.indexOf(marker);assert(i>=0);bytes[i]^=1;fs.writeFileSync(bad,bytes);
    assert.throws(()=>execFileSync(process.execPath,[__filename,bad],{stdio:'pipe'}));console.log('PASS one-byte mutation rejected: '+marker);
  }}finally{fs.unlinkSync(bad);fs.rmdirSync(dir);}
}
