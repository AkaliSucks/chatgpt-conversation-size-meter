// Unchanged V2.24.4 cases against the repair; only version/name projection.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),root=path.resolve(__dirname,'..'),read=fs.readFileSync;
const parent='904798397da384c1eee4190035647a22b521464f';
const legacy=path.join(root,'releases/v2.24.4/chatgpt_chat_size_meter_v2244_multi_effort_seeds.js');
const target=path.join(root,'releases/v2.24.4.1/chatgpt_chat_size_meter_v22441_current_model_identity.js');
const source=read(target,'utf8').replaceAll('V2.24.4.1 CURRENT MODEL IDENTITY REPAIR','V2.24.4 MULTI-EFFORT ANONYMOUS SEEDS')
 .replaceAll("'2.24.4.1'","'2.24.4'").replace('// @version      2.24.4.1','// @version      2.24.4');
fs.readFileSync=function(file,options){return path.resolve(String(file))===legacy?source:read.call(fs,file,options);};
const harness=path.join(__dirname,process.argv.includes('--registry')?'test-v2244.js':'test-v2244-regressions.js');
const code=read.call(fs,harness,'utf8');assert.equal(code,execFileSync('git',['show',parent+':scripts/'+path.basename(harness)],{encoding:'utf8'}));
console.log('V2.24.4.1 current identity repair: unchanged prior cases, identity projection only; inherited legacy registry fixtures explicitly labelled.');
const runner=new Module(harness,module);runner.filename=harness;runner.paths=module.paths;runner._compile(code,harness);
