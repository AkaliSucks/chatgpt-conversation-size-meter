// Unchanged V2.24.3 cases against repaired bytes; metadata projection only.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),root=path.resolve(__dirname,'..'),read=fs.readFileSync;
const legacy=path.join(root,'releases/v2.24.3/chatgpt_chat_size_meter_v2243_anonymous_seed_builder.js');
const target=path.join(root,'releases/v2.24.3.1/chatgpt_chat_size_meter_v22431_effort_normalization.js');
const source=read(target,'utf8').replaceAll('V2.24.3.1 CANONICAL EFFORT REPAIR','V2.24.3 MULTI-PROFILE ANONYMOUS BUILDER')
 .replaceAll("'2.24.3.1'","'2.24.3'").replace('// @version      2.24.3.1','// @version      2.24.3');
fs.readFileSync=function(file,options){return path.resolve(String(file))===legacy?source:read.call(fs,file,options);};
const anonymous=process.argv.includes('--anonymous'),harness=path.join(__dirname,anonymous?'test-v2243.js':'test-v2243-regressions.js');
let code=read.call(fs,harness,'utf8');assert.equal(code,execFileSync('git',['show','913458c7be3a07a2cdadb73736170d591500a52c:scripts/'+path.basename(harness)],{encoding:'utf8'}));
if(anonymous)code=code.replaceAll('build-anonymous-seeds','build-anonymous-seeds-v22431');
console.log('V2.24.3.1: frozen V2.24.3 cases; identity projection only; offline builder cases/CLI redirected to repaired utility. No cases skipped.');
const runner=new Module(harness,module);runner.filename=harness;runner.paths=module.paths;runner._compile(code,harness);
