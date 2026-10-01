// Execute exact original 99-case checkpoint harness against its exact source.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),Module=require('node:module');
const {execFileSync}=require('node:child_process');
const checkpoint='3337f1bd41dea2577ea2e6329783b81ea7466e00';
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'cgpt-v224-prior-'));
const source=path.join(scratch,'checkpoint.js');
fs.writeFileSync(source,execFileSync('git',['show',checkpoint+':releases/v2.23/chatgpt_chat_size_meter_v223_event_model_cleanup.js']));
process.argv[2]=source;
process.on('exit',()=>{fs.unlinkSync(source);fs.rmdirSync(scratch);});
const filename=path.join(__dirname,'test-v223-prior.js'),original=execFileSync('git',['show',checkpoint+':scripts/test-v223.js'],{encoding:'utf8'});
const harness=new Module(filename,module);harness.filename=filename;harness.paths=module.paths;harness._compile(original,filename);
