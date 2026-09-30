// Deterministic Node VM harness: production userscript, fake clock/storage/DOM,
// fetch/XHR/WebSocket surfaces. No browser or ChatGPT server is contacted.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname,'..');
const source = fs.readFileSync(path.join(root,'releases/v2.23/chatgpt_chat_size_meter_v223_event_model_cleanup.js'),'utf8');
const dispatchURL = '/backend-api/f/conversation';
const phrase = "You've reached the maximum length for this conversation";
const body = (extra={}) => JSON.stringify({action:'next',parent_message_id:'parent-a',model:'test-model',conversation_id:'chat-a',messages:[{id:'u',author:{role:'user'},content:{content_type:'text',parts:['hello']}}],...extra});
const response = (text='',status=200,type='application/json') => ({ok:status<400,status,headers:{get:()=>type},clone(){return {text:async()=>text};}});
function successfulStreamResponse() {
  const text='data: [DONE]\n\n';let read=0;
  const resp=response(text,200,'text/event-stream');
  resp.clone=()=>({text:async()=>text,body:{getReader:()=>({read:async()=>read++===0?{done:false,value:new TextEncoder().encode(text)}:{done:true}})}});
  return resp;
}
function environment(candidateSource=source) {
  let now = 1000000, counter = 0;
  const timers = new Map(), storage = new Map(), listeners = {}, fetches = [];
  const state = {banners:[],stop:false,turns:[],composer:'small prompt',quota:false,quotaBytes:Infinity,quotaUtf16:false,failedWrites:0,fetch:async()=>response('{}'),clipboard:null};
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
  const page = {fetch:async(...args)=>{fetches.push(args);return state.fetch(...args);},WebSocket:WS,XMLHttpRequest:XHR,
    addEventListener(name,fn,capture){assert.equal(capture,true);(listeners[name] ||= []).push(fn);}};
  const context = {document,location,unsafeWindow:page,window:page,URL,TextEncoder,TextDecoder,ArrayBuffer,
    Request,Blob,btoa,atob,Date:FakeDate,console,performance:{getEntriesByType:()=>[]},
    getComputedStyle:el=>({display:el.hidden?'none':'block',visibility:'visible',opacity:'1'}),
    localStorage:{get length(){return storage.size;},key:i=>[...storage.keys()][i] ?? null,getItem:k=>storage.get(k)||null,setItem:(k,v)=>{
      const size=(key,value)=>state.quotaUtf16?2*(key.length+value.length):Buffer.byteLength(value);
      const used=[...storage].filter(([key])=>key!==k).reduce((sum,[key,value])=>sum+size(key,value),0);
      if(state.quota || used+size(k,v)>state.quotaBytes){state.failedWrites++;throw Error('QuotaExceededError');}
      storage.set(k,v);
    },removeItem:k=>storage.delete(k)},
    navigator:{clipboard:{writeText:async text=>{state.clipboard=text;}}},alert:()=>{},
    setTimeout(fn,ms){const id=++counter;timers.set(id,{fn,time:now+ms});return id;},clearTimeout:id=>timers.delete(id),
    setInterval:()=>++counter,clearInterval:()=>{},MutationObserver:class{observe(){}}};
  vm.createContext(context);
  // Test instrumentation stays outside the shipped artifact. Suppress UI boot,
  // retaining and exercising the actual early hook installation.
  const exposed=[...candidateSource.matchAll(/^(?:async )?function (\w+)\(/gm)].map(x=>x[1]);
  vm.runInContext(candidateSource.replace('\nstartUI();',`\nglobalThis.test = {${exposed.join(',')},storageHealth,setLatest: x => latest=x,setUI: () => {panel={querySelector:()=>({style:{}})};compact={};detail={};},ui:()=>({panel,compact,detail})};`),context);
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
  function composerForm(options={}) {
    const form={getAttribute:()=>null,querySelectorAll:()=>[editable]};
    const editable={tagName:options.textarea?'TEXTAREA':'DIV',id:'',isConnected:true,
      getAttribute:k=>k==='aria-label'?'Ask ChatGPT':k==='contenteditable'?'true':k==='role'?'textbox':null,
      getBoundingClientRect:()=>({width:200,height:40}),
      closest:selector=>selector==='form'?form:selector.startsWith('textarea')?editable:null};
    Object.defineProperty(editable,options.textarea?'value':'innerText',{get:()=>state.composer});
    const button={type:options.buttonType || 'button',form,disabled:!!options.disabled,
      getAttribute:k=>k==='aria-label'?(options.buttonLabel || 'Send prompt'):null,
      closest:selector=>selector==='form'?form:selector.startsWith('button')?button:null};
    const icon={closest:selector=>selector.startsWith('button')?button:null};
    return {form,editable,button,icon};
  }
  const fire=(name,event)=>{for(const fn of listeners[name] || [])fn(event);};
  const start=extra=>test.attemptInspectOutgoingRequest(dispatchURL,'POST',body(extra));
  const chunk=(a,text)=>test.attemptRecordStreamChunk('chat-a',dispatchURL,response('',200,'text/event-stream'),Buffer.byteLength(text),text,a.id);
  return {test,state,page,context,document,storage,fetches,listeners,banner,flush,advance,navigate,start,chunk,composerForm,fire,now:()=>now,setNow:value=>now=value};
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
  const h=environment();h.test.installSendIntentHook();const composer=h.composerForm().editable;
  const listener=h.listeners.keydown[0];
  for(const extra of [{shiftKey:true},{isComposing:true},{keyCode:229},{ctrlKey:true},{altKey:true},{metaKey:true},{repeat:true}])listener({key:'Enter',target:composer,...extra});
  listener({key:'Enter',target:{closest:()=>null}});assert.equal(h.test.loadAttemptState('chat-a').sendIntents.length,0);
  listener({key:'Enter',target:composer});assert.equal(h.test.loadAttemptState('chat-a').sendIntents.length,0);
  h.start();assert.equal(h.test.loadAttemptState('chat-a').sendIntents.length,1);
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

check('native button icon click and tap submit correlate once, before body/UI initialization',async()=>{
  for(const detail of [1,0]) {
    const h=environment(),c=h.composerForm();assert.equal(h.listeners.click.length,1);
    h.state.composer='Reply with one short sentence.';
    h.state.fetch=async()=>successfulStreamResponse();
    // Current contenteditable lacks the old prompt-textarea id/testid. SVG target.
    h.fire('click',{target:c.icon,composedPath:()=>[c.icon,c.button,c.form],detail});
    h.fire('submit',{target:c.form});await h.advance(37);
    await h.page.fetch(dispatchURL,{method:'POST',body:body({messages:[{author:{role:'user'},content:{parts:[h.state.composer]}}]})});await h.flush();
    const a=h.test.loadAttemptState('chat-a').last;assert.equal(a.requestPromptChars,30);
    const intents=h.test.loadAttemptState('chat-a').sendIntents;
    assert.equal(intents.length,1);assert.equal(intents[0].submissionMethod,'button');
    assert.equal(intents[0].composerChars,h.state.composer.length);assert.equal(intents[0].conversationId,'chat-a');
    assert.equal(intents[0].attemptId,a.id);assert.equal(intents[0].intentToDispatchMs,37);assert.equal(a.sendIntentToDispatchMs,37);
    assert.equal(a.outcome,'success');assert(a.transportClosedAt);
  }
});
check('native contenteditable Enter dispatch, form submit and implicit click produce one intent',async()=>{
  for(const submitFirst of [true,false]) {
    const h=environment(),c=h.composerForm(),event={key:'Enter',target:c.editable,defaultPrevented:false};
    h.state.composer='Reply with one short sentence.';
    h.state.fetch=async()=>successfulStreamResponse();
    h.fire('keydown',event);assert.equal(h.test.loadAttemptState('chat-a').sendIntents.length,0);
    event.defaultPrevented=true; // React handles key without stopping our window capture.
    if(submitFirst)h.fire('submit',{target:c.form});
    await h.advance(64);
    await h.page.fetch(dispatchURL,{method:'POST',body:body({messages:[{author:{role:'user'},content:{parts:[h.state.composer]}}]})});await h.flush();
    const a=h.test.loadAttemptState('chat-a').last;assert.equal(a.requestPromptChars,30);
    h.fire('click',{target:c.icon,detail:0});h.fire('submit',{target:c.form});
    const intents=h.test.loadAttemptState('chat-a').sendIntents;
    assert.equal(intents.length,1);assert.equal(intents[0].submissionMethod,'enter');
    assert.equal(intents[0].composerChars,h.state.composer.length);assert.equal(intents[0].sendIntentAt,1000000);
    assert.equal(intents[0].attemptId,a.id);assert.equal(intents[0].intentToDispatchMs,64);
    assert.equal(a.submissionMethod,'enter');assert.equal(a.outcome,'success');assert(a.transportClosedAt);
  }
});
check('Enter newline, ignored key and excluded search fields never become intents',async()=>{
  for(const inputType of ['insertParagraph','insertLineBreak','literal','ignored']) {
    const h=environment(),c=h.composerForm();h.fire('keydown',{key:'Enter',target:c.editable});
    if(inputType==='literal')h.fire('input',{target:c.editable,data:'\n'});
    else if(inputType!=='ignored')h.fire('beforeinput',{target:c.editable,inputType});
    await h.advance(5001);h.start();assert.equal(h.test.loadAttemptState('chat-a').sendIntents.length,0);
  }
  const h=environment(),c=h.composerForm();c.editable.getAttribute=()=> 'Search messages';
  h.fire('keydown',{key:'Enter',target:c.editable});h.fire('click',{target:c.button});h.fire('submit',{target:c.form});h.start();
  assert.equal(h.test.loadAttemptState('chat-a').sendIntents.length,0);
});
check('disabled and unrelated composer controls are ignored; default submit semantics work',()=>{
  for(const options of [{disabled:true},{buttonLabel:'Start Voice'},{buttonLabel:'Dictate'},{buttonLabel:'Stop generating'},{buttonLabel:'Add files and more'}]) {
    const h=environment(),c=h.composerForm(options);h.fire('click',{target:c.icon});assert.equal(h.test.loadAttemptState('chat-a').sendIntents.length,0);
  }
  const h=environment(),c=h.composerForm({buttonLabel:'Arrow',buttonType:'submit',textarea:true});h.fire('click',{target:c.icon});
  assert.equal(h.test.loadAttemptState('chat-a').sendIntents.length,1);
});
check('handled Enter followed by native MAX stays blocked without inventing a dispatch',async()=>{
  const h=environment(),c=h.composerForm(),event={key:'Enter',target:c.editable};h.fire('keydown',event);event.defaultPrevented=true;
  h.state.banners=[h.banner()];h.test.eventPollMax('chat-a');await h.advance(2500);
  const store=h.test.loadAttemptState('chat-a');assert.equal(store.sendIntents.length,1);
  assert.equal(store.sendIntents[0].submissionMethod,'enter');assert.equal(store.sendIntents[0].blockedBeforeDispatch,true);
  assert.equal(store.attempts.length,0);assert.equal(h.test.eventActiveEpisode('chat-a').blockedBeforeDispatch,true);
});
check('native Enter composer clear confirms original length; navigation cancels provisional key',()=>{
  const h=environment(),c=h.composerForm(),event={key:'Enter',target:c.editable};h.fire('keydown',event);event.defaultPrevented=true;
  h.state.composer='';h.fire('input',{target:c.editable,data:null});
  assert.equal(h.test.loadAttemptState('chat-a').sendIntents[0].composerChars,12);h.start();
  const other=environment(),d=other.composerForm();other.fire('keydown',{key:'Enter',target:d.editable});other.navigate('chat-b');
  other.test.attemptInspectOutgoingRequest(dispatchURL,'POST',body({conversation_id:'chat-b'}));
  assert.equal(other.test.loadAttemptState('chat-b').sendIntents.length,0);
});

function persistenceFixture(h,count=10) {
  // Real attempt/observation constructors, filled with deterministic scalar metrics.
  const life=h.test.loadLifecycle('chat-a');
  for(const family of ['direct','batch'])life.families[family].lastStable={time:h.now(),fullCapturedAt:h.now(),source:family,sourceFamily:family,
    retainedBytes:180000+count,activeBranchBytes:92000,mappingBytes:155000,branchNodes:85,messageNodes:90,userMessages:20,
    assistantMessages:20,toolResults:15,toolResultBytes:73000,hot128:128,hot256:256,toolCalls:15,strongContextMarkers:3,
    systemRoleNodes:2,displayLikeTokens:2000,payloadBytes:210000};
  h.test.saveLifecycle('chat-a',life);
  const row=(i,type)=>({time:h.now()+i,url:dispatchURL,sourceFamily:'direct',bytes:100+i,status:200,kind:type});
  for(let i=0;i<count;i++) {
    const a=h.start();a.networkEvents=Array.from({length:75},(_,j)=>row(j,'HTTP'));
    a.transportEvents=Array.from({length:75},(_,j)=>row(j,'WebSocket'));
    for(const family of ['direct','batch']) {
      const obs={...a.pre[family],time:h.now()+i+1};
      a.firstCaptureByFamily[family]=obs;a.peakRetainedByFamily[family]=obs;a.peakActiveByFamily[family]=obs;a.lastCaptureByFamily[family]=obs;
      a.postCorrelation.snapshotsByFamily[family]=obs;
    }
    h.chunk(a,'data: [DONE]\n\n');h.test.attemptFinishStream('chat-a',dispatchURL,response(),null,a.id);
  }
  const store=h.test.loadAttemptState('chat-a');
  for(const field of ['appStateNetwork','meterCaptureNetwork','uncorrelatedWebSocket'])store[field]=Array.from({length:55},(_,i)=>row(i,field));
  h.test.saveAttemptState('chat-a',store);return store;
}
check('lossless storage compaction roundtrips repeated snapshots, nulls and Unicode',()=>{
  const h=environment(),store=persistenceFixture(h),plain=JSON.stringify(store),packed=h.test.eventStorageText(store),retry=h.test.eventStorageRetryText(packed);
  assert.deepEqual(JSON.parse(JSON.stringify(h.test.eventStorageParse(packed))),JSON.parse(plain));
  assert.deepEqual(JSON.parse(JSON.stringify(h.test.eventStorageParse(retry))),JSON.parse(plain));
  assert(packed.length<plain.length*0.55);assert(retry.length<packed.length);
  const misc={text:'é漢字😀',nothing:null,list:[null,false,0,[],{value:'é'}]};
  assert.equal(JSON.stringify(h.test.eventStorageParse(h.test.eventStorageRetryText(h.test.eventStorageText(misc)))),JSON.stringify(misc));
  console.log(`STORAGE representative 10-attempt fixture: original JSON ${Buffer.byteLength(plain)}; compact ${Buffer.byteLength(packed)}; quota retry ${Buffer.byteLength(retry)} bytes`);
  const single=environment(),one=persistenceFixture(single,1),oneText=single.test.eventStorageText(one);
  console.log(`STORAGE representative 1-attempt fixture: original JSON ${Buffer.byteLength(JSON.stringify(one))}; compact ${Buffer.byteLength(oneText)}; quota retry ${Buffer.byteLength(single.test.eventStorageRetryText(oneText))} bytes`);
});
check('quota pressure bounds traces, recovers losslessly and retains attempt/MAX identity and outcomes',()=>{
  const h=environment(),store=persistenceFixture(h,15),key=h.test.attemptKey('chat-a');
  for(const field of ['sendIntents','unclassifiedConversationPosts','preflightHistory'])store[field]=Array.from({length:35},(_,i)=>({id:i+1,conversationId:'chat-a',time:h.now()+i}));
  for(const a of store.attempts)a.streamStats.recentEvents=Array.from({length:55},(_,i)=>({time:h.now()+i,type:'message_delta'}));
  h.test.saveAttemptState('chat-a',store);
  const packed=h.test.eventStorageSavedText(store),retry=h.test.eventStorageRetryText(packed);
  const otherBytes=[...h.test.meterRequiredState('chat-a')].filter(([k])=>k!==key).reduce((sum,[,data])=>sum+Buffer.byteLength(h.test.eventStorageSavedText(data)),0);
  h.storage.clear();h.state.quotaBytes=Buffer.byteLength(retry)+otherBytes+1;h.test.saveAttemptState('chat-a',store);
  assert(h.state.failedWrites>=1);const health=h.test.storageHealth.get('chat-a');
  assert.equal(health.lastSaveSuccessful,true);assert.match(health.lastError,/QuotaExceeded/);assert(health.compactRetryCount>=1);assert(health.compactRetryRecoveredAt);
  const decoded=h.test.eventStorageParse(h.storage.get(key));assert.equal(decoded.attempts.length,10);
  assert.deepEqual(JSON.parse(JSON.stringify(decoded)),JSON.parse(JSON.stringify(store)));
  assert.equal(decoded.attempts[0].id,6);assert.equal(decoded.attempts.at(-1).outcome,'success');
  assert.equal(decoded.attempts.at(-1).pre.direct.retainedBytes,180015);
  for(const a of decoded.attempts){assert.equal(a.networkEvents.length,60);assert.equal(a.transportEvents.length,60);}
  assert.equal(decoded.preflightHistory.length,10);assert.equal(decoded.sendIntents.length,20);assert.equal(decoded.unclassifiedConversationPosts.length,20);
  for(const a of decoded.attempts)assert.equal(a.streamStats.recentEvents.length,40);
  for(const field of ['appStateNetwork','meterCaptureNetwork','uncorrelatedWebSocket'])assert.equal(decoded[field].length,40);
  h.storage.clear();h.state.quotaBytes=Infinity;
  for(let i=0;i<15;i++) {
    const e=h.test.eventOpenEpisode('chat-a','structured transport MAX',i+1);e.blockedBeforeDispatch=i%2===0;
    e.captureHistory=Array.from({length:40},(_,j)=>({episodeId:e.id,capturedAt:h.now()+j,conversationId:'chat-a',retainedBytes:12000+j,sourceFamily:'direct'}));
    e.direct=e.captureHistory.at(-1);h.test.eventSaveEpisodes('chat-a');e.active=false;
  }
  const state=h.test.eventEpisodes('chat-a'),episodeKey='cgpt-size-meter-v2101:max-episodes-v223:chat-a';
  const full=h.test.eventStorageSavedText(state),small=h.test.eventStorageRetryText(full);assert(small.length<full.length);
  const episodeOtherBytes=[...h.test.meterRequiredState('chat-a')].filter(([k])=>k!==episodeKey).reduce((sum,[,data])=>sum+Buffer.byteLength(h.test.eventStorageSavedText(data)),0);
  h.storage.clear();h.state.quotaBytes=Buffer.byteLength(small)+episodeOtherBytes+1;h.test.eventSaveEpisodes('chat-a');
  const episodes=h.test.eventStorageParse(h.storage.get(episodeKey));assert.equal(episodes.episodes.length,10);
  assert.deepEqual(JSON.parse(JSON.stringify(episodes)),JSON.parse(JSON.stringify(state)));
  const last=episodes.episodes.at(-1);assert.equal(last.id,15);assert.equal(last.relatedRealAttemptId,15);assert.equal(last.blockedBeforeDispatch,true);
  assert.equal(last.confirmationSource,'structured transport MAX');assert.equal(last.captureHistory.length,30);assert.equal(last.direct.retainedBytes,12039);
  h.state.quotaBytes=1;h.test.eventSaveEpisodes('chat-a');assert.equal(health.lastSaveSuccessful,false);
  assert.equal(h.test.eventEpisodes('chat-a').episodes.at(-1).id,15); // failed writes cannot erase memory evidence
});
check('compact saved attempts, episodes, lifecycle, snapshot and diagnostics reload through production readers',()=>{
  const h=environment(),store=persistenceFixture(h,2),fresh=environment();
  const key=h.test.attemptKey('chat-a');fresh.storage.set(key,h.test.eventStorageRetryText(h.test.eventStorageText(store)));
  const loaded=fresh.test.loadAttemptState('chat-a');assert.equal(loaded.last.id,store.last.id);assert.equal(loaded.last.outcome,'success');assert.equal(loaded.last.pre.batch.retainedBytes,180002);
  const e=h.test.eventOpenEpisode('chat-a','UI MAX banner',2);h.test.eventSaveEpisodes('chat-a');
  const episodeKey='cgpt-size-meter-v2101:max-episodes-v223:chat-a';fresh.storage.set(episodeKey,h.storage.get(episodeKey));
  assert.equal(fresh.test.eventEpisodes('chat-a').episodes[0].id,e.id);
  h.test.inspectJSON(mapping(),'/backend-api/conversation/chat-a',300);
  h.test.saveDiagnostic('chat-a',{lastObservedURL:'/backend-api/conversation/chat-a'});
  for(const [k,v] of h.storage)if(!k.includes('attempts-v223')&&!k.includes('max-episodes'))fresh.storage.set(k,v);
  assert.equal(fresh.test.loadSnapshot('chat-a').full,true);assert(fresh.test.loadLifecycle('chat-a').families.direct.lastStable);
  assert.equal(fresh.test.loadDiagnostic('chat-a').lastObservedURL,'https://chatgpt.com/backend-api/conversation/chat-a');
});

function staticVector(h) {
  const lines=h.test.eventDiagnostics('chat-a');
  return JSON.parse(lines[lines.indexOf('STATIC STATE VECTOR')+1]);
}
check('parsed DIRECT then BATCH publish distinct static vectors even when every storage write fails',()=>{
  const h=environment();h.state.quota=true;
  h.test.inspectJSON(mapping(),'/backend-api/conversation/chat-a',301);
  const direct=staticVector(h);assert(direct.direct);assert(direct.latest);assert.equal(direct.batch,null);
  assert.equal(direct.direct.mappingBytes,h.test.loadSnapshot('chat-a').structure.mappingSerializedBytes);
  assert.equal(direct.direct.retainedBytes,h.test.loadSnapshot('chat-a').structure.contextTopology.retainedState.retainedStateProxyBytes);
  const batch=mapping();batch.mapping.u.message.content.parts=['different BATCH representation'];
  h.test.inspectJSON({conversations:[batch]},'/backend-api/conversations/batch',802);
  const vector=staticVector(h);assert.equal(vector.direct.payloadBytes,301);assert.equal(vector.batch.payloadBytes,802);
  assert.equal(vector.latest.sourceFamily,'batch');assert.equal(vector.direct.sourceFamily,'direct');
  assert.equal(h.test.storageHealth.get('chat-a').lastSaveSuccessful,false);
  assert(h.test.eventPanelMarkup('chat-a').includes('&quot;sourceFamily&quot;:&quot;batch&quot;'));
});
check('partial quota failure reproduces deep snapshot success and must retain lifecycle publication in memory',()=>{
  const h=environment();h.test.inspectJSON(mapping(),'/backend-api/conversation/chat-a',300);
  const previous=staticVector(h);assert(previous.direct);
  h.state.quota=true;
  const obj=mapping();obj.mapping.u.message.content.parts=['new longer source data'];
  h.test.inspectJSON(obj,'/backend-api/conversation/chat-a',900);
  const current=staticVector(h);assert.equal(current.direct.payloadBytes,900);
  assert(current.direct.mappingBytes>previous.direct.mappingBytes);
  assert.equal(h.test.loadSnapshot('chat-a').records[0].chars,'new longer source data'.length);
});
check('inflight parsed snapshots publish valid vectors without relabelling them stable or fabricating BATCH',()=>{
  const h=environment(),a=h.start();h.test.inspectJSON(mapping(),'/backend-api/conversation/chat-a',450);
  const vector=staticVector(h);assert(vector.direct);assert.equal(vector.direct.phase,'inflight');assert.equal(vector.batch,null);
  assert.equal(h.test.loadLifecycle('chat-a').families.direct.lastStable,null);
  assert.equal(vector.latest.sourceFamily,'direct');assert.equal(a.firstCaptureByFamily.direct.payloadBytes,450);
});
check('snapshot persistence succeeds while lifecycle alone fails: profiler and published source metrics both survive',()=>{
  const h=environment(),save=h.context.localStorage.setItem;
  h.context.localStorage.setItem=(key,value)=>{if(key.includes(':lifecycle-v216:'))throw Error('QuotaExceededError');save(key,value);};
  h.test.inspectJSON(mapping(),'/backend-api/conversation/chat-a',700);
  const stored=h.test.eventStorageParse(h.storage.get(h.test.snapshotKey('chat-a')));
  assert(stored.full);assert(stored.structure.contextTopology.retainedState);
  const vector=staticVector(h);assert(vector.direct);assert.equal(vector.direct.retainedBytes,stored.structure.contextTopology.retainedState.retainedStateProxyBytes);
  assert.equal(vector.direct.payloadBytes,700);assert.equal(vector.latest.sourceFamily,'direct');
  const health=h.test.eventStorageHealth('chat-a');assert.equal(health.saveResultsByKey[h.test.lifecycleKey('chat-a')],'failed');assert(health.unsavedKeyCount>0);
  assert.match(health.lastError,/QuotaExceeded/); // later successful diagnostic writes cannot conceal an unsaved lifecycle
});
check('explicit snapshot clear invalidates its new memory cache',()=>{
  const h=environment();h.test.inspectJSON(mapping(),'/backend-api/conversation/chat-a',300);
  h.test.setUI();h.context.confirm=()=>true;assert.equal(h.test.clearSnapshot(),true);assert.equal(h.test.loadSnapshot('chat-a').full,false);
});
check('healthy parsed DIRECT and BATCH HTTP responses publish static metrics through production network hooks',async()=>{
  const h=environment();h.state.fetch=async()=>response(JSON.stringify(mapping()));
  await h.page.fetch('/backend-api/conversation/chat-a');await h.flush();
  const first=staticVector(h);assert(first.direct);assert.equal(first.direct.phase,'stable');assert.equal(first.batch,null);
  const batch=mapping();batch.mapping.u.message.content.parts=['batch-specific text'];
  h.state.fetch=async()=>response(JSON.stringify({conversations:[batch]}));
  await h.page.fetch('/backend-api/conversations/batch',{method:'POST',body:'{}'});await h.flush();
  const vector=staticVector(h);assert(vector.batch);assert.equal(vector.latest.sourceFamily,'batch');
  assert.equal(vector.direct.mappingBytes,first.direct.mappingBytes);assert.notEqual(vector.batch.mappingBytes,first.direct.mappingBytes);
  assert(h.test.loadSnapshot('chat-a').structure.contextTopology.retainedState);
  assert.equal(h.test.loadAttemptState('chat-a').attempts.length,0);
});

const meterPrefix='cgpt-size-meter-v2101:';
function gcEnvironment() {const h=environment();h.setNow(1000000+45*86400000);return h;}
const legacyData=(time,padding=0)=>JSON.stringify({last:{id:1,outcome:'success',finalizedAt:time},rows:'x'.repeat(padding)});
check('origin-wide meter audit includes every owned namespace and conversation without reading unrelated values',()=>{
  const h=gcEnvironment();
  for(const suffix of ['settings','position','verified-max-samples','attempts-v222:old','attempts-v223:chat-a','lifecycle-v216:other','unknown:other'])h.storage.set(meterPrefix+suffix,'é😀');
  h.storage.set('ChatGPT-private','PRIVATE');h.storage.set('cgpt-size-meter-v21010:similar','PRIVATE');
  const read=h.context.localStorage.getItem;h.context.localStorage.getItem=key=>{assert(key.startsWith(meterPrefix));return read(key);};
  const entries=h.test.meterStorageInventory(),health=h.test.eventStorageHealth('chat-a');
  const expected=entries.reduce((n,e)=>n+Buffer.byteLength(e.key)+Buffer.byteLength(e.value),0);
  assert.equal(health.meterOwnedKeyCount,7);assert.equal(health.meterOwnedBytes,expected);
  assert.equal(health.meterOwnedUtf16Bytes,entries.reduce((n,e)=>n+2*(e.key.length+e.value.length),0));
  assert.equal(Object.keys(health.meterOwnedNamespaces).length,7);assert.equal(health.meterOwnedNamespaces['attempts-v222'].keys,1);
  assert.equal(h.storage.get('ChatGPT-private'),'PRIVATE');
});
check('stale cross-conversation legacy state is reclaimed and quota save finally succeeds without touching app storage',()=>{
  const h=gcEnvironment(),old=h.now()-40*86400000,oldKey=meterPrefix+'attempts-v222:stale';
  h.storage.set(oldKey,legacyData(old,8000));h.storage.set(meterPrefix+'diag:stale',JSON.stringify({time:old}));
  h.storage.set(meterPrefix+'attempts-v223:recent',legacyData(h.now()-86400000,1000));
  const samples=JSON.stringify([{time:old,verified:true}]);h.storage.set(meterPrefix+'verified-max-samples',samples);
  h.storage.set('ChatGPT-app-state','PRIVATE'.repeat(100));h.storage.set('cgpt-size-meter-v21010:lookalike','PRIVATE');
  const episodeKey=meterPrefix+'max-episodes-v223:chat-a',episode={nextId:9,activeId:8,episodes:[{id:8,firstSeenAt:old,relatedRealAttemptId:7,blockedBeforeDispatch:true}]};
  h.storage.set(episodeKey,JSON.stringify(episode));
  const store=h.test.blankAttemptState();store.attempts=[{id:7,conversationId:'chat-a',outcome:'success',finalizedAt:old,telemetryFinalizedAt:old,requestBodyBytes:30}];store.last=store.attempts[0];
  h.state.quotaBytes=[...h.storage.values()].reduce((n,v)=>n+Buffer.byteLength(v),0);
  const removed=[],remove=h.context.localStorage.removeItem;h.context.localStorage.removeItem=key=>{assert(key.startsWith(meterPrefix));removed.push(key);remove(key);};
  h.test.saveAttemptState('chat-a',store);
  const health=h.test.eventStorageHealth('chat-a',true);
  assert.equal(health.lastSaveSuccessful,true);assert.equal(health.finalSaveResult,'saved');assert(health.cleanupRetryRecoveredAt);
  assert.equal(health.cleanupRemovedKeyCount,2);assert(health.bytesReclaimed>8000);assert.equal(health.cleanupAt,h.now());
  assert.equal(h.storage.has(oldKey),false);assert.deepEqual(JSON.parse(JSON.stringify(h.test.eventStorageParse(h.storage.get(h.test.attemptKey('chat-a'))))),JSON.parse(JSON.stringify(store)));
  assert.deepEqual(JSON.parse(JSON.stringify(h.test.eventStorageParse(h.storage.get(episodeKey)))),episode);assert.equal(h.storage.get(meterPrefix+'verified-max-samples'),samples);
  assert.equal(h.storage.get('ChatGPT-app-state'),'PRIVATE'.repeat(100));assert.equal(h.storage.get('cgpt-size-meter-v21010:lookalike'),'PRIVATE');
  assert(removed.every(key=>key.endsWith(':stale')));
  console.log(`GC fixture: reclaimed ${health.bytesReclaimed} meter-owned bytes from ${removed.length} stale keys; final save ${health.finalSaveResult}`);
});
check('GC retains current sources, active/unknown V223 owners, undated/malformed/future caches and reserved metadata',()=>{
  const h=gcEnvironment(),old=h.now()-40*86400000;
  const keep=new Map();const seed=(suffix,value)=>{const key=meterPrefix+suffix;h.storage.set(key,value);keep.set(key,value);};
  seed('snapshot:chat-a',legacyData(old));
  seed('attempts-v223:active',legacyData(old));h.test.loadAttemptState('active').current={id:2,status:'running'};
  seed('snapshot:active',legacyData(old));seed('lifecycle-v216:active',legacyData(old));
  seed('attempts-v223:recent',legacyData(old));seed('diag:recent',JSON.stringify({time:h.now()}));
  seed('diag:undated','{}');seed('diag:malformed','invalid JSON');seed('snapshot:future',legacyData(h.now()+86400000));
  for(const suffix of ['settings','position','verified-max-samples','max:old','notify:old:live-max','unknown:old'])seed(suffix,legacyData(old));
  h.storage.set(meterPrefix+'attempts-v222:eligible',legacyData(old));
  assert(h.test.meterStorageCleanup('chat-a',h.test.attemptKey('chat-a'))>0);
  for(const [key,value]of keep)assert.equal(h.storage.get(key),value,key);
  assert.equal(h.storage.has(meterPrefix+'attempts-v222:eligible'),false);
});
check('GC twelve-key pass bound and cooldown hold across many inactive conversations; V223 episodes stay',()=>{
  const h=gcEnvironment(),old=h.now()-40*86400000;
  for(let i=0;i<10;i++)for(const namespace of ['snapshot','diag','lifecycle-v216','attempts-v222','max-episodes-v223'])h.storage.set(meterPrefix+namespace+':old-'+i,
    namespace==='max-episodes-v223'?JSON.stringify({nextId:2,activeId:null,episodes:[{id:1,active:false,firstSeenAt:old}]}):legacyData(old));
  const removed=[],remove=h.context.localStorage.removeItem;h.context.localStorage.removeItem=key=>{removed.push(key);remove(key);};
  h.test.meterStorageCleanup('chat-a',h.test.attemptKey('chat-a'));
  assert.equal(removed.length,12);assert(removed.every(key=>!key.includes(':max-episodes-v223:')));
  const count=h.storage.size;assert.equal(h.test.meterStorageCleanup('chat-a',h.test.attemptKey('chat-a')),0);assert.equal(h.storage.size,count);
  h.setNow(h.now()+30001);h.test.meterStorageCleanup('chat-a',h.test.attemptKey('chat-a'));assert.equal(removed.length,24);
});
check('GC stops after reclaim target even if the first eligible key is large',()=>{
  const h=gcEnvironment(),old=h.now()-40*86400000;
  h.storage.set(meterPrefix+'attempts-v222:large',legacyData(old,600000));h.storage.set(meterPrefix+'diag:large',JSON.stringify({time:old}));
  h.test.meterStorageCleanup('chat-a',h.test.attemptKey('chat-a'));const health=h.test.eventStorageHealth('chat-a');
  assert.equal(health.cleanupRemovedKeyCount,1);assert(health.cleanupBytesReclaimed>=512*1024);assert(h.storage.has(meterPrefix+'diag:large'));
});
check('GC skips a whole stale conversation changed by another tab during inspection',()=>{
  const h=gcEnvironment(),old=h.now()-40*86400000,key=meterPrefix+'attempts-v222:changed';
  h.storage.set(key,legacyData(old));h.storage.set(meterPrefix+'diag:changed',JSON.stringify({time:old}));
  let reads=0;const read=h.context.localStorage.getItem;
  h.context.localStorage.getItem=name=>{if(name===key && ++reads===2)h.storage.set(key,legacyData(h.now()));return read(name);};
  assert.equal(h.test.meterStorageCleanup('chat-a',h.test.attemptKey('chat-a')),0);
  assert.equal(h.storage.has(meterPrefix+'diag:changed'),true);assert.equal(JSON.parse(h.storage.get(key)).last.finalizedAt,h.now());
});
check('new storage write times protect recently used conversations containing old research observations',()=>{
  const h=gcEnvironment(),old=h.now()-40*86400000;
  h.storage.set(meterPrefix+'attempts-v223:recent-write',h.test.eventStorageSavedText(JSON.parse(legacyData(old))));
  h.storage.set(meterPrefix+'lifecycle-v216:recent-write',h.test.eventStorageRetryText(h.test.eventStorageSavedText({lastObservation:{time:old}})));
  h.test.meterStorageCleanup('chat-a',h.test.attemptKey('chat-a'));
  assert.equal(h.storage.size,2);assert.equal(h.test.eventStorageHealth('chat-a').bytesReclaimed,0);
});
check('validated 4b14425 checkpoint readers can still decode timestamped normal and retry storage',()=>{
  const checkpoint=require('node:child_process').execFileSync('git',['show','4b14425c50ff62b093082908c5861ae796fa7a7d:releases/v2.23/chatgpt_chat_size_meter_v223_event_model_cleanup.js'],{encoding:'utf8'});
  const old=environment(checkpoint.toString()),h=environment(),store=persistenceFixture(h,2),text=h.test.eventStorageSavedText(store);
  const logical=JSON.parse(JSON.stringify(store));
  assert.deepEqual(JSON.parse(JSON.stringify(old.test.eventStorageParse(text))),logical);
  assert.deepEqual(JSON.parse(JSON.stringify(old.test.eventStorageParse(h.test.eventStorageRetryText(text)))),logical);
});
check('no eligible headroom and denied cleanup surface final failure while parsed in-memory state remains valid',()=>{
  const h=gcEnvironment(),old=h.now()-40*86400000,key=meterPrefix+'attempts-v222:stale';h.storage.set(key,legacyData(old,2000));
  h.context.localStorage.removeItem=()=>{throw Error('cleanup denied');};h.state.quota=true;
  h.test.inspectJSON(mapping(),'/backend-api/conversation/chat-a',500);
  const health=h.test.eventStorageHealth('chat-a');assert.equal(health.finalSaveResult,'failed');assert.equal(health.lastSaveSuccessful,false);
  assert.match(health.cleanupError,/cleanup denied/);assert.match(health.lastError,/QuotaExceeded/);assert.equal(health.bytesReclaimed,0);
  assert(h.storage.has(key));assert(staticVector(h).direct);assert(h.test.loadSnapshot('chat-a').full);
});
check('non-quota storage failures never trigger destructive cleanup of stale evidence',()=>{
  const h=gcEnvironment(),old=h.now()-40*86400000,key=meterPrefix+'attempts-v222:stale';h.storage.set(key,legacyData(old,2000));
  h.context.localStorage.setItem=()=>{throw Error('storage temporarily unavailable');};
  h.test.inspectJSON(mapping(),'/backend-api/conversation/chat-a',501);
  const health=h.test.eventStorageHealth('chat-a');assert.equal(health.finalSaveResult,'failed');assert.equal(health.cleanupAt,null);
  assert.equal(health.bytesReclaimed,0);assert(h.storage.has(key));assert(staticVector(h).direct);
});

check('recent multi-megabyte origin reclaims superseded v218-v222 histories and retries every current key',()=>{
  const h=environment(),a=h.start();
  h.chunk(a,'data: {"type":"error","error":{"code":"conversation_too_long"}}\n\n');
  h.test.attemptFinishStream('chat-a',dispatchURL,response(),null,a.id);
  const episodeKey=meterPrefix+'max-episodes-v223:chat-a';
  const preserve=new Map();
  const keep=(suffix,value)=>{const key=meterPrefix+suffix;h.storage.set(key,value);preserve.set(key,value);};
  for(const suffix of ['settings','position','verified-max-samples'])keep(suffix,JSON.stringify({verified:true,time:h.now(),researchId:'retain-exact'}));
  for(let i=0;i<49;i++)keep('unknown-metadata-'+i,JSON.stringify({time:h.now(),value:i}));
  const active=h.test.blankAttemptState();active.current={id:9,startedAt:h.now(),status:'running'};
  keep('attempts-v223:other-active',JSON.stringify(active));keep('snapshot:other-active',legacyData(h.now(),2000));
  h.storage.set('ChatGPT-private-app','PRIVATE'.repeat(242857));
  h.storage.set('cgpt-size-meter-v21010:lookalike','do not delete');
  const obsolete=[];
  for(const [version,padding] of [[218,150000],[219,499000],[220,323000],[221,402000],[222,1130000]]){
    const key=meterPrefix+`attempts-v${version}:history-${version}`;
    const value=legacyData(h.now()-1000+version,padding);h.storage.set(key,value);
    obsolete.push({key,namespace:`attempts-v${version}`,bytes:Buffer.byteLength(key)+Buffer.byteLength(value),utf16Bytes:2*(key.length+value.length)});
  }
  const oldSnapshot=meterPrefix+'snapshot:orphan';h.storage.set(oldSnapshot,legacyData(h.now()-1,869000));
  // Simulate the previously failed four-key working set, without cleanup during setup.
  const save=h.context.localStorage.setItem;
  h.context.localStorage.setItem=()=>{throw Error('storage temporarily unavailable');};
  h.test.inspectJSON(mapping(),'/backend-api/conversation/chat-a',1200);
  h.test.inspectJSON({conversations:[mapping()]},'/backend-api/conversations/batch',1400);
  const before=h.test.eventStorageHealth('chat-a',true);
  assert.equal(before.meterOwnedKeyCount,65);assert(before.meterOwnedBytes>3300000);assert(before.meterOwnedUtf16Bytes>6600000);
  assert.equal(before.unsavedKeyCount,5);assert.equal(before.finalSaveResult,'failed');
  const initial={keys:before.meterOwnedKeyCount,bytes:before.meterOwnedBytes,utf16Bytes:before.meterOwnedUtf16Bytes};
  const vector=staticVector(h),required=h.test.meterRequiredState('chat-a');
  assert(vector.direct);assert(vector.batch);assert.equal(required.size,5);
  const expected=new Map([...required].map(([key,data])=>[key,JSON.parse(JSON.stringify(data))]));
  const writes=[],removed=[];h.context.localStorage.setItem=(key,value)=>{writes.push(key);save(key,value);};
  const remove=h.context.localStorage.removeItem;h.context.localStorage.removeItem=key=>{assert(key.startsWith(meterPrefix));removed.push(key);remove(key);};
  h.state.quotaUtf16=true;h.state.quotaBytes=5500000;
  h.test.saveSnapshot('chat-a',h.test.loadSnapshot('chat-a'));
  const health=h.test.eventStorageHealth('chat-a',true);
  assert(h.state.failedWrites>=4);assert.equal(health.finalSaveResult,'saved');assert.equal(health.lastSaveSuccessful,true);
  assert.equal(health.unsavedKeyCount,0);assert.equal(health.pendingWriteCount,0);
  assert.equal(health.recoveryPassCount,3);assert.equal(removed.length,5);
  assert.deepEqual(removed,obsolete.map(e=>e.key));
  assert.equal(health.recoveryBytesReclaimed,obsolete.reduce((n,e)=>n+e.bytes,0));
  assert.equal(health.bytesReclaimed,health.recoveryBytesReclaimed);assert.equal(health.cleanupAt,h.now());
  assert(health.recoveryPasses.every(pass=>pass.keys<=12));
  assert.deepEqual(JSON.parse(JSON.stringify(health.recoveryNamespaceTotals)),Object.fromEntries(obsolete.map(e=>[e.namespace,{keys:1,bytes:e.bytes,utf16Bytes:e.utf16Bytes}])));
  for(const [key,data] of expected){assert.equal(health.saveResultsByKey[key],'saved');assert(writes.filter(k=>k===key).length>=2);assert.deepEqual(JSON.parse(JSON.stringify(h.test.eventStorageParse(h.storage.get(key)))),data);}
  assert.equal(h.test.loadAttemptState('chat-a').last.id,a.id);assert.equal(h.test.loadAttemptState('chat-a').last.outcome,'max');
  assert.equal(h.test.eventEpisodes('chat-a').episodes[0].relatedRealAttemptId,a.id);
  for(const [key,value]of preserve)assert.equal(h.storage.get(key),value,key);
  assert(h.storage.has(oldSnapshot));assert.equal(h.storage.get('ChatGPT-private-app'),'PRIVATE'.repeat(242857));
  assert.equal(h.storage.get('cgpt-size-meter-v21010:lookalike'),'do not delete');
  assert.deepEqual(staticVector(h),vector);
  const fresh=environment();for(const [key,value]of h.storage)fresh.storage.set(key,value);
  assert.deepEqual(staticVector(fresh),vector);assert.equal(fresh.test.loadSnapshot('chat-a').full,true);
  assert.equal(fresh.test.loadAttemptState('chat-a').last.outcome,'max');assert.equal(fresh.test.eventEpisodes('chat-a').episodes[0].id,1);
  console.log(`RECENT ORIGIN: ${health.recoveryBytesReclaimed} UTF-8 bytes / ${obsolete.reduce((n,e)=>n+e.utf16Bytes,0)} UTF-16 bytes reclaimed; ${removed.length} obsolete keys; ${health.recoveryPassCount} bounded passes; ${required.size}/${required.size} required keys saved; namespaces ${JSON.stringify(health.recoveryNamespaceTotals)}`);
  const finalAudit={keys:health.meterOwnedKeyCount,bytes:health.meterOwnedBytes,utf16Bytes:health.meterOwnedUtf16Bytes};
  const keyBytes=Object.fromEntries([...required.keys()].map(key=>[key.slice(meterPrefix.length),Buffer.byteLength(h.storage.get(key))]));
  console.log(`RECENT ORIGIN AUDIT: before ${JSON.stringify(initial)}; after ${JSON.stringify(finalAudit)}; required current key bytes ${JSON.stringify(keyBytes)}`);
});
check('obsolete current-chat attempt versions are reclaimable; current sources and all V223 evidence survive',()=>{
  const h=environment(),preserve=new Map();
  for(const suffix of ['snapshot:chat-a','diag:chat-a','lifecycle-v216:chat-a','attempts-v223:chat-a','max-episodes-v223:chat-a','settings','position','verified-max-samples','max:chat-a','notify:chat-a:live-max']){
    const key=meterPrefix+suffix,value=legacyData(h.now());h.storage.set(key,value);preserve.set(key,value);
  }
  for(let v=218;v<=222;v++)h.storage.set(meterPrefix+`attempts-v${v}:chat-a`,v===218?'undated/legacy format':legacyData(h.now()));
  h.test.meterStorageCleanup('chat-a',h.test.snapshotKey('chat-a'));
  const health=h.test.eventStorageHealth('chat-a');assert.equal(health.cleanupRemovedKeyCount,5);
  for(let v=218;v<=222;v++)assert.equal(h.storage.has(meterPrefix+`attempts-v${v}:chat-a`),false);
  for(const [key,value]of preserve)assert.equal(h.storage.get(key),value,key);
});
check('recent source caches are reclaimable only without active V223 owners; closed V223 history is retained',()=>{
  const h=environment(),closed=h.test.blankAttemptState();closed.attempts=[{id:1,outcome:'success',telemetryFinalizedAt:h.now()}];
  h.storage.set(meterPrefix+'attempts-v223:closed',JSON.stringify(closed));
  h.storage.set(meterPrefix+'max-episodes-v223:closed',JSON.stringify({nextId:2,activeId:null,episodes:[{id:1,active:false,confirmationSource:'UI MAX banner'}]}));
  const pending=h.test.blankAttemptState();pending.attempts=[{id:2,outcome:'success',telemetryFinalizedAt:null}];
  h.storage.set(meterPrefix+'attempts-v223:pending',JSON.stringify(pending));
  const activeEpisode=JSON.stringify({nextId:2,activeId:1,episodes:[{id:1,active:true}]});h.storage.set(meterPrefix+'max-episodes-v223:episode-active',activeEpisode);
  for(const chat of ['closed','orphan','pending','episode-active'])for(const namespace of ['snapshot','diag','lifecycle-v216'])h.storage.set(meterPrefix+namespace+':'+chat,legacyData(h.now()));
  h.test.meterStorageCleanup('chat-a',null);
  assert.equal(h.test.eventStorageHealth('chat-a').cleanupRemovedKeyCount,6);
  for(const namespace of ['snapshot','diag','lifecycle-v216']){
    assert(!h.storage.has(meterPrefix+namespace+':closed'));assert(!h.storage.has(meterPrefix+namespace+':orphan'));
    assert(h.storage.has(meterPrefix+namespace+':pending'));assert(h.storage.has(meterPrefix+namespace+':episode-active'));
  }
  assert.equal(h.storage.get(meterPrefix+'attempts-v223:closed'),JSON.stringify(closed));
  assert.equal(h.storage.get(meterPrefix+'max-episodes-v223:episode-active'),activeEpisode);
});
check('cleanup prioritizes obsolete non-current histories, then current legacy histories, then oldest caches',()=>{
  const h=environment(),removed=[],remove=h.context.localStorage.removeItem;
  h.context.localStorage.removeItem=key=>{removed.push(key.slice(meterPrefix.length));remove(key);};
  for(const [suffix,time]of [['snapshot:new-cache',h.now()],['diag:old-cache',h.now()-100],['attempts-v222:chat-a',h.now()-500],['attempts-v219:recent-other',h.now()],['attempts-v218:older-other',h.now()-50]])h.storage.set(meterPrefix+suffix,legacyData(time));
  h.test.meterStorageCleanup('chat-a',null);
  assert.deepEqual(removed,['attempts-v218:older-other','attempts-v219:recent-other','attempts-v222:chat-a','diag:old-cache','snapshot:new-cache']);
});
check('unrecoverable quota stops at four twelve-key passes and preserves every current key in memory',()=>{
  const h=environment();h.test.inspectJSON(mapping(),'/backend-api/conversation/chat-a',300);
  for(let i=0;i<100;i++)h.storage.set(meterPrefix+'attempts-v222:recent-'+i,legacyData(h.now()));
  const before=staticVector(h);h.state.quota=true;h.test.saveSnapshot('chat-a',h.test.loadSnapshot('chat-a'));
  const health=h.test.eventStorageHealth('chat-a');assert.equal(health.recoveryPassCount,4);assert.equal(health.recoveryPasses.reduce((n,p)=>n+p.keys,0),48);
  assert(health.recoveryPasses.every(p=>p.keys===12));assert.equal(health.finalSaveResult,'failed');assert.equal(health.unsavedKeyCount,4);
  assert.equal([...h.storage.keys()].filter(key=>key.includes(':attempts-v222:')).length,52);assert.deepEqual(staticVector(h),before);
  h.test.saveDiagnostic('chat-a',{test:'cooldown'});assert.equal([...h.storage.keys()].filter(key=>key.includes(':attempts-v222:')).length,52);
});
check('cleanup success cannot mask a remaining required-key failure and later recovery retries every key',()=>{
  const h=environment();h.test.inspectJSON(mapping(),'/backend-api/conversation/chat-a',300);
  h.storage.set(meterPrefix+'attempts-v222:recent',legacyData(h.now(),20000));
  const save=h.context.localStorage.setItem,writes=[];let deny=true;
  h.context.localStorage.setItem=(key,value)=>{writes.push(key);if(deny && key===h.test.diagKey('chat-a'))throw Error('QuotaExceededError');save(key,value);};
  h.test.saveSnapshot('chat-a',h.test.loadSnapshot('chat-a'));
  // A failed diagnostic alone must trigger coordinated recovery, even after a successful snapshot.
  h.test.saveDiagnostic('chat-a',{test:'fail'});
  const health=h.test.eventStorageHealth('chat-a');assert.equal(health.finalSaveResult,'failed');assert.equal(health.unsavedKeyCount,1);
  assert.equal(health.saveResultsByKey[h.test.diagKey('chat-a')],'failed');assert(!h.storage.has(meterPrefix+'attempts-v222:recent'));
  writes.length=0;deny=false;h.test.saveAttemptState('chat-a',h.test.loadAttemptState('chat-a'));
  assert.equal(health.finalSaveResult,'saved');assert.equal(health.unsavedKeyCount,0);assert.equal(health.pendingWriteCount,0);
  for(const key of health.requiredCurrentKeys)assert(writes.includes(key));
});
check('silent storage write loss and externally missing keys cannot produce overall save success',()=>{
  const h=environment();h.test.inspectJSON(mapping(),'/backend-api/conversation/chat-a',300);
  const save=h.context.localStorage.setItem;h.context.localStorage.setItem=(key,value)=>{if(key!==h.test.diagKey('chat-a'))save(key,value);};
  h.test.saveDiagnostic('chat-a',{test:'new diagnostic'});
  const health=h.test.eventStorageHealth('chat-a');assert.equal(health.finalSaveResult,'failed');assert.equal(health.unsavedKeyCount,1);assert.match(health.lastError,/readback mismatch/);
  h.context.localStorage.setItem=save;h.storage.delete(h.test.lifecycleKey('chat-a'));
  h.test.saveAttemptState('chat-a',h.test.loadAttemptState('chat-a'));
  assert.equal(health.finalSaveResult,'saved');assert.equal(health.unsavedKeyCount,0);assert(h.storage.has(h.test.lifecycleKey('chat-a')));
});

(async()=>{
  let failed=0;
  for(const [name,fn]of cases){try{await fn();console.log('PASS '+name);}catch(error){failed++;console.error('FAIL '+name+'\n'+error.stack);}}
  console.log(`${cases.length-failed}/${cases.length} synthetic harness tests passed; native-browser validation not performed`);
  if(failed)process.exitCode=1;
})();
