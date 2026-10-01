// Frozen cases preserved; explicit superseding expectations for dual capacity,
// LOW policy, and model identity. No cases skipped and no old scorer emulation.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),root=path.resolve(__dirname,'..');
const read=fs.readFileSync,mode=process.argv.includes('--v223')?'120':process.argv.includes('--correctness')?'31':'59';
const target=path.join(root,'releases/v2.24.1/chatgpt_chat_size_meter_v2241_dual_axis_pressure.js');
const legacy=path.join(root,mode==='31'?'releases/v2.24.0-calibration-correctness/chatgpt_chat_size_meter_v2240_calibration_correctness.js':
  'releases/v2.24.0/chatgpt_chat_size_meter_v224_empirical_pressure.js');
const source=read(target,'utf8');
// Only identity fields are projected for old 120/59 metadata assertions. The
// actual dual scorer runs; its real metadata is tested in test-v2241.js.
const projected=mode==='31'?source:source.replaceAll('V2.24.1 DUAL AXIS PRESSURE','V2.24 EMPIRICAL PRESSURE')
  .replaceAll("'2.24.1'","'2.24.0'").replace('// @version      2.24.1','// @version      2.24.0');
fs.readFileSync=function(file,options){return path.resolve(String(file))===legacy?projected:read.call(fs,file,options);};
const harness=path.join(__dirname,mode==='120'?'test-v224-regressions.js':mode==='31'?'test-v224-correctness.js':'test-v224.js');
let code=read.call(fs,harness,'utf8');assert.equal(code,execFileSync('git',['show','34195fa83942beb8b5e335833634295abb85898b:scripts/'+path.basename(harness)],{encoding:'utf8'}));
function once(before,after){assert.equal(code.split(before).length,2,before);code=code.replace(before,after);}
if(mode!=='120'){
  // Old synthetic text tests gave every vector an identical 19MB state. Make
  // that artificial axis proportional (20 bytes/token), so both axes exercise
  // the same pressure. Real heterogeneous vectors have a separate native fixture.
  once('activeBranchBytes:19000000','activeBranchBytes:tokens*20');
  code=code.replaceAll("confidence,'medium'","confidence,'low'").replaceAll("confidence,'high'","confidence,'low'");
  if(mode==='59'){
    once("row=(id,tokens,extra={})=>({conversationId:'chat-a',eventId:id","row=(id,tokens,extra={})=>({conversationId:'calibration-chat-'+id,eventId:id");
    once("pressureEffort('Extra   High'),'extra high'","pressureEffort('Extra   High'),'max'");
    once('f.displayLikeTokens/840795*100','f.displayLikeTokens/845331*100');
    once("assert.equal(r.empiricalMaxAnchor,840795);assert.equal(r.comparisonTier,'exact-model-effort')","assert.equal(r.empiricalMaxAnchor,845331);assert.equal(r.comparisonTier,'exact-model-effort')");
    once('r.empiricalMaxAnchor,841000','r.empiricalMaxAnchor,844000');
    once('[[[10,20,30,40],10],[[10,20,30,40,50],20],[[1,10,11,12,13,14,15,16],10]]',
      '[[[10,20,30,40],40],[[10,20,30,40,50],50],[[1,10,11,12,13,14,15,16],16]]');
    once("modelVersion,'v224-display-ratio-1'","modelVersion,'v2241-dual-frontier-1'");
    once("'src/v224/pressure-calibration.js'","'src/v2241/pressure-calibration.js'");
    once("source.includes('values[n<5?0:Math.ceil(n*.25)-1]')","source.includes('anchor=n?Math.max(...values):null')");
    once('PRESSURE 52 \\/ 100 · MEDIUM','PRESSURE 52 \\/ 100 · LOW');
  }else{
    once('r.empiricalMaxAnchor,840795);\n});\ncheck(\'native-style', 'r.empiricalMaxAnchor,845331);\n});\ncheck(\'native-style');
    once('original.empiricalMaxAnchor,810000','original.empiricalMaxAnchor,840000');
    once('repeated.empiricalMaxAnchor,810000','repeated.empiricalMaxAnchor,840000');
    once("modelVersion,'v224-display-ratio-2'","modelVersion,'v2241-dual-frontier-1'");
    code=code.replaceAll('V2\\.24 CALIBRATION CORRECTNESS','V2\\.24\\.1 DUAL AXIS PRESSURE')
      .replaceAll('Candidate userscript: V2.24 CALIBRATION CORRECTNESS','Candidate userscript: V2.24.1 DUAL AXIS PRESSURE')
      .replace('2\\.24\\.0/','2\\.24\\.1/');
  }
  // Update descriptive labels, keeping every case body and assertion count.
  code=code.replaceAll('scores from display-like tokens alone','scores with proportional synthetic dual axes')
    .replaceAll('produce medium and never high confidence','retain LOW confidence')
    .replaceAll('permit high confidence','retain LOW confidence').replaceAll('HIGH requires','LOW persists despite')
    .replaceAll('model uses minimum with 1-4 MAX and lower quartile with 5+','model uses upper maximum for every independent sample count')
    .replaceAll('retain lower-quartile anchor','retain upper-frontier anchor');
}
console.log(`V2.24.1 superseding ${mode} cases: upper frontier, LOW policy, proportional synthetic state, and identity expectations explicitly updated; no cases skipped.`);
const runner=new Module(harness,module);runner.filename=harness;runner.paths=module.paths;runner._compile(code,harness);
