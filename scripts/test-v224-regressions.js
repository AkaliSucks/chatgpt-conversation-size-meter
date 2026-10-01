// Execute the unchanged V2.23.5 harness on V2.24. Only candidate identity literals
// are projected to the frozen labels expected by its version-specific assertions.
// Behavior, cases, fixture data and all other bytes stay unchanged.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const root=path.resolve(__dirname,'..');
const candidate=path.join(root,'releases/v2.24.0/chatgpt_chat_size_meter_v224_empirical_pressure.js');
const harness=path.join(__dirname,'test-v223.js');
let source=fs.readFileSync(candidate,'utf8');
for(const [old,replacement] of [
  ['// @name         ChatGPT Conversation Size Meter V2.24 EMPIRICAL PRESSURE','// @name         ChatGPT Conversation Size Meter V2.23.5 RELIABILITY HOTFIX'],
  ['// @version      2.24.0','// @version      2.23.5'],
  ["health.candidateVersion = '2.24.0';","health.candidateVersion = '2.23.5';"],
  ["const trace = {version:'2.24.0'","const trace = {version:'2.23.5'"],
  ['ChatGPT Conversation Size Meter V2.24 EMPIRICAL PRESSURE','ChatGPT Conversation Size Meter V2.23.5 EVENT MODEL CLEANUP'],
  ['Candidate userscript: V2.24 EMPIRICAL PRESSURE','Candidate userscript: V2.23.5 RELIABILITY HOTFIX']
]) {if(source.split(old).length!==2)throw Error('Identity projection boundary '+old);source=source.replace(old,replacement);}
const originalRead=fs.readFileSync;
fs.readFileSync=function(file,options){return path.resolve(String(file))===candidate ? source : originalRead.call(fs,file,options);};
process.argv[2]=candidate;
const moduleUnderTest=new Module(harness,module);moduleUnderTest.filename=harness;moduleUnderTest.paths=module.paths;
moduleUnderTest._compile(originalRead.call(fs,harness,'utf8'),harness);
