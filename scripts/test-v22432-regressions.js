// All V2.24.3.1 cases preserved; project metadata, redirect only builder path.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),root=path.resolve(__dirname,'..'),read=fs.readFileSync;
const legacy=path.join(root,'releases/v2.24.3.1/chatgpt_chat_size_meter_v22431_effort_normalization.js');
const target=path.join(root,'releases/v2.24.3.2/chatgpt_chat_size_meter_v22432_medium_effort_repair.js');
const source=read(target,'utf8').replaceAll('V2.24.3.2 MEDIUM EFFORT REPAIR','V2.24.3.1 CANONICAL EFFORT REPAIR')
 .replaceAll("'2.24.3.2'","'2.24.3.1'").replace('// @version      2.24.3.2','// @version      2.24.3.1');
fs.readFileSync=function(file,options){return path.resolve(String(file))===legacy?source:read.call(fs,file,options);};
const effort=process.argv.includes('--effort'),harness=path.join(__dirname,effort?'test-v22431.js':'test-v22431-regressions.js');
let code=read.call(fs,harness,'utf8');assert.equal(code,execFileSync('git',['show','849e75ac78c55d5359efa16003783bbb8228c83b:scripts/'+path.basename(harness)],{encoding:'utf8'}));
code=code.replaceAll('build-anonymous-seeds-v22431','build-anonymous-seeds-v22432');
// The nested adapter consequently redirects its unchanged anonymous suite too.
console.log('V2.24.3.2: unchanged V2.24.3.1 cases; metadata projection and latest builder/CLI path only. No cases skipped.');
const runner=new Module(harness,module);runner.filename=harness;runner.paths=module.paths;runner._compile(code,harness);
