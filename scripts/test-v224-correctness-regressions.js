// Keep frozen harness files unchanged. Supersede the two now-invalid fixture
// assumptions (uncanonicalized alias; one chat counted as independent events).
// Candidate identity projection only serves legacy metadata assertions.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),base='2c4e78d80cae6763c3a333841db728060ff669b0';
const legacy=path.join(root,'releases/v2.24.0/chatgpt_chat_size_meter_v224_empirical_pressure.js');
const target=path.join(root,'releases/v2.24.0-calibration-correctness/chatgpt_chat_size_meter_v2240_calibration_correctness.js');
const read=fs.readFileSync,source=read(target,'utf8').replaceAll('V2.24 CALIBRATION CORRECTNESS','V2.24 EMPIRICAL PRESSURE');
fs.readFileSync=function(file,options){return path.resolve(String(file))===legacy?source:read.call(fs,file,options);};
const harness=path.join(__dirname,process.argv.includes('--v223')?'test-v224-regressions.js':'test-v224.js');
let code=read.call(fs,harness,'utf8');
assert.equal(code,execFileSync('git',['show',base+':scripts/'+path.basename(harness)],{encoding:'utf8'}));
if(!process.argv.includes('--v223')){
  for(const[old,replacement]of [
    ["row=(id,tokens,extra={})=>({conversationId:'chat-a',eventId:id", "row=(id,tokens,extra={})=>({conversationId:'calibration-chat-'+id,eventId:id"],
    ["pressureEffort('Extra   High'),'extra high'", "pressureEffort('Extra   High'),'max'"],
    ["modelVersion,'v224-display-ratio-1'", "modelVersion,'v224-display-ratio-2'"],
    ["'src/v224/pressure-calibration.js'", "'src/v224-correctness/pressure-calibration.js'"]
  ]){assert.equal(code.split(old).length,2,old);code=code.replace(old,replacement);}
  console.log('Revision regression: original 59 cases; distinct-chat anchor fixtures, demonstrated alias/model-version expectations superseded explicitly. No cases skipped.');
}
const runner=new Module(harness,module);runner.filename=harness;runner.paths=module.paths;runner._compile(code,harness);
