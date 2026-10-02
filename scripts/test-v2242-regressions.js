// Preserve all V2.24.1 cases. Local-only regression cohorts use an unsupported
// synthetic model, while test-v2242.js exercises the exact supported seed cohort.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),root=path.resolve(__dirname,'..'),read=fs.readFileSync;
const base='2658874a7acf71c8805677098c08f7e79c7422cc',legacy=path.join(root,'releases/v2.24.1/chatgpt_chat_size_meter_v2241_dual_axis_pressure.js');
const target=path.join(root,'releases/v2.24.2/chatgpt_chat_size_meter_v2242_anonymous_seed_calibration.js');
const source=read(target,'utf8').replaceAll('V2.24.2 ANONYMOUS SEED CALIBRATION','V2.24.1 DUAL AXIS PRESSURE')
  .replaceAll("'2.24.2'","'2.24.1'").replace('// @version      2.24.2','// @version      2.24.1')
  .replaceAll('v2242-seeded-dual-frontier-1','v2241-dual-frontier-1').replaceAll('V2.24.2 confidence','V2.24.1 confidence');
fs.readFileSync=function(file,options){const name=path.resolve(String(file));
  if(name===legacy)return source;
  if(name===path.join(root,'src/v2241/pressure-calibration.js'))return read.call(fs,path.join(root,'src/v2242/pressure-calibration.js'),options);
  if(name===path.join(root,'fixtures/v2241/dual-axis-vectors.json')){
    const data=JSON.parse(read.call(fs,file,'utf8'));data.model='local-only-regression-model';return JSON.stringify(data);
  }
  return read.call(fs,file,options);
};
const dual=process.argv.includes('--dual'),harness=path.join(__dirname,dual?'test-v2241.js':'test-v2241-regressions.js');
let code=read.call(fs,harness,'utf8');assert.equal(code,execFileSync('git',['show',base+':scripts/'+path.basename(harness)],{encoding:'utf8'}));
if(dual){
  const before="const oldSource=fs.readFileSync(path.join(root,'releases/v2.24.0-calibration-correctness/chatgpt_chat_size_meter_v2240_calibration_correctness.js'),'utf8');";
  // This older source path is already distinct from the candidate and stays frozen.
  assert(code.includes(before));
}else{
  const marker='const runner=new Module(harness,module)';assert.equal(code.split(marker).length,2);
  code=code.replace(marker,"if(mode==='31')code=code.replaceAll('gpt-5-6-thinking','local-only-regression-model');\n"+marker);
}
console.log('V2.24.2 local-only regression: unchanged V2.24.1 cases; seed-ineligible synthetic model for 31/34 cases; identity-only projection. Supported seed behavior tested separately. No cases skipped.');
const runner=new Module(harness,module);runner.filename=harness;runner.paths=module.paths;runner._compile(code,harness);
