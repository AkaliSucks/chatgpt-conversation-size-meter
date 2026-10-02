// Every V2.24.2 case unchanged. Project version literals only, never logic.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),root=path.resolve(__dirname,'..'),read=fs.readFileSync;
const legacy=path.join(root,'releases/v2.24.2/chatgpt_chat_size_meter_v2242_anonymous_seed_calibration.js');
const target=path.join(root,'releases/v2.24.3/chatgpt_chat_size_meter_v2243_anonymous_seed_builder.js');
const source=read(target,'utf8').replaceAll('V2.24.3 MULTI-PROFILE ANONYMOUS BUILDER','V2.24.2 ANONYMOUS SEED CALIBRATION')
 .replaceAll("'2.24.3'","'2.24.2'").replace('// @version      2.24.3','// @version      2.24.2');
fs.readFileSync=function(file,options){return path.resolve(String(file))===legacy?source:read.call(fs,file,options);};
const harness=path.join(__dirname,process.argv.includes('--seed')?'test-v2242.js':'test-v2242-regressions.js');
const code=read.call(fs,harness,'utf8');assert.equal(code,execFileSync('git',['show','be93e49e6c69bf8bd87a7de8e830382afb71f810:scripts/'+path.basename(harness)],{encoding:'utf8'}));
console.log('V2.24.3: frozen V2.24.2 cases, identity literals projected only; seed and scorer unchanged. No cases skipped.');
const runner=new Module(harness,module);runner.filename=harness;runner.paths=module.paths;runner._compile(code,harness);
