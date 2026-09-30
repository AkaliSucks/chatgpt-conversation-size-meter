// Deterministic Node VM harness: production userscript, fake clock/storage/DOM,
// fetch/XHR/WebSocket surfaces. No browser or ChatGPT server is contacted.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname,'..');
const source = fs.readFileSync(path.join(root,'releases/v2.23/chatgpt_chat_size_meter_v223_event_model_cleanup.js'),'utf8');
const names = [...source.matchAll(/^(?:async )?function (\w+)\(/gm)].map(x=>x[1]);
const dispatchURL = '/backend-api/f/conversation';
const phrase = "You've reached the maximum length for this conversation";
const body = (extra={}) => JSON.stringify({action:'next',parent_message_id:'parent-a',model:'test-model',conversation_id:'chat-a',messages:[{id:'u',author:{role:'user'},content:{content_type:'text',parts:['hello']}}],...extra});
const response = (text='',status=200,type='application/json') => ({ok:status<400,status,headers:{get:()=>type},clone(){return {text:async()=>text};}});
function environment() {
  let now = 1000000, counter = 0;
  const timers = new Map(), storage = new Map(), listeners = {}, fetches = [];
  const state = {banners:[],stop:false,turns:[],composer:'small prompt',quota:false,fetch:async()=>response('{}'),clipboard:null};
  const location = {origin:'https://chatgpt.com',pathname:'/c/chat-a',href:'https://chatgpt.com/c/chat-a'};
  class FakeDate extends Date { static now(){return now;} }
  const document = {body:null,querySelectorAll(selector) {
    if (selector.includes('[role="alert"]')) return state.banners;
    if (selector.includes('conversation-turn')) return state.turns;
    return [];
  },querySelector(selector) {
    if (selector.includes('stop-button')) return state.stop ? {} : null;
    if (selector.includes('prompt-textarea')) return {value:state.composer};
    return null;
  },addEventListener(name,fn){(listeners[name] ||= []).push(fn);}};
  class WS {constructor(url){this.url=url;this.events={};}send(){}addEventListener(n,fn){this.events[n]=fn;}}
  class XHR {constructor(){this.events={};this.status=200;this.responseText='';}open(){}send(){}addEventListener(n,f){this.events[n]=f;}getResponseHeader(){return 'application/json';}}
  const page = {fetch:async(...args)=>{fetches.push(args);return state.fetch(...args);},WebSocket:WS,XMLHttpRequest:XHR};
  const context = {document,location,unsafeWindow:page,window:page,URL,TextEncoder,TextDecoder,ArrayBuffer,
    Request,Blob,Date:FakeDate,console,performance:{getEntriesByType:()=>[]},
    getComputedStyle:el=>({display:el.hidden?'none':'block',visibility:'visible',opacity:'1'}),
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>{if(state.quota)throw Error('QuotaExceededError');storage.set(k,v);},removeItem:k=>storage.delete(k)},
    navigator:{clipboard:{writeText:async text=>{state.clipboard=text;}}},alert:()=>{},
    setTimeout(fn,ms){const id=++counter;timers.set(id,{fn,time:now+ms});return id;},clearTimeout:id=>timers.delete(id),
    setInterval:()=>++counter,clearInterval:()=>{},MutationObserver:class{observe(){}}};
  vm.createContext(context);
  // Test instrumentation stays outside the shipped artifact. Suppress UI boot,
  // retaining and exercising the actual early hook installation.
  vm.runInContext(source.replace('\nstartUI();',`\nglobalThis.test = {${names.join(',')},storageHealth,setLatest: x => latest=x,setUI: () => {panel={querySelector:()=>({style:{}})};compact={};detail={};},ui:()=>({panel,compact,detail})};`),context);
  document.body = {innerText:'',contains:()=>false};
  const test = context.test;
  function banner(options={}) {
    const excluded = options.turn || options.panel;
    return {tagName:'DIV',innerText:options.text || phrase,hidden:options.hidden,
      getAttribute:k=>k==='role'?'alert':k==='data-testid'?'conversation-error':null,
      getBoundingClientRect:()=>({width:100,height:20}),
      closest:selector=>selector.includes('[hidden]')?null:excluded?{}:null,
      querySelector:()=>options.wrapsTurn?{}:null};
  }
  async function flush(){for(let i=0;i<20;i++)await Promise.resolve();}
  async function advance(ms) {
    const end=now+ms;
    while(true){const jobs=[...timers].filter(([,v])=>v.time<=end).sort((a,b)=>a[1].time-b[1].time);if(!jobs.length)break;
      const [id,job]=jobs[0];timers.delete(id);now=job.time;
      // UI rendering is not emulated; all event/capture timers are real.
      if(job.fn.name!=='updateUI')job.fn();await flush();}
    now=end;await flush();
  }
  const navigate=id=>{location.pathname='/c/'+id;location.href=location.origin+location.pathname;};
  const start=extra=>test.attemptInspectOutgoingRequest(dispatchURL,'POST',body(extra));
  const chunk=(a,text)=>test.attemptRecordStreamChunk('chat-a',dispatchURL,response('',200,'text/event-stream'),Buffer.byteLength(text),text,a.id);
  return {test,state,page,context,document,storage,fetches,listeners,banner,flush,advance,navigate,start,chunk,now:()=>now};
}
const cases=[];
const check=(name,fn)=>cases.push([name,fn]);

check('1 short SUCCESS confirms immediately; archived telemetry continues',()=>{
  const h=environment(), a=h.start();
  h.chunk(a,'data: {"message":{"status":"finished_successfully"}}\n\n');
  const store=h.test.loadAttemptState('chat-a');
  assert.equal(store.current,null);assert.equal(store.attempts.length,1);assert.equal(a.outcome,'success');
  assert.equal(a.outcomeStatus,'success');assert.equal(a.transportClosedAt,null);
  const before=a.streamStats.totalBytes;h.chunk(a,'event: message_stream_complete\ndata: {}\n\n');
  assert(a.streamStats.totalBytes>before);assert.equal(store.attempts.length,1);
  h.test.attemptFinishStream('chat-a',dispatchURL,response(),null,a.id);
  assert(a.transportClosedAt);assert(a.telemetryFinalizedAt);assert.equal(h.test.eventEpisodes('chat-a').episodes.length,0);
});
check('2/7 long assistant stream quotes MAX without false outcomes',()=>{
  const h=environment(),a=h.start();
  for(let i=0;i<12;i++)h.chunk(a,'data: '+JSON.stringify({type:'delta',delta:{text:phrase+' '.repeat(4000)}})+'\n\n');
  assert.equal(h.test.eventEpisodes('chat-a').episodes.length,0);assert.equal(a.outcome,null);
  h.chunk(a,'data: {"type":"message_stream_complete"}\n\n');
  assert.equal(a.outcome,'success');assert.equal(a.streamStats.chunkCount,13);
});
check('3/10 repeated visible MAX at load creates one episode and zero attempts',()=>{
  const h=environment();h.state.banners=[h.banner()];
  for(let i=0;i<300;i++){h.test.lifecyclePollPhase();h.test.attemptHandleDOMMutation();}
  assert.equal(h.test.eventEpisodes('chat-a').episodes.length,1);
  assert.equal(h.test.loadAttemptState('chat-a').attempts.length,0);
  assert.equal(h.test.loadAttemptState('chat-a').current,null);
});
check('4 capped Send intent times out without inventing a dispatch',async()=>{
  const h=environment();h.state.banners=[h.banner()];h.test.eventPollMax('chat-a');
  h.test.recordSendIntent('composer Enter');await h.advance(2500);
  assert.equal(h.test.eventActiveEpisode('chat-a').blockedBeforeDispatch,true);
  assert.equal(h.test.loadAttemptState('chat-a').sendIntents.length,1);
  assert.equal(h.test.loadAttemptState('chat-a').attempts.length,0);
});
function mapping(id='chat-a') {
  return {conversation_id:id,current_node:'u',mapping:{u:{id:'u',parent:null,children:[],message:{id:'u',author:{role:'user'},content:{content_type:'text',parts:['hello']}}}}};
}
check('5 Retry Capture bypasses fetch hook, parses once, attaches fresh episode source',async()=>{
  const h=environment();h.state.banners=[h.banner()];h.test.eventPollMax('chat-a');
  h.state.fetch=async()=>response(JSON.stringify(mapping()));
  const result=await h.test.retryCapture();assert.equal(result,true);
  const e=h.test.eventActiveEpisode('chat-a'),store=h.test.loadAttemptState('chat-a');
  assert.equal(h.fetches.length,1);assert.equal(store.meterCaptureNetwork.length,1);assert.equal(store.appStateNetwork.length,0);
  assert.equal(store.attempts.length,0);assert.equal(e.captureHistory.length,1);assert.equal(e.direct.episodeId,e.id);
  // BATCH remains an app response: no invented/replayed batch POST.
  h.test.inspectJSON({conversations:[mapping()]},'/backend-api/conversations/batch',300);
  assert.equal(e.batch.episodeId,e.id);assert.equal(e.captureHistory.length,2);
});
check('6 ordinary conversation text, hidden banners, panel and wrapper quotes are ignored',()=>{
  const h=environment();h.document.body.innerText=phrase;
  assert.equal(h.test.visibleHardMax(),false);
  for(const options of [{turn:true},{panel:true},{hidden:true},{wrapsTurn:true}]){
    h.state.banners=[h.banner(options)];assert.equal(h.test.visibleHardMax(),false);
  }
});
check('8 SUCCESS then clone abort preserves outcome and archived totals',()=>{
  const h=environment(),a=h.start();h.chunk(a,'data: [DONE]\n\n');
  h.chunk(a,'event: message_stream_complete\n\n');
  h.test.attemptFinishStream('chat-a',dispatchURL,response(),Error('BodyStreamBuffer was aborted'),a.id);
  assert.equal(a.outcome,'success');assert.equal(a.streamStats.readErrorBenign,true);
  assert.match(a.streamStats.readError,/BodyStreamBuffer/);assert.equal(a.streamStats.chunkCount,2);
  assert(h.test.eventPanelMarkup('chat-a').includes('Benign post-completion clone abort'));
});
check('9 SPA navigation cancels scheduled captures and in-progress parser attribution',async()=>{
  const h=environment(),a=h.start();h.chunk(a,'data: [DONE]\n\n');h.navigate('chat-b');
  await h.advance(3200);assert.equal(h.fetches.length,0);
  await h.test.inspectResponse(response(JSON.stringify(mapping('chat-a'))),'/backend-api/conversation/chat-a',{chatId:'chat-a'},'meter');
  assert.equal(h.test.loadSnapshot('chat-b').full,false);
});
check('split SSE lines and completion tokens survive arbitrary chunk boundaries',()=>{
  const h=environment(),a=h.start(),text='data: {"message":{"status":"finished_successfully"}}\n\n';
  for(const char of text)h.chunk(a,char);
  assert.equal(a.outcome,'success');assert.equal(a.streamStats.totalBytes,Buffer.byteLength(text));
  assert.equal(a.streamStats.eventCounts.finished_successfully,1);
});
check('quoted completion markers in assistant deltas do not confirm SUCCESS',()=>{
  const h=environment(),a=h.start();h.chunk(a,'data: '+JSON.stringify({type:'delta',delta:{text:'finished_successfully [DONE] "type":"message_end"'}})+'\n\n');
  assert.equal(a.outcome,null);
});
check('structured SSE MAX relates episode to real dispatch; repeated errors deduplicate',()=>{
  const h=environment(),a=h.start();const text='data: {"type":"error","error":{"code":"conversation_too_long"}}\n\n';
  h.chunk(a,text);h.chunk(a,text);
  assert.equal(a.outcome,'max');assert.equal(h.test.eventEpisodes('chat-a').episodes.length,1);
  assert.equal(h.test.eventActiveEpisode('chat-a').relatedRealAttemptId,a.id);
  assert.equal(h.test.eventActiveEpisode('chat-a').direct,null);
});
check('HTTP structured MAX, generic HTTP error and normal assistant JSON differ',()=>{
  const h=environment(),a=h.start();h.test.attemptObserveGenerationResponse('chat-a',dispatchURL,response('',400),'{"error":{"message":"conversation is too long"}}',40,{attemptId:a.id});
  assert.equal(a.outcome,'max');assert.equal(a.outcomeConfirmedBy,'HTTP generation error');
  const b=h.start();h.test.attemptObserveGenerationResponse('chat-a',dispatchURL,response('',503),'{"error":"temporarily unavailable"}',40,{attemptId:b.id});
  assert.equal(b.outcome,'error');
  assert.equal(h.test.attemptLooksLikeMaxErrorText(JSON.stringify({message:{author:{role:'assistant'},content:{parts:[phrase]}}})),false);
});
check('preflight matching prefers identity and rejects conflicting parent/action/chat',()=>{
  const h=environment();h.test.attemptRecordPreflightRequest('chat-a',dispatchURL+'/prepare','POST',body());
  h.test.attemptRecordPreflightRequest('chat-a',dispatchURL+'/prepare','POST',body({parent_message_id:'wrong'}));
  const a=h.start();assert.equal(a.preflight.parentMessageId,'parent-a');assert.equal(a.preflightMatchedBy,'conversation+parent');
  const b=h.start({parent_message_id:'new-parent'});assert.equal(b.preflightMatchedBy,'no preflight match');
});
check('delayed preflight response updates consumed preflight identity',()=>{
  const h=environment();h.test.attemptRecordPreflightRequest('chat-a',dispatchURL+'/prepare','POST',body());
  const preflightId=h.test.loadAttemptState('chat-a').pendingPreflight.id,a=h.start();
  h.test.attemptObservePreflightResponse('chat-a',dispatchURL+'/prepare',response(),'{"websocket_request_id":"safe-id","verify":"SECRET"}',50,preflightId);
  assert.equal(a.preflight.responseDispatchHints.websocket_request_id,'safe-id');
  assert(!JSON.stringify(a).includes('SECRET'));assert.equal(h.test.loadAttemptState('chat-a').pendingPreflight,null);
});
check('classifier ignores mutation, prepare, wrong endpoints and action-only POST',()=>{
  const h=environment();
  for(const [url,obj] of [[dispatchURL,{action:'next'}],[dispatchURL,{action:'update',parent_message_id:'p',model:'m'}],['/unrelated/conversation',JSON.parse(body())],[dispatchURL+'/prepare',JSON.parse(body())]])
    assert.equal(h.test.attemptIsGenerationRequest(url,'POST',obj),false);
  assert.equal(h.test.loadAttemptState('chat-a').current,null);
  assert.equal(h.test.attemptIsGenerationRequest(dispatchURL,'POST',JSON.parse(body())),true);
});
check('fetch Request object body classification completes before clone reader starts',async()=>{
  const h=environment();h.state.fetch=async()=>response('{}');
  await h.page.fetch(new Request('https://chatgpt.com'+dispatchURL,{method:'POST',body:body()}));await h.flush();
  assert.equal(h.test.loadAttemptState('chat-a').current.requestModel,'test-model');
  assert.equal(h.test.loadAttemptState('chat-a').current.generationClassifierReason,'supported action + parent + model/messages/encoding');
});
check('real network activity sets INFLIGHT despite absent Stop UI',()=>{
  const h=environment(),a=h.start();h.test.inspectJSON(mapping(),'/backend-api/conversation/chat-a',250);
  assert.equal(h.test.loadLifecycle('chat-a').lastObservation.phase,'inflight');assert(a.peakRetainedByFamily.direct);
});
check('lingering Stop UI cannot create attempts after SUCCESS',()=>{
  const h=environment(),a=h.start();h.chunk(a,'data: [DONE]\n\n');h.state.stop=true;
  for(let i=0;i<20;i++){h.test.lifecyclePollPhase();h.test.attemptHandleDOMMutation();}
  assert.equal(h.test.loadAttemptState('chat-a').current,null);assert.equal(h.test.loadAttemptState('chat-a').attempts.length,1);
});
check('old stream callback never updates a newer dispatch with same URL',()=>{
  const h=environment(),a=h.start();h.chunk(a,'data: [DONE]\n\n');const b=h.start();
  h.chunk(a,'event: message_stream_complete\n\n');h.test.attemptFinishStream('chat-a',dispatchURL,response(),null,a.id);
  assert.equal(b.streamStats.totalBytes,0);assert.equal(b.outcome,null);assert.equal(h.test.loadAttemptState('chat-a').current.id,b.id);
});
check('post-outcome job attaches to archived attempt while newer attempt runs',async()=>{
  const h=environment(),a=h.start();h.chunk(a,'data: [DONE]\n\n');const b=h.start();
  h.state.fetch=async()=>response(JSON.stringify(mapping()));
  await h.test.retryCapture({chatId:'chat-a',attemptId:a.id,reason:'post-outcome'});
  assert.equal(a.postCorrelation.snapshotsByFamily.direct.attemptId,a.id);
  assert.equal(b.postCorrelation.captureCount,0);
});
check('MAX clear starts a new episode; stale historical metrics remain pending',()=>{
  const h=environment();h.state.banners=[h.banner()];h.test.eventPollMax('chat-a');const first=h.test.eventActiveEpisode('chat-a');
  first.direct={retainedBytes:99};h.state.banners=[];h.test.eventPollMax('chat-a');
  h.state.banners=[h.banner()];h.test.eventPollMax('chat-a');const next=h.test.eventActiveEpisode('chat-a');
  assert.notEqual(first.id,next.id);assert.equal(next.direct,null);assert(first.bannerClearedAt);
  assert.match(h.test.eventDiagnostics('chat-a').join('\n'),/No fresh DIRECT capture/);
});
check('WebSocket auth redaction, no previews and explicit correlation only',()=>{
  const h=environment(),a=h.start(),url='wss://ws.chatgpt.com/control?verify=SECRET&session_token=OTHER';
  h.test.attemptRecordTransportEvent('chat-a','websocket','in',url,'{"type":"delta","text":"PRIVATE"}');
  assert.equal(a.transportEvents.length,0);
  h.test.attemptRecordTransportEvent('chat-a','websocket','in',url,JSON.stringify({type:'delta',conversation_id:'chat-a',parent_message_id:'parent-a',text:'PRIVATE'}));
  assert.equal(a.transportEvents.length,1);
  const persisted=[...h.storage.values()].join('\n');assert(!/SECRET|OTHER|PRIVATE/.test(persisted));
  assert(!JSON.stringify(a.transportEvents).includes('preview'));
});
check('null numeric helpers preserve unknown DIRECT rather than green/zero',()=>{
  const h=environment();for(const value of [null,undefined,'']){
    assert.equal(h.test.safeNumber(value),null);assert.equal(h.test.v215BandFromRetainedBytes(value),'unknown');assert.equal(h.test.v213BandFromProxyShare(value),'unknown');
  }
  const stats=h.test.calculateStats();assert.equal(stats.lifecycleCanonicalRiskAvailable,false);
});
check('quota failure is visible and in-memory SUCCESS tracking continues',()=>{
  const h=environment();h.state.quota=true;const a=h.start();h.chunk(a,'data: [DONE]\n\n');
  assert.equal(a.outcome,'success');assert.equal(h.test.storageHealth.get('chat-a').lastSaveSuccessful,false);
  assert.match(h.test.storageHealth.get('chat-a').lastError,/QuotaExceeded/);
});
check('bounded persistence retains ten full attempts and episodes',()=>{
  const h=environment();for(let i=0;i<15;i++){const a=h.start();h.chunk(a,'data: [DONE]\n\n');}
  assert.equal(h.test.loadAttemptState('chat-a').attempts.length,10);
  for(let i=0;i<15;i++){h.state.banners=[h.banner()];h.test.eventPollMax('chat-a');h.state.banners=[];h.test.eventPollMax('chat-a');}
  assert.equal(h.test.eventEpisodes('chat-a').episodes.length,10);
});
check('transport timeout closes telemetry without inventing stream close',async()=>{
  const h=environment(),a=h.start();h.chunk(a,'data: [DONE]\n\n');await h.advance(60000);
  assert(a.telemetryFinalizedAt);assert.equal(a.transportClosedAt,null);assert.match(a.telemetryClosureReason,/timeout/);
});
check('SSE full fetch wrapper observes final totals once and preserves original Response',async()=>{
  const h=environment(),text='data: {"message":{"status":"finished_successfully"}}\n\nevent: message_stream_complete\n\n';
  let read=0;const resp=response(text,200,'text/event-stream');resp.clone=()=>({text:async()=>text,body:{getReader:()=>({read:async()=>read++===0?{done:false,value:new TextEncoder().encode(text)}:{done:true}})}});
  h.state.fetch=async()=>resp;assert.equal(await h.page.fetch(dispatchURL,{method:'POST',body:body()}),resp);await h.flush();
  const a=h.test.loadAttemptState('chat-a').last;assert.equal(a.outcome,'success');assert.equal(a.streamStats.totalBytes,Buffer.byteLength(text));
  assert.equal(a.networkEvents.length,1);assert.equal(h.test.loadAttemptState('chat-a').attempts.length,1);
});
check('saved false-MAX fixtures replay quotes and synthetic attempt flooding only',()=>{
  for(const file of fs.readdirSync(path.join(root,'diagnostics/false-max'))){
    const text=fs.readFileSync(path.join(root,'diagnostics/false-max',file),'utf8');
    assert.match(text,/max-banner-without-generation-edge/);
    const h=environment();h.document.body.innerText=text+'\n'+phrase;h.test.lifecyclePollPhase();
    assert.equal(h.test.eventEpisodes('chat-a').episodes.length,0);
    h.state.banners=[h.banner()];const count=[...text.matchAll(/max-banner-without-generation-edge/g)].length;
    for(let i=0;i<count;i++)h.test.attemptHandleDOMMutation();
    assert.equal(h.test.eventEpisodes('chat-a').episodes.length,1);assert.equal(h.test.loadAttemptState('chat-a').attempts.length,0);
  }
});
check('fetch rejection closes only its generation attempt and passes rejection to page',async()=>{
  const h=environment();h.state.fetch=async()=>{throw Error('offline');};
  await assert.rejects(h.page.fetch(dispatchURL,{method:'POST',body:body()}),/offline/);await h.flush();
  const a=h.test.loadAttemptState('chat-a').last;assert.equal(a.outcome,'error');assert(a.telemetryFinalizedAt);
});
check('XHR success, preflight and error use fixed request identities',async()=>{
  const h=environment();
  const pre=new h.page.XMLHttpRequest();pre.open('POST',dispatchURL+'/prepare');pre.send(body());
  const xhr=new h.page.XMLHttpRequest();xhr.open('POST',dispatchURL);xhr.send(body());
  pre.responseText='{"websocket_request_id":"ws-safe"}';pre.events.load();await h.flush();
  const a=h.test.loadAttemptState('chat-a').current;assert.equal(a.preflight.responseDispatchHints.websocket_request_id,'ws-safe');
  xhr.responseText='data: [DONE]\n\n';xhr.events.load();await h.flush();assert.equal(a.outcome,'success');
  const other=new h.page.XMLHttpRequest();other.open('POST',dispatchURL);other.send(body());other.events.error();
  assert.equal(h.test.loadAttemptState('chat-a').last.outcome,'error');
});
check('fetch preflight response arrives after dispatch and attaches once',async()=>{
  const h=environment();let release;h.state.fetch=async url=>url.endsWith('/prepare')?new Promise(resolve=>release=resolve):response('{}');
  const pending=h.page.fetch(dispatchURL+'/prepare',{method:'POST',body:body()});
  await h.page.fetch(dispatchURL,{method:'POST',body:body()});
  release(response('{"websocket_request_id":"id-a","access_token":"SECRET"}'));await pending;await h.flush();
  const a=h.test.loadAttemptState('chat-a').current;assert.equal(a.preflight.responseDispatchHints.websocket_request_id,'id-a');
  assert.equal(h.test.loadAttemptState('chat-a').preflightHistory.length,1);assert(![...h.storage.values()].join('').includes('SECRET'));
});
check('two preflights in the same millisecond keep distinct response ownership',()=>{
  const h=environment();const one=h.test.attemptRecordPreflightRequest('chat-a',dispatchURL+'/prepare','POST',body());
  const two=h.test.attemptRecordPreflightRequest('chat-a',dispatchURL+'/prepare','POST',body({parent_message_id:'parent-b'}));
  assert.notEqual(one.id,two.id);
  h.test.attemptObservePreflightResponse('chat-a',dispatchURL+'/prepare',response(),'{"request_id":"one"}',20,one.id);
  h.test.attemptObservePreflightResponse('chat-a',dispatchURL+'/prepare',response(),'{"request_id":"two"}',20,two.id);
  assert.equal(one.responseDispatchHints.request_id,'one');assert.equal(two.responseDispatchHints.request_id,'two');
});
check('pre-existing banner does not finalize a later unrelated dispatch',()=>{
  const h=environment();h.state.banners=[h.banner()];h.test.eventPollMax('chat-a');
  const a=h.start();h.test.eventPollMax('chat-a');assert.equal(a.outcome,null);
  assert.equal(h.test.eventActiveEpisode('chat-a').relatedRealAttemptId,null);
});
check('send followed by dispatch records latency and cannot become blocked',async()=>{
  const h=environment();h.test.recordSendIntent('send button');await h.advance(100);const a=h.start();
  h.state.banners=[h.banner()];await h.advance(2500);
  assert.equal(a.sendIntentToDispatchMs,100);assert.equal(h.test.loadAttemptState('chat-a').sendIntents[0].blockedBeforeDispatch,false);
});
check('send listeners ignore Shift Enter, IME, modifiers and non-composer keys',()=>{
  const h=environment();h.test.installSendIntentHook();const composer={closest:()=>({})};
  const listener=h.listeners.keydown[0];
  for(const extra of [{shiftKey:true},{isComposing:true},{ctrlKey:true},{repeat:true}])listener({key:'Enter',target:composer,...extra});
  listener({key:'Enter',target:{closest:()=>null}});assert.equal(h.test.loadAttemptState('chat-a').sendIntents.length,0);
  listener({key:'Enter',target:composer});assert.equal(h.test.loadAttemptState('chat-a').sendIntents.length,1);
});
check('coalesced Retry clicks use one internal workflow during generation',async()=>{
  const h=environment(),a=h.start();let release;h.state.fetch=()=>new Promise(resolve=>release=resolve);
  const binding={chatId:'chat-a',attemptId:a.id};
  const one=h.test.controlledCapture(binding),two=h.test.controlledCapture(binding);assert.equal(one,two);
  release(response(JSON.stringify(mapping())));await one;
  assert.equal(h.fetches.length,1);assert.equal(a.networkMaxBytes,0);assert.equal(a.networkEvents.length,0);
  assert.equal(h.test.loadAttemptState('chat-a').meterCaptureNetwork.length,1);
});
check('same-millisecond fresh capture does not trigger duplicate fallback parsing',async()=>{
  const h=environment();h.state.fetch=async()=>response(JSON.stringify(mapping()));
  await h.test.retryCapture();await h.test.retryCapture();assert.equal(h.fetches.length,2);
});
check('cleared episode cancels its pending capture job',async()=>{
  const h=environment();h.state.banners=[h.banner()];h.test.eventPollMax('chat-a');
  h.state.banners=[];h.test.eventPollMax('chat-a');await h.advance(250);assert.equal(h.fetches.length,0);
});
check('banner clearing alone is not recovery; later real SSE SUCCESS is',async()=>{
  const h=environment();h.state.banners=[h.banner()];h.test.eventPollMax('chat-a');const e=h.test.eventActiveEpisode('chat-a');
  h.state.banners=[];h.test.eventPollMax('chat-a');assert.equal(e.recoveryConfirmedLater,false);
  await h.advance(1);const a=h.start();h.chunk(a,'data: [DONE]\n\n');assert.equal(e.recoveryAttemptId,a.id);
});
check('comparison missing metrics stay null and source families remain distinct',()=>{
  const h=environment(),a=h.start();a.pre.direct={retainedBytes:null,branchNodes:10};a.pre.batch={retainedBytes:200,branchNodes:20};
  h.chunk(a,'data: [DONE]\n\n');const e=h.test.eventOpenEpisode('chat-a','UI MAX banner');e.direct={retainedBytes:100,branchNodes:11};e.batch={retainedBytes:250,branchNodes:22};
  const c=h.test.eventComparison('chat-a');assert.equal(c.families.direct.deltas.retainedBytes,null);assert.equal(c.families.batch.deltas.retainedBytes,50);
});
check('restart archives lost transport as correlation incomplete, preserving evidence',()=>{
  const h=environment();h.storage.set('cgpt-size-meter-v2101:attempts-v223:chat-a',JSON.stringify({current:{id:1,status:'running',requestPath:dispatchURL,streamStats:{totalBytes:123}},attempts:[],nextId:2}));
  const store=h.test.loadAttemptState('chat-a');assert.equal(store.current,null);assert.equal(store.last.outcome,'unknown');assert.equal(store.last.streamStats.totalBytes,123);
  assert.equal(store.last.transportClosedAt,undefined);assert.match(store.last.telemetryClosureReason,/page restarted/);
});
check('historical V2.22 synthetic attempts are neither migrated nor relabelled',()=>{
  const h=environment();h.storage.set('cgpt-size-meter-v2101:attempts-v222:chat-a','{"current":{"id":298,"outcome":"max"}}');
  assert.equal(h.test.loadAttemptState('chat-a').current,null);assert.equal(h.test.loadAttemptState('chat-a').nextId,1);
});
check('rendered event sections and copied diagnostics omit predictive bands and tokens',async()=>{
  const h=environment(),a=h.start();h.chunk(a,'data: [DONE]\n\n');
  h.test.saveDiagnostic('chat-a',{lastObservedURL:'https://chatgpt.com/test?verify=SECRET',lastSourceURL:'https://chatgpt.com/test?session_token=SECRET'});
  h.test.setUI();h.test.render();const markup=h.test.ui().detail.innerHTML;
  const sections=['REAL ATTEMPTS — V2.23','MAX EPISODES','LAST SUCCESS vs LAST MAX','GENERATION TRANSPORT','POST-OUTCOME CORRELATION','SOURCE-SEPARATED STATIC STATE VECTOR'];
  let last=-1;for(const section of sections){const next=markup.indexOf(section);assert(next>last);last=next;}
  assert(!/OBSERVED MAX ZONE|PRIMARY RISK BAND|risk-meter-fill/.test(markup));
  await h.test.copyStats();assert(!/SECRET|OBSERVED MAX ZONE|Canonical DIRECT risk band/.test(h.state.clipboard));
  assert.match(h.state.clipboard,/METER CAPTURE NETWORK/);assert.match(h.state.clipboard,/REAL ATTEMPTS/);
});
check('late dispatch corrects provisional blocked-before-dispatch classification',async()=>{
  const h=environment();h.state.banners=[h.banner()];h.test.recordSendIntent('composer Enter');await h.advance(2500);
  const e=h.test.eventActiveEpisode('chat-a');assert.equal(e.blockedBeforeDispatch,true);
  await h.advance(100);h.start();assert.equal(e.blockedBeforeDispatch,false);
  assert(h.test.loadAttemptState('chat-a').sendIntents[0].initialBlockedObservationAt);
});
check('unclassified conversation POST prevents a false blocked-before-dispatch label',async()=>{
  const h=environment();h.state.banners=[h.banner()];h.test.eventPollMax('chat-a');h.test.recordSendIntent('composer Enter');
  h.test.attemptInspectOutgoingRequest(dispatchURL,'POST','{"action":"new-unknown-variant"}');await h.advance(2500);
  assert.equal(h.test.eventActiveEpisode('chat-a').blockedBeforeDispatch,false);
  assert.match(h.test.loadAttemptState('chat-a').sendIntents[0].correlationIncomplete,/unresolved/);
});

(async()=>{
  let failed=0;
  for(const [name,fn]of cases){try{await fn();console.log('PASS '+name);}catch(error){failed++;console.error('FAIL '+name+'\n'+error.stack);}}
  console.log(`${cases.length-failed}/${cases.length} synthetic harness tests passed; native-browser validation not performed`);
  if(failed)process.exitCode=1;
})();
