// Frozen cases retained. Full registry for foundation/local-only cohorts;
// legacy unsupported-High/Medium assertions use an explicit single-seed fixture.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),root=path.resolve(__dirname,'..'),read=fs.readFileSync;
const parent='decc7a38ad6a842015092c8c36bee09f7166289a';
const legacy=path.join(root,'releases/v2.24.3.2/chatgpt_chat_size_meter_v22432_medium_effort_repair.js');
const target=path.join(root,'releases/v2.24.4/chatgpt_chat_size_meter_v2244_multi_effort_seeds.js');
const single=['--seed','--anonymous','--effort','--medium'].some(flag=>process.argv.includes(flag));
let source=read(target,'utf8').replaceAll('V2.24.4 MULTI-EFFORT ANONYMOUS SEEDS','V2.24.3.2 MEDIUM EFFORT REPAIR')
 .replaceAll("'2.24.4'","'2.24.3.2'").replace('// @version      2.24.4','// @version      2.24.3.2');
if(single){const registry=read(path.join(root,'src/v2244/seed-registry.js'),'utf8');assert.equal(source.split(registry).length,2);
 source=source.replace(registry,()=>execFileSync('git',['show',parent+':src/v2243/seed-registry.js'],{encoding:'utf8'}));}
fs.readFileSync=function(file,options){return path.resolve(String(file))===legacy?source:read.call(fs,file,options);};
const medium=process.argv.includes('--medium'),harness=path.join(__dirname,medium?'test-v22432.js':'test-v22432-regressions.js');
const code=read.call(fs,harness,'utf8');assert.equal(code,execFileSync('git',['show',parent+':scripts/'+path.basename(harness)],{encoding:'utf8'}));
console.log(single?'V2.24.4 legacy single-seed fixture: all old cases retained; only registry data and identity projected. Full three-entry behavior tested separately.':
 'V2.24.4 full three-entry registry: all foundation/local-only cases retained; identity projection only.');
const runner=new Module(harness,module);runner.filename=harness;runner.paths=module.paths;runner._compile(code,harness);
