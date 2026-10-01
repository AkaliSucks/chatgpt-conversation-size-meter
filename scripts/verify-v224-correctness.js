// Strict parent reconstruction and unchanged calibration/capture regions.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process'),root=path.resolve(__dirname,'..');
const base='2c4e78d80cae6763c3a333841db728060ff669b0',get=p=>execFileSync('git',['show',base+':'+p]);
const parent=get('releases/v2.24.0/chatgpt_chat_size_meter_v224_empirical_pressure.js'),old=get('src/v224/pressure-calibration.js');
const revised=fs.readFileSync(path.join(root,'src/v224-correctness/pressure-calibration.js'));
const candidate=fs.readFileSync(process.argv[2] || path.join(root,'releases/v2.24.0-calibration-correctness/chatgpt_chat_size_meter_v2240_calibration_correctness.js'));
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
assert.equal(sha(parent),'b4f042e04f4369c8e830d0f6dd41239054b5134c580cf5d3d1c58b89cdaef866');
function once(bytes,before,after){const a=bytes.indexOf(before);assert(a>=0 && bytes.indexOf(before,a+before.length)===-1);return Buffer.concat([bytes.subarray(0,a),after,bytes.subarray(a+before.length)]);}
let expected=once(parent,old,revised);
for(const before of ['// @name         ChatGPT Conversation Size Meter V2.24 EMPIRICAL PRESSURE',
  'ChatGPT Conversation Size Meter V2.24 EMPIRICAL PRESSURE', 'Candidate userscript: V2.24 EMPIRICAL PRESSURE']){
  expected=once(expected,Buffer.from(before),Buffer.from(before.replace('EMPIRICAL PRESSURE','CALIBRATION CORRECTNESS')));
}
assert.deepEqual(candidate,expected,'every byte outside pressure fragment and three identity labels unchanged');
const functions=bytes=>{const text=bytes.toString(),matches=[...text.matchAll(/^function (\w+)\(/gm)],map=new Map();
  for(let i=0;i<matches.length;i++)map.set(matches[i][1],Buffer.from(text.slice(matches[i].index,matches[i+1]?.index??text.length)));return map;};
const original=functions(old),changed=functions(revised),allowed=new Set(['pressureEffort','pressureCleanRow','pressureBlank','pressureLoad','pressureCompute','pressureSummary']);
assert.equal(changed.size,original.size+1);assert(changed.has('pressureEffectiveMax'));
for(const[name,bytes]of original){assert(changed.has(name));if(!allowed.has(name))assert.deepEqual(changed.get(name),bytes,'unchanged pressure function '+name);}
console.log('PASS exact V2.24.0 parent; only six pressure functions, one new effective-view helper and three identity labels differ');
console.log('PASS all existing sampling, migration, retention, persistence, current-vector selection, caching, UI and V2.23.5 foundation bytes preserved');
if(!process.argv[2]){
  console.log(execFileSync('python',[path.join(__dirname,'build-v224-correctness.py'),'--check'],{encoding:'utf8'}).trim());
  console.log(execFileSync(process.execPath,[path.join(__dirname,'verify-v224-protected.js'),
    path.join(root,'releases/v2.24.0-calibration-correctness/chatgpt_chat_size_meter_v2240_calibration_correctness.js')],{encoding:'utf8'}).trim());
  const os=require('node:os'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'cgpt-pressure-correctness-')),file=path.join(dir,'negative.js');
  try{for(const marker of ['function findBestCandidate(','function pressureMigrate(','function getStatus(']){
    const bad=Buffer.from(candidate),a=bad.indexOf(Buffer.from(marker));assert(a>=0);bad[a]^=1;fs.writeFileSync(file,bad);
    let rejected=false;try{execFileSync(process.execPath,[__filename,file],{stdio:'pipe'});}catch{rejected=true;}assert(rejected);console.log('PASS negative one-byte edit rejected: '+marker);
  }}finally{fs.unlinkSync(file);fs.rmdirSync(dir);}
}
