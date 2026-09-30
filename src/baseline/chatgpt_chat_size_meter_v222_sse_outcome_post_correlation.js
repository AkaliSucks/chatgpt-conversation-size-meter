// ==UserScript==
// @name         ChatGPT Conversation Size Meter V2.22 SSE OUTCOME + POST CORRELATION
// @namespace    local.chatgpt.size.v2101
// @version      2.22.0
// @description  Confirms SUCCESS directly from SSE completion signals, records the confirmation source, treats post-completion stream aborts as benign, and captures post-outcome DIRECT/BATCH correlation.
// @match        https://chatgpt.com/*
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==

(() => {
'use strict';

/*
  V2.22 — SSE OUTCOME CONFIRMATION + POST CORRELATION

  Goal:
  - Do not auto-scroll the conversation.
  - Do not require a manual top-to-bottom pass.
  - Observe ChatGPT's own conversation network traffic at document-start.
  - Extract user/assistant messages from full conversation payloads when available.
  - Merge later POST/SSE messages into a captured full snapshot.
  - Persist only message IDs/roles/character counts; not the conversation text.

  Important:
  ChatGPT does not expose an official "remaining conversation capacity" value.
  V2.22 promotes explicit SSE completion to authoritative SUCCESS evidence and makes post-response source snapshots optional correlation rather than a success gate.
  It measures the active current_node ancestry separately from the total mapping,
  records hidden/internal-role structure, branch topology, content types, and stable
  serialized-size diagnostics. Verified MAX samples can only be saved while the
  actual red maximum-length banner is visible.

  If ChatGPT changes its internal transport again and no full payload can be
  captured, this script intentionally says "waiting for full data" instead of
  pretending a viewport sample is the whole conversation.
*/

const P = 'cgpt-size-meter-v2101';
const SETTINGS_KEY = `${P}:settings`;
const POSITION_KEY = `${P}:position`;
const SNAPSHOT_PREFIX = `${P}:snapshot`;
const MAX_PREFIX = `${P}:max`;
const DIAG_PREFIX = `${P}:diag`;
const MAX_SAMPLES_KEY = `${P}:verified-max-samples`;
const LIFECYCLE_PREFIX = `${P}:lifecycle-v216`;
const ATTEMPT_PREFIX = `${P}:attempts-v222`;

const DEFAULTS = {
  charsPerToken: 4.0,
  fallbackReferenceTokens: 250000,
  warningPercent: 80,
  notifications: false,
  calibrationTokens: null,
  expanded: false
};

let S = loadSettings();
let panel = null;
let compact = null;
let detail = null;
let settingsBox = null;
let latest = null;
let updateTimer = null;
let lastURL = location.href;
let drag = false;
let dx = 0;
let dy = 0;
let networkHooked = false;
let directRetryTimer = null;
let lastGeneratingState = false;
let lifecycleRetryTimer = null;
let attemptFinalizeTimer = null;
let attemptUnknownTimer = null;
let attemptSettleTimer = null;
let attemptSSESuccessTimer = null;
let websocketHooked = false;
let attemptDOMObserver = null;
let attemptDOMTimer = null;
let attemptDOMLastSignature = '';
let attemptDOMLastGenerating = null;
let attemptDOMLastCaptureAt = 0;

const page = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;


// ============================================================
// Storage
// ============================================================

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };

    for (const k of [
      'cgpt-size-meter-v210:settings',
      'cgpt-size-meter-v29:settings',
      'cgpt-size-meter-v28:settings',
      'cgpt-size-meter-v27:settings',
      'cgpt-size-meter-v26:settings',
      'cgpt-size-meter-v25:settings',
      'cgpt-size-meter-v24:settings',
      'cgpt-size-meter-v23:settings',
      'cgpt-size-meter-v22:settings'
    ]) {
      const x = localStorage.getItem(k);
      if (!x) continue;

      const migrated = {
        ...DEFAULTS,
        ...JSON.parse(x),
        // V2.7 proved that raw archive-text size is NOT a universal
        // conversation hard limit. Never migrate the old calibration.
        calibrationTokens: null
      };

      localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify(migrated)
      );

      return migrated;
    }
  } catch {}

  return { ...DEFAULTS };
}

function saveSettings() {
  localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify(S)
  );
}

function chatIdFromURL() {
  return location.pathname.match(/\/c\/([^/?#]+)/)?.[1] || null;
}

function snapshotKey(id = chatIdFromURL()) {
  return id ? `${SNAPSHOT_PREFIX}:${id}` : null;
}

function maxKey(id = chatIdFromURL()) {
  return id ? `${MAX_PREFIX}:${id}` : null;
}

function diagKey(id = chatIdFromURL()) {
  return id ? `${DIAG_PREFIX}:${id}` : null;
}

function blankSnapshot() {
  return {
    version: 3,
    full: false,
    records: [],
    source: 'waiting for full data',
    capturedAt: 0,
    fullCapturedAt: 0,
    structure: null,
    maxFullPayloadBytes: 0
  };
}

function loadSnapshot(id = chatIdFromURL()) {
  const k = snapshotKey(id);
  if (!k) return blankSnapshot();

  try {
    const parsed = JSON.parse(localStorage.getItem(k));
    if (parsed && Array.isArray(parsed.records)) {
      return {
        ...blankSnapshot(),
        ...parsed
      };
    }
  } catch {}

  return blankSnapshot();
}

function saveSnapshot(id, snap) {
  const k = snapshotKey(id);
  if (!k) return;

  try {
    localStorage.setItem(
      k,
      JSON.stringify(snap)
    );
  } catch (e) {
    console.warn('[Chat Size V2.10.1] Could not save snapshot:', e);
  }
}

function saveDiagnostic(id, diag) {
  const k = diagKey(id);
  if (!k) return;

  try {
    let previous = {};
    try {
      previous = JSON.parse(localStorage.getItem(k)) || {};
    } catch {}

    localStorage.setItem(
      k,
      JSON.stringify({
        ...previous,
        ...diag,
        time: Date.now()
      })
    );
  } catch {}
}

function loadDiagnostic(id = chatIdFromURL()) {
  const k = diagKey(id);
  if (!k) return null;

  try {
    return JSON.parse(localStorage.getItem(k));
  } catch {
    return null;
  }
}


// ============================================================
// Helpers
// ============================================================

function esc(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function fmt(n) {
  if (!Number.isFinite(n)) return '0';
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e5) return `${(n / 1e3).toFixed(0)}k`;
  if (n >= 1e4) return `${(n / 1e3).toFixed(1)}k`;
  return n.toLocaleString();
}

function hashString(s) {
  let h = 2166136261;

  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }

  return (h >>> 0).toString(36);
}

function estimateTokens(chars) {
  return chars
    ? Math.ceil(chars / S.charsPerToken)
    : 0;
}

function formatAge(ts) {
  if (!ts) return '—';

  const mins = Math.max(
    0,
    Math.floor((Date.now() - ts) / 60000)
  );

  if (mins < 60) return `${mins}m ago`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;

  return `${Math.floor(hours / 24)}d ago`;
}

function scheduleUpdate() {
  clearTimeout(updateTimer);
  updateTimer = setTimeout(updateUI, 150);
}


// ============================================================
// Hard-limit persistence
// ============================================================

function visibleHardMax() {
  const t = (document.body?.innerText || '').toLowerCase();

  return (
    t.includes("you've reached the maximum length for this conversation") ||
    t.includes('you have reached the maximum length for this conversation') ||
    t.includes('maximum length for this conversation')
  );
}

function verifiedSampleSignature(sample) {
  return [
    sample?.chatId ?? '',
    sample?.archiveTokens ?? '',
    sample?.messages ?? '',
    sample?.userMessages ?? '',
    sample?.assistantMessages ?? ''
  ].join('|');
}

function richerVerifiedSample(a, b) {
  const score = x => [
    x?.mappingNodes,
    x?.activeBranchNodes,
    x?.activeAllTextCharacters,
    x?.mappingSerializedBytes,
    x?.maxFullPayloadBytes
  ].filter(v => Number.isFinite(Number(v)) && Number(v) > 0).length;

  return score(b) >= score(a) ? { ...a, ...b } : { ...b, ...a };
}

function loadVerifiedMaxSamples() {
  let samples = [];

  try {
    const x = JSON.parse(localStorage.getItem(MAX_SAMPLES_KEY));
    if (Array.isArray(x)) samples = x;
  } catch {}

  if (!samples.length) {
    for (const oldKey of [
      'cgpt-size-meter-v210:verified-max-samples',
      'cgpt-size-meter-v29:verified-max-samples',
      'cgpt-size-meter-v28:verified-max-samples'
    ]) {
      try {
        const old = JSON.parse(localStorage.getItem(oldKey));

        if (Array.isArray(old) && old.length) {
          const bySignature = new Map();

          for (const sample of old) {
            const sig = verifiedSampleSignature(sample);
            const prior = bySignature.get(sig);
            bySignature.set(
              sig,
              prior ? richerVerifiedSample(prior, sample) : sample
            );
          }

          samples = [...bySignature.values()];
          localStorage.setItem(
            MAX_SAMPLES_KEY,
            JSON.stringify(samples.slice(-20))
          );
          break;
        }
      } catch {}
    }
  }

  return samples;
}

function saveVerifiedMaxSample(sample) {
  const samples = loadVerifiedMaxSamples();
  const sig = verifiedSampleSignature(sample);
  const index = samples.findIndex(x => verifiedSampleSignature(x) === sig);

  if (index >= 0) {
    samples[index] = richerVerifiedSample(samples[index], sample);
  } else {
    samples.push(sample);
  }

  localStorage.setItem(MAX_SAMPLES_KEY, JSON.stringify(samples.slice(-20)));
}

function clearVerifiedMaxSamples() {
  localStorage.removeItem(MAX_SAMPLES_KEY);
}


// ============================================================
// Message extraction
// ============================================================

function normalizeRole(role) {
  const r = String(role || '').trim().toLowerCase();

  if (['user', 'assistant'].includes(r)) {
    return r;
  }

  return null;
}

function textFromPart(part) {
  if (part == null) return '';

  if (typeof part === 'string') {
    return part;
  }

  if (Array.isArray(part)) {
    return part
      .map(textFromPart)
      .filter(Boolean)
      .join('\n');
  }

  if (typeof part === 'object') {
    if (typeof part.text === 'string') return part.text;
    if (typeof part.value === 'string') return part.value;

    if (typeof part.content === 'string') {
      return part.content;
    }

    if (Array.isArray(part.parts)) {
      return part.parts
        .map(textFromPart)
        .filter(Boolean)
        .join('\n');
    }

    if (
      part.content &&
      typeof part.content === 'object'
    ) {
      return textFromPart(part.content);
    }
  }

  return '';
}

function textFromMessage(msg) {
  if (!msg || typeof msg !== 'object') return '';

  const c = msg.content;

  if (typeof c === 'string') {
    return c.trim();
  }

  if (c && typeof c === 'object') {
    if (Array.isArray(c.parts)) {
      return c.parts
        .map(textFromPart)
        .filter(Boolean)
        .join('\n')
        .trim();
    }

    if (typeof c.text === 'string') {
      return c.text.trim();
    }

    if (typeof c.content === 'string') {
      return c.content.trim();
    }

    const derived = textFromPart(c);
    if (derived) return derived.trim();
  }

  if (typeof msg.text === 'string') {
    return msg.text.trim();
  }

  return '';
}

function roleFromMessage(msg) {
  if (!msg || typeof msg !== 'object') return null;

  return normalizeRole(
    msg.author?.role ??
    msg.role ??
    msg.message?.author?.role ??
    msg.message?.role
  );
}

function idFromMessage(msg, fallbackText, role) {
  const id =
    msg?.id ??
    msg?.message?.id ??
    msg?.message_id ??
    msg?.client_message_id ??
    msg?.metadata?.message_id;

  if (id) return String(id);

  return `hash:${hashString(`${role}\0${fallbackText}`)}`;
}

function recordFromMessage(msg) {
  const actual = msg?.message && typeof msg.message === 'object'
    ? msg.message
    : msg;

  const role = roleFromMessage(actual);
  if (!role) return null;

  const text = textFromMessage(actual);
  if (!text) return null;

  return {
    id: idFromMessage(actual, text, role),
    role,
    chars: text.length
  };
}


// ============================================================
// Conversation-shape parsers + structural diagnostics
// ============================================================

function rawRoleFromMessage(msg) {
  const actual = msg?.message && typeof msg.message === 'object'
    ? msg.message
    : msg;

  const role =
    actual?.author?.role ??
    actual?.role ??
    'unknown';

  return String(role || 'unknown').trim().toLowerCase() || 'unknown';
}

function primaryContentType(msg) {
  const actual = msg?.message && typeof msg.message === 'object'
    ? msg.message
    : msg;

  const c = actual?.content;

  const type =
    c?.content_type ??
    c?.type ??
    actual?.content_type ??
    actual?.type ??
    'unknown';

  return String(type || 'unknown').trim().toLowerCase() || 'unknown';
}

function countInto(obj, key, amount = 1) {
  const k = String(key || 'unknown');
  obj[k] = (obj[k] || 0) + amount;
}

function utf8BytesOfJSON(value) {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    return null;
  }
}

function cleanShortString(value, max = 240) {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (!s || s.length > max) return null;
  return s;
}

function genericRecipient(value) {
  const s = String(value || '').trim().toLowerCase();

  return (
    !s ||
    s === 'all' ||
    s === 'none' ||
    s === 'null' ||
    s === 'assistant' ||
    s === 'user' ||
    s === 'system' ||
    s === 'developer'
  );
}

function looksLikeImageGenName(value) {
  const s = String(value || '').toLowerCase();

  return (
    /image[_\-. ]?(gen|generation)/.test(s) ||
    /gpt[-_. ]?image/.test(s) ||
    /\bdall[-_. ]?e?\b/.test(s) ||
    /imagegen/.test(s) ||
    /text2im/.test(s)
  );
}

function looksLikeAssetKey(key) {
  const k = String(key || '').toLowerCase();

  return (
    k === 'asset_pointer' ||
    k === 'image_asset_pointer' ||
    k === 'file_id' ||
    k === 'attachment_id' ||
    k === 'upload_id' ||
    k === 'media_id' ||
    k === 'asset_id' ||
    k === 'sandbox_path' ||
    k === 'download_url' ||
    k === 'image_url' ||
    k === 'file_url'
  );
}

function scanDeepSignals(value, depth = 0, state = null, parentKey = '') {
  if (!state) {
    state = {
      attachment: false,
      image: false,
      file: false,
      audio: false,
      video: false,
      generatedImageHint: false,
      imageReferenceOccurrences: 0,
      fileReferenceOccurrences: 0,
      assetIds: new Set(),
      imageAssetIds: new Set(),
      fileAssetIds: new Set(),
      modelIds: new Set(),
      toolNameHints: new Set()
    };
  }

  if (value == null || depth > 9) return state;

  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    const pk = String(parentKey || '').toLowerCase();

    if (looksLikeImageGenName(value)) {
      state.generatedImageHint = true;
    }

    if (
      pk === 'model' ||
      pk === 'model_id' ||
      pk === 'model_name' ||
      pk === 'model_slug' ||
      pk === 'default_model_slug' ||
      pk.endsWith('_model_slug') ||
      pk.endsWith('_model_id')
    ) {
      const v = cleanShortString(value, 160);
      if (v) state.modelIds.add(v);
    }

    if (
      pk === 'tool_name' ||
      pk === 'function_name' ||
      pk === 'recipient' ||
      pk === 'name'
    ) {
      const v = cleanShortString(value, 180);
      if (v && !genericRecipient(v)) {
        state.toolNameHints.add(v);
      }
    }

    if (looksLikeAssetKey(pk)) {
      state.assetIds.add(value);

      if (pk.includes('image')) {
        state.image = true;
        state.imageReferenceOccurrences++;
        state.imageAssetIds.add(value);
      }

      if (
        pk.includes('file') ||
        pk.includes('attachment') ||
        pk.includes('upload') ||
        pk === 'sandbox_path'
      ) {
        state.file = true;
        state.fileReferenceOccurrences++;
        state.fileAssetIds.add(value);
      }
    }

    if (
      lower.startsWith('sediment://') ||
      lower.startsWith('asset://') ||
      lower.startsWith('sandbox:/') ||
      lower.startsWith('file-')
    ) {
      state.assetIds.add(value);
    }

    return state;
  }

  if (Array.isArray(value)) {
    for (const item of value.slice(0, 300)) {
      scanDeepSignals(item, depth + 1, state, parentKey);
    }
    return state;
  }

  if (typeof value !== 'object') return state;

  for (const [key, child] of Object.entries(value)) {
    const k = String(key || '').toLowerCase();

    if (
      k === 'attachment' ||
      k === 'attachments' ||
      k.includes('attachment') ||
      k === 'asset_pointer' ||
      k === 'image_asset_pointer' ||
      k === 'file_id' ||
      k === 'upload_id' ||
      k === 'sandbox_path'
    ) {
      state.attachment = true;
    }

    if (k.includes('image')) {
      state.image = true;
      state.imageReferenceOccurrences++;
    }

    if (k.includes('file') || k.includes('attachment') || k.includes('upload')) {
      state.file = true;
      state.fileReferenceOccurrences++;
    }

    if (k.includes('audio')) state.audio = true;
    if (k.includes('video')) state.video = true;

    if (
      (k === 'content_type' || k === 'type') &&
      typeof child === 'string'
    ) {
      const v = child.toLowerCase();

      if (v.includes('image')) {
        state.image = true;
        state.imageReferenceOccurrences++;
      }

      if (v.includes('file') || v.includes('attachment')) {
        state.file = true;
        state.fileReferenceOccurrences++;
      }

      if (v.includes('audio')) state.audio = true;
      if (v.includes('video')) state.video = true;

      if (looksLikeImageGenName(v)) {
        state.generatedImageHint = true;
      }
    }

    if (typeof child === 'string') {
      const v = child;

      if (looksLikeAssetKey(k)) {
        state.assetIds.add(v);

        if (k.includes('image')) {
          state.imageAssetIds.add(v);
        }

        if (
          k.includes('file') ||
          k.includes('attachment') ||
          k.includes('upload') ||
          k === 'sandbox_path'
        ) {
          state.fileAssetIds.add(v);
        }
      }

      if (
        k === 'model' ||
        k === 'model_id' ||
        k === 'model_name' ||
        k === 'model_slug' ||
        k === 'default_model_slug' ||
        k.endsWith('_model_slug') ||
        k.endsWith('_model_id')
      ) {
        const m = cleanShortString(v, 160);
        if (m) state.modelIds.add(m);
      }

      if (
        k === 'tool_name' ||
        k === 'function_name' ||
        k === 'recipient'
      ) {
        const t = cleanShortString(v, 180);
        if (t && !genericRecipient(t)) {
          state.toolNameHints.add(t);
        }
      }

      if (looksLikeImageGenName(v)) {
        state.generatedImageHint = true;
      }
    }

    if (child && typeof child === 'object') {
      scanDeepSignals(child, depth + 1, state, k);
    }
  }

  return state;
}

function messageDiagnostics(msg) {
  const actual = msg?.message && typeof msg.message === 'object'
    ? msg.message
    : msg;

  if (!actual || typeof actual !== 'object') {
    return null;
  }

  const role = rawRoleFromMessage(actual);
  const contentType = primaryContentType(actual);
  const text = textFromMessage(actual);
  const textChars = text.length;
  const signals = scanDeepSignals(actual);

  const recipient =
    cleanShortString(
      actual?.recipient ??
      actual?.metadata?.recipient ??
      actual?.content?.recipient,
      180
    );

  const authorName =
    cleanShortString(
      actual?.author?.name ??
      actual?.name,
      180
    );

  const metadataToolName =
    cleanShortString(
      actual?.metadata?.tool_name ??
      actual?.metadata?.function_name ??
      actual?.metadata?.name ??
      actual?.content?.name,
      180
    );

  const nonGenericRecipient =
    recipient && !genericRecipient(recipient)
      ? recipient
      : null;

  /*
    V2.9 incorrectly treated nearly every message as tool-like because many
    ChatGPT messages carry a generic recipient field. V2.10.1 only treats
    non-generic recipients and explicit tool/function/result shapes as tools.
  */
  const toolCall =
    (
      role === 'assistant' ||
      role === 'developer'
    ) &&
    (
      Boolean(nonGenericRecipient) ||
      contentType.includes('tool_call') ||
      contentType.includes('function_call') ||
      contentType.includes('computer_initialize_state')
    );

  const explicitToolRole =
    role === 'tool' ||
    role === 'function';

  const toolResult =
    explicitToolRole ||
    contentType.includes('execution_output') ||
    contentType.includes('tool_result') ||
    contentType.includes('function_result') ||
    contentType.includes('computer_output');

  const toolish =
    toolCall ||
    toolResult;

  let toolName = null;

  if (toolCall) {
    toolName =
      nonGenericRecipient ||
      metadataToolName ||
      [...signals.toolNameHints][0] ||
      authorName ||
      'unknown-tool';
  } else if (toolResult) {
    toolName =
      authorName ||
      metadataToolName ||
      [...signals.toolNameHints][0] ||
      nonGenericRecipient ||
      'unknown-tool';
  }

  const imageGenCall =
    toolCall &&
    (
      looksLikeImageGenName(toolName) ||
      signals.generatedImageHint
    );

  const imageGenResult =
    toolResult &&
    (
      looksLikeImageGenName(toolName) ||
      signals.generatedImageHint
    );

  const generatedImageNode =
    imageGenCall ||
    imageGenResult ||
    (
      signals.generatedImageHint &&
      signals.image
    );

  const uploadedImageNode =
    role === 'user' &&
    signals.image;

  const knownInternalContentType =
    (
      contentType === 'thoughts' ||
      contentType === 'reasoning_recap' ||
      contentType === 'model_editable_context' ||
      contentType === 'execution_output' ||
      contentType === 'tool_result' ||
      contentType === 'function_result'
    );

  const displayLike =
    (
      role === 'user' ||
      role === 'assistant'
    ) &&
    !knownInternalContentType;

  const contextLike =
    role === 'system' ||
    role === 'developer' ||
    contentType.includes('context') ||
    contentType.includes('summary') ||
    contentType === 'model_editable_context';

  const modelIds = [...signals.modelIds];
  const gpt6Pro =
    modelIds.some(x => {
      const v = x.toLowerCase();
      return (
        (v.includes('gpt-6') || v.includes('gpt6')) &&
        v.includes('pro')
      );
    });

  return {
    role,
    contentType,
    textChars,
    hasText: textChars > 0,
    displayLike,
    toolCall,
    toolResult,
    explicitToolRole,
    toolish,
    toolName,
    recipient: nonGenericRecipient,
    imageGenCall,
    imageGenResult,
    generatedImageNode,
    uploadedImageNode,
    contextLike,
    attachment: signals.attachment,
    image: signals.image,
    file: signals.file,
    audio: signals.audio,    video: signals.video,
    assetIds: [...signals.assetIds],
    imageAssetIds: [...signals.imageAssetIds],
    fileAssetIds: [...signals.fileAssetIds],
    imageReferenceOccurrences: signals.imageReferenceOccurrences,
    fileReferenceOccurrences: signals.fileReferenceOccurrences,
    modelIds,
    gpt6Pro
  };
}

function getActiveBranch(mapping, currentNode) {
  if (!mapping || typeof mapping !== 'object') return [];

  if (currentNode && mapping[currentNode]) {
    const reversed = [];
    const seen = new Set();
    let nodeId = currentNode;

    while (
      nodeId &&
      mapping[nodeId] &&
      !seen.has(nodeId)
    ) {
      seen.add(nodeId);
      reversed.push(mapping[nodeId]);
      nodeId = mapping[nodeId].parent;
    }

    reversed.reverse();
    return reversed;
  }

  return Object.values(mapping)
    .filter(Boolean)
    .sort((a, b) => {
      const at = Number(a?.message?.create_time || 0);
      const bt = Number(b?.message?.create_time || 0);
      return at - bt;
    });
}

function largestRecord(current, bytes, d, extra = {}) {
  if (!Number.isFinite(Number(bytes))) return current;

  if (!current || Number(bytes) > Number(current.bytes || 0)) {
    return {
      bytes: Number(bytes),
      role: d?.role ?? 'unknown',
      contentType: d?.contentType ?? 'unknown',
      toolName: d?.toolName ?? null,
      ...extra
    };
  }

  return current;
}

function analyzeNodes(nodes) {
  const roleCounts = {};
  const contentTypeCounts = {};
  const toolCallNames = {};
  const toolResultNames = {};
  const recipientCounts = {};
  const modelCounts = {};
  const nodeBytesByRole = {};
  const nodeBytesByContentType = {};

  const uniqueAssetIds = new Set();
  const uniqueImageAssetIds = new Set();
  const uniqueFileAssetIds = new Set();
  const uniqueGeneratedImageAssetIds = new Set();
  const uniqueUploadedImageAssetIds = new Set();

  let messageNodes = 0;
  let emptyMessageNodes = 0;
  let allTextChars = 0;

  // Legacy role-based user/assistant text, retained for continuity.
  let displayTextChars = 0;
  let displayMessages = 0;

  // Heuristic UI-display-like text excluding known internal assistant content.
  let displayLikeTextChars = 0;
  let displayLikeMessages = 0;

  let hiddenMessageNodes = 0;
  let hiddenTextChars = 0;

  let explicitToolRoleNodes = 0;
  let toolishNodes = 0;
  let toolCallNodes = 0;
  let toolResultNodes = 0;
  let toolCallBytes = 0;
  let toolResultBytes = 0;

  let contextLikeNodes = 0;
  let attachmentNodes = 0;
  let imageNodes = 0;
  let fileNodes = 0;
  let audioNodes = 0;
  let videoNodes = 0;

  let imageGenCallNodes = 0;
  let imageGenResultNodes = 0;
  let generatedImageNodes = 0;
  let uploadedImageNodes = 0;
  let imageReferenceOccurrences = 0;
  let fileReferenceOccurrences = 0;

  let assetNodeBytes = 0;
  let imageNodeBytes = 0;
  let fileNodeBytes = 0;

  let gpt6ProMessageNodes = 0;

  let largestNode = null;
  let largestToolResult = null;
  let largestImageNode = null;

  for (const node of nodes) {
    const msg = node?.message;
    if (!msg) continue;

    messageNodes++;

    const d = messageDiagnostics(msg);
    if (!d) continue;

    const nodeBytes = utf8BytesOfJSON(node) ?? 0;

    countInto(roleCounts, d.role);
    countInto(contentTypeCounts, d.contentType);
    countInto(nodeBytesByRole, d.role, nodeBytes);
    countInto(nodeBytesByContentType, d.contentType, nodeBytes);

    allTextChars += d.textChars;

    if (!d.hasText) {
      emptyMessageNodes++;
    }

    if (d.role === 'user' || d.role === 'assistant') {
      if (d.hasText) {
        displayMessages++;
        displayTextChars += d.textChars;
      }
    } else {
      hiddenMessageNodes++;
      hiddenTextChars += d.textChars;
    }

    if (d.displayLike && d.hasText) {
      displayLikeMessages++;
      displayLikeTextChars += d.textChars;
    }

    if (d.explicitToolRole) {
      explicitToolRoleNodes++;
    }

    if (d.toolish) {
      toolishNodes++;
    }

    if (d.toolCall) {
      toolCallNodes++;
      toolCallBytes += nodeBytes;
      countInto(toolCallNames, d.toolName || 'unknown-tool');

      if (d.recipient) {
        countInto(recipientCounts, d.recipient);
      }
    }

    if (d.toolResult) {
      toolResultNodes++;
      toolResultBytes += nodeBytes;
      countInto(toolResultNames, d.toolName || 'unknown-tool');
      largestToolResult = largestRecord(
        largestToolResult,
        nodeBytes,
        d
      );
    }

    if (d.contextLike) contextLikeNodes++;
    if (d.attachment) attachmentNodes++;
    if (d.image) imageNodes++;
    if (d.file) fileNodes++;
    if (d.audio) audioNodes++;
    if (d.video) videoNodes++;

    if (d.imageGenCall) imageGenCallNodes++;
    if (d.imageGenResult) imageGenResultNodes++;
    if (d.generatedImageNode) generatedImageNodes++;
    if (d.uploadedImageNode) uploadedImageNodes++;

    imageReferenceOccurrences += d.imageReferenceOccurrences || 0;
    fileReferenceOccurrences += d.fileReferenceOccurrences || 0;

    for (const x of d.assetIds) uniqueAssetIds.add(x);
    for (const x of d.imageAssetIds) uniqueImageAssetIds.add(x);
    for (const x of d.fileAssetIds) uniqueFileAssetIds.add(x);

    if (d.generatedImageNode) {
      for (const x of d.imageAssetIds) {
        uniqueGeneratedImageAssetIds.add(x);
      }
    }

    if (d.uploadedImageNode) {
      for (const x of d.imageAssetIds) {
        uniqueUploadedImageAssetIds.add(x);
      }
    }

    if (d.attachment || d.image || d.file) {
      assetNodeBytes += nodeBytes;
    }

    if (d.image) {
      imageNodeBytes += nodeBytes;
      largestImageNode = largestRecord(
        largestImageNode,
        nodeBytes,
        d
      );
    }

    if (d.file) {
      fileNodeBytes += nodeBytes;
    }

    for (const modelId of d.modelIds) {
      countInto(modelCounts, modelId);
    }

    if (d.gpt6Pro) {
      gpt6ProMessageNodes++;
    }

    largestNode = largestRecord(
      largestNode,
      nodeBytes,
      d
    );
  }

  return {
    messageNodes,
    emptyMessageNodes,
    allTextChars,

    displayTextChars,
    displayMessages,
    displayLikeTextChars,
    displayLikeMessages,

    hiddenMessageNodes,
    hiddenTextChars,

    explicitToolRoleNodes,
    toolishNodes,
    toolCallNodes,
    toolResultNodes,
    toolCallBytes,
    toolResultBytes,
    toolCallNames,
    toolResultNames,
    recipientCounts,

    contextLikeNodes,
    attachmentNodes,
    imageNodes,
    fileNodes,
    audioNodes,
    videoNodes,

    imageGenCallNodes,
    imageGenResultNodes,
    generatedImageNodes,
    uploadedImageNodes,

    uniqueAssetIds: uniqueAssetIds.size,
    uniqueImageAssetIds: uniqueImageAssetIds.size,
    uniqueFileAssetIds: uniqueFileAssetIds.size,
    uniqueGeneratedImageAssetIds: uniqueGeneratedImageAssetIds.size,
    uniqueUploadedImageAssetIds: uniqueUploadedImageAssetIds.size,
    imageReferenceOccurrences,
    fileReferenceOccurrences,

    assetNodeBytes,
    imageNodeBytes,
    fileNodeBytes,

    modelCounts,
    gpt6ProMessageNodes,

    roleCounts,
    contentTypeCounts,
    nodeBytesByRole,
    nodeBytesByContentType,

    largestNode,
    largestToolResult,
    largestImageNode
  };
}

function subtreeSize(mapping, rootId, cache, visiting = null) {
  if (!rootId || !mapping[rootId]) return 0;

  if (cache.has(rootId)) {
    return cache.get(rootId);
  }

  if (!visiting) visiting = new Set();

  if (visiting.has(rootId)) {
    return 0;
  }

  visiting.add(rootId);

  const node = mapping[rootId];
  const children = Array.isArray(node?.children) ? node.children : [];

  let size = 1;

  for (const childId of children) {
    size += subtreeSize(mapping, childId, cache, visiting);
  }

  visiting.delete(rootId);
  cache.set(rootId, size);

  return size;
}

function analyzeBranchPoints(mapping, activeNodes) {
  const idByNode = new Map();

  for (const [id, node] of Object.entries(mapping)) {
    if (node && typeof node === 'object') {
      idByNode.set(node, id);
    }
  }

  const activeIds = activeNodes.map(node => {
    return (
      idByNode.get(node) ||
      node?.id ||
      null
    );
  });

  const subtreeCache = new Map();
  const details = [];

  let alternateSubtreeNodesTotal = 0;
  let alternateSubtreeNodesMax = 0;
  let lastBranchPointDepth = null;

  for (let depth = 0; depth < activeNodes.length; depth++) {
    const node = activeNodes[depth];
    const children = Array.isArray(node?.children) ? node.children : [];

    if (children.length <= 1) continue;

    const selectedChild = activeIds[depth + 1] || null;
    const alternateChildren = children.filter(x => x !== selectedChild);

    const alternateSizes = alternateChildren.map(childId => {
      return subtreeSize(mapping, childId, subtreeCache);
    });

    const alternateTotal = alternateSizes.reduce((a, b) => a + b, 0);
    const alternateMax = alternateSizes.length
      ? Math.max(...alternateSizes)
      : 0;

    alternateSubtreeNodesTotal += alternateTotal;
    alternateSubtreeNodesMax = Math.max(
      alternateSubtreeNodesMax,
      alternateMax
    );

    lastBranchPointDepth = depth;

    details.push({
      depth,
      children: children.length,
      alternateChildren: alternateChildren.length,
      alternateSubtreeNodes: alternateTotal,
      largestAlternateSubtreeNodes: alternateMax
    });
  }

  return {
    activeBranchPoints: details.length,
    activeBranchPointDepths: details.map(x => x.depth),
    lastBranchPointDepth,
    nodesSinceLastBranchPoint:
      lastBranchPointDepth == null
        ? activeNodes.length
        : Math.max(0, activeNodes.length - lastBranchPointDepth - 1),
    alternateSubtreeNodesTotal,
    alternateSubtreeNodesMax,
    branchPointDetails: details
  };
}


function litePrimaryModel(msg, diagnostics) {
  const actual = msg?.message && typeof msg.message === 'object'
    ? msg.message
    : msg;

  const candidates = [
    actual?.metadata?.model_slug,
    actual?.metadata?.model_id,
    actual?.metadata?.model_name,
    actual?.metadata?.default_model_slug,
    actual?.model_slug,
    actual?.model_id,
    actual?.model_name,
    ...(Array.isArray(diagnostics?.modelIds)
      ? diagnostics.modelIds
      : [])
  ];

  for (const value of candidates) {
    const v = cleanShortString(value, 160);
    if (v) return v;
  }

  return null;
}

function liteIsGpt6Pro(model) {
  const v = String(model || '').toLowerCase();

  return (
    (v.includes('gpt-6') || v.includes('gpt6')) &&
    v.includes('pro')
  );
}

function liteStrongContextMarker(msg, diagnostics, text) {
  const role = diagnostics?.role || 'unknown';
  const type = diagnostics?.contentType || 'unknown';
  const sample = String(text || '').slice(0, 5000).toLowerCase();

  if (type === 'model_editable_context') return true;

  if (
    role === 'system' &&
    (
      sample.includes('user knowledge memories') ||
      sample.includes('recent conversation content') ||
      sample.includes('model set context') ||
      sample.includes('conversation summary') ||
      sample.includes('context summary')
    )
  ) {
    return true;
  }

  return false;
}

function liteNearestDistance(depth, depths) {
  if (
    !Number.isFinite(Number(depth)) ||
    !Array.isArray(depths) ||
    !depths.length
  ) {
    return null;
  }

  let best = Infinity;

  for (const x of depths) {
    const d = Math.abs(Number(depth) - Number(x));
    if (d < best) best = d;
  }

  return Number.isFinite(best) ? best : null;
}

function liteDepthList(depths, limit = 120) {
  if (!Array.isArray(depths)) return [];
  return depths.length <= limit ? depths : depths.slice(-limit);
}

function liteWindowSummary(timeline, branchDepths, size) {
  const total = timeline.length;
  const startDepth = Math.max(0, total - size);
  const slice = timeline.filter(x => x.depth >= startDepth);

  const models = {};
  let bytes = 0;
  let displayChars = 0;
  let allChars = 0;
  let toolCalls = 0;
  let toolResults = 0;
  let imageEvents = 0;
  let generatedImages = 0;
  let gpt6ProNodes = 0;
  let contextMarkers = 0;
  let recapMarkers = 0;

  for (const item of slice) {
    bytes += item.nodeBytes || 0;
    allChars += item.textChars || 0;

    if (item.displayLike) {
      displayChars += item.textChars || 0;
    }

    if (item.toolCall) toolCalls++;
    if (item.toolResult) toolResults++;
    if (item.imageGenEvent) imageEvents++;
    if (item.generatedImageNode) generatedImages++;
    if (item.gpt6Pro) gpt6ProNodes++;
    if (item.strongContextMarker) contextMarkers++;
    if (item.recapMarker) recapMarkers++;

    if (item.model) {
      countInto(models, item.model);
    }
  }

  return {
    size,
    actualNodes: slice.length,
    startDepth,
    endDepth: total ? total - 1 : null,
    serializedBytes: bytes,
    displayLikeTextTokens: tokenEstimateForChars(displayChars),
    allTextTokens: tokenEstimateForChars(allChars),
    toolCalls,
    toolResults,
    imageGenEvents: imageEvents,
    generatedImageNodes: generatedImages,
    gpt6ProNodes,
    strongContextMarkers: contextMarkers,
    recapMarkers,
    branchPoints: Array.isArray(branchDepths)
      ? branchDepths.filter(x => x >= startDepth).length
      : 0,
    modelCounts: models
  };
}

function liteInferImagePairs(timeline) {
  const calls = timeline.filter(x => x.toolCall);
  const results = timeline.filter(
    x => x.imageGenResult || x.generatedImageNode
  );

  const used = new Set();
  const pairs = [];
  const names = {};

  for (const result of results) {
    let best = null;

    for (let i = calls.length - 1; i >= 0; i--) {
      const call = calls[i];

      if (call.depth >= result.depth) continue;

      const distance = result.depth - call.depth;

      if (distance > 24) break;
      if (used.has(call.depth)) continue;

      best = {
        callDepth: call.depth,
        resultDepth: result.depth,
        distance,
        toolName: call.toolName || 'unknown-tool'
      };

      break;
    }

    if (best) {
      used.add(best.callDepth);
      pairs.push(best);
      countInto(names, best.toolName);
    }
  }

  const distances = pairs.map(x => x.distance);

  return {
    pairCount: pairs.length,
    unpairedResults: Math.max(0, results.length - pairs.length),
    inferredCallNames: names,
    pairDistanceMin: distances.length ? Math.min(...distances) : null,
    pairDistanceMax: distances.length ? Math.max(...distances) : null,
    pairDistanceAverage: distances.length
      ? distances.reduce((a, b) => a + b, 0) / distances.length
      : null,
    pairs: pairs.slice(-100)
  };
}

function analyzeContextHistoryLite(
  activeNodes,
  branchDepths = [],
  mapping = null
) {
  /*
    V2.12 remains one-pass/fault-tolerant for active ancestry, but retains
    enough per-depth metadata to profile "special" state by region.
  */
  const timeline = [];
  const gpt6Depths = [];
  const imageDepths = [];
  const generatedDepths = [];
  const contextDepths = [];
  const recapDepths = [];

  const modelSegments = [];
  let currentSegment = null;
  let latestModel = null;

  for (let depth = 0; depth < activeNodes.length; depth++) {
    const node = activeNodes[depth];
    const msg = node?.message;
    const nodeBytes = utf8BytesOfJSON(node) || 0;

    if (!msg) {
      timeline.push({
        depth,
        nodeBytes,
        textChars: 0,
        assetIds: []
      });
      continue;
    }

    const d = messageDiagnostics(msg);

    if (!d) {
      timeline.push({
        depth,
        nodeBytes,
        textChars: 0,
        assetIds: []
      });
      continue;
    }

    const text = textFromMessage(msg);
    const model = litePrimaryModel(msg, d);
    const gpt6Pro = Boolean(
      d.gpt6Pro ||
      liteIsGpt6Pro(model)
    );

    const strongContextMarker =
      liteStrongContextMarker(
        msg,
        d,
        text
      );

    const recapMarker =
      d.contentType === 'reasoning_recap';

    const imageGenEvent =
      Boolean(
        d.imageGenCall ||
        d.imageGenResult
      );

    /*
      "Special node bytes" is deliberately deduplicated per node.
      A node counts once if it is a tool result, image-like/generated-image,
      or GPT-6 Pro-labeled. This is a comparison proxy, not a product limit.
    */
    const specialNode =
      Boolean(
        d.toolResult ||
        d.image ||
        d.generatedImageNode ||
        gpt6Pro
      );

    const item = {
      depth,
      role: d.role,
      contentType: d.contentType,
      model,
      gpt6Pro,
      textChars: d.textChars || 0,
      displayLike: Boolean(d.displayLike),

      toolCall: Boolean(d.toolCall),
      toolResult: Boolean(d.toolResult),
      toolName: d.toolName || null,

      imageLike: Boolean(d.image),
      imageGenCall: Boolean(d.imageGenCall),
      imageGenResult: Boolean(d.imageGenResult),
      imageGenEvent,
      generatedImageNode: Boolean(d.generatedImageNode),

      assetIds: Array.isArray(d.assetIds)
        ? d.assetIds
        : [],

      strongContextMarker,
      recapMarker,

      nodeBytes,

      specialNode,
      specialNodeBytes:
        specialNode ? nodeBytes : 0,

      toolCallBytes:
        d.toolCall ? nodeBytes : 0,

      toolResultBytes:
        d.toolResult ? nodeBytes : 0,

      imageLikeBytes:
        d.image ? nodeBytes : 0,

      imageGenResultBytes:
        d.imageGenResult ? nodeBytes : 0,

      gpt6ProBytes:
        gpt6Pro ? nodeBytes : 0
    };

    timeline.push(item);

    if (model) {
      latestModel = model;

      if (
        !currentSegment ||
        currentSegment.model !== model
      ) {
        if (currentSegment) {
          modelSegments.push(currentSegment);
        }

        currentSegment = {
          model,
          startDepth: depth,
          endDepth: depth,
          labeledNodes: 1
        };
      } else {
        currentSegment.endDepth = depth;
        currentSegment.labeledNodes++;
      }
    }

    if (gpt6Pro) gpt6Depths.push(depth);
    if (imageGenEvent) imageDepths.push(depth);
    if (d.generatedImageNode) generatedDepths.push(depth);
    if (strongContextMarker) contextDepths.push(depth);
    if (recapMarker) recapDepths.push(depth);
  }

  if (currentSegment) {
    modelSegments.push(currentSegment);
  }

  for (const segment of modelSegments) {
    segment.spanNodes =
      Math.max(
        1,
        segment.endDepth -
        segment.startDepth +
        1
      );
  }

  const gpt6Segments =
    modelSegments.filter(
      x => liteIsGpt6Pro(x.model)
    );

  const longestGpt6 =
    gpt6Segments.length
      ? [...gpt6Segments].sort(
          (a, b) =>
            (b.labeledNodes - a.labeledNodes) ||
            (b.spanNodes - a.spanNodes)
        )[0]
      : null;

  const latestGpt6 =
    gpt6Segments.length
      ? gpt6Segments[gpt6Segments.length - 1]
      : null;

  const currentDepth =
    activeNodes.length
      ? activeNodes.length - 1
      : null;

  const lastGpt6Depth =
    gpt6Depths.length
      ? gpt6Depths[gpt6Depths.length - 1]
      : null;

  const lastImageDepth =
    imageDepths.length
      ? imageDepths[imageDepths.length - 1]
      : null;

  const lastContextDepth =
    contextDepths.length
      ? contextDepths[contextDepths.length - 1]
      : null;

  const lastRecapDepth =
    recapDepths.length
      ? recapDepths[recapDepths.length - 1]
      : null;

  const recentWindows =
    [64, 128, 256, 512].map(
      size =>
        liteWindowSummary(
          timeline,
          branchDepths,
          size
        )
    );

  let sinceLastContext = null;

  if (lastContextDepth != null) {
    const slice =
      timeline.filter(
        x => x.depth > lastContextDepth
      );

    const modelCounts = {};
    let bytes = 0;
    let displayChars = 0;
    let allChars = 0;
    let toolCalls = 0;
    let toolResults = 0;
    let imageGenResults = 0;
    let generatedImageNodes = 0;
    let gpt6ProNodes = 0;

    for (const item of slice) {
      bytes += item.nodeBytes || 0;
      allChars += item.textChars || 0;

      if (item.displayLike) {
        displayChars += item.textChars || 0;
      }

      if (item.toolCall) toolCalls++;
      if (item.toolResult) toolResults++;
      if (item.imageGenResult) imageGenResults++;
      if (item.generatedImageNode) generatedImageNodes++;
      if (item.gpt6Pro) gpt6ProNodes++;

      if (item.model) {
        countInto(
          modelCounts,
          item.model
        );
      }
    }

    sinceLastContext = {
      startDepth:
        lastContextDepth + 1,
      nodes: slice.length,
      serializedBytes: bytes,
      displayLikeTextTokens:
        tokenEstimateForChars(
          displayChars
        ),
      allTextTokens:
        tokenEstimateForChars(
          allChars
        ),
      toolCalls,
      toolResults,
      imageGenResults,
      generatedImageNodes,
      gpt6ProNodes,
      modelCounts
    };
  }

  const pairing =
    liteInferImagePairs(
      timeline
    );

  let retainedState = null;

  if (mapping) {
    retainedState =
      v212AnalyzeRetainedState(
        mapping,
        activeNodes,
        timeline,
        branchDepths,
        modelSegments,
        lastImageDepth
      );
  }

  return {
    ok: true,
    currentDepth,
    currentModel: latestModel,

    modelSegments:
      modelSegments.slice(-100),
    modelSegmentCount:
      modelSegments.length,

    gpt6ProSegmentCount:
      gpt6Segments.length,
    longestGpt6ProSegment:
      longestGpt6,
    latestGpt6ProSegment:
      latestGpt6,

    gpt6ProDepthCount:
      gpt6Depths.length,
    gpt6ProDepths:
      liteDepthList(gpt6Depths),
    firstGpt6ProDepth:
      gpt6Depths.length
        ? gpt6Depths[0]
        : null,
    lastGpt6ProDepth:
      lastGpt6Depth,
    nodesSinceLastGpt6Pro:
      currentDepth != null &&
      lastGpt6Depth != null
        ? currentDepth - lastGpt6Depth
        : null,

    imageGenDepthCount:
      imageDepths.length,
    imageGenDepths:
      liteDepthList(imageDepths),
    generatedImageDepthCount:
      generatedDepths.length,
    generatedImageDepths:
      liteDepthList(generatedDepths),
    lastImageGenDepth:
      lastImageDepth,
    nodesSinceLastImageGen:
      currentDepth != null &&
      lastImageDepth != null
        ? currentDepth - lastImageDepth
        : null,

    strongContextMarkerCount:
      contextDepths.length,
    strongContextMarkerDepths:
      liteDepthList(contextDepths),
    lastStrongContextMarkerDepth:
      lastContextDepth,
    nodesSinceLastStrongContextMarker:
      currentDepth != null &&
      lastContextDepth != null
        ? currentDepth - lastContextDepth
        : null,

    recapMarkerCount:
      recapDepths.length,
    recapDepths:
      liteDepthList(recapDepths),
    lastRecapDepth,
    nodesSinceLastRecap:
      currentDepth != null &&
      lastRecapDepth != null
        ? currentDepth - lastRecapDepth
        : null,

    branchPointsAfterLastImageGen:
      lastImageDepth == null
        ? null
        : branchDepths.filter(
            x => x > lastImageDepth          ).length,

    branchPointsAfterLastGpt6Pro:
      lastGpt6Depth == null
        ? null
        : branchDepths.filter(
            x => x > lastGpt6Depth
          ).length,

    branchPointsNearImageGen32:
      imageDepths.length
        ? branchDepths.filter(
            b =>
              imageDepths.some(
                d => Math.abs(b - d) <= 32
              )
          ).length
        : 0,

    branchPointsNearGpt6Pro32:
      gpt6Depths.length
        ? branchDepths.filter(
            b =>
              gpt6Depths.some(
                d => Math.abs(b - d) <= 32
              )
          ).length
        : 0,

    nearestBranchDistanceToLastImageGen:
      liteNearestDistance(
        lastImageDepth,
        branchDepths
      ),

    nearestBranchDistanceToLastGpt6Pro:
      liteNearestDistance(
        lastGpt6Depth,
        branchDepths
      ),

    imageGenPairCount:
      pairing.pairCount,
    imageGenUnpairedResults:
      pairing.unpairedResults,
    imageGenInferredCallNames:
      pairing.inferredCallNames,
    imageGenPairDistanceMin:
      pairing.pairDistanceMin,
    imageGenPairDistanceMax:
      pairing.pairDistanceMax,
    imageGenPairDistanceAverage:
      pairing.pairDistanceAverage,

    recentWindows,
    sinceLastContext,

    retainedState
  };
}

function compactDepthsV2114(depths, limit = 36) {
  if (!Array.isArray(depths) || !depths.length) return '—';

  if (depths.length <= limit) {
    return depths.join(', ');
  }

  return `… ${depths.slice(-limit).join(', ')}`;
}

function segmentTextV2114(segment) {
  if (!segment) return '—';

  return (
    `${segment.model || 'unknown'} ` +
    `d${segment.startDepth}→${segment.endDepth} ` +
    `(${segment.labeledNodes || 0} labeled)`
  );
}

function modelSegmentsTextV2114(segments, limit = 14) {
  if (!Array.isArray(segments) || !segments.length) return '—';

  const shown = segments.slice(-limit).map(segmentTextV2114);

  if (segments.length > limit) {
    shown.unshift(`+${segments.length - limit} earlier`);
  }

  return shown.join(' | ');
}

function recentWindowsTextV2114(windows) {
  if (!Array.isArray(windows) || !windows.length) return '—';

  return windows.map(w => (
    `last${w.size}: ` +
    `${fmt(w.serializedBytes || 0)}B, ` +
    `${fmt(w.displayLikeTextTokens || 0)} disp, ` +
    `${fmt(w.allTextTokens || 0)} all, ` +
    `tools ${w.toolCalls || 0}/${w.toolResults || 0}, ` +
    `img ${w.imageGenEvents || 0}, ` +
    `pro ${w.gpt6ProNodes || 0}, ` +
    `ctx ${w.strongContextMarkers || 0}, ` +
    `branches ${w.branchPoints || 0}`
  )).join(' || ');
}


function v212Percent(part, whole) {
  const p = Number(part);
  const w = Number(whole);

  if (!Number.isFinite(p) || !Number.isFinite(w) || w <= 0) {
    return null;
  }

  return (p / w) * 100;
}

function v212SummarizeTimelineSlice(slice, branchDepths = []) {
  let serializedBytes = 0;
  let specialNodeBytes = 0;
  let toolCallBytes = 0;
  let toolResultBytes = 0;
  let imageLikeBytes = 0;
  let imageGenResultBytes = 0;
  let gpt6ProBytes = 0;

  let toolCalls = 0;
  let toolResults = 0;
  let imageGenEvents = 0;
  let imageGenResults = 0;
  let generatedImages = 0;
  let gpt6ProNodes = 0;

  const assetIds = new Set();

  for (const item of slice) {
    serializedBytes += item.nodeBytes || 0;
    specialNodeBytes += item.specialNodeBytes || 0;
    toolCallBytes += item.toolCallBytes || 0;
    toolResultBytes += item.toolResultBytes || 0;
    imageLikeBytes += item.imageLikeBytes || 0;
    imageGenResultBytes += item.imageGenResultBytes || 0;
    gpt6ProBytes += item.gpt6ProBytes || 0;

    if (item.toolCall) toolCalls++;
    if (item.toolResult) toolResults++;
    if (item.imageGenEvent) imageGenEvents++;
    if (item.imageGenResult) imageGenResults++;
    if (item.generatedImageNode) generatedImages++;
    if (item.gpt6Pro) gpt6ProNodes++;

    for (const id of item.assetIds || []) {
      assetIds.add(id);
    }
  }

  const startDepth = slice.length ? slice[0].depth : null;
  const endDepth = slice.length ? slice[slice.length - 1].depth : null;

  return {
    startDepth,
    endDepth,
    nodes: slice.length,
    serializedBytes,
    specialNodeBytes,
    specialSharePercent: v212Percent(specialNodeBytes, serializedBytes),
    toolCallBytes,
    toolResultBytes,
    imageLikeBytes,
    imageGenResultBytes,
    gpt6ProBytes,
    toolCalls,
    toolResults,
    imageGenEvents,
    imageGenResults,
    generatedImages,
    gpt6ProNodes,
    uniqueAssetIds: assetIds.size,
    branchPoints:
      startDepth == null || endDepth == null
        ? 0
        : branchDepths.filter(
            x => x >= startDepth && x <= endDepth
          ).length
  };
}

function v212BuildDepthBuckets(timeline, branchDepths = [], bucketSize = 100) {
  if (!Array.isArray(timeline) || !timeline.length) return [];

  const buckets = [];

  for (let start = 0; start < timeline.length; start += bucketSize) {
    const end = Math.min(timeline.length, start + bucketSize);
    const slice = timeline.slice(start, end);
    const summary = v212SummarizeTimelineSlice(slice, branchDepths);

    summary.bucketIndex = Math.floor(start / bucketSize);
    summary.bucketSize = bucketSize;

    buckets.push(summary);
  }

  return buckets;
}

function v212HottestWindow(timeline, branchDepths = [], windowSize = 256) {
  if (!Array.isArray(timeline) || !timeline.length) return null;

  const n = timeline.length;
  const size = Math.min(windowSize, n);

  const prefixSpecial = new Array(n + 1).fill(0);

  for (let i = 0; i < n; i++) {
    prefixSpecial[i + 1] =
      prefixSpecial[i] +
      Number(timeline[i].specialNodeBytes || 0);
  }

  let bestStart = 0;
  let bestSpecial = -1;

  for (let start = 0; start + size <= n; start++) {
    const value =
      prefixSpecial[start + size] -
      prefixSpecial[start];

    if (value > bestSpecial) {
      bestSpecial = value;
      bestStart = start;
    }
  }

  const slice = timeline.slice(bestStart, bestStart + size);
  const summary = v212SummarizeTimelineSlice(slice, branchDepths);

  summary.windowSize = size;

  return summary;
}

function v212SubtreeSerializedStats(mapping, rootId, cache, visiting = null) {
  if (!rootId || !mapping?.[rootId]) {
    return {
      nodes: 0,
      bytes: 0
    };
  }

  if (cache.has(rootId)) {
    return cache.get(rootId);
  }

  if (!visiting) visiting = new Set();

  if (visiting.has(rootId)) {
    return {
      nodes: 0,
      bytes: 0
    };
  }

  visiting.add(rootId);

  const node = mapping[rootId];
  const children = Array.isArray(node?.children) ? node.children : [];

  let nodes = 1;
  let bytes = utf8BytesOfJSON(node) || 0;

  for (const childId of children) {
    const child = v212SubtreeSerializedStats(
      mapping,
      childId,
      cache,
      visiting
    );

    nodes += child.nodes;
    bytes += child.bytes;
  }

  visiting.delete(rootId);

  const result = {
    nodes,
    bytes
  };

  cache.set(rootId, result);

  return result;
}

function v212AnalyzeBranchRetention(
  mapping,
  activeNodes,
  timeline,
  branchDepths = []
) {
  if (!mapping || typeof mapping !== 'object') {
    return {
      details: [],
      alternateSubtreeBytesTotal: 0,
      alternateSubtreeBytesMax: 0
    };
  }

  const idByNode = new Map();

  for (const [id, node] of Object.entries(mapping)) {
    if (node && typeof node === 'object') {
      idByNode.set(node, id);
    }
  }

  const activeIds = activeNodes.map(node => {
    return idByNode.get(node) || node?.id || null;
  });

  const subtreeCache = new Map();
  const details = [];

  let alternateSubtreeBytesTotal = 0;
  let alternateSubtreeBytesMax = 0;

  for (const depth of branchDepths) {
    const node = activeNodes[depth];
    if (!node) continue;

    const children = Array.isArray(node.children) ? node.children : [];
    if (children.length <= 1) continue;

    const selectedChild = activeIds[depth + 1] || null;
    const alternateChildren = children.filter(x => x !== selectedChild);

    const activeStats = selectedChild
      ? v212SubtreeSerializedStats(
          mapping,
          selectedChild,
          subtreeCache
        )
      : {
          nodes: 0,
          bytes: 0
        };

    let alternateNodes = 0;
    let alternateBytes = 0;
    let largestAlternateBytes = 0;

    for (const childId of alternateChildren) {
      const stats = v212SubtreeSerializedStats(
        mapping,
        childId,
        subtreeCache
      );

      alternateNodes += stats.nodes;
      alternateBytes += stats.bytes;
      largestAlternateBytes = Math.max(
        largestAlternateBytes,
        stats.bytes
      );
    }

    alternateSubtreeBytesTotal += alternateBytes;
    alternateSubtreeBytesMax = Math.max(
      alternateSubtreeBytesMax,
      largestAlternateBytes
    );

    const neighborhoods = {};

    for (const radius of [16, 32, 64]) {
      const start = Math.max(0, depth - radius);
      const end = Math.min(timeline.length, depth + radius + 1);

      neighborhoods[`r${radius}`] =
        v212SummarizeTimelineSlice(
          timeline.slice(start, end),
          branchDepths
        );
    }

    details.push({
      depth,
      children: children.length,
      alternateChildren: alternateChildren.length,
      activeSubtreeNodes: activeStats.nodes,
      activeSubtreeBytes: activeStats.bytes,
      alternateSubtreeNodes: alternateNodes,
      alternateSubtreeBytes: alternateBytes,
      largestAlternateSubtreeBytes: largestAlternateBytes,
      neighborhoods
    });
  }

  return {
    details,
    alternateSubtreeBytesTotal,
    alternateSubtreeBytesMax
  };
}

function v212AnalyzeAssetPersistence(timeline, lastImageDepth) {
  const assets = new Map();
  const imageGenAssociated = new Set();

  for (const item of timeline) {
    const ids = Array.isArray(item.assetIds)
      ? item.assetIds
      : [];

    for (const id of ids) {
      if (!id) continue;

      let rec = assets.get(id);

      if (!rec) {
        rec = {
          firstDepth: item.depth,
          lastDepth: item.depth,
          references: 0,
          firstSeenInImageGen: false,
          seenInImageGen: false
        };

        assets.set(id, rec);
      }

      rec.lastDepth = item.depth;
      rec.references++;

      if (
        item.imageGenResult ||
        item.generatedImageNode
      ) {
        rec.seenInImageGen = true;

        if (rec.firstDepth === item.depth) {
          rec.firstSeenInImageGen = true;
        }

        imageGenAssociated.add(id);
      }
    }
  }

  let assetsExistingByLastImage = 0;
  let assetsReferencedAfterLastImage = 0;
  let imageGenAssetsReferencedAfterLastImage = 0;
  let persistentAssetReferenceNodesAfterLastImage = 0;

  if (lastImageDepth != null) {
    for (const rec of assets.values()) {
      if (rec.firstDepth <= lastImageDepth) {
        assetsExistingByLastImage++;

        if (rec.lastDepth > lastImageDepth) {
          assetsReferencedAfterLastImage++;
        }
      }
    }

    for (const id of imageGenAssociated) {
      const rec = assets.get(id);

      if (
        rec &&
        rec.lastDepth > lastImageDepth
      ) {
        imageGenAssetsReferencedAfterLastImage++;
      }
    }

    for (const item of timeline) {
      if (item.depth <= lastImageDepth) continue;

      const ids = Array.isArray(item.assetIds)
        ? item.assetIds
        : [];

      if (
        ids.some(id => {
          const rec = assets.get(id);
          return rec && rec.firstDepth <= lastImageDepth;
        })
      ) {
        persistentAssetReferenceNodesAfterLastImage++;
      }
    }
  }

  return {
    uniqueAssetsObserved: assets.size,
    imageGenAssociatedAssetIds: imageGenAssociated.size,
    assetsExistingByLastImage,
    assetsReferencedAfterLastImage,
    imageGenAssetsReferencedAfterLastImage,
    persistentAssetReferenceNodesAfterLastImage
  };
}

function v212AnalyzeProSegments(
  modelSegments,
  timeline,
  branchDepths = []
) {
  if (!Array.isArray(modelSegments)) return [];

  const output = [];

  for (const segment of modelSegments) {
    if (!liteIsGpt6Pro(segment.model)) continue;

    const slice = timeline.filter(
      x =>
        x.depth >= segment.startDepth &&
        x.depth <= segment.endDepth
    );

    const summary =
      v212SummarizeTimelineSlice(
        slice,
        branchDepths
      );

    output.push({
      ...segment,
      serializedBytes: summary.serializedBytes,
      specialNodeBytes: summary.specialNodeBytes,
      toolCallBytes: summary.toolCallBytes,
      toolResultBytes: summary.toolResultBytes,
      imageLikeBytes: summary.imageLikeBytes,
      imageGenResultBytes: summary.imageGenResultBytes,
      imageGenEvents: summary.imageGenEvents,
      imageGenResults: summary.imageGenResults,
      generatedImages: summary.generatedImages,
      branchPoints: summary.branchPoints
    });
  }

  return output;
}

function v212TopImageGenResults(timeline, limit = 12) {
  const rows = timeline
    .filter(x => x.imageGenResult)
    .map(x => ({
      depth: x.depth,
      bytes: x.nodeBytes || 0,
      toolName: x.toolName || null,
      contentType: x.contentType || null,
      model: x.model || null
    }))
    .sort((a, b) => b.bytes - a.bytes);

  const totalBytes = rows.reduce(
    (sum, x) => sum + x.bytes,
    0
  );

  return {
    count: rows.length,
    totalBytes,
    averageBytes: rows.length
      ? totalBytes / rows.length
      : null,
    largestBytes: rows.length
      ? rows[0].bytes
      : null,
    top: rows.slice(0, limit)
  };
}

function v212AnalyzeRetainedState(
  mapping,
  activeNodes,
  timeline,
  branchDepths,
  modelSegments,
  lastImageDepth
) {
  const depthBuckets100 =
    v212BuildDepthBuckets(
      timeline,
      branchDepths,
      100
    );

  const hottestBuckets =
    [...depthBuckets100]
      .sort(
        (a, b) =>
          (b.specialNodeBytes - a.specialNodeBytes) ||
          (b.serializedBytes - a.serializedBytes)
      )
      .slice(0, 10);

  const hotWindows = {
    w128: v212HottestWindow(
      timeline,
      branchDepths,
      128
    ),
    w256: v212HottestWindow(
      timeline,
      branchDepths,
      256
    ),
    w512: v212HottestWindow(
      timeline,
      branchDepths,
      512
    )
  };

  const branchRetention =
    v212AnalyzeBranchRetention(
      mapping,
      activeNodes,
      timeline,
      branchDepths
    );

  const assetPersistence =
    v212AnalyzeAssetPersistence(
      timeline,
      lastImageDepth
    );

  const proSegments =
    v212AnalyzeProSegments(
      modelSegments,
      timeline,
      branchDepths
    );

  const imageGenResults =
    v212TopImageGenResults(
      timeline,
      12
    );

  const activeSerializedBytes =
    timeline.reduce(
      (sum, x) =>
        sum + (x.nodeBytes || 0),
      0
    );

  const activeSpecialNodeBytes =
    timeline.reduce(
      (sum, x) =>
        sum + (x.specialNodeBytes || 0),
      0
    );

  const activeToolResultBytes =
    timeline.reduce(
      (sum, x) =>
        sum + (x.toolResultBytes || 0),
      0
    );

  const activeImageLikeBytes =
    timeline.reduce(
      (sum, x) =>
        sum + (x.imageLikeBytes || 0),
      0
    );

  const activeGpt6ProBytes =
    timeline.reduce(
      (sum, x) =>
        sum + (x.gpt6ProBytes || 0),
      0
    );

  const retainedStateProxyBytes =
    activeSpecialNodeBytes +
    branchRetention.alternateSubtreeBytesTotal;

  return {
    ok: true,

    activeSerializedBytes,
    activeSpecialNodeBytes,
    activeSpecialSharePercent:
      v212Percent(
        activeSpecialNodeBytes,
        activeSerializedBytes
      ),

    activeToolResultBytes,
    activeImageLikeBytes,
    activeGpt6ProBytes,

    retainedStateProxyBytes,
    retainedStateProxySharePercent:
      v212Percent(
        retainedStateProxyBytes,
        activeSerializedBytes
      ),

    depthBuckets100,
    hottestBuckets,
    hotWindows,

    branchRetention,
    assetPersistence,
    proSegments,
    imageGenResults
  };
}

function v212BucketText(buckets, limit = 8) {
  if (!Array.isArray(buckets) || !buckets.length) {
    return '—';
  }

  return buckets
    .slice(0, limit)
    .map(x => (
      `d${x.startDepth}-${x.endDepth}: ` +
      `${fmt(x.specialNodeBytes || 0)}B special / ` +
      `${fmt(x.serializedBytes || 0)}B total · ` +
      `tools ${x.toolCalls || 0}/${x.toolResults || 0} · ` +
      `img ${x.imageGenResults || 0} · ` +
      `pro ${x.gpt6ProNodes || 0} · ` +
      `br ${x.branchPoints || 0}`
    ))
    .join(' || ');
}

function v212HotWindowText(window) {
  if (!window) return '—';

  return (
    `d${window.startDepth}-${window.endDepth} · ` +
    `${fmt(window.specialNodeBytes || 0)}B special / ` +
    `${fmt(window.serializedBytes || 0)}B total ` +
    `(${window.specialSharePercent != null
      ? window.specialSharePercent.toFixed(1) + '%'
      : '—'}) · ` +
    `toolres ${fmt(window.toolResultBytes || 0)}B · ` +
    `image ${fmt(window.imageLikeBytes || 0)}B · ` +
    `img-gen ${fmt(window.imageGenResultBytes || 0)}B · ` +
    `pro ${fmt(window.gpt6ProBytes || 0)}B · ` +
    `branches ${window.branchPoints || 0}`
  );
}

function v212BranchRetentionText(details, limit = 12) {
  if (!Array.isArray(details) || !details.length) {
    return '—';
  }

  const shown = details.slice(-limit).map(x => (
    `d${x.depth}: ` +
    `alt ${x.alternateSubtreeNodes || 0}n/${fmt(x.alternateSubtreeBytes || 0)}B · ` +
    `active ${x.activeSubtreeNodes || 0}n/${fmt(x.activeSubtreeBytes || 0)}B · ` +
    `±32 ${fmt(x.neighborhoods?.r32?.specialNodeBytes || 0)}B special`
  ));

  if (details.length > limit) {
    shown.unshift(`+${details.length - limit} earlier`);
  }

  return shown.join(' || ');
}

function v212ProSegmentsText(segments, limit = 12) {
  if (!Array.isArray(segments) || !segments.length) {
    return '—';
  }

  return segments
    .slice(-limit)
    .map(x => (
      `${x.model} d${x.startDepth}-${x.endDepth}: ` +
      `${fmt(x.toolResultBytes || 0)}B toolres · ` +
      `${fmt(x.imageGenResultBytes || 0)}B img-gen · ` +
      `${fmt(x.specialNodeBytes || 0)}B special · ` +
      `${x.branchPoints || 0} branches`
    ))
    .join(' || ');
}

function v212ImageGenResultsText(result) {
  if (!result || !Array.isArray(result.top) || !result.top.length) {
    return '—';
  }

  return result.top
    .map(x => (
      `d${x.depth}:${fmt(x.bytes || 0)}B` +
      `${x.toolName ? ':' + x.toolName : ''}`
    ))
    .join(', ');
}


function analyzeMapping(mapping, activeNodes) {
  const allNodes = Object.values(mapping).filter(Boolean);
  const all = analyzeNodes(allNodes);
  const active = analyzeNodes(activeNodes);

  let leafNodes = 0;
  let branchPoints = 0;
  let maxChildren = 0;

  for (const node of allNodes) {
    const children = Array.isArray(node?.children) ? node.children : [];
    const count = children.length;

    if (count === 0) leafNodes++;
    if (count > 1) branchPoints++;
    if (count > maxChildren) maxChildren = count;
  }

  const mappingNodes = allNodes.length;
  const activeBranchNodes = activeNodes.length;
  const branch = analyzeBranchPoints(mapping, activeNodes);

  let contextTopology;

  try {
    contextTopology = analyzeContextHistoryLite(
      activeNodes,
      branch.activeBranchPointDepths,
      mapping
    );
  } catch (error) {
    contextTopology = {
      ok: false,
      error:
        String(error?.stack || error?.message || error || 'unknown topology error')
          .slice(0, 4000)
    };
  }

  return {
    contextTopology,
    mappingNodes,
    activeBranchNodes,
    offBranchNodes: Math.max(0, mappingNodes - activeBranchNodes),
    leafNodes,
    branchPoints,
    maxChildren,

    activeBranchPoints: branch.activeBranchPoints,
    activeBranchPointDepths: branch.activeBranchPointDepths,
    lastBranchPointDepth: branch.lastBranchPointDepth,
    nodesSinceLastBranchPoint: branch.nodesSinceLastBranchPoint,
    alternateSubtreeNodesTotal: branch.alternateSubtreeNodesTotal,
    alternateSubtreeNodesMax: branch.alternateSubtreeNodesMax,
    branchPointDetails: branch.branchPointDetails,

    mappingMessageNodes: all.messageNodes,
    mappingEmptyMessageNodes: all.emptyMessageNodes,
    mappingAllTextChars: all.allTextChars,
    mappingDisplayTextChars: all.displayTextChars,
    mappingDisplayLikeTextChars: all.displayLikeTextChars,
    mappingDisplayLikeMessages: all.displayLikeMessages,
    mappingHiddenMessageNodes: all.hiddenMessageNodes,
    mappingHiddenTextChars: all.hiddenTextChars,

    mappingExplicitToolRoleNodes: all.explicitToolRoleNodes,
    mappingToolishNodes: all.toolishNodes,
    mappingToolCallNodes: all.toolCallNodes,
    mappingToolResultNodes: all.toolResultNodes,
    mappingToolCallBytes: all.toolCallBytes,
    mappingToolResultBytes: all.toolResultBytes,
    mappingToolCallNames: all.toolCallNames,
    mappingToolResultNames: all.toolResultNames,
    mappingRecipientCounts: all.recipientCounts,

    mappingContextLikeNodes: all.contextLikeNodes,
    mappingAttachmentNodes: all.attachmentNodes,
    mappingImageNodes: all.imageNodes,
    mappingFileNodes: all.fileNodes,
    mappingAudioNodes: all.audioNodes,
    mappingVideoNodes: all.videoNodes,

    mappingImageGenCallNodes: all.imageGenCallNodes,
    mappingImageGenResultNodes: all.imageGenResultNodes,
    mappingGeneratedImageNodes: all.generatedImageNodes,
    mappingUploadedImageNodes: all.uploadedImageNodes,

    mappingUniqueAssetIds: all.uniqueAssetIds,
    mappingUniqueImageAssetIds: all.uniqueImageAssetIds,
    mappingUniqueFileAssetIds: all.uniqueFileAssetIds,
    mappingUniqueGeneratedImageAssetIds: all.uniqueGeneratedImageAssetIds,
    mappingUniqueUploadedImageAssetIds: all.uniqueUploadedImageAssetIds,
    mappingImageReferenceOccurrences: all.imageReferenceOccurrences,
    mappingFileReferenceOccurrences: all.fileReferenceOccurrences,

    mappingAssetNodeBytes: all.assetNodeBytes,
    mappingImageNodeBytes: all.imageNodeBytes,
    mappingFileNodeBytes: all.fileNodeBytes,

    mappingModelCounts: all.modelCounts,
    mappingGpt6ProMessageNodes: all.gpt6ProMessageNodes,
    mappingRoleCounts: all.roleCounts,
    mappingContentTypeCounts: all.contentTypeCounts,
    mappingNodeBytesByRole: all.nodeBytesByRole,
    mappingNodeBytesByContentType: all.nodeBytesByContentType,
    mappingLargestNode: all.largestNode,
    mappingLargestToolResult: all.largestToolResult,
    mappingLargestImageNode: all.largestImageNode,

    activeMessageNodes: active.messageNodes,
    activeDisplayMessages: active.displayMessages,
    activeDisplayTextChars: active.displayTextChars,
    activeDisplayLikeMessages: active.displayLikeMessages,
    activeDisplayLikeTextChars: active.displayLikeTextChars,
    activeAllTextChars: active.allTextChars,
    activeHiddenMessageNodes: active.hiddenMessageNodes,
    activeHiddenTextChars: active.hiddenTextChars,
    activeEmptyMessageNodes: active.emptyMessageNodes,

    activeExplicitToolRoleNodes: active.explicitToolRoleNodes,
    activeToolishNodes: active.toolishNodes,
    activeToolCallNodes: active.toolCallNodes,
    activeToolResultNodes: active.toolResultNodes,
    activeToolCallBytes: active.toolCallBytes,
    activeToolResultBytes: active.toolResultBytes,
    activeToolCallNames: active.toolCallNames,
    activeToolResultNames: active.toolResultNames,
    activeRecipientCounts: active.recipientCounts,

    activeContextLikeNodes: active.contextLikeNodes,
    activeAttachmentNodes: active.attachmentNodes,
    activeImageNodes: active.imageNodes,
    activeFileNodes: active.fileNodes,
    activeAudioNodes: active.audioNodes,
    activeVideoNodes: active.videoNodes,

    activeImageGenCallNodes: active.imageGenCallNodes,
    activeImageGenResultNodes: active.imageGenResultNodes,
    activeGeneratedImageNodes: active.generatedImageNodes,
    activeUploadedImageNodes: active.uploadedImageNodes,

    activeUniqueAssetIds: active.uniqueAssetIds,
    activeUniqueImageAssetIds: active.uniqueImageAssetIds,
    activeUniqueFileAssetIds: active.uniqueFileAssetIds,
    activeUniqueGeneratedImageAssetIds: active.uniqueGeneratedImageAssetIds,
    activeUniqueUploadedImageAssetIds: active.uniqueUploadedImageAssetIds,
    activeImageReferenceOccurrences: active.imageReferenceOccurrences,
    activeFileReferenceOccurrences: active.fileReferenceOccurrences,

    activeAssetNodeBytes: active.assetNodeBytes,
    activeImageNodeBytes: active.imageNodeBytes,
    activeFileNodeBytes: active.fileNodeBytes,

    activeModelCounts: active.modelCounts,
    activeGpt6ProMessageNodes: active.gpt6ProMessageNodes,
    activeRoleCounts: active.roleCounts,
    activeContentTypeCounts: active.contentTypeCounts,
    activeNodeBytesByRole: active.nodeBytesByRole,
    activeNodeBytesByContentType: active.nodeBytesByContentType,
    activeLargestNode: active.largestNode,
    activeLargestToolResult: active.largestToolResult,
    activeLargestImageNode: active.largestImageNode,

    mappingSerializedBytes: utf8BytesOfJSON(mapping),
    activeBranchSerializedBytes: utf8BytesOfJSON(activeNodes)
  };
}

function parseMappingConversation(obj) {
  const mapping = obj?.mapping;

  if (!mapping || typeof mapping !== 'object') {
    return null;
  }

  const keys = Object.keys(mapping);
  if (!keys.length) return null;

  const activeNodes = getActiveBranch(mapping, obj.current_node);
  const records = [];

  for (const node of activeNodes) {
    const rec = recordFromMessage(node);
    if (rec) records.push(rec);
  }

  if (!records.length) return null;

  return {
    records,
    full: true,    mappingNodes: keys.length,
    structure: analyzeMapping(mapping, activeNodes),
    conversationId:
      obj.conversation_id ??
      obj.id ??
      obj.conversationId ??
      null,
    source: 'network conversation mapping'
  };
}

function parseMessageArray(arr, source = 'network messages') {
  if (!Array.isArray(arr) || !arr.length) {
    return null;
  }

  const records = [];

  for (const item of arr) {
    const rec = recordFromMessage(item);
    if (rec) records.push(rec);
  }

  if (!records.length) return null;

  return {
    records,
    full: false,
    mappingNodes: null,
    structure: null,
    conversationId: null,
    source
  };
}

function findBestCandidate(root) {
  if (!root || typeof root !== 'object') {
    return null;
  }

  let best = null;
  let visited = 0;
  const queue = [root];
  const seen = new WeakSet();

  while (queue.length && visited < 12000) {
    const obj = queue.shift();

    if (
      !obj ||
      typeof obj !== 'object'
    ) {
      continue;
    }

    if (seen.has(obj)) continue;
    seen.add(obj);
    visited++;

    const mapped = parseMappingConversation(obj);

    if (mapped) {
      const score =
        1000000 +
        mapped.records.reduce((s, r) => s + r.chars, 0) +
        mapped.records.length * 200;

      if (!best || score > best.score) {
        best = { ...mapped, score };
      }
    }

    for (const prop of ['messages', 'items', 'data']) {
      if (Array.isArray(obj[prop])) {
        const parsed = parseMessageArray(
          obj[prop],
          `network ${prop}`
        );

        if (parsed) {
          const chars = parsed.records.reduce(
            (s, r) => s + r.chars,
            0
          );

          const score =
            chars +
            parsed.records.length * 100;

          if (!best || score > best.score) {
            best = { ...parsed, score };
          }
        }
      }
    }

    if (Array.isArray(obj)) {
      const parsed = parseMessageArray(
        obj,
        'network message array'
      );

      if (parsed) {
        const chars = parsed.records.reduce(
          (s, r) => s + r.chars,
          0
        );

        const score =
          chars +
          parsed.records.length * 100;

        if (!best || score > best.score) {
          best = { ...parsed, score };
        }
      }

      for (const child of obj) {
        if (child && typeof child === 'object') {
          queue.push(child);
        }
      }
    } else {
      for (const [k, child] of Object.entries(obj)) {
        if (
          ['mapping', 'messages', 'items'].includes(k)
        ) {
          continue;
        }

        if (child && typeof child === 'object') {
          queue.push(child);
        }
      }
    }
  }

  return best;
}



function lifecycleKey(id = chatIdFromURL()) {
  return id ? `${LIFECYCLE_PREFIX}:${id}` : null;
}


function lifecycleSourceFamily(source) {
  const s = String(source || '');

  if (
    s.includes('/backend-api/conversations/batch')
  ) {
    return 'batch';
  }

  if (
    /\/backend-api\/conversation\/[^/?#]+/i.test(s) &&
    !s.includes('/backend-api/conversations/')
  ) {
    return 'direct';
  }

  return 'other';
}

function lifecycleFamilyLabel(family) {
  return ({
    direct: 'DIRECT',
    batch: 'BATCH',
    other: 'OTHER'
  })[family] || 'OTHER';
}

function blankLifecycleFamily() {
  return {
    lastStable: null,
    lastInflight: null,
    highestStable: null,
    highestInflight: null,
    currentPeak: null,
    lastGenerationPeak: null,
    lastMaxEvent: null,
    maxEvents: [],
    lastRecovery: null,
    recoveryPending: null
  };
}

function normalizeLifecycleFamily(x) {
  return {
    ...blankLifecycleFamily(),
    ...(x && typeof x === 'object' ? x : {})
  };
}

function lifecycleAssignObservationToFamily(state, obs) {
  if (!obs) return;

  const family =
    obs.sourceFamily ||
    lifecycleSourceFamily(obs.source);

  obs.sourceFamily = family;

  const f = state.families[family];

  if (obs.phase === 'stable') {
    f.lastStable = obs;
    f.highestStable = chooseHigher(f.highestStable, obs);
  } else if (obs.phase === 'inflight') {
    f.lastInflight = obs;
    f.highestInflight = chooseHigher(f.highestInflight, obs);
  } else if (obs.phase === 'max') {
    f.lastMaxEvent = {
      time: obs.time || Date.now(),
      fullCapturedAt: obs.fullCapturedAt || 0,
      sourceFamily: family,
      metrics: obs,
      generationPeak: f.currentPeak || f.lastInflight || null
    };
  }
}

function migrateLifecycleV216(x) {
  const state = blankLifecycle();

  if (!x || typeof x !== 'object') {
    return state;
  }

  /*
    V2.16 had one global bucket. Rebuild family buckets from every
    source-tagged observation it already saved.
  */
  const rows = Array.isArray(x.observations)
    ? x.observations
    : [];

  for (const raw of rows) {
    const obs = {
      ...raw,
      sourceFamily:
        raw?.sourceFamily ||
        lifecycleSourceFamily(raw?.source)
    };

    lifecycleAssignObservationToFamily(state, obs);
    state.observations.push(obs);
    state.lastObservation = obs;
  }

  for (const raw of [
    x.lastStable,
    x.lastInflight,
    x.lastObservation,
    x.highestStable,
    x.highestInflight
  ]) {
    if (!raw) continue;

    const obs = {
      ...raw,
      sourceFamily:
        raw.sourceFamily ||
        lifecycleSourceFamily(raw.source)
    };

    lifecycleAssignObservationToFamily(state, obs);
  }

  /*
    Old MAX events did not carry a source family. Attribute them to the
    closest/latest observation source, which is sufficient to preserve
    V2.16 history without pretending it is cross-source comparable.
  */
  const oldEvents = Array.isArray(x.maxEvents)
    ? x.maxEvents
    : [];

  for (const event of oldEvents) {
    const family =
      event?.sourceFamily ||
      lifecycleSourceFamily(
        event?.metrics?.source ||
        x.lastObservation?.source
      );

    const migrated = {
      ...event,
      sourceFamily: family
    };

    state.maxEvents.push(migrated);
    state.families[family].maxEvents.push(migrated);
    state.families[family].lastMaxEvent = migrated;
    state.lastMaxEvent = migrated;
  }

  if (x.lastMaxEvent && !oldEvents.length) {
    const family =
      lifecycleSourceFamily(
        x.lastMaxEvent?.metrics?.source ||
        x.lastObservation?.source
      );

    const migrated = {
      ...x.lastMaxEvent,
      sourceFamily: family
    };

    state.lastMaxEvent = migrated;
    state.maxEvents.push(migrated);
    state.families[family].lastMaxEvent = migrated;
    state.families[family].maxEvents.push(migrated);
  }

  state.bannerActive = Boolean(x.bannerActive);
  state.bannerClearedAt = x.bannerClearedAt || null;
  state.lastSourceFamily =
    state.lastObservation?.sourceFamily || null;

  return state;
}


function blankLifecycle() {
  return {
    version: 2,
    families: {
      direct: blankLifecycleFamily(),
      batch: blankLifecycleFamily(),
      other: blankLifecycleFamily()
    },
    lastObservation: null,
    lastSourceFamily: null,
    sourceSwitches: [],
    bannerActive: false,
    bannerClearedAt: null,
    lastMaxEvent: null,
    maxEvents: [],
    observations: []
  };
}

function loadLifecycle(id = chatIdFromURL()) {
  const k = lifecycleKey(id);
  if (!k) return blankLifecycle();

  try {
    const x = JSON.parse(localStorage.getItem(k));

    if (!x || typeof x !== 'object') {
      return blankLifecycle();
    }

    if (
      x.version === 2 &&
      x.families &&
      typeof x.families === 'object'
    ) {
      return {
        ...blankLifecycle(),
        ...x,
        families: {
          direct: normalizeLifecycleFamily(x.families.direct),
          batch: normalizeLifecycleFamily(x.families.batch),
          other: normalizeLifecycleFamily(x.families.other)
        },
        sourceSwitches: Array.isArray(x.sourceSwitches)
          ? x.sourceSwitches
          : [],
        maxEvents: Array.isArray(x.maxEvents)
          ? x.maxEvents
          : [],
        observations: Array.isArray(x.observations)
          ? x.observations
          : []
      };
    }

    const migrated = migrateLifecycleV216(x);
    saveLifecycle(id, migrated);
    return migrated;
  } catch {
    return blankLifecycle();
  }
}

function saveLifecycle(id, x) {
  const k = lifecycleKey(id);
  if (!k) return;
  try {
    localStorage.setItem(k, JSON.stringify(x));
  } catch {}
}

function visibleGenerationActive() {
  try {
    if (document.querySelector(
      '[data-testid="stop-button"], button[aria-label="Stop generating"], button[aria-label="Stop response"]'
    )) return true;

    return [...document.querySelectorAll('button[data-testid],button[aria-label]')]
      .some(el => {
        const t = String(el.getAttribute('data-testid') || '').toLowerCase();
        const a = String(el.getAttribute('aria-label') || '').toLowerCase();
        return t.includes('stop') || a === 'stop generating' || a === 'stop response';
      });
  } catch {
    return false;
  }
}

function lifecycleSourceLabel(url) {
  if (!url) return 'unknown';
  try {
    const u = new URL(url, location.origin);
    return `${u.pathname}${u.search || ''}`.slice(0, 220);
  } catch {
    return String(url).slice(0, 220);
  }
}

function lifecycleMetrics(id = chatIdFromURL()) {
  const snap = loadSnapshot(id);
  const s = snap.structure || {};
  const top = s.contextTopology || {};
  const retained = top.retainedState || {};

  const userMessages = Array.isArray(snap.records)
    ? snap.records.filter(x => x.role === 'user').length
    : null;

  const assistantMessages = Array.isArray(snap.records)
    ? snap.records.filter(x => x.role === 'assistant').length
    : null;

  return {
    time: Date.now(),
    fullCapturedAt: Number(snap.fullCapturedAt) || 0,
    retainedBytes: nullableNumber(retained.retainedStateProxyBytes),
    retainedShare: nullableNumber(retained.retainedStateProxySharePercent),
    activeBranchBytes: nullableNumber(s.activeBranchSerializedBytes),
    mappingBytes: nullableNumber(s.mappingSerializedBytes),
    branchNodes: nullableNumber(s.activeBranchNodes),
    messageNodes: nullableNumber(s.activeMessageNodes),
    userMessages,
    assistantMessages,
    toolResults: nullableNumber(s.activeToolResultNodes),
    toolCalls: nullableNumber(s.activeToolCallNodes),
    strongContextMarkers: nullableNumber(top.strongContextMarkerCount),
    systemRoleNodes: nullableNumber(s.activeRoleCounts?.system),
    displayLikeTokens:
      s.activeDisplayLikeTextChars != null
        ? tokenEstimateForChars(Number(s.activeDisplayLikeTextChars) || 0)
        : null
  };
}

function chooseHigher(a, b, field = 'retainedBytes') {
  if (!a) return b || null;
  if (!b) return a;
  const av = nullableNumber(a[field]);
  const bv = nullableNumber(b[field]);
  if (av == null) return b;
  if (bv == null) return a;
  return bv > av ? b : a;
}

function recordLifecycleFullCapture(id, sourceURL = '', payloadBytes = null) {
  if (!id) return;

  const state = loadLifecycle(id);
  const generating = visibleGenerationActive();
  const maxVisible = visibleHardMax();
  const phase = maxVisible
    ? 'max'
    : generating
      ? 'inflight'
      : 'stable';

  const source = lifecycleSourceLabel(sourceURL);
  const sourceFamily = lifecycleSourceFamily(source);
  const family = state.families[sourceFamily];

  const obs = {
    ...lifecycleMetrics(id),
    phase,
    generating,
    maxVisible,
    source,
    sourceFamily,
    payloadBytes: nullableNumber(payloadBytes)
  };

  if (
    state.lastSourceFamily &&
    state.lastSourceFamily !== sourceFamily
  ) {
    const switches = Array.isArray(state.sourceSwitches)
      ? state.sourceSwitches
      : [];

    switches.push({
      time: Date.now(),
      from: state.lastSourceFamily,
      to: sourceFamily,
      retainedBytes: obs.retainedBytes,
      activeBranchBytes: obs.activeBranchBytes
    });

    state.sourceSwitches = switches.slice(-30);
  }

  state.lastSourceFamily = sourceFamily;
  state.lastObservation = obs;

  if (phase === 'inflight') {
    family.lastInflight = obs;
    family.currentPeak = chooseHigher(family.currentPeak, obs);
    family.highestInflight = chooseHigher(family.highestInflight, obs);
  }

  if (phase === 'stable') {
    family.lastStable = obs;
    family.highestStable = chooseHigher(family.highestStable, obs);

    const maxEvent = family.lastMaxEvent;
    const before = maxEvent?.metrics || null;

    if (
      maxEvent &&
      before &&
      !maxVisible &&
      obs.fullCapturedAt > Number(maxEvent.fullCapturedAt || 0)
    ) {
      /*
        A disappearing banner is NOT enough.
        Confirm recovery only when the SAME SOURCE FAMILY shows newer
        conversation progress after its MAX event.
      */
      const progressed =
        (
          obs.userMessages != null &&
          before.userMessages != null &&
          obs.userMessages > before.userMessages
        ) ||
        (
          obs.assistantMessages != null &&
          before.assistantMessages != null &&
          obs.assistantMessages > before.assistantMessages
        ) ||
        (
          obs.branchNodes != null &&
          before.branchNodes != null &&
          obs.branchNodes > before.branchNodes
        );

      if (progressed) {
        family.lastRecovery = {
          confirmed: true,
          time: Date.now(),
          sourceFamily,
          afterMaxTime: maxEvent.time,
          before,
          after: obs,
          delta: {
            retainedBytes:
              (obs.retainedBytes ?? 0) -
              (before.retainedBytes ?? 0),
            activeBranchBytes:
              (obs.activeBranchBytes ?? 0) -
              (before.activeBranchBytes ?? 0),
            mappingBytes:
              (obs.mappingBytes ?? 0) -
              (before.mappingBytes ?? 0),
            branchNodes:
              (obs.branchNodes ?? 0) -
              (before.branchNodes ?? 0),
            userMessages:
              (obs.userMessages ?? 0) -
              (before.userMessages ?? 0),
            assistantMessages:
              (obs.assistantMessages ?? 0) -
              (before.assistantMessages ?? 0),
            toolResults:
              (obs.toolResults ?? 0) -
              (before.toolResults ?? 0),
            strongContextMarkers:
              (obs.strongContextMarkers ?? 0) -
              (before.strongContextMarkers ?? 0)
          }
        };

        family.recoveryPending = null;
      } else {
        family.recoveryPending = {
          confirmed: false,
          time: Date.now(),
          sourceFamily,
          reason:
            'banner cleared / newer snapshot seen, but no same-source message or branch progress yet',
          maxEvent,
          candidate: obs
        };
      }
    }
  }

  if (phase === 'max') {
    const event = {
      time: Date.now(),
      fullCapturedAt: obs.fullCapturedAt,
      sourceFamily,
      metrics: obs,
      generationPeak:
        family.currentPeak ||
        family.lastInflight ||
        null
    };

    const duplicate =
      family.lastMaxEvent &&
      Number(family.lastMaxEvent.fullCapturedAt) ===
        Number(event.fullCapturedAt) &&
      family.lastMaxEvent.sourceFamily === sourceFamily;

    if (!duplicate) {
      family.lastMaxEvent = event;
      const familyEvents = Array.isArray(family.maxEvents)
        ? family.maxEvents
        : [];
      familyEvents.push(event);
      family.maxEvents = familyEvents.slice(-12);

      state.lastMaxEvent = event;
      const allEvents = Array.isArray(state.maxEvents)
        ? state.maxEvents
        : [];
      allEvents.push(event);
      state.maxEvents = allEvents.slice(-24);
    }
  }

  const rows = Array.isArray(state.observations)
    ? state.observations
    : [];

  const prev = rows[rows.length - 1];

  const sig = [
    phase,
    sourceFamily,
    obs.retainedBytes,
    obs.activeBranchBytes,
    obs.branchNodes,
    obs.source
  ].join('|');

  const prevSig = prev
    ? [
        prev.phase,
        prev.sourceFamily,
        prev.retainedBytes,
        prev.activeBranchBytes,
        prev.branchNodes,
        prev.source
      ].join('|')
    : '';

  if (sig !== prevSig) {
    rows.push(obs);
  }

  state.observations = rows.slice(-80);
  saveLifecycle(id, state);

  attemptRecordFullCapture(id, obs);
  attemptRecordPostOutcomeCapture(id, obs);
}

function lifecyclePollPhase() {
  const id = chatIdFromURL();
  if (!id) return;

  const generating = visibleGenerationActive();
  const state = loadLifecycle(id);

  if (generating && !lastGeneratingState) {
    {
      const attemptStore = loadAttemptState(id);

      if (!attemptStore.current) {
        attemptStart(id, 'dom-generation-fallback');
      }
    }

    for (const familyName of ['direct', 'batch', 'other']) {
      state.families[familyName].currentPeak = null;
    }
    state.generationStartedAt = Date.now();
  }

  if (!generating && lastGeneratingState) {
    {
      const attemptStore = loadAttemptState(id);

      if (
        attemptStore.current &&
        attemptStore.current.trigger === 'dom-generation-fallback'
      ) {
        attemptGenerationEnded(id);
        attemptSchedulePostResponseCapture(id);
      }
    }

    for (const familyName of ['direct', 'batch', 'other']) {
      const f = state.families[familyName];
      f.lastGenerationPeak =
        f.currentPeak ||
        f.lastInflight ||
        f.lastGenerationPeak ||
        null;
      f.currentPeak = null;
    }

    state.generationEndedAt = Date.now();

    clearTimeout(lifecycleRetryTimer);
    lifecycleRetryTimer = setTimeout(
      () => retryCapture(),
      1200
    );
  }

  const maxNow = visibleHardMax();

  if (maxNow && !state.bannerActive) {
    attemptMarkMax(id, 'MAX banner');

    state.bannerActive = true;
    state.bannerDetectedAt = Date.now();

    /*
      Force a fresh capture while the banner is visible so both DIRECT
      and BATCH families have a chance to record source-specific MAX data.
    */
    clearTimeout(lifecycleRetryTimer);
    lifecycleRetryTimer = setTimeout(
      () => retryCapture(),
      250
    );
  } else if (!maxNow && state.bannerActive) {
    state.bannerActive = false;
    state.bannerClearedAt = Date.now();
  }

  lastGeneratingState = generating;
  saveLifecycle(id, state);
}

function lifecycleObsText(x) {
  if (!x) return '—';

  return (
    `${lifecycleFamilyLabel(x.sourceFamily || lifecycleSourceFamily(x.source))} ` +
    `${x.phase || '?'} · ` +
    `${x.retainedBytes != null ? fmt(x.retainedBytes) + 'B retained' : '— retained'} · ` +
    `${x.activeBranchBytes != null ? fmt(x.activeBranchBytes) + 'B active' : '— active'} · ` +
    `${x.branchNodes ?? '—'} nodes · ${x.source || 'unknown'}`
  );
}

function lifecycleRowsText(rows, limit = 12) {
  if (!Array.isArray(rows) || !rows.length) return '—';
  return rows.slice(-limit).map(lifecycleObsText).join(' || ');
}

function lifecycleDelta(value, suffix = '') {
  const n = nullableNumber(value);
  if (n == null) return '—';
  return `${n > 0 ? '+' : ''}${fmt(n)}${suffix}`;
}



function attemptKey(id = chatIdFromURL()) {
  return id ? `${ATTEMPT_PREFIX}:${id}` : null;
}
function blankAttemptState() {
  return {
    version:2,
    nextId:1,
    current:null,
    last:null,
    attempts:[],
    pendingPreflight:null,
    preflightHistory:[]
  };
}
function loadAttemptState(id = chatIdFromURL()) {
  const k = attemptKey(id);
  if (!k) return blankAttemptState();

  try {
    const x = JSON.parse(localStorage.getItem(k));

    if (!x || typeof x !== 'object') {
      return blankAttemptState();
    }

    return {
      ...blankAttemptState(),
      ...x,
      attempts:Array.isArray(x.attempts) ? x.attempts : [],
      preflightHistory:Array.isArray(x.preflightHistory)
        ? x.preflightHistory
        : []
    };
  } catch {
    return blankAttemptState();
  }
}
function saveAttemptState(id,x) {
  const k = attemptKey(id); if (!k) return;
  try { localStorage.setItem(k, JSON.stringify(x)); } catch {}
}
function attemptLatestUserPromptChars() {
  try {
    const nodes=[...document.querySelectorAll('[data-message-author-role="user"]')];
    if (nodes.length) return String(nodes[nodes.length-1].innerText||'').length;
  } catch {}
  return null;
}
function attemptEffortHint() {
  try {
    const allowed=new Set(['instant','thinking','medium','high','extra high']);
    const xs=[...document.querySelectorAll('button')]
      .map(x=>String(x.innerText||'').trim())
      .filter(x=>allowed.has(x.toLowerCase()));
    return xs.length ? xs[xs.length-1] : null;
  } catch { return null; }
}
function attemptSnapshotModel(id = chatIdFromURL()) {
  const snap=loadSnapshot(id);
  return snap?.structure?.contextTopology?.currentModel || null;
}
function attemptCompactObservation(obs) {
  if (!obs) return null;
  return {
    time:obs.time||Date.now(), fullCapturedAt:obs.fullCapturedAt||0,
    source:obs.source||null,
    sourceFamily:obs.sourceFamily||lifecycleSourceFamily(obs.source),
    phase:obs.phase||null,
    retainedBytes:nullableNumber(obs.retainedBytes),
    retainedShare:nullableNumber(obs.retainedShare),
    activeBranchBytes:nullableNumber(obs.activeBranchBytes),
    mappingBytes:nullableNumber(obs.mappingBytes),
    branchNodes:nullableNumber(obs.branchNodes),
    messageNodes:nullableNumber(obs.messageNodes),
    userMessages:nullableNumber(obs.userMessages),
    assistantMessages:nullableNumber(obs.assistantMessages),
    toolResults:nullableNumber(obs.toolResults),
    toolCalls:nullableNumber(obs.toolCalls),
    strongContextMarkers:nullableNumber(obs.strongContextMarkers),
    systemRoleNodes:nullableNumber(obs.systemRoleNodes),
    displayLikeTokens:nullableNumber(obs.displayLikeTokens),
    payloadBytes:nullableNumber(obs.payloadBytes)
  };
}
function attemptPeakObservation(a,b,field) {
  if (!a) return b||null; if (!b) return a;
  const av=nullableNumber(a[field]), bv=nullableNumber(b[field]);
  if (av==null) return b; if (bv==null) return a;
  return bv>av?b:a;
}
function attemptBaselineForFamily(lifecycle,family) {
  return attemptCompactObservation(lifecycle?.families?.[family]?.lastStable);
}
function attemptStart(id,trigger='generation-start') {
  if (!id) return null;

  const store=loadAttemptState(id);

  if (
    store.current &&
    ['running','pending'].includes(store.current.status)
  ) {
    return store.current;
  }

  const lifecycle=loadLifecycle(id);

  const a={
    id:store.nextId||1,
    startedAt:Date.now(),
    trigger,
    status:'running',
    outcome:null,
    outcomeConfirmedBy:null,
    outcomeConfirmedAt:null,

    postCorrelation:{
      scheduled:false,
      startedAt:null,
      lastCapturedAt:null,
      captureCount:0,
      snapshotsByFamily:{
        direct:null,
        batch:null,
        other:null
      },
      deltasByFamily:{
        direct:null,
        batch:null,
        other:null
      }
    },

    promptChars:attemptLatestUserPromptChars(),
    preSnapshotModel:attemptSnapshotModel(id),
    effortHint:attemptEffortHint(),

    requestDetectedAt:null,
    requestURL:null,
    requestPath:null,
    requestMethod:null,
    requestBodyBytes:null,
    requestAction:null,
    requestModel:null,
    requestEffort:null,
    requestPromptChars:null,
    requestConversationId:null,
    requestParentMessageId:null,
    requestKeys:[],
    requestParsed:false,

    responseObservedAt:null,
    responseCompletedAt:null,
    responseStatus:null,
    responseContentType:null,
    responseBytes:null,
    responseMaxTextDetected:false,

    preflight:null,

    streamStats:{
      observed:false,
      startedAt:null,
      firstByteAt:null,
      endedAt:null,
      chunkCount:0,
      totalBytes:0,
      maxChunkBytes:0,
      lastChunkAt:null,
      status:null,
      contentType:null,
      doneSignals:0,
      maxTextDetected:false,
      eventCounts:{},
      recentEvents:[],
      readError:null,
      readErrorBenign:false
    },

    domStats:{
      observerEvents:0,
      assistantChanges:0,
      generationStarts:0,
      generationStops:0,
      lastAssistantCount:null,
      lastAssistantChars:null,
      lastMutationAt:null,
      lastCaptureAt:null
    },

    transportEvents:[],
    transportStats:{
      websocketInCount:0,
      websocketOutCount:0,
      websocketInBytes:0,
      websocketOutBytes:0,
      websocketMaxBytes:0,
      websocketURLs:[],
      doneSignals:0
    },
    lastTransportActivityAt:null,
    lastNetworkActivityAt:null,
    successCandidate:null,

    pre:{
      currentSourceFamily:lifecycle.lastObservation?.sourceFamily||null,
      direct:attemptBaselineForFamily(lifecycle,'direct'),
      batch:attemptBaselineForFamily(lifecycle,'batch'),
      other:attemptBaselineForFamily(lifecycle,'other')
    },

    firstCaptureByFamily:{direct:null,batch:null,other:null},
    peakRetainedByFamily:{direct:null,batch:null,other:null},    peakActiveByFamily:{direct:null,batch:null,other:null},
    lastCaptureByFamily:{direct:null,batch:null,other:null},

    networkEvents:[],
    networkMaxBytes:0,
    networkFamilies:{},

    generationEndedAt:null,
    maxDetectedAt:null,
    successConfirmedAt:null,
    finalizedAt:null,

    maxSnapshot:null,
    post:null,
    deltas:null
  };

  store.nextId=a.id+1;
  store.current=a;
  saveAttemptState(id,store);

  return a;
}
function attemptRecordNetworkEvent(id,url,bytes,contentType='') {
  if (!id) return;

  const store=loadAttemptState(id), a=store.current;

  if (
    !a ||
    !['running','pending'].includes(a.status)
  ) {
    return;
  }

  const source=lifecycleSourceLabel(url);
  const family=lifecycleSourceFamily(source);

  const ev={
    time:Date.now(),
    source,
    family,
    bytes:nullableNumber(bytes),
    contentType:String(contentType||'').slice(0,120)
  };

  const rows=Array.isArray(a.networkEvents)
    ? a.networkEvents
    : [];

  rows.push(ev);
  a.networkEvents=rows.slice(-100);

  a.networkMaxBytes=Math.max(
    Number(a.networkMaxBytes)||0,
    Number(bytes)||0
  );

  a.lastNetworkActivityAt=ev.time;

  const fs=
    a.networkFamilies &&
    typeof a.networkFamilies==='object'
      ? a.networkFamilies
      : {};

  if (!fs[family]) {
    fs[family]={
      count:0,
      totalBytes:0,
      maxBytes:0,
      lastURL:null
    };
  }

  fs[family].count++;
  fs[family].totalBytes+=Number(bytes)||0;
  fs[family].maxBytes=Math.max(
    fs[family].maxBytes,
    Number(bytes)||0
  );
  fs[family].lastURL=source;

  a.networkFamilies=fs;
  store.current=a;
  saveAttemptState(id,store);
}
function attemptFinalize(store,a) {
  const rows=Array.isArray(store.attempts)?store.attempts:[];
  rows.push(a); store.attempts=rows.slice(-30); store.last=a; store.current=null;
}
function attemptRecordFullCapture(id,obs) {
  if (!id||!obs) return;

  const store=loadAttemptState(id), a=store.current;

  if (
    !a ||
    !['running','pending'].includes(a.status)
  ) {
    return;
  }

  const c=attemptCompactObservation(obs);
  const family=
    c.sourceFamily ||
    lifecycleSourceFamily(c.source);

  if (!a.firstCaptureByFamily[family]) {
    a.firstCaptureByFamily[family]=c;
  }

  a.lastCaptureByFamily[family]=c;

  a.peakRetainedByFamily[family]=
    attemptPeakObservation(
      a.peakRetainedByFamily[family],
      c,
      'retainedBytes'
    );

  a.peakActiveByFamily[family]=
    attemptPeakObservation(
      a.peakActiveByFamily[family],
      c,
      'activeBranchBytes'
    );

  if (c.phase==='max') {
    a.status='max';
    a.outcome='max';
    a.outcomeConfirmedBy=
      `${lifecycleFamilyLabel(family)} MAX capture / banner`;
    a.outcomeConfirmedAt=Date.now();
    a.maxDetectedAt=Date.now();
    a.maxSnapshot=c;
    a.finalizedAt=Date.now();

    const attemptId=a.id;

    attemptFinalize(store,a);
    saveAttemptState(id,store);

    attemptSchedulePostOutcomeCaptures(
      id,
      attemptId
    );

    return;
  }

  if (
    ['running','pending'].includes(a.status) &&
    c.phase==='stable'
  ) {
    const pre=a.pre?.[family]||null;

    if (
      attemptSuccessCandidateFromCapture(
        a,
        c,
        pre
      )
    ) {
      a.successCandidate={
        time:Date.now(),
        family,
        pre,
        capture:c
      };

      store.current=a;
      saveAttemptState(id,store);
      attemptScheduleSettledSuccess(id);
      return;
    }
  }

  store.current=a;
  saveAttemptState(id,store);
}
function attemptGenerationEnded(id) {
  if (!id) return;

  const store=loadAttemptState(id);
  const a=store.current;

  if (!a || a.status!=='running') return;

  a.status='pending';
  a.generationEndedAt=Date.now();

  store.current=a;
  saveAttemptState(id,store);
}
function attemptMarkMax(
  id,
  confirmation = 'MAX banner'
) {
  if (!id) return;

  let store=loadAttemptState(id);
  let a=store.current;

  if (!a) {
    attemptStart(
      id,
      'max-banner-without-generation-edge'
    );

    store=loadAttemptState(id);
    a=store.current;
  }

  if (
    !a ||
    ['success','max'].includes(a.status)
  ) {
    return;
  }

  a.status='max';
  a.outcome='max';
  a.outcomeConfirmedBy=confirmation;
  a.outcomeConfirmedAt=Date.now();
  a.maxDetectedAt=Date.now();
  a.finalizedAt=Date.now();

  const life=loadLifecycle(id);

  a.maxSnapshot={
    time:Date.now(),
    currentSourceFamily:
      life.lastObservation?.sourceFamily || null,
    direct:attemptCompactObservation(
      life.families?.direct?.lastMaxEvent?.metrics ||
      life.families?.direct?.lastStable
    ),
    batch:attemptCompactObservation(
      life.families?.batch?.lastMaxEvent?.metrics ||
      life.families?.batch?.lastStable
    ),
    other:attemptCompactObservation(
      life.families?.other?.lastMaxEvent?.metrics ||
      life.families?.other?.lastStable
    )
  };

  const attemptId=a.id;

  attemptFinalize(store,a);
  saveAttemptState(id,store);

  attemptSchedulePostOutcomeCaptures(
    id,
    attemptId
  );
}
function attemptStatusLabel(a) {
  if (!a) return 'READY';
  return ({running:'RUNNING',pending:'FINALIZING',success:'SUCCESS',max:'MAX'})[a.status]||String(a.status||'UNKNOWN').toUpperCase();
}
function attemptFamilyPeakText(a,family) {
  if (!a) return '—';
  const r=a.peakRetainedByFamily?.[family], x=a.peakActiveByFamily?.[family];
  if (!r&&!x) return '—';
  return `${r?.retainedBytes!=null?fmt(r.retainedBytes)+'B retained':'— retained'} · ${x?.activeBranchBytes!=null?fmt(x.activeBranchBytes)+'B active':'— active'}`;
}
function attemptNetworkText(a) {
  if (!a) return '—';
  const fs=a.networkFamilies||{};
  const parts=['direct','batch','other'].filter(k=>fs[k]).map(k=>`${lifecycleFamilyLabel(k)} ${fs[k].count||0} events / ${fmt(fs[k].maxBytes||0)}B max`);
  return parts.length?parts.join(' · '):'—';
}
function attemptSummaryText(a) {
  if (!a) return '—';

  const end=a.finalizedAt||Date.now();

  const dur=a.startedAt
    ? Math.max(0,end-a.startedAt)
    : null;

  const promptChars =
    a.requestPromptChars ??
    a.promptChars ??
    '—';

  const model =
    a.requestModel ||
    a.preSnapshotModel ||
    '—';

  const effort =
    a.requestEffort ||
    a.effortHint ||
    '—';

  const confirmed =
    a.outcomeConfirmedBy
      ? ` · confirmed ${a.outcomeConfirmedBy}`
      : '';

  return (
    `#${a.id} ${attemptStatusLabel(a)} · ` +
    `${a.trigger || 'unknown-trigger'} · ` +
    `prompt ${promptChars} chars · ` +
    `request ${fmt(a.requestBodyBytes || 0)}B · ` +
    `model ${model} · ` +
    `effort ${effort} · ` +
    `${dur!=null?(dur/1000).toFixed(1)+'s':'—'} · ` +
    `response ${fmt(a.responseBytes || 0)}B · ` +
    `network max ${fmt(a.networkMaxBytes||0)}B` +
    confirmed
  );
}
function attemptRecentText(rows,limit=10) {
  if (!Array.isArray(rows)||!rows.length) return '—';
  return rows.slice(-limit).map(attemptSummaryText).join(' || ');
}


// ============================================================
// Snapshot merging
// ============================================================

function mergeRecordsForChat(
  id,
  records,
  {
    full = false,
    source = 'network update',
    structure = null,
    payloadBytes = null
  } = {}
) {
  if (!id || !records?.length) return;

  const snap = loadSnapshot(id);

  if (full) {
    // A full mapping describes the currently active branch. Replace instead of
    // union-merging so old regenerated branches cannot inflate active metrics.
    snap.records = records;
    snap.full = true;
    snap.fullCapturedAt = Date.now();
    snap.source = source;
    snap.structure = structure || snap.structure || null;

    if (Number.isFinite(Number(payloadBytes))) {
      snap.maxFullPayloadBytes = Math.max(
        Number(snap.maxFullPayloadBytes) || 0,
        Number(payloadBytes) || 0
      );
    }
  } else {
    const map = new Map(
      snap.records.map(r => [r.id, r])
    );

    for (const rec of records) {
      const old = map.get(rec.id);

      if (!old || rec.chars >= old.chars) {
        map.set(rec.id, rec);
      }
    }

    snap.records = [...map.values()];

    if (!snap.full) {
      snap.source = source;
    }
  }

  snap.capturedAt = Date.now();
  saveSnapshot(id, snap);
  scheduleUpdate();
}

function acceptCandidate(candidate, sourceURL = '', payloadBytes = null) {
  if (!candidate?.records?.length) return;

  const current = chatIdFromURL();

  const candidateId = candidate.conversationId
    ? String(candidate.conversationId)
    : null;

  if (
    candidateId &&
    current &&
    candidateId !== current
  ) {
    return;
  }

  const id = candidateId || current;
  if (!id) return;

  mergeRecordsForChat(
    id,
    candidate.records,
    {
      full: candidate.full,
      source: candidate.full
        ? candidate.source
        : 'network incremental update',
      structure: candidate.structure || null,
      payloadBytes: candidate.full ? payloadBytes : null
    }
  );

  if (candidate.full) {
    recordLifecycleFullCapture(id, sourceURL, payloadBytes);
  }

  const previousDiag = loadDiagnostic(id) || {};

  saveDiagnostic(id, {
    lastSourceURL: sourceURL,
    lastCandidateRecords: candidate.records.length,
    lastCandidateFull: !!candidate.full,
    mappingNodes: candidate.mappingNodes ?? previousDiag.mappingNodes ?? null,
    maxFullPayloadBytes: candidate.full && Number.isFinite(Number(payloadBytes))
      ? Math.max(
          Number(previousDiag.maxFullPayloadBytes) || 0,
          Number(payloadBytes) || 0
        )
      : Number(previousDiag.maxFullPayloadBytes) || null
  });
}


// ============================================================
// JSON / SSE network inspection
// ============================================================

function inspectJSON(obj, sourceURL = '', payloadBytes = null) {
  try {
    const candidate = findBestCandidate(obj);
    if (candidate) acceptCandidate(candidate, sourceURL, payloadBytes);
  } catch (e) {
    console.debug('[Chat Size V2.10.1] JSON inspection failed', e);
  }
}

function inspectSSE(text, sourceURL = '') {
  if (!text || !text.includes('data:')) return;

  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    if (!line.startsWith('data:')) continue;

    const payload = line.slice(5).trim();

    if (
      !payload ||
      payload === '[DONE]'
    ) {
      continue;
    }

    try {
      inspectJSON(
        JSON.parse(payload),
        sourceURL
      );
    } catch {}
  }
}

function interestingURL(url) {
  const s = String(url || '');

  return (
    /\/backend-api\/conversation(?:\/|\?|$)/i.test(s) ||
    /\/backend-api\/conversations(?:\/|\?|$)/i.test(s) ||
    /\/conversation(?:\/|\?|$)/i.test(s) ||
    /conversation_id=/i.test(s)
  );
}

async function inspectResponse(response, url) {
  try {
    if (!interestingURL(url)) return;

    const clone = response.clone();
    const text = await clone.text();

    if (!text) return;

    const payloadBytes = new TextEncoder().encode(text).length;
    const id = chatIdFromURL();
    const previous = loadDiagnostic(id) || {};

    saveDiagnostic(id, {
      lastObservedURL: String(url),
      lastObservedCharacters: text.length,
      lastObservedBytes: payloadBytes,
      maxObservedPayloadBytes: Math.max(
        Number(previous.maxObservedPayloadBytes) || 0,
        payloadBytes
      ),
      lastObservedType:
        response.headers.get('content-type') || ''
    });

    attemptRecordNetworkEvent(
      id,
      String(url),
      payloadBytes,
      response.headers.get('content-type') || ''
    );

    attemptObservePreflightResponse(
      id,
      String(url),
      response,
      text,
      payloadBytes
    );

    attemptObserveGenerationResponse(
      id,
      String(url),
      response,
      text,
      payloadBytes
    );

    const trimmed = text.trim();

    if (
      trimmed.startsWith('{') ||
      trimmed.startsWith('[')
    ) {
      try {
        inspectJSON(
          JSON.parse(trimmed),
          String(url),
          payloadBytes
        );
        return;
      } catch {}
    }

    inspectSSE(text, String(url));
  } catch {}
}

function inspectRequestBody(url, init) {
  try {
    if (!interestingURL(url)) return;

    const body = init?.body;
    if (typeof body !== 'string') return;

    const parsed = JSON.parse(body);

    const candidate = findBestCandidate(parsed);

    if (candidate) {
      candidate.full = false;
      acceptCandidate(
        candidate,
        `request:${String(url)}`
      );
    }
  } catch {}
}




function attemptIsPreflightRequest(url, method, parsedBody = null) {
  const m = String(method || 'GET').toUpperCase();
  if (m !== 'POST') return false;

  const path = attemptRequestPath(url);

  if (
    /\/backend-api\/f\/conversation\/prepare$/i.test(path) ||
    /\/backend-api\/conversation\/prepare$/i.test(path) ||
    /\/conversation\/prepare$/i.test(path)
  ) {
    return true;
  }

  return Boolean(
    parsedBody &&
    typeof parsedBody === 'object' &&
    /\/conversation\/prepare$/i.test(path) &&
    (
      'client_prepare_state' in parsedBody ||
      'client_prepare_dispatch' in parsedBody ||
      'client_prepare_source' in parsedBody
    )
  );
}

function attemptSafeJSONParse(text) {
  try {
    return JSON.parse(String(text || ''));
  } catch {
    return null;
  }
}

function attemptShallowKeys(obj) {
  return (
    obj &&
    typeof obj === 'object' &&
    !Array.isArray(obj)
  )
    ? Object.keys(obj).slice(0,80)
    : [];
}

function attemptExtractTransportHints(root) {
  const out = {};
  const seen = new WeakSet();
  const queue = [{ value:root, path:'' }];
  let visited = 0;

  while (queue.length && visited < 300) {
    const { value, path } = queue.shift();

    if (!value || typeof value !== 'object') continue;
    if (seen.has(value)) continue;
    seen.add(value);
    visited++;

    for (const [k,v] of Object.entries(value)) {
      const key = String(k);
      const p = path ? `${path}.${key}` : key;
      const lowerPath = p.toLowerCase();

      const transportPath =
        lowerPath.includes('dispatch') ||
        lowerPath.includes('transport') ||
        lowerPath.includes('websocket') ||
        lowerPath.includes('socket') ||
        lowerPath.includes('ws_url') ||
        lowerPath.includes('wss_url') ||
        lowerPath.includes('stream') ||
        lowerPath.includes('request_id') ||
        lowerPath.includes('response_id') ||
        lowerPath.includes('channel') ||
        lowerPath.includes('topic');

      if (
        transportPath &&
        (
          typeof v === 'string' ||
          typeof v === 'number' ||
          typeof v === 'boolean' ||
          v === null
        )
      ) {
        out[p] = v;
      }

      if (
        v &&
        typeof v === 'object' &&
        p.split('.').length <= 4
      ) {
        queue.push({ value:v, path:p });
      }
    }
  }

  return out;
}

function attemptPreflightMeta(url, method, body) {
  const parsed = attemptParseJSONBody(body);

  return {
    time:Date.now(),
    requestURL:String(url || '').slice(0,600),
    requestPath:attemptRequestPath(url),
    requestMethod:String(method || 'POST').toUpperCase(),
    requestBodyBytes:attemptBodyBytes(body),
    conversationId:
      parsed?.conversation_id ??
      parsed?.conversationId ??
      null,
    parentMessageId:
      parsed?.parent_message_id ??
      parsed?.parentMessageId ??
      null,
    model:parsed?.model != null ? String(parsed.model) : null,
    effort:attemptFindEffortValue(parsed),
    action:parsed?.action != null ? String(parsed.action) : null,
    requestKeys:attemptShallowKeys(parsed),
    requestDispatchHints:attemptExtractTransportHints(parsed),

    responseAt:null,
    responseStatus:null,
    responseBytes:null,
    responseContentType:null,
    responseKeys:[],
    responseDispatchHints:{}
  };
}

function attemptRecordPreflightRequest(id, url, method, body) {
  if (!id) return;

  const store = loadAttemptState(id);
  const pre = attemptPreflightMeta(url, method, body);

  store.pendingPreflight = pre;

  const rows = Array.isArray(store.preflightHistory)
    ? store.preflightHistory
    : [];

  rows.push(pre);
  store.preflightHistory = rows.slice(-40);

  saveAttemptState(id, store);
}

function attemptUpdatePreflightHistory(store, pre) {
  const rows = Array.isArray(store.preflightHistory)
    ? store.preflightHistory
    : [];

  if (
    rows.length &&
    Number(rows[rows.length-1]?.time || 0) === Number(pre?.time || 0)
  ) {
    rows[rows.length-1] = pre;
  } else {
    rows.push(pre);
  }

  store.preflightHistory = rows.slice(-40);
}

function attemptObservePreflightResponse(
  id,
  url,
  response,
  text,
  payloadBytes
) {
  if (!id) return false;

  const path = attemptRequestPath(url);

  if (!/\/conversation\/prepare$/i.test(path)) {
    return false;
  }

  const store = loadAttemptState(id);
  const pre = store.pendingPreflight || {
    time:Date.now(),
    requestURL:String(url || '').slice(0,600),
    requestPath:path,
    requestMethod:'POST',
    requestKeys:[],
    requestDispatchHints:{}
  };

  const parsed = attemptSafeJSONParse(text);

  pre.responseAt = Date.now();
  pre.responseStatus =
    response && Number.isFinite(Number(response.status))
      ? Number(response.status)
      : null;
  pre.responseBytes = nullableNumber(payloadBytes);
  pre.responseContentType =
    response?.headers?.get?.('content-type') || null;
  pre.responseKeys = attemptShallowKeys(parsed);
  pre.responseDispatchHints =
    attemptExtractTransportHints(parsed);

  store.pendingPreflight = pre;
  attemptUpdatePreflightHistory(store, pre);
  saveAttemptState(id, store);

  return true;
}

function attemptTakeRecentPreflight(id, maxAgeMs = 30000) {
  const store = loadAttemptState(id);
  const pre = store.pendingPreflight;

  if (!pre) return null;

  const age = Date.now() - Number(pre.time || 0);

  if (age < 0 || age > maxAgeMs) {
    return null;
  }

  store.pendingPreflight = null;
  saveAttemptState(id, store);

  return pre;
}

function attemptDataBytes(data) {
  if (typeof data === 'string') {
    try {
      return new TextEncoder().encode(data).length;
    } catch {
      return data.length;
    }
  }

  if (data instanceof ArrayBuffer) {
    return data.byteLength;
  }

  if (ArrayBuffer.isView(data)) {
    return data.byteLength;
  }

  if (data && typeof data.size === 'number') {
    return Number(data.size) || 0;
  }

  return 0;
}

function attemptTransportPreview(data) {
  if (typeof data !== 'string') return null;

  const s = data
    .replace(/\s+/g,' ')
    .slice(0,400);

  return s || null;
}

function attemptTransportEventKind(data) {
  if (typeof data !== 'string') return null;

  const parsed = attemptSafeJSONParse(data);

  if (parsed && typeof parsed === 'object') {
    return (
      parsed.type ??
      parsed.event ??
      parsed.status ??
      parsed.message?.status ??
      parsed.message?.author?.role ??
      null
    );
  }

  const lower = data.toLowerCase();

  if (lower.includes('[done]')) return '[DONE]';
  if (lower.includes('finished_successfully')) {
    return 'finished_successfully';
  }

  return null;
}

function attemptTransportLooksDone(data) {
  if (typeof data !== 'string') return false;

  const s = data
    .slice(0,200000)
    .toLowerCase();

  return (
    s.includes('[done]') ||
    s.includes('"finished_successfully"') ||
    s.includes('"status":"finished_successfully"') ||
    s.includes('"type":"message_end"') ||
    s.includes('"type":"done"') ||
    s.includes('"event":"done"')
  );
}

function attemptRecentTransportText(a, limit = 12) {
  const rows = Array.isArray(a?.transportEvents)
    ? a.transportEvents
    : [];

  if (!rows.length) return '—';

  return rows
    .slice(-limit)
    .map(x => (
      `${x.transport}:${x.direction} ` +
      `${fmt(x.bytes || 0)}B` +
      `${x.kind ? ` ${x.kind}` : ''}`
    ))
    .join(' || ');
}

function attemptRecordTransportEvent(
  id,
  transport,
  direction,
  url,
  data
) {
  if (!id) return;

  const store = loadAttemptState(id);
  const a = store.current;

  if (
    !a ||
    !['running','pending'].includes(a.status)
  ) {
    return;
  }

  const bytes = attemptDataBytes(data);
  const ev = {
    time:Date.now(),
    transport,
    direction,
    url:String(url || '').slice(0,500),
    bytes,
    kind:attemptTransportEventKind(data),
    preview:attemptTransportPreview(data)
  };

  const rows = Array.isArray(a.transportEvents)
    ? a.transportEvents
    : [];

  rows.push(ev);
  a.transportEvents = rows.slice(-200);
  a.lastTransportActivityAt = ev.time;

  if (!a.transportStats) {
    a.transportStats = {
      websocketInCount:0,
      websocketOutCount:0,
      websocketInBytes:0,
      websocketOutBytes:0,
      websocketMaxBytes:0,
      websocketURLs:[],
      doneSignals:0
    };
  }

  if (transport === 'websocket') {
    if (direction === 'in') {
      a.transportStats.websocketInCount++;
      a.transportStats.websocketInBytes += bytes;
    } else {
      a.transportStats.websocketOutCount++;
      a.transportStats.websocketOutBytes += bytes;
    }

    a.transportStats.websocketMaxBytes = Math.max(
      Number(a.transportStats.websocketMaxBytes) || 0,
      bytes
    );

    const urls = Array.isArray(a.transportStats.websocketURLs)
      ? a.transportStats.websocketURLs
      : [];

    const u = String(url || '');

    if (u && !urls.includes(u)) {
      urls.push(u);
    }

    a.transportStats.websocketURLs = urls.slice(-12);

    if (attemptTransportLooksDone(data)) {
      a.transportStats.doneSignals++;
    }
  }

  store.current = a;
  saveAttemptState(id, store);

  if (attemptLooksLikeMaxErrorText(data)) {
    attemptMarkMax(
      id,
      'WebSocket MAX/error text'
    );
    return;
  }

  if (attemptTransportLooksDone(data)) {
    attemptGenerationEnded(id);
    attemptSchedulePostResponseCapture(id);
  }
}
function attemptSuccessCandidateFromCapture(a, c, pre) {
  return Boolean(
    a &&
    c &&
    pre &&
    pre.assistantMessages != null &&
    c.assistantMessages != null &&
    c.assistantMessages > pre.assistantMessages
  );
}

function attemptScheduleSettledSuccess(id) {
  clearTimeout(attemptSettleTimer);

  attemptSettleTimer = setTimeout(() => {
    const store = loadAttemptState(id);
    const a = store.current;

    if (!a?.successCandidate) return;
    if (visibleHardMax()) return;

    /*
      Require either explicit completion evidence or that ChatGPT is no
      longer visibly generating. This prevents a temporary pause in a long
      answer from being finalized too early.
    */
    const completionEvidence =
      Number(a.responseCompletedAt || 0) > 0 ||
      Number(a.transportStats?.doneSignals || 0) > 0 ||
      !visibleGenerationActive();

    if (!completionEvidence) {
      attemptScheduleSettledSuccess(id);
      return;
    }

    const activity = Math.max(
      Number(a.lastTransportActivityAt || 0),
      Number(a.responseCompletedAt || 0),
      Number(a.generationEndedAt || 0),
      Number(a.successCandidate?.time || 0)
    );

    if (Date.now() - activity < 1800) {
      attemptScheduleSettledSuccess(id);
      return;
    }

    const c = a.successCandidate.capture;
    const pre = a.successCandidate.pre;

    a.status='success';
    a.outcome='success';
    a.successConfirmedAt=Date.now();
    a.finalizedAt=Date.now();
    a.post=c;

    a.deltas={
      sourceFamily:c.sourceFamily,
      retainedBytes:
        pre?.retainedBytes!=null && c.retainedBytes!=null
          ? c.retainedBytes-pre.retainedBytes
          : null,
      activeBranchBytes:
        pre?.activeBranchBytes!=null && c.activeBranchBytes!=null
          ? c.activeBranchBytes-pre.activeBranchBytes
          : null,
      mappingBytes:
        pre?.mappingBytes!=null && c.mappingBytes!=null
          ? c.mappingBytes-pre.mappingBytes
          : null,
      branchNodes:
        pre?.branchNodes!=null && c.branchNodes!=null
          ? c.branchNodes-pre.branchNodes
          : null,
      assistantMessages:
        pre?.assistantMessages!=null && c.assistantMessages!=null
          ? c.assistantMessages-pre.assistantMessages
          : null,
      toolResults:
        pre?.toolResults!=null && c.toolResults!=null
          ? c.toolResults-pre.toolResults
          : null,
      strongContextMarkers:
        pre?.strongContextMarkers!=null && c.strongContextMarkers!=null
          ? c.strongContextMarkers-pre.strongContextMarkers
          : null
    };

    attemptFinalize(store,a);
    saveAttemptState(id,store);
  },2200);
}

function attemptTransportSummary(a) {
  if (!a) return '—';

  const s = a.transportStats || {};
  const parts = [];

  if (
    s.websocketInCount ||
    s.websocketOutCount
  ) {
    parts.push(
      `WS in ${s.websocketInCount||0}/${fmt(s.websocketInBytes||0)}B`
    );
    parts.push(
      `WS out ${s.websocketOutCount||0}/${fmt(s.websocketOutBytes||0)}B`
    );
    parts.push(
      `WS max ${fmt(s.websocketMaxBytes||0)}B`
    );
  }

  if (s.doneSignals) {
    parts.push(`done ${s.doneSignals}`);
  }

  return parts.length ? parts.join(' · ') : '—';
}

function attemptPreflightSummary(pre) {
  if (!pre) return '—';

  const hints = {
    ...(pre.requestDispatchHints || {}),
    ...(pre.responseDispatchHints || {})
  };

  return (
    `${pre.requestPath || 'prepare'} · ` +
    `${fmt(pre.requestBodyBytes || 0)}B request · ` +
    `${pre.responseStatus ?? '—'} / ` +
    `${fmt(pre.responseBytes || 0)}B response · ` +
    `hints ${Object.keys(hints).length}`
  );
}



function attemptNetworkTotalCount(a) {
  const families = a?.networkFamilies;

  if (
    !families ||
    typeof families !== 'object'
  ) {
    return 0;
  }

  return Object.values(families)
    .reduce(
      (sum, x) => sum + (Number(x?.count) || 0),
      0
    );
}

function attemptSSECompletionSignals(stats) {
  const counts = stats?.eventCounts || {};
  const signals = [];

  const add = (key, label) => {
    if (Number(counts[key]) > 0) {
      signals.push(label);
    }
  };

  add('[DONE]', '[DONE]');
  add('finished_successfully', 'finished_successfully');
  add('message_stream_complete', 'message_stream_complete');
  add('message_end', 'message_end');
  add('done', 'done');

  return signals;
}

function attemptSSEConfirmationLabel(a) {
  const signals = attemptSSECompletionSignals(
    a?.streamStats
  );

  if (!signals.length) {
    return 'SSE completion';
  }

  return `SSE ${signals.slice(0,3).join(' + ')}`;
}

function attemptUpdateStoredAttempt(store, a) {
  if (!store || !a) return;

  if (
    store.last &&
    Number(store.last.id) === Number(a.id)
  ) {
    store.last = a;
  }

  const rows = Array.isArray(store.attempts)
    ? store.attempts
    : [];

  for (let i = rows.length - 1; i >= 0; i--) {
    if (Number(rows[i]?.id) === Number(a.id)) {
      rows[i] = a;
      break;
    }
  }

  store.attempts = rows;
}

function attemptPostDelta(pre, c) {
  if (!pre || !c) return null;

  const delta = (field) => (
    pre[field] != null &&
    c[field] != null
      ? c[field] - pre[field]
      : null
  );

  return {
    sourceFamily:c.sourceFamily,
    retainedBytes:delta('retainedBytes'),
    activeBranchBytes:delta('activeBranchBytes'),
    mappingBytes:delta('mappingBytes'),
    branchNodes:delta('branchNodes'),
    messageNodes:delta('messageNodes'),
    assistantMessages:delta('assistantMessages'),
    userMessages:delta('userMessages'),
    toolResults:delta('toolResults'),
    toolCalls:delta('toolCalls'),
    strongContextMarkers:delta('strongContextMarkers'),
    displayLikeTokens:delta('displayLikeTokens')
  };
}

function attemptRecordPostOutcomeCapture(id, obs) {
  if (!id || !obs) return;

  const store = loadAttemptState(id);

  /*
    Post-outcome snapshots are optional correlation only. They update the
    most recently completed attempt for a short bounded window and never
    determine SUCCESS/MAX.
  */
  if (store.current) return;

  const a = store.last;

  if (
    !a ||
    !['success','max'].includes(a.outcome) ||
    !a.finalizedAt ||
    Date.now() - Number(a.finalizedAt) > 20000
  ) {
    return;
  }

  const c = attemptCompactObservation(obs);
  const family =
    c.sourceFamily ||
    lifecycleSourceFamily(c.source);

  if (!a.postCorrelation) {
    a.postCorrelation = {
      scheduled:false,
      startedAt:null,
      lastCapturedAt:null,
      captureCount:0,
      snapshotsByFamily:{
        direct:null,
        batch:null,
        other:null
      },
      deltasByFamily:{
        direct:null,
        batch:null,
        other:null
      }
    };
  }

  a.postCorrelation.lastCapturedAt = Date.now();
  a.postCorrelation.captureCount =
    (Number(a.postCorrelation.captureCount) || 0) + 1;

  a.postCorrelation.snapshotsByFamily[family] = c;

  const pre = a.pre?.[family] || null;
  a.postCorrelation.deltasByFamily[family] =
    attemptPostDelta(pre, c);

  /*
    Keep legacy single post/delta fields populated with the newest
    comparable source for older diagnostics.
  */
  a.post = c;

  if (pre) {
    a.deltas = attemptPostDelta(pre, c);
  }

  attemptUpdateStoredAttempt(store, a);
  saveAttemptState(id, store);
}

function attemptSchedulePostOutcomeCaptures(
  id,
  attemptId
) {
  if (!id || attemptId == null) return;

  let store = loadAttemptState(id);
  const a = store.last;

  if (
    !a ||
    Number(a.id) !== Number(attemptId)
  ) {
    return;
  }

  if (!a.postCorrelation) {
    a.postCorrelation = {
      scheduled:true,
      startedAt:Date.now(),
      lastCapturedAt:null,
      captureCount:0,
      snapshotsByFamily:{
        direct:null,
        batch:null,
        other:null
      },
      deltasByFamily:{
        direct:null,
        batch:null,
        other:null
      }
    };
  }

  a.postCorrelation.scheduled = true;
  a.postCorrelation.startedAt =
    a.postCorrelation.startedAt ||
    Date.now();

  attemptUpdateStoredAttempt(store, a);
  saveAttemptState(id, store);

  /*
    DIRECT comes from retryCapture. BATCH may arrive naturally from the app;
    either source is recorded when observed.
  */
  setTimeout(() => retryCapture(), 250);
  setTimeout(() => retryCapture(), 1200);
  setTimeout(() => retryCapture(), 3200);
}

function attemptFinalizeSuccessFromSSE(
  id,
  confirmation = null
) {
  if (!id) return false;

  const store = loadAttemptState(id);
  const a = store.current;

  if (
    !a ||
    !['running','pending'].includes(a.status)
  ) {
    return false;
  }

  if (visibleHardMax()) {
    return false;
  }

  const signals = attemptSSECompletionSignals(
    a.streamStats
  );

  if (!signals.length) {
    return false;
  }

  a.status = 'success';
  a.outcome = 'success';
  a.outcomeConfirmedBy =
    confirmation ||
    attemptSSEConfirmationLabel(a);
  a.outcomeConfirmedAt = Date.now();
  a.successConfirmedAt = Date.now();
  a.finalizedAt = Date.now();

  if (
    a.streamStats?.readError &&
    signals.length
  ) {
    a.streamStats.readErrorBenign = true;
  }

  const attemptId = a.id;

  attemptFinalize(store, a);
  saveAttemptState(id, store);

  attemptSchedulePostOutcomeCaptures(
    id,
    attemptId
  );

  return true;
}

function attemptScheduleSSESuccess(id) {
  clearTimeout(attemptSSESuccessTimer);

  attemptSSESuccessTimer = setTimeout(() => {
    const store = loadAttemptState(id);
    const a = store.current;

    if (
      !a ||
      !['running','pending'].includes(a.status)
    ) {
      return;
    }

    const signals =
      attemptSSECompletionSignals(a.streamStats);

    if (!signals.length) {
      return;
    }

    if (visibleHardMax()) {
      return;
    }

    const lastActivity = Math.max(
      Number(a.streamStats?.lastChunkAt || 0),
      Number(a.lastTransportActivityAt || 0),
      Number(a.responseCompletedAt || 0)
    );

    /*
      Prefer stream-end, but if the conduit stays open after [DONE], a
      brief quiet period is enough because the SSE completion itself is
      authoritative outcome evidence.
    */
    const ended =
      Number(a.streamStats?.endedAt || 0) > 0;

    if (
      !ended &&
      Date.now() - lastActivity < 650
    ) {
      attemptScheduleSSESuccess(id);
      return;
    }

    attemptFinalizeSuccessFromSSE(
      id,
      attemptSSEConfirmationLabel(a)
    );
  }, 750);
}

function attemptOutcomeConfirmationText(a) {
  if (!a) return '—';

  return (
    a.outcomeConfirmedBy ||
    (
      a.outcome === 'success'
        ? 'success (legacy/unattributed)'
        : a.outcome === 'max'
          ? 'MAX (legacy/unattributed)'
          : '—'
    )
  );
}

function attemptPostCorrelationText(a) {
  const p = a?.postCorrelation;

  if (!p) return '—';

  const parts = [];

  for (const family of ['direct','batch','other']) {
    const c = p.snapshotsByFamily?.[family];

    if (!c) continue;

    const d = p.deltasByFamily?.[family];

    parts.push(
      `${lifecycleFamilyLabel(family)} ` +
      `${fmt(c.retainedBytes || 0)}B retained / ` +
      `${fmt(c.activeBranchBytes || 0)}B active` +
      (
        d?.assistantMessages != null
          ? ` · Δassistant ${d.assistantMessages >= 0 ? '+' : ''}${d.assistantMessages}`
          : ''
      )
    );
  }

  if (!parts.length) {
    return p.scheduled
      ? 'scheduled / awaiting source snapshot'
      : '—';
  }

  return parts.join(' || ');
}


function attemptEnsureStreamStats(a) {
  if (!a.streamStats) {
    a.streamStats = {
      observed:false,
      startedAt:null,
      firstByteAt:null,
      endedAt:null,
      chunkCount:0,
      totalBytes:0,
      maxChunkBytes:0,
      lastChunkAt:null,
      status:null,
      contentType:null,
      doneSignals:0,
      maxTextDetected:false,
      eventCounts:{},
      recentEvents:[],
      readError:null,
      readErrorBenign:false
    };
  }

  if (!a.streamStats.eventCounts) {
    a.streamStats.eventCounts = {};
  }

  if (!Array.isArray(a.streamStats.recentEvents)) {
    a.streamStats.recentEvents = [];
  }

  return a.streamStats;
}

function attemptSSEEventNames(text) {
  if (typeof text !== 'string' || !text) {
    return [];
  }

  const names = [];
  const lines = text.split(/\r?\n/);

  for (const raw of lines) {
    const line = raw.trim();

    if (!line) continue;

    if (line.startsWith('event:')) {
      const name = line.slice(6).trim();
      if (name) names.push(name);
      continue;
    }

    if (line.startsWith('data:')) {
      const payload = line.slice(5).trim();

      if (!payload) continue;

      if (payload === '[DONE]') {
        names.push('[DONE]');
        continue;
      }

      const parsed = attemptSafeJSONParse(payload);

      if (parsed && typeof parsed === 'object') {
        const name =
          parsed.type ??
          parsed.event ??
          parsed.status ??
          parsed.message?.status ??
          parsed.message?.author?.role ??
          null;

        if (name != null) {
          names.push(String(name));
        }
      }
    }
  }

  /*
    Some streaming chunks split SSE lines across reads. These broad
    signatures supplement line parsing without retaining the chunk body.
  */
  const lower = text.toLowerCase();

  if (lower.includes('finished_successfully')) {
    names.push('finished_successfully');
  }

  if (lower.includes('"type":"message_end"')) {
    names.push('message_end');
  }

  return [...new Set(names)].slice(0,40);
}

function attemptRecordStreamEventNames(stats, names) {
  for (const raw of names || []) {
    const name = String(raw || '').slice(0,120);
    if (!name) continue;

    stats.eventCounts[name] =
      (Number(stats.eventCounts[name]) || 0) + 1;

    const recent = stats.recentEvents;
    recent.push({
      time:Date.now(),
      event:name
    });
    stats.recentEvents = recent.slice(-40);
  }
}

function attemptStreamHasDoneSignal(text, names = []) {
  if (
    names.some(x =>
      ['[DONE]','finished_successfully','message_end','done']
        .includes(String(x).toLowerCase() === '[done]'
          ? '[DONE]'
          : String(x).toLowerCase())
    )
  ) {
    return true;
  }

  return attemptTransportLooksDone(text);
}

function attemptRecordStreamChunk(
  id,
  url,
  response,
  bytes,
  textChunk
) {
  if (!id) return;

  const store = loadAttemptState(id);
  const a = store.current;

  if (
    !a ||
    !['running','pending'].includes(a.status) ||
    !attemptRequestMatches(a, url)
  ) {
    return;
  }

  const stats = attemptEnsureStreamStats(a);
  const now = Date.now();

  stats.observed = true;
  stats.startedAt = stats.startedAt || now;
  stats.firstByteAt = stats.firstByteAt || now;
  stats.chunkCount++;
  stats.totalBytes += Number(bytes) || 0;
  stats.maxChunkBytes = Math.max(
    Number(stats.maxChunkBytes) || 0,
    Number(bytes) || 0
  );
  stats.lastChunkAt = now;

  if (stats.status == null) {
    stats.status =
      response && Number.isFinite(Number(response.status))
        ? Number(response.status)
        : null;
  }

  if (!stats.contentType) {
    stats.contentType =
      response?.headers?.get?.('content-type') || null;
  }

  const names = attemptSSEEventNames(textChunk);
  attemptRecordStreamEventNames(stats, names);

  const maxText = attemptLooksLikeMaxErrorText(textChunk);

  if (maxText) {
    stats.maxTextDetected = true;
  }

  const done = attemptStreamHasDoneSignal(
    textChunk,
    names
  );

  if (done) {
    stats.doneSignals++;
  }

  a.responseObservedAt =
    a.responseObservedAt ||
    now;
  a.responseStatus =
    stats.status ??
    a.responseStatus ??
    null;
  a.responseContentType =
    stats.contentType ||
    a.responseContentType ||
    null;
  a.responseBytes = stats.totalBytes;
  a.lastTransportActivityAt = now;
  a.streamStats = stats;

  store.current = a;
  saveAttemptState(id, store);

  if (maxText) {
    attemptMarkMax(
      id,
      'SSE MAX/error text'
    );
    return;
  }

  if (done) {
    attemptGenerationEnded(id);
    attemptScheduleSSESuccess(id);
  }
}

function attemptFinishStream(
  id,
  url,
  response,
  error = null
) {
  if (!id) return;

  const store = loadAttemptState(id);
  const a = store.current;

  if (
    !a ||
    !['running','pending'].includes(a.status) ||
    !attemptRequestMatches(a, url)
  ) {
    return;
  }

  const stats = attemptEnsureStreamStats(a);
  const now = Date.now();

  stats.observed = true;
  stats.startedAt = stats.startedAt || now;
  stats.endedAt = now;

  if (error) {
    stats.readError = String(
      error?.message ||
      error
    ).slice(0,500);
  }

  const completionSignals =
    attemptSSECompletionSignals(stats);

  if (
    stats.readError &&
    completionSignals.length
  ) {
    /*
      ChatGPT may abort the cloned BodyStreamBuffer after the useful SSE
      sequence has already delivered finished_successfully/[DONE].
      That is not a failed generation.
    */
    stats.readErrorBenign = true;
  }

  if (stats.status == null) {
    stats.status =
      response &&
      Number.isFinite(Number(response.status))
        ? Number(response.status)
        : null;
  }

  if (!stats.contentType) {
    stats.contentType =
      response?.headers?.get?.('content-type') ||
      null;
  }

  a.responseObservedAt =
    a.responseObservedAt ||
    now;
  a.responseCompletedAt = now;
  a.responseStatus =
    stats.status ??
    a.responseStatus ??
    null;
  a.responseContentType =
    stats.contentType ||
    a.responseContentType ||
    null;
  a.responseBytes =
    stats.totalBytes;
  a.streamStats = stats;

  store.current = a;
  saveAttemptState(id, store);

  if (completionSignals.length) {
    attemptGenerationEnded(id);

    attemptFinalizeSuccessFromSSE(
      id,
      attemptSSEConfirmationLabel(a)
    );

    return;
  }

  /*
    No authoritative SSE completion signal: preserve V2.21's slower
    assistant-progress/DOM/MAX fallback.
  */
  attemptGenerationEnded(id);
  attemptSchedulePostResponseCapture(id);
}

function attemptInspectResponseStream(response, url) {
  try {
    const id = chatIdFromURL();

    if (!id) return false;

    const store = loadAttemptState(id);
    const a = store.current;

    if (
      !a ||
      !['running','pending'].includes(a.status) ||
      !attemptRequestMatches(a, url)
    ) {
      return false;
    }

    if (
      !response ||
      typeof response.clone !== 'function'
    ) {
      return false;
    }

    const clone = response.clone();
    const body = clone.body;

    if (
      !body ||
      typeof body.getReader !== 'function'
    ) {
      return false;
    }

    const reader = body.getReader();
    const decoder = new TextDecoder();

    /*
      Read the CLONE only. The page's original Response and its body are
      untouched.
    */
    (async () => {
      try {
        while (true) {
          const { value, done } = await reader.read();

          if (done) break;

          const bytes =
            value?.byteLength ??
            value?.length ??
            0;

          const textChunk = value
            ? decoder.decode(value, { stream:true })
            : '';

          attemptRecordStreamChunk(
            id,
            url,
            response,
            bytes,
            textChunk
          );
        }

        const tail = decoder.decode();

        if (tail) {
          attemptRecordStreamChunk(
            id,
            url,
            response,
            0,
            tail
          );
        }

        attemptFinishStream(
          id,
          url,
          response,
          null
        );
      } catch (e) {
        attemptFinishStream(
          id,
          url,
          response,
          e
        );
      }
    })();

    return true;
  } catch {
    return false;
  }
}

function attemptStreamSummary(a) {
  const s = a?.streamStats;

  if (!s?.observed) return '—';

  const firstByteMs =
    s.firstByteAt && a?.startedAt
      ? s.firstByteAt - a.startedAt
      : null;

  const durationMs =
    s.endedAt && s.firstByteAt
      ? s.endedAt - s.firstByteAt
      : null;

  const errorText =
    s.readError
      ? (
          s.readErrorBenign
            ? ` · benign abort: ${s.readError}`
            : ` · read error: ${s.readError}`
        )
      : '';

  return (
    `${s.chunkCount || 0} chunks · ` +
    `${fmt(s.totalBytes || 0)}B total · ` +
    `${fmt(s.maxChunkBytes || 0)}B max chunk · ` +
    `TTFB ${firstByteMs != null ? firstByteMs + 'ms' : '—'} · ` +
    `stream ${durationMs != null ? (durationMs/1000).toFixed(2)+'s' : 'open'} · ` +
    `done ${s.doneSignals || 0}` +
    errorText
  );
}

function attemptStreamEventsText(a, limit = 20) {
  const counts = a?.streamStats?.eventCounts;

  if (!counts || typeof counts !== 'object') {
    return '—';
  }

  const rows = Object.entries(counts)
    .sort((x,y) => Number(y[1]) - Number(x[1]))
    .slice(0,limit);

  return rows.length
    ? rows.map(([k,v]) => `${k}:${v}`).join(', ')
    : '—';
}
function attemptDOMAssistantSignature() {
  try {
    const turns = [
      ...document.querySelectorAll(
        'main [data-testid^="conversation-turn"]'
      )
    ];

    if (turns.length) {
      const lastAssistantTurn = [...turns]
        .reverse()
        .find(turn =>
          turn.querySelector?.(
            '[data-message-author-role="assistant"]'
          ) ||
          /assistant/i.test(
            String(turn.getAttribute?.('data-testid') || '')
          )
        );

      const text = String(
        lastAssistantTurn?.innerText || ''
      );

      return {
        signature:
          `${turns.length}:${text.length}:${text.slice(-120)}`,
        count:turns.length,
        chars:text.length
      };
    }

    const nodes = [
      ...document.querySelectorAll(
        '[data-message-author-role="assistant"]'
      )
    ];

    const count = nodes.length;
    const last = count
      ? String(nodes[count-1]?.innerText || '')
      : '';

    return {
      signature:
        `${count}:${last.length}:${last.slice(-120)}`,
      count,
      chars:last.length
    };
  } catch {
    return {
      signature:'',
      count:0,
      chars:0
    };
  }
}

function attemptMutationRelevant(mutations) {
  if (!Array.isArray(mutations)) {
    mutations = [...(mutations || [])];
  }

  return mutations.some(m => {
    const target = m?.target;

    if (
      panel &&
      target &&
      (
        target === panel ||
        panel.contains?.(target)
      )
    ) {
      return false;
    }

    return true;
  });
}

function attemptHandleDOMMutation() {
  const id = chatIdFromURL();

  if (!id) return;

  const now = Date.now();
  const generating = visibleGenerationActive();
  const sig = attemptDOMAssistantSignature();

  let store = loadAttemptState(id);
  let a = store.current;

  if (
    generating &&
    !a
  ) {
    attemptStart(
      id,
      'dom-mutation-fallback'
    );

    store = loadAttemptState(id);
    a = store.current;
  }

  if (a) {
    if (!a.domStats) {
      a.domStats = {
        observerEvents:0,
        assistantChanges:0,
        generationStarts:0,
        generationStops:0,
        lastAssistantCount:null,
        lastAssistantChars:null,
        lastMutationAt:null,
        lastCaptureAt:null
      };
    }

    a.domStats.observerEvents++;
    a.domStats.lastMutationAt = now;

    if (
      sig.signature &&
      sig.signature !== attemptDOMLastSignature
    ) {
      a.domStats.assistantChanges++;
      a.domStats.lastAssistantCount = sig.count;
      a.domStats.lastAssistantChars = sig.chars;

      /*
        A bounded mid-generation capture makes source-family peaks visible
        without fetching a multi-megabyte conversation on every token.
      */
      if (
        now - attemptDOMLastCaptureAt > 2500
      ) {
        attemptDOMLastCaptureAt = now;
        a.domStats.lastCaptureAt = now;

        setTimeout(
          () => retryCapture(),
          100
        );
      }
    }

    if (
      attemptDOMLastGenerating === false &&
      generating
    ) {
      a.domStats.generationStarts++;
    }

    if (
      attemptDOMLastGenerating === true &&
      !generating
    ) {
      a.domStats.generationStops++;

      if (
        ['running','pending'].includes(a.status)
      ) {
        attemptGenerationEnded(id);
        attemptSchedulePostResponseCapture(id);
      }
    }

    store.current = a;
    saveAttemptState(id, store);
  }

  if (visibleHardMax()) {
    attemptMarkMax(
      id,
      'MAX banner via DOM observer'
    );
  }

  attemptDOMLastSignature = sig.signature;
  attemptDOMLastGenerating = generating;
}

function installAttemptDOMObserver() {
  if (
    attemptDOMObserver ||
    !document.body
  ) {
    return;
  }

  attemptDOMLastGenerating =
    visibleGenerationActive();

  attemptDOMLastSignature =
    attemptDOMAssistantSignature().signature;

  attemptDOMObserver = new MutationObserver(
    mutations => {
      if (!attemptMutationRelevant(mutations)) {
        return;
      }

      clearTimeout(attemptDOMTimer);

      attemptDOMTimer = setTimeout(
        attemptHandleDOMMutation,
        100
      );
    }
  );

  attemptDOMObserver.observe(
    document.body,
    {
      childList:true,
      subtree:true,
      characterData:true,
      attributes:true,
      attributeFilter:[
        'data-testid',
        'aria-label',
        'aria-busy',
        'disabled'
      ]
    }
  );
}

function attemptDOMSummary(a) {
  const d = a?.domStats;

  if (!d) return '—';

  return (
    `${d.observerEvents || 0} observer events · ` +
    `${d.assistantChanges || 0} assistant changes · ` +
    `${d.generationStarts || 0} starts / ` +
    `${d.generationStops || 0} stops`
  );
}


function installWebSocketHook() {
  if (websocketHooked) return;
  websocketHooked = true;

  try {
    const OriginalWebSocket = page.WebSocket;

    if (typeof OriginalWebSocket !== 'function') {
      return;
    }

    const WrappedWebSocket = new Proxy(
      OriginalWebSocket,
      {
        construct(target, args) {
          const ws = Reflect.construct(
            target,
            args,
            target
          );

          const url = String(
            args?.[0] ||
            ws.url ||
            ''
          );

          try {
            const originalSend = ws.send;

            ws.send = function(data) {
              try {
                attemptRecordTransportEvent(
                  chatIdFromURL(),
                  'websocket',
                  'out',
                  url,
                  data
                );
              } catch {}

              return originalSend.call(this, data);
            };

            ws.addEventListener(
              'message',
              ev => {
                try {
                  attemptRecordTransportEvent(
                    chatIdFromURL(),
                    'websocket',
                    'in',
                    url,
                    ev.data
                  );
                } catch {}
              }
            );
          } catch {}

          return ws;
        }
      }
    );

    page.WebSocket = WrappedWebSocket;
  } catch (e) {
    console.warn(
      '[Chat Size V2.20] Could not hook WebSocket:',
      e
    );
  }
}


function attemptURLParts(url) {
  try {
    const u = new URL(String(url || ''), location.origin);
    return {
      href: u.href,
      pathname: u.pathname,
      search: u.search || ''
    };
  } catch {
    return {
      href: String(url || ''),
      pathname: String(url || '').split('?')[0],
      search: ''
    };
  }
}

function attemptRequestPath(url) {
  return attemptURLParts(url).pathname || '';
}

function attemptBodyBytes(body) {
  if (typeof body === 'string') {
    try {
      return new TextEncoder().encode(body).length;
    } catch {
      return body.length;
    }
  }

  if (body instanceof URLSearchParams) {
    const s = body.toString();
    try {
      return new TextEncoder().encode(s).length;
    } catch {
      return s.length;
    }
  }

  if (body && typeof body.size === 'number') {
    return Number(body.size) || null;
  }

  return null;
}

function attemptParseJSONBody(body) {
  if (typeof body !== 'string') return null;

  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function attemptGenerationBodyHints(parsed) {
  if (!parsed || typeof parsed !== 'object') return false;

  const action = String(parsed.action || '').toLowerCase();

  if (
    ['next', 'continue', 'variant', 'retry', 'edit'].includes(action)
  ) {
    return true;
  }

  if (Array.isArray(parsed.messages) && parsed.messages.length) {
    return true;
  }

  if (
    parsed.parent_message_id &&
    (
      parsed.model ||
      parsed.websocket_request_id ||
      parsed.conversation_mode ||
      parsed.history_and_training_disabled !== undefined
    )
  ) {
    return true;
  }

  return false;
}

function attemptIsGenerationRequest(
  url,
  method,
  parsedBody = null
) {
  const m = String(method || 'GET').toUpperCase();

  if (m !== 'POST') return false;

  const path = attemptRequestPath(url);

  if (
    /\/conversation\/prepare$/i.test(path)
  ) {
    return false;
  }

  if (
    path.includes('/backend-api/conversations/batch')
  ) {
    return false;
  }

  /*
    The normal ChatGPT send/regenerate request uses a POST to the
    conversation endpoint. For exact root /conversation POSTs, the URL
    alone is strong enough. For id-suffixed conversation URLs, require
    generation-shaped body fields so title/update requests are ignored.
  */
  if (
    /\/backend-api\/conversation$/i.test(path) ||
    /\/conversation$/i.test(path)
  ) {
    return true;
  }

  if (
    /\/conversation(?:\/|$)/i.test(path) &&
    attemptGenerationBodyHints(parsedBody)
  ) {
    return true;
  }

  return false;
}

function attemptTextFromContent(value) {
  if (value == null) return '';

  if (typeof value === 'string') return value;

  if (Array.isArray(value)) {
    return value
      .map(attemptTextFromContent)
      .filter(Boolean)
      .join('\n');
  }

  if (typeof value !== 'object') return '';

  if (Array.isArray(value.parts)) {
    return value.parts
      .map(part => {
        if (typeof part === 'string') return part;
        if (
          part &&
          typeof part === 'object' &&
          typeof part.text === 'string'
        ) {
          return part.text;
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }

  if (typeof value.text === 'string') {
    return value.text;
  }

  return '';
}

function attemptPromptCharsFromRequest(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;

  const messages = Array.isArray(parsed.messages)
    ? parsed.messages
    : [];

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const role =
      msg?.author?.role ||
      msg?.role ||
      msg?.message?.author?.role ||
      null;

    if (role && role !== 'user') continue;

    const text =
      attemptTextFromContent(msg?.content) ||
      attemptTextFromContent(msg?.message?.content);

    if (text) return text.length;
  }

  return null;
}

function attemptFindEffortValue(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;

  const direct = [
    parsed.reasoning_effort,
    parsed.thinking_effort,
    parsed.effort,
    parsed.thinking_level,
    parsed.reasoning?.effort,
    parsed.metadata?.reasoning_effort,
    parsed.metadata?.thinking_effort
  ];

  for (const v of direct) {
    if (
      typeof v === 'string' ||
      typeof v === 'number'
    ) {
      return String(v);
    }
  }

  return null;
}

function attemptRequestMeta(url, method, body) {
  const parsed = attemptParseJSONBody(body);
  const path = attemptRequestPath(url);

  return {
    requestDetectedAt: Date.now(),
    requestURL: String(url || '').slice(0, 600),
    requestPath: path,
    requestMethod: String(method || 'GET').toUpperCase(),
    requestBodyBytes: attemptBodyBytes(body),
    requestAction:
      parsed && parsed.action != null
        ? String(parsed.action)
        : null,
    requestModel:
      parsed && parsed.model != null
        ? String(parsed.model)
        : null,
    requestEffort: attemptFindEffortValue(parsed),
    requestPromptChars: attemptPromptCharsFromRequest(parsed),
    requestConversationId:
      parsed?.conversation_id ??
      parsed?.conversationId ??
      null,
    requestParentMessageId:
      parsed?.parent_message_id ??
      parsed?.parentMessageId ??
      null,
    requestKeys:
      parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? Object.keys(parsed).slice(0, 80)
        : [],
    requestParsed: Boolean(parsed)
  };
}

function attemptSameRequest(a, meta) {
  if (!a || !meta) return false;

  return (
    a.requestPath &&
    meta.requestPath &&
    a.requestPath === meta.requestPath &&
    Math.abs(
      Number(meta.requestDetectedAt || 0) -
      Number(a.requestDetectedAt || a.startedAt || 0)
    ) < 2500
  );
}

function attemptFinalizeUnknownCurrent(
  id,
  reason = 'superseded'
) {
  const store = loadAttemptState(id);
  const a = store.current;

  if (!a) return;

  a.status = 'unknown';
  a.outcome = 'unknown';
  a.unknownReason = reason;
  a.finalizedAt = Date.now();

  attemptFinalize(store, a);
  saveAttemptState(id, store);
}

function attemptApplyRequestMeta(id, meta) {
  const store = loadAttemptState(id);
  const a = store.current;

  if (!a) return;

  Object.assign(a, {
    requestDetectedAt:
      meta.requestDetectedAt ??
      a.requestDetectedAt ??
      Date.now(),
    requestURL:
      meta.requestURL ??
      a.requestURL ??
      null,
    requestPath:
      meta.requestPath ??
      a.requestPath ??
      null,
    requestMethod:
      meta.requestMethod ??
      a.requestMethod ??
      null,
    requestBodyBytes:
      meta.requestBodyBytes ??
      a.requestBodyBytes ??
      null,
    requestAction:
      meta.requestAction ??
      a.requestAction ??
      null,
    requestModel:
      meta.requestModel ??
      a.requestModel ??
      null,
    requestEffort:
      meta.requestEffort ??
      a.requestEffort ??
      null,
    requestPromptChars:
      meta.requestPromptChars ??
      a.requestPromptChars ??
      null,
    requestConversationId:
      meta.requestConversationId ??
      a.requestConversationId ??
      null,
    requestParentMessageId:
      meta.requestParentMessageId ??
      a.requestParentMessageId ??
      null,
    requestKeys:
      Array.isArray(meta.requestKeys) && meta.requestKeys.length
        ? meta.requestKeys
        : a.requestKeys || [],
    requestParsed:
      Boolean(meta.requestParsed || a.requestParsed)
  });

  if (a.requestPromptChars != null) {
    a.promptChars = a.requestPromptChars;
  }

  if (a.requestModel) {
    a.requestModelDetected = a.requestModel;
  }

  if (a.requestEffort) {
    a.requestEffortDetected = a.requestEffort;
  }

  store.current = a;
  saveAttemptState(id, store);
}

function attemptStartFromNetwork(id, meta) {
  if (!id) return null;

  let store = loadAttemptState(id);
  let current = store.current;

  if (current) {
    const recentFallback =
      current.trigger === 'dom-generation-fallback' &&
      Date.now() - Number(current.startedAt || 0) < 2500;

    if (
      recentFallback ||
      attemptSameRequest(current, meta)
    ) {
      attemptApplyRequestMeta(id, meta);
      return loadAttemptState(id).current;
    }

    if (
      ['running','pending'].includes(current.status)
    ) {
      attemptFinalizeUnknownCurrent(
        id,
        'superseded by a newer real generation dispatch'
      );
    }
  }

  attemptStart(id, 'network-generation-dispatch');
  attemptApplyRequestMeta(id, meta);

  const preflight = attemptTakeRecentPreflight(id, 30000);

  store = loadAttemptState(id);
  current = store.current;

  if (current) {
    current.preflight = preflight;
    current.lastNetworkActivityAt = Date.now();
    store.current = current;
    saveAttemptState(id, store);
  }

  return loadAttemptState(id).current;
}

function attemptEnrichRequestBody(id, url, method, body) {
  const parsed = attemptParseJSONBody(body);

  if (
    !attemptIsGenerationRequest(url, method, parsed)
  ) {
    return false;
  }

  const meta = attemptRequestMeta(url, method, body);
  attemptStartFromNetwork(id, meta);
  return true;
}

function attemptInspectOutgoingRequest(
  url,
  method,
  body,
  requestObject = null
) {
  const id = chatIdFromURL();
  if (!id) return false;

  const parsed = attemptParseJSONBody(body);

  if (
    attemptIsPreflightRequest(
      url,
      method,
      parsed
    )
  ) {
    attemptRecordPreflightRequest(
      id,
      url,
      method,
      body
    );

    return false;
  }

  if (
    !attemptIsGenerationRequest(
      url,
      method,
      parsed
    )
  ) {
    return false;
  }

  const meta = attemptRequestMeta(
    url,
    method,
    body
  );

  attemptStartFromNetwork(id, meta);

  if (
    typeof body !== 'string' &&
    requestObject &&
    typeof requestObject.clone === 'function'
  ) {
    try {
      const cloned = requestObject.clone();

      Promise.resolve(cloned.text())
        .then(text => {
          if (typeof text === 'string' && text) {
            attemptEnrichRequestBody(
              id,
              url,
              method,
              text
            );
          }
        })
        .catch(() => {});
    } catch {}
  }

  return true;
}

function attemptRequestMatches(a, url) {
  if (!a?.requestPath) return false;
  return a.requestPath === attemptRequestPath(url);
}

function attemptLooksLikeMaxErrorText(text) {
  const sample = String(text || '')
    .slice(0, 250000)
    .toLowerCase();

  return (
    sample.includes(
      "you've reached the maximum length for this conversation"
    ) ||
    sample.includes(
      'you have reached the maximum length for this conversation'
    ) ||
    sample.includes('maximum length for this conversation') ||
    sample.includes('conversation is too long') ||
    sample.includes('conversation_too_long')
  );
}

function attemptSchedulePostResponseCapture(id) {
  clearTimeout(attemptFinalizeTimer);
  clearTimeout(attemptUnknownTimer);

  setTimeout(() => retryCapture(), 250);
  setTimeout(() => retryCapture(), 1200);
  setTimeout(() => retryCapture(), 3200);

  attemptUnknownTimer = setTimeout(() => {
    const store = loadAttemptState(id);
    const a = store.current;

    if (a?.status === 'pending') {
      a.status = 'unknown';
      a.outcome = 'unknown';
      a.unknownReason =
        'generation response completed but no assistant progress or MAX was confirmed';
      a.finalizedAt = Date.now();

      attemptFinalize(store, a);
      saveAttemptState(id, store);
    }
  }, 12000);
}

function attemptObserveGenerationResponse(
  id,
  url,
  response,
  text,
  payloadBytes
) {
  if (!id) return;

  if (
    /\/conversation\/prepare$/i.test(
      attemptRequestPath(url)
    )
  ) {
    return;
  }

  const store = loadAttemptState(id);
  const a = store.current;

  if (
    !a ||
    !['running', 'pending'].includes(a.status) ||
    !attemptRequestMatches(a, url)
  ) {
    return;
  }

  a.responseObservedAt = Date.now();
  a.responseCompletedAt = Date.now();
  a.responseStatus =
    response && Number.isFinite(Number(response.status))
      ? Number(response.status)
      : a.responseStatus ?? null;
  a.responseContentType =
    response?.headers?.get?.('content-type') ||
    a.responseContentType ||
    null;
  a.responseBytes =
    nullableNumber(payloadBytes) ??
    a.responseBytes ??
    null;

  const maxText = attemptLooksLikeMaxErrorText(text);
  a.responseMaxTextDetected = maxText;

  store.current = a;
  saveAttemptState(id, store);

  if (maxText) {
    attemptMarkMax(
      id,
      'generation response MAX/error text'
    );
    return;
  }

  attemptGenerationEnded(id);
  attemptSchedulePostResponseCapture(id);
}

function attemptObserveXHRGenerationResponse(
  id,
  url,
  status,
  contentType,
  text,
  payloadBytes
) {
  const fakeResponse = {
    status,
    headers: {
      get(name) {
        return String(name).toLowerCase() === 'content-type'
          ? contentType || ''
          : '';
      }
    }
  };

  attemptObserveGenerationResponse(
    id,
    url,
    fakeResponse,
    text,
    payloadBytes
  );
}


// ============================================================
// Install page network hooks at document-start
// ============================================================

function installNetworkHooks() {
  if (networkHooked) return;
  networkHooked = true;

  installWebSocketHook();

  try {
    const originalFetch = page.fetch;

    if (typeof originalFetch === 'function') {
      page.fetch = function(...args) {
        let url = '';
        let method = 'GET';
        let body = null;
        let requestObject = null;

        try {
          requestObject =
            args[0] &&
            typeof args[0] === 'object'
              ? args[0]
              : null;

          url =
            typeof args[0] === 'string'
              ? args[0]
              : args[0]?.url || '';

          method =
            String(
              args[1]?.method ||
              args[0]?.method ||
              'GET'
            ).toUpperCase();

          body =
            args[1]?.body ??
            null;
        } catch {}

        /*          V2.19 primary attempt-start signal.
          This runs synchronously before originalFetch.
        */
        attemptInspectOutgoingRequest(
          url,
          method,
          body,
          requestObject
        );

        /*
          Preserve the original V2.10.1.1 request-body message merge.
        */
        inspectRequestBody(
          url,
          args[1]
        );

        const promise = originalFetch.apply(
          this,
          args
        );

        Promise.resolve(promise)
          .then(resp => {
            attemptInspectResponseStream(
              resp,
              url
            );

            inspectResponse(
              resp,
              url
            );
          })
          .catch(() => {});

        return promise;
      };
    }
  } catch (e) {
    console.warn(
      '[Chat Size V2.21] Could not hook fetch:',
      e
    );
  }

  try {
    const XHR = page.XMLHttpRequest;

    if (XHR?.prototype) {
      const originalOpen = XHR.prototype.open;
      const originalSend = XHR.prototype.send;

      XHR.prototype.open = function(
        method,
        url,
        ...rest
      ) {
        try {
          this.__cgptMeterURL = String(url || '');
          this.__cgptMeterMethod = String(method || '');
        } catch {}

        return originalOpen.call(
          this,
          method,
          url,
          ...rest
        );
      };

      XHR.prototype.send = function(body) {
        try {
          attemptInspectOutgoingRequest(
            this.__cgptMeterURL,
            this.__cgptMeterMethod,
            body,
            null
          );

          if (
            interestingURL(this.__cgptMeterURL) &&
            typeof body === 'string'
          ) {
            inspectRequestBody(
              this.__cgptMeterURL,
              {
                body,
                method: this.__cgptMeterMethod
              }
            );
          }

          this.addEventListener(
            'load',
            () => {
              try {
                if (
                  !interestingURL(
                    this.__cgptMeterURL
                  )
                ) {
                  return;
                }

                const text =
                  typeof this.responseText === 'string'
                    ? this.responseText
                    : '';

                if (!text) return;

                let payloadBytes = null;

                try {
                  payloadBytes =
                    new TextEncoder().encode(text).length;
                } catch {
                  payloadBytes = text.length;
                }

                const id = chatIdFromURL();

                attemptRecordNetworkEvent(
                  id,
                  this.__cgptMeterURL,
                  payloadBytes,
                  this.getResponseHeader?.('content-type') || ''
                );

                attemptObserveXHRGenerationResponse(
                  id,
                  this.__cgptMeterURL,
                  Number(this.status) || 0,
                  this.getResponseHeader?.('content-type') || '',
                  text,
                  payloadBytes
                );

                const trimmed = text.trim();

                if (
                  trimmed.startsWith('{') ||
                  trimmed.startsWith('[')
                ) {
                  try {
                    inspectJSON(
                      JSON.parse(trimmed),
                      this.__cgptMeterURL
                    );
                    return;
                  } catch {}
                }

                inspectSSE(
                  text,
                  this.__cgptMeterURL
                );
              } catch {}
            }
          );
        } catch {}

        return originalSend.call(
          this,
          body
        );
      };
    }
  } catch (e) {
    console.warn(
      '[Chat Size V2.21] Could not hook XHR:',
      e
    );
  }
}

installNetworkHooks();


// ============================================================
// Direct capture attempts
// ============================================================

async function tryDirectURL(url) {
  try {
    const resp = await page.fetch(
      url,
      {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          Accept: 'application/json, text/plain, */*'
        }
      }
    );

    await inspectResponse(resp, url);

    return resp.ok;
  } catch {
    return false;
  }
}

async function retryCapture() {
  const id = chatIdFromURL();
  if (!id) return false;

  const before = loadSnapshot(id);
  const beforeTime = Number(before.fullCapturedAt) || 0;

  function freshFullSnapshot() {
    const snap = loadSnapshot(id);

    return Boolean(
      snap.full &&
      Number(snap.fullCapturedAt) > beforeTime
    );
  }

  const encoded = encodeURIComponent(id);

  const urls = [
    `/backend-api/conversation/${encoded}`,
    `/backend-api/conversation/${encoded}?include_messages=true`
  ];

  for (const url of urls) {
    await tryDirectURL(url);

    if (freshFullSnapshot()) {
      scheduleUpdate();
      return true;
    }
  }

  try {
    const resources = performance
      .getEntriesByType('resource')
      .map(x => x.name)
      .filter(interestingURL);

    for (const url of [...new Set(resources)].slice(-20)) {
      if (
        url.includes(id) &&
        url.startsWith(location.origin)
      ) {
        await tryDirectURL(url);

        if (freshFullSnapshot()) {
          scheduleUpdate();
          return true;
        }
      }
    }
  } catch {}

  scheduleUpdate();
  return false;
}


// ============================================================
// Stats
// ============================================================

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}


function nullableNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}


function tokenEstimateForChars(chars) {
  const n = safeNumber(chars);
  return n == null ? null : estimateTokens(n);
}

function compactCounts(obj, limit = 7) {
  if (!obj || typeof obj !== 'object') return '—';

  const entries = Object.entries(obj)
    .sort((a, b) => Number(b[1]) - Number(a[1]));

  if (!entries.length) return '—';

  const shown = entries
    .slice(0, limit)
    .map(([k, v]) => `${k}:${v}`);

  if (entries.length > limit) {
    shown.push(`+${entries.length - limit} more`);
  }

  return shown.join(', ');
}

function compactByteCounts(obj, limit = 7) {
  if (!obj || typeof obj !== 'object') return '—';

  const entries = Object.entries(obj)
    .sort((a, b) => Number(b[1]) - Number(a[1]));

  if (!entries.length) return '—';

  const shown = entries
    .slice(0, limit)
    .map(([k, v]) => `${k}:${fmt(Number(v) || 0)}B`);

  if (entries.length > limit) {
    shown.push(`+${entries.length - limit} more`);
  }

  return shown.join(', ');
}

function compactBranchDetails(details, limit = 8) {
  if (!Array.isArray(details) || !details.length) return '—';

  const shown = details.slice(-limit).map(x => {
    return (
      `d${x.depth}:` +
      `${x.children}ch/` +
      `${x.alternateChildren}alt/` +
      `${x.alternateSubtreeNodes}nodes`
    );
  });

  if (details.length > limit) {
    shown.unshift(`+${details.length - limit} earlier`);
  }

  return shown.join(', ');
}

function describeLargest(record) {
  if (!record || !Number.isFinite(Number(record.bytes))) return '—';

  const parts = [
    `${fmt(Number(record.bytes))} B`,
    record.role || 'unknown',
    record.contentType || 'unknown'
  ];

  if (record.toolName) {
    parts.push(record.toolName);
  }

  return parts.join(' · ');
}

function calculateStats() {
  const id = chatIdFromURL();
  const snap = loadSnapshot(id);
  const diag = loadDiagnostic(id) || {};
  const structure = snap.structure || {};
  const topology = structure.contextTopology || null;
  const retainedState = topology?.retainedState || null;
  const experimentalRisk = v213AssessRisk(retainedState);
  const lifecycle = loadLifecycle(id);
  const lifecycleGeneratingNow = visibleGenerationActive();

  const lifecycleDirect = lifecycle.families?.direct || blankLifecycleFamily();
  const lifecycleBatch = lifecycle.families?.batch || blankLifecycleFamily();
  const lifecycleOther = lifecycle.families?.other || blankLifecycleFamily();

  const lifecycleCurrentSourceFamily =
    lifecycle.lastObservation?.sourceFamily ||
    lifecycleSourceFamily(lifecycle.lastObservation?.source || '');

  const canonicalDirectStable = lifecycleDirect.lastStable || null;
  const canonicalDirectRetainedBytes =
    nullableNumber(canonicalDirectStable?.retainedBytes);

  const canonicalDirectRiskBand =
    v215BandFromRetainedBytes(canonicalDirectRetainedBytes);

  const canonicalDirectRiskAvailable =
    canonicalDirectRiskBand !== 'unknown';

  const attemptState = loadAttemptState(id);
  const runtimeAttempt = attemptState.current || attemptState.last || null;

  const chars = snap.records.reduce(
    (sum, r) => sum + (r.chars || 0),
    0
  );

  const userMessages = snap.records.filter(
    r => r.role === 'user'
  ).length;

  const assistantMessages = snap.records.filter(
    r => r.role === 'assistant'
  ).length;

  const samples = loadVerifiedMaxSamples();
  const sampleTokens = samples
    .map(x => Number(x.archiveTokens))
    .filter(Number.isFinite);

  const activeAllTextChars =
    safeNumber(structure.activeAllTextChars) ?? chars;

  const activeRoleBasedTextChars =
    safeNumber(structure.activeDisplayTextChars) ?? chars;

  const activeDisplayLikeTextChars =
    safeNumber(structure.activeDisplayLikeTextChars) ??
    activeRoleBasedTextChars;

  const activeHiddenTextChars =
    safeNumber(structure.activeHiddenTextChars) ??
    Math.max(0, activeAllTextChars - activeRoleBasedTextChars);

  return {
    id,
    full: !!snap.full,
    source: snap.source,
    capturedAt: snap.capturedAt,
    fullCapturedAt: snap.fullCapturedAt,

    // Legacy role-based user/assistant text on active ancestry.
    chars: activeRoleBasedTextChars,
    tokens: tokenEstimateForChars(activeRoleBasedTextChars),
    messages: snap.records.length,
    userMessages,
    assistantMessages,

    // Heuristic display-like text (excludes known thoughts/recaps/tool outputs).
    activeDisplayLikeMessages: safeNumber(structure.activeDisplayLikeMessages),
    activeDisplayLikeTextChars,
    activeDisplayLikeTextTokens: tokenEstimateForChars(activeDisplayLikeTextChars),

    // Active branch diagnostics.
    activeBranchNodes: safeNumber(structure.activeBranchNodes),
    activeMessageNodes: safeNumber(structure.activeMessageNodes),
    activeDisplayMessages: safeNumber(structure.activeDisplayMessages),
    activeAllTextChars,
    activeAllTextTokens: tokenEstimateForChars(activeAllTextChars),
    activeHiddenMessageNodes: safeNumber(structure.activeHiddenMessageNodes),
    activeHiddenTextChars,
    activeHiddenTextTokens: tokenEstimateForChars(activeHiddenTextChars),
    activeEmptyMessageNodes: safeNumber(structure.activeEmptyMessageNodes),

    activeExplicitToolRoleNodes: safeNumber(structure.activeExplicitToolRoleNodes),
    activeToolishNodes: safeNumber(structure.activeToolishNodes),
    activeToolCallNodes: safeNumber(structure.activeToolCallNodes),
    activeToolResultNodes: safeNumber(structure.activeToolResultNodes),
    activeToolCallBytes: safeNumber(structure.activeToolCallBytes),
    activeToolResultBytes: safeNumber(structure.activeToolResultBytes),
    activeToolCallNames: structure.activeToolCallNames || null,
    activeToolResultNames: structure.activeToolResultNames || null,
    activeRecipientCounts: structure.activeRecipientCounts || null,

    activeContextLikeNodes: safeNumber(structure.activeContextLikeNodes),
    activeAttachmentNodes: safeNumber(structure.activeAttachmentNodes),
    activeImageNodes: safeNumber(structure.activeImageNodes),
    activeFileNodes: safeNumber(structure.activeFileNodes),
    activeAudioNodes: safeNumber(structure.activeAudioNodes),
    activeVideoNodes: safeNumber(structure.activeVideoNodes),

    activeImageGenCallNodes: safeNumber(structure.activeImageGenCallNodes),
    activeImageGenResultNodes: safeNumber(structure.activeImageGenResultNodes),
    activeGeneratedImageNodes: safeNumber(structure.activeGeneratedImageNodes),
    activeUploadedImageNodes: safeNumber(structure.activeUploadedImageNodes),

    activeUniqueAssetIds: safeNumber(structure.activeUniqueAssetIds),
    activeUniqueImageAssetIds: safeNumber(structure.activeUniqueImageAssetIds),
    activeUniqueFileAssetIds: safeNumber(structure.activeUniqueFileAssetIds),
    activeUniqueGeneratedImageAssetIds:
      safeNumber(structure.activeUniqueGeneratedImageAssetIds),
    activeUniqueUploadedImageAssetIds:
      safeNumber(structure.activeUniqueUploadedImageAssetIds),
    activeImageReferenceOccurrences:
      safeNumber(structure.activeImageReferenceOccurrences),
    activeFileReferenceOccurrences:
      safeNumber(structure.activeFileReferenceOccurrences),

    activeAssetNodeBytes: safeNumber(structure.activeAssetNodeBytes),
    activeImageNodeBytes: safeNumber(structure.activeImageNodeBytes),
    activeFileNodeBytes: safeNumber(structure.activeFileNodeBytes),

    activeModelCounts: structure.activeModelCounts || null,
    activeGpt6ProMessageNodes: safeNumber(structure.activeGpt6ProMessageNodes),
    activeRoleCounts: structure.activeRoleCounts || null,
    activeContentTypeCounts: structure.activeContentTypeCounts || null,
    activeNodeBytesByRole: structure.activeNodeBytesByRole || null,
    activeNodeBytesByContentType: structure.activeNodeBytesByContentType || null,
    activeLargestNode: structure.activeLargestNode || null,
    activeLargestToolResult: structure.activeLargestToolResult || null,
    activeLargestImageNode: structure.activeLargestImageNode || null,

    activeBranchSerializedBytes: safeNumber(structure.activeBranchSerializedBytes),

    // Whole mapping / branch topology.
    mappingNodes:
      safeNumber(structure.mappingNodes) ??
      safeNumber(diag.mappingNodes),
    offBranchNodes: safeNumber(structure.offBranchNodes),
    leafNodes: safeNumber(structure.leafNodes),
    branchPoints: safeNumber(structure.branchPoints),
    maxChildren: safeNumber(structure.maxChildren),

    activeBranchPoints: safeNumber(structure.activeBranchPoints),
    activeBranchPointDepths: structure.activeBranchPointDepths || null,
    lastBranchPointDepth: safeNumber(structure.lastBranchPointDepth),
    nodesSinceLastBranchPoint: safeNumber(structure.nodesSinceLastBranchPoint),
    alternateSubtreeNodesTotal: safeNumber(structure.alternateSubtreeNodesTotal),
    alternateSubtreeNodesMax: safeNumber(structure.alternateSubtreeNodesMax),
    branchPointDetails: structure.branchPointDetails || null,

    mappingMessageNodes: safeNumber(structure.mappingMessageNodes),
    mappingEmptyMessageNodes: safeNumber(structure.mappingEmptyMessageNodes),
    mappingAllTextChars: safeNumber(structure.mappingAllTextChars),
    mappingDisplayTextChars: safeNumber(structure.mappingDisplayTextChars),
    mappingDisplayLikeTextChars: safeNumber(structure.mappingDisplayLikeTextChars),
    mappingHiddenMessageNodes: safeNumber(structure.mappingHiddenMessageNodes),
    mappingHiddenTextChars: safeNumber(structure.mappingHiddenTextChars),

    mappingExplicitToolRoleNodes: safeNumber(structure.mappingExplicitToolRoleNodes),
    mappingToolishNodes: safeNumber(structure.mappingToolishNodes),
    mappingToolCallNodes: safeNumber(structure.mappingToolCallNodes),
    mappingToolResultNodes: safeNumber(structure.mappingToolResultNodes),
    mappingToolCallBytes: safeNumber(structure.mappingToolCallBytes),
    mappingToolResultBytes: safeNumber(structure.mappingToolResultBytes),
    mappingToolCallNames: structure.mappingToolCallNames || null,
    mappingToolResultNames: structure.mappingToolResultNames || null,
    mappingRecipientCounts: structure.mappingRecipientCounts || null,

    mappingContextLikeNodes: safeNumber(structure.mappingContextLikeNodes),
    mappingAttachmentNodes: safeNumber(structure.mappingAttachmentNodes),
    mappingImageNodes: safeNumber(structure.mappingImageNodes),
    mappingFileNodes: safeNumber(structure.mappingFileNodes),
    mappingAudioNodes: safeNumber(structure.mappingAudioNodes),
    mappingVideoNodes: safeNumber(structure.mappingVideoNodes),

    mappingImageGenCallNodes: safeNumber(structure.mappingImageGenCallNodes),
    mappingImageGenResultNodes: safeNumber(structure.mappingImageGenResultNodes),
    mappingGeneratedImageNodes: safeNumber(structure.mappingGeneratedImageNodes),
    mappingUploadedImageNodes: safeNumber(structure.mappingUploadedImageNodes),

    mappingUniqueAssetIds: safeNumber(structure.mappingUniqueAssetIds),
    mappingUniqueImageAssetIds: safeNumber(structure.mappingUniqueImageAssetIds),
    mappingUniqueFileAssetIds: safeNumber(structure.mappingUniqueFileAssetIds),
    mappingUniqueGeneratedImageAssetIds:
      safeNumber(structure.mappingUniqueGeneratedImageAssetIds),
    mappingUniqueUploadedImageAssetIds:
      safeNumber(structure.mappingUniqueUploadedImageAssetIds),
    mappingImageReferenceOccurrences:
      safeNumber(structure.mappingImageReferenceOccurrences),
    mappingFileReferenceOccurrences:
      safeNumber(structure.mappingFileReferenceOccurrences),

    mappingAssetNodeBytes: safeNumber(structure.mappingAssetNodeBytes),
    mappingImageNodeBytes: safeNumber(structure.mappingImageNodeBytes),
    mappingFileNodeBytes: safeNumber(structure.mappingFileNodeBytes),

    mappingModelCounts: structure.mappingModelCounts || null,
    mappingGpt6ProMessageNodes: safeNumber(structure.mappingGpt6ProMessageNodes),
    mappingRoleCounts: structure.mappingRoleCounts || null,
    mappingContentTypeCounts: structure.mappingContentTypeCounts || null,
    mappingNodeBytesByRole: structure.mappingNodeBytesByRole || null,
    mappingNodeBytesByContentType: structure.mappingNodeBytesByContentType || null,
    mappingLargestNode: structure.mappingLargestNode || null,
    mappingLargestToolResult: structure.mappingLargestToolResult || null,
    mappingLargestImageNode: structure.mappingLargestImageNode || null,

    mappingSerializedBytes: safeNumber(structure.mappingSerializedBytes),


    topologySnapshotPresent: Boolean(topology),
    topologyOk: topology?.ok !== false,
    topologyError: topology?.error || null,

    currentDepth: nullableNumber(topology?.currentDepth),
    currentModel: topology?.currentModel || null,
    modelSegments: topology?.modelSegments || null,
    modelSegmentCount: nullableNumber(topology?.modelSegmentCount),
    gpt6ProSegmentCount: nullableNumber(topology?.gpt6ProSegmentCount),
    longestGpt6ProSegment: topology?.longestGpt6ProSegment || null,
    latestGpt6ProSegment: topology?.latestGpt6ProSegment || null,

    gpt6ProDepthCount: nullableNumber(topology?.gpt6ProDepthCount),
    gpt6ProDepths: topology?.gpt6ProDepths || null,
    firstGpt6ProDepth: nullableNumber(topology?.firstGpt6ProDepth),
    lastGpt6ProDepth: nullableNumber(topology?.lastGpt6ProDepth),
    nodesSinceLastGpt6Pro: nullableNumber(topology?.nodesSinceLastGpt6Pro),

    imageGenDepthCount: nullableNumber(topology?.imageGenDepthCount),
    imageGenDepths: topology?.imageGenDepths || null,
    generatedImageDepthCount: nullableNumber(topology?.generatedImageDepthCount),
    generatedImageDepths: topology?.generatedImageDepths || null,
    lastImageGenDepth: nullableNumber(topology?.lastImageGenDepth),
    nodesSinceLastImageGen: nullableNumber(topology?.nodesSinceLastImageGen),

    strongContextMarkerCount: nullableNumber(topology?.strongContextMarkerCount),
    strongContextMarkerDepths: topology?.strongContextMarkerDepths || null,
    lastStrongContextMarkerDepth: nullableNumber(topology?.lastStrongContextMarkerDepth),
    nodesSinceLastStrongContextMarker:
      nullableNumber(topology?.nodesSinceLastStrongContextMarker),

    recapMarkerCount: nullableNumber(topology?.recapMarkerCount),
    recapDepths: topology?.recapDepths || null,
    nodesSinceLastRecap: nullableNumber(topology?.nodesSinceLastRecap),

    branchPointsAfterLastImageGen:
      nullableNumber(topology?.branchPointsAfterLastImageGen),
    branchPointsAfterLastGpt6Pro:
      nullableNumber(topology?.branchPointsAfterLastGpt6Pro),
    branchPointsNearImageGen32:
      nullableNumber(topology?.branchPointsNearImageGen32),
    branchPointsNearGpt6Pro32:
      nullableNumber(topology?.branchPointsNearGpt6Pro32),
    nearestBranchDistanceToLastImageGen:
      nullableNumber(topology?.nearestBranchDistanceToLastImageGen),
    nearestBranchDistanceToLastGpt6Pro:
      nullableNumber(topology?.nearestBranchDistanceToLastGpt6Pro),

    imageGenPairCount: nullableNumber(topology?.imageGenPairCount),
    imageGenUnpairedResults: nullableNumber(topology?.imageGenUnpairedResults),
    imageGenInferredCallNames: topology?.imageGenInferredCallNames || null,
    imageGenPairDistanceMin: nullableNumber(topology?.imageGenPairDistanceMin),
    imageGenPairDistanceMax: nullableNumber(topology?.imageGenPairDistanceMax),
    imageGenPairDistanceAverage:
      nullableNumber(topology?.imageGenPairDistanceAverage),

    recentWindows: topology?.recentWindows || null,
    sinceLastContext: topology?.sinceLastContext || null,


    // V2.12 retained-state profiler.
    retainedStatePresent: Boolean(retainedState),
    retainedStateOk: retainedState?.ok !== false,

    activeSpecialNodeBytes:
      nullableNumber(retainedState?.activeSpecialNodeBytes),
    activeSpecialSharePercent:
      nullableNumber(retainedState?.activeSpecialSharePercent),

    retainedStateProxyBytes:
      nullableNumber(retainedState?.retainedStateProxyBytes),
    retainedStateProxySharePercent:
      nullableNumber(retainedState?.retainedStateProxySharePercent),

    retainedActiveToolResultBytes:
      nullableNumber(retainedState?.activeToolResultBytes),
    retainedActiveImageLikeBytes:
      nullableNumber(retainedState?.activeImageLikeBytes),
    retainedActiveGpt6ProBytes:
      nullableNumber(retainedState?.activeGpt6ProBytes),

    retainedDepthBuckets100:
      retainedState?.depthBuckets100 || null,
    retainedHottestBuckets:
      retainedState?.hottestBuckets || null,
    retainedHotWindows:
      retainedState?.hotWindows || null,

    retainedBranchDetails:
      retainedState?.branchRetention?.details || null,
    retainedAlternateSubtreeBytesTotal:
      nullableNumber(
        retainedState?.branchRetention?.alternateSubtreeBytesTotal
      ),
    retainedAlternateSubtreeBytesMax:
      nullableNumber(
        retainedState?.branchRetention?.alternateSubtreeBytesMax
      ),

    retainedUniqueAssetsObserved:
      nullableNumber(
        retainedState?.assetPersistence?.uniqueAssetsObserved
      ),
    retainedImageGenAssociatedAssetIds:
      nullableNumber(
        retainedState?.assetPersistence?.imageGenAssociatedAssetIds
      ),
    retainedAssetsExistingByLastImage:
      nullableNumber(
        retainedState?.assetPersistence?.assetsExistingByLastImage
      ),
    retainedAssetsReferencedAfterLastImage:
      nullableNumber(
        retainedState?.assetPersistence?.assetsReferencedAfterLastImage
      ),
    retainedImageGenAssetsReferencedAfterLastImage:
      nullableNumber(
        retainedState?.assetPersistence?.imageGenAssetsReferencedAfterLastImage
      ),
    retainedAssetReferenceNodesAfterLastImage:
      nullableNumber(
        retainedState?.assetPersistence?.persistentAssetReferenceNodesAfterLastImage
      ),

    retainedProSegments:
      retainedState?.proSegments || null,

    retainedImageGenResultCount:
      nullableNumber(
        retainedState?.imageGenResults?.count
      ),
    retainedImageGenResultTotalBytes:
      nullableNumber(
        retainedState?.imageGenResults?.totalBytes
      ),
    retainedImageGenResultAverageBytes:
      nullableNumber(
        retainedState?.imageGenResults?.averageBytes
      ),
    retainedLargestImageGenResultBytes:
      nullableNumber(
        retainedState?.imageGenResults?.largestBytes
      ),
    retainedTopImageGenResults:
      retainedState?.imageGenResults?.top || null,


    // V2.13 experimental MAX-risk band.
    experimentalRiskAvailable:
      Boolean(experimentalRisk?.available),
    experimentalRiskBand:
      experimentalRisk?.band || 'unknown',
    experimentalRiskBaseBand:
      experimentalRisk?.baseBand || 'unknown',
    experimentalRiskElevatedByHotspot:
      Boolean(experimentalRisk?.elevatedByHotspot),
    experimentalRiskHotspot128:
      Boolean(experimentalRisk?.hotspot128),
    experimentalRiskHotspot256:
      Boolean(experimentalRisk?.hotspot256),

    experimentalDensityFlag:
      Boolean(experimentalRisk?.densityFlag),
    experimentalExtremeDensityFlag:
      Boolean(experimentalRisk?.extremeDensityFlag),
    experimentalDensityLevel:
      experimentalRisk?.densityLevel || 'unknown',
    experimentalDensityReasons:
      experimentalRisk?.densityReasons || null,

    experimentalRiskRetainedBytes:
      nullableNumber(experimentalRisk?.retainedBytes),
    experimentalRiskDeltaToObservedMaxFloorBytes:
      nullableNumber(experimentalRisk?.deltaToObservedMaxFloorBytes),
    experimentalRiskProxyShare:
      nullableNumber(experimentalRisk?.proxyShare),
    experimentalRiskHot128Bytes:
      nullableNumber(experimentalRisk?.hot128Bytes),
    experimentalRiskHot256Bytes:
      nullableNumber(experimentalRisk?.hot256Bytes),
    experimentalRiskHot512Bytes:
      nullableNumber(experimentalRisk?.hot512Bytes),
    experimentalRiskReasons:
      experimentalRisk?.reasons || null,


    lifecycleGeneratingNow,
    lifecycleCurrentSourceFamily,
    lifecycleDirect,
    lifecycleBatch,
    lifecycleOther,
    lifecycleCanonicalSource: 'direct',
    lifecycleCanonicalDirectStable: canonicalDirectStable,
    lifecycleCanonicalRetainedBytes: canonicalDirectRetainedBytes,
    lifecycleCanonicalRiskBand: canonicalDirectRiskBand,
    lifecycleCanonicalRiskAvailable: canonicalDirectRiskAvailable,
    lifecycleLastObservation: lifecycle.lastObservation || null,
    lifecycleSourceSwitches: lifecycle.sourceSwitches || null,
    lifecycleSourceSwitchCount: Array.isArray(lifecycle.sourceSwitches)
      ? lifecycle.sourceSwitches.length
      : 0,
    lifecycleMaxEventCount: Array.isArray(lifecycle.maxEvents)
      ? lifecycle.maxEvents.length
      : 0,
    lifecycleLastMaxEvent: lifecycle.lastMaxEvent || null,
    lifecycleObservations: lifecycle.observations || null,

    runtimeAttemptCurrent: attemptState.current || null,
    runtimeAttemptLast: attemptState.last || null,
    runtimeAttemptDisplay: runtimeAttempt,
    runtimeAttemptCount: Array.isArray(attemptState.attempts)
      ? attemptState.attempts.length
      : 0,
    runtimeAttemptHistory: attemptState.attempts || null,

    // Network capture sizes.
    lastPayloadBytes: safeNumber(diag.lastObservedBytes),
    maxObservedPayloadBytes: safeNumber(diag.maxObservedPayloadBytes),
    maxFullPayloadBytes:
      safeNumber(snap.maxFullPayloadBytes) ??
      safeNumber(diag.maxFullPayloadBytes),

    liveMaximum: visibleHardMax(),
    verifiedMaxSamples: samples.length,
    verifiedMaxMin: sampleTokens.length ? Math.min(...sampleTokens) : null,
    verifiedMaxMax: sampleTokens.length ? Math.max(...sampleTokens) : null
  };
}


const V215_RISK_CALIBRATION = Object.freeze({
  /*
    V2.15 PRIMARY SIGNAL
      absolute retained-state proxy bytes

    Empirical longitudinal evidence so far:
      highest confirmed healthy retained proxy: 6,826,995 B
      verified MAX sample #1 retained proxy:     7,015,394 B
      verified MAX sample #2 retained proxy:     7,293,688 B

    The primary warning bands intentionally surround that observed region.
    These values describe THIS SCRIPT'S heuristic proxy, not an OpenAI
    byte limit and not "remaining context."
  */
  lowUpperBytes:       5_000_000,
  elevatedUpperBytes:  6_000_000,
  highUpperBytes:      6_500_000,
  veryHighUpperBytes:  7_000_000,

  highestHealthyObservedBytes: 6_826_995,
  smallestObservedMaxBytes:    7_015_394,
  secondObservedMaxBytes:      7_293_688,

  // Density remains a separate advisory only.
  dense128Bytes:   1_000_000,
  dense256Bytes:   1_500_000,
  extreme128Bytes: 1_500_000,
  extreme256Bytes: 2_000_000
});

function v213RiskRank(band) {
  return ({
    unknown: -1,
    green: 0,
    yellow: 1,
    orange: 2,
    red: 3
  })[band] ?? -1;
}

function v213BandFromProxyShare(share) {
  const x = Number(share);

  if (!Number.isFinite(x)) return 'unknown';
  if (x < V215_RISK_CALIBRATION.proxyGreenUpper) return 'green';
  if (x < V215_RISK_CALIBRATION.proxyYellowUpper) return 'yellow';
  if (x < V215_RISK_CALIBRATION.proxyOrangeUpper) return 'orange';
  return 'red';
}


function v215BandFromRetainedBytes(bytes) {
  const x = Number(bytes);

  if (!Number.isFinite(x)) return 'unknown';
  if (x < V215_RISK_CALIBRATION.lowUpperBytes) return 'green';
  if (x < V215_RISK_CALIBRATION.elevatedUpperBytes) return 'yellow';
  if (x < V215_RISK_CALIBRATION.highUpperBytes) return 'orange';
  if (x < V215_RISK_CALIBRATION.veryHighUpperBytes) return 'red';
  return 'limit';
}

function v215ObservedDeltaText(retainedBytes) {
  const x = Number(retainedBytes);

  if (!Number.isFinite(x)) return 'Unavailable';

  const floor = V215_RISK_CALIBRATION.smallestObservedMaxBytes;
  const delta = floor - x;

  if (delta > 0) {
    return `${fmt(delta)}B below the smallest observed MAX sample`;
  }

  if (delta < 0) {
    return `${fmt(Math.abs(delta))}B above the smallest observed MAX sample`;
  }

  return 'equal to the smallest observed MAX sample';
}


function v213AssessRisk(retainedState) {
  if (!retainedState || retainedState.ok === false) {
    return {
      available: false,
      band: 'unknown',
      baseBand: 'unknown',

      retainedBytes: null,
      proxyShare: null,
      deltaToObservedMaxFloorBytes: null,

      hot128Bytes: null,
      hot256Bytes: null,
      hot512Bytes: null,

      hotspot128: false,
      hotspot256: false,
      densityFlag: false,
      extremeDensityFlag: false,
      densityLevel: 'unknown',

      elevatedByHotspot: false,
      reasons: ['Retained-state profiler unavailable'],
      densityReasons: []
    };
  }

  const retainedBytes =
    nullableNumber(retainedState.retainedStateProxyBytes);

  const proxyShare =
    nullableNumber(retainedState.retainedStateProxySharePercent);

  const hot128Bytes =
    nullableNumber(retainedState.hotWindows?.w128?.specialNodeBytes);

  const hot256Bytes =
    nullableNumber(retainedState.hotWindows?.w256?.specialNodeBytes);

  const hot512Bytes =
    nullableNumber(retainedState.hotWindows?.w512?.specialNodeBytes);

  /*
    V2.15 PRIMARY BAND:
    absolute retained-state proxy bytes only.
  */
  const band = v215BandFromRetainedBytes(retainedBytes);
  const baseBand = band;

  const hotspot128 =
    hot128Bytes != null &&
    hot128Bytes >= V215_RISK_CALIBRATION.dense128Bytes;

  const hotspot256 =
    hot256Bytes != null &&
    hot256Bytes >= V215_RISK_CALIBRATION.dense256Bytes;

  const extreme128 =
    hot128Bytes != null &&
    hot128Bytes >= V215_RISK_CALIBRATION.extreme128Bytes;

  const extreme256 =
    hot256Bytes != null &&
    hot256Bytes >= V215_RISK_CALIBRATION.extreme256Bytes;

  const densityFlag = hotspot128 || hotspot256;
  const extremeDensityFlag = extreme128 || extreme256;

  const densityLevel =
    extremeDensityFlag
      ? 'extreme'
      : densityFlag
        ? 'dense'
        : 'normal';

  const deltaToObservedMaxFloorBytes =
    retainedBytes == null
      ? null
      : V215_RISK_CALIBRATION.smallestObservedMaxBytes - retainedBytes;

  const reasons = [];

  if (retainedBytes != null) {
    reasons.push(
      `absolute retained proxy ${fmt(retainedBytes)}B`
    );
    reasons.push(
      v215ObservedDeltaText(retainedBytes)
    );
  }

  if (proxyShare != null) {
    reasons.push(
      `secondary share ${proxyShare.toFixed(1)}%`
    );
  }

  const densityReasons = [];

  if (hotspot128) {
    densityReasons.push(
      `128-node historical window ${fmt(hot128Bytes)}B`
    );
  }
  if (hotspot256) {
    densityReasons.push(
      `256-node historical window ${fmt(hot256Bytes)}B`
    );
  }

  if (!densityFlag) {
    densityReasons.push(
      'no dense-history advisory threshold crossed'
    );
  }

  return {
    available: band !== 'unknown',
    band,
    baseBand,

    retainedBytes,
    proxyShare,
    deltaToObservedMaxFloorBytes,

    hot128Bytes,
    hot256Bytes,
    hot512Bytes,

    hotspot128,
    hotspot256,
    extreme128,
    extreme256,
    densityFlag,
    extremeDensityFlag,
    densityLevel,

    elevatedByHotspot: false,

    reasons,
    densityReasons
  };
}

function v213RiskLabel(band) {
  return ({
    green: 'LOW',
    yellow: 'ELEVATED',
    orange: 'HIGH',
    red: 'VERY HIGH',
    limit: 'OBSERVED MAX ZONE',
    unknown: 'UNKNOWN'
  })[band] || 'UNKNOWN';
}

function v213RiskThemeClass(band) {
  return ({
    green: 'normal',
    yellow: 'large',
    orange: 'warning',
    red: 'critical',
    limit: 'critical',
    unknown: 'waiting'
  })[band] || 'waiting';
}


function v214DensityLabel(level) {
  return ({
    normal: 'NORMAL',
    dense: 'DENSE HISTORY',
    extreme: 'EXTREME HISTORY',
    unknown: 'UNKNOWN'
  })[level] || 'UNKNOWN';
}

function v214DensityExplanation(risk) {
  if (!risk) return 'Density advisory unavailable.';

  const parts = Array.isArray(risk.densityReasons)
    ? risk.densityReasons
    : [];

  return parts.join(' · ') || 'No density details available';
}


function v213RiskExplanation(risk) {
  if (!risk?.available) {
    return 'Experimental risk unavailable until a fresh V2.15 retained-state snapshot is captured.';
  }

  const parts = Array.isArray(risk.reasons)
    ? risk.reasons
    : [];

  return parts.join(' · ') || 'No primary-risk details available';
}


function getStatus(s) {
  if (s.liveMaximum) return { text:'Attempt outcome: MAX', cls:'maximum' };
  if (!s.full) return { text:'Waiting for full data', cls:'waiting' };
  const a=s.runtimeAttemptCurrent;
  if (a?.status==='running') return { text:`Attempt #${a.id}: RUNNING`, cls:'warning' };
  if (a?.status==='pending') return { text:`Attempt #${a.id}: FINALIZING`, cls:'warning' };
  const last=s.runtimeAttemptLast;
  if (last?.outcome==='max') return { text:`Last attempt #${last.id}: MAX`, cls:'warning' };
  if (last?.outcome==='success') return { text:`Last attempt #${last.id}: SUCCESS`, cls:'normal' };
  return { text:'Runtime tracker ready', cls:'normal' };
}

function statusColor(cls) {
  if (cls === 'maximum') return '#ff7777';
  if (cls === 'waiting') return '#a8b0ba';
  return '#70f3b6';
}

let uiFeedback = {
  text: '',
  type: 'ok',
  until: 0
};
let uiFeedbackTimer = null;

function showFeedback(text, type = 'ok', milliseconds = 1300) {
  uiFeedback = {
    text,
    type,
    until: Date.now() + milliseconds
  };

  clearTimeout(uiFeedbackTimer);
  render();

  uiFeedbackTimer = setTimeout(() => {
    uiFeedback = { text: '', type: 'ok', until: 0 };
    render();
  }, milliseconds);
}

function feedbackMarkup() {
  if (!uiFeedback.text || uiFeedback.until <= Date.now()) return '';

  return `
    <div class="button-feedback ${esc(uiFeedback.type)}">
      ${esc(uiFeedback.text)}
    </div>
  `;
}

function render() {
  lifecyclePollPhase();
  latest = calculateStats();
  const st = getStatus(latest);

  panel.className =
    `theme-${st.cls}` +
    (S.expanded ? ' expanded' : '');

  compact.innerHTML = `
    <div class="compact-stats">
      <div>
        ${latest.full ? '~' + fmt(latest.activeDisplayLikeTextTokens) : '—'} display-like tok
      </div>

      <div>
        ${latest.full ? fmt(latest.activeToolCallNodes ?? 0) : '—'} tool calls
      </div>

      <div>
        ${latest.lifecycleCanonicalRetainedBytes != null
          ? fmt(latest.lifecycleCanonicalRetainedBytes) + 'B DIRECT stable'
          : '— DIRECT stable'}
      </div>

      <div>source: ${esc(lifecycleFamilyLabel(latest.lifecycleCurrentSourceFamily))}</div>

      <div>attempt: ${esc(attemptStatusLabel(latest.runtimeAttemptDisplay))}</div>

      ${latest.runtimeAttemptCurrent?.status === 'running'
        ? `<div>network peak ${fmt(latest.runtimeAttemptCurrent.networkMaxBytes || 0)}B</div>`
        : ''}
    </div>

    <div class="divider"></div>

    <div class="compact-status">
      <span class="dot ${st.cls}">●</span>
      <span>${esc(st.text)}</span>
    </div>

    ${
      latest.experimentalDensityFlag
        ? `<div class="source-note density-advisory">
             ⚠ ${esc(v214DensityLabel(latest.experimentalDensityLevel))}
           </div>`
        : ''
    }

    <div class="source-note">
      ${esc(latest.full ? 'v2.22 SSE outcome + post correlation' : 'waiting for network snapshot')}
    </div>
  `;

  detail.innerHTML = `
    <div class="quick-actions">
      <button data-action="copy">Copy diagnostics</button>
      <button data-action="retry">Retry capture</button>
    </div>

    <div class="expanded-top">
      <div>
        <div class="big-number">
          ${latest.full ? '~' + fmt(latest.activeDisplayLikeTextTokens) : '—'}
        </div>
        <div class="muted">display-like text token estimate</div>
      </div>

      <div class="percent">
        ${latest.liveMaximum ? 'MAX NOW' : 'V2.22'}
      </div>
    </div>




    <div class="section-title">SSE OUTCOME + POST CORRELATION — V2.22</div>
    <div class="capture-note">
      V2.22 treats explicit SSE completion as authoritative SUCCESS.
      Post-response DIRECT/BATCH captures are optional correlation only,
      while MAX remains independently confirmed by banner/error evidence.
    </div>
    <div class="stats-grid">
      <div><div class="label">ATTEMPT NOW</div><div class="value">${
        latest.runtimeAttemptCurrent ? `#${latest.runtimeAttemptCurrent.id} ${attemptStatusLabel(latest.runtimeAttemptCurrent)}` : 'IDLE'
      }</div></div>
      <div><div class="label">LAST OUTCOME</div><div class="value">${
        latest.runtimeAttemptLast ? `#${latest.runtimeAttemptLast.id} ${attemptStatusLabel(latest.runtimeAttemptLast)}` : '—'
      }</div></div>

      <div><div class="label">OUTCOME CONFIRMED BY</div><div class="value tiny-value">${
        esc(attemptOutcomeConfirmationText(latest.runtimeAttemptDisplay))
      }</div></div>

      <div class="wide"><div class="label">POST-OUTCOME SOURCE CORRELATION</div><div class="value tiny-value">${
        esc(attemptPostCorrelationText(latest.runtimeAttemptDisplay))
      }</div></div>

      <div><div class="label">PROMPT CHARS</div><div class="value">${
        latest.runtimeAttemptDisplay?.requestPromptChars ??
        latest.runtimeAttemptDisplay?.promptChars ??
        '—'
      }</div></div>

      <div><div class="label">REQUEST BODY</div><div class="value">${
        latest.runtimeAttemptDisplay?.requestBodyBytes != null
          ? fmt(latest.runtimeAttemptDisplay.requestBodyBytes) + ' B'
          : '—'
      }</div></div>

      <div><div class="label">REQUEST METHOD</div><div class="value">${
        esc(latest.runtimeAttemptDisplay?.requestMethod || '—')
      }</div></div>

      <div><div class="label">REQUEST ACTION</div><div class="value">${
        esc(latest.runtimeAttemptDisplay?.requestAction || '—')
      }</div></div>

      <div><div class="label">REQUEST MODEL</div><div class="value tiny-value">${
        esc(
          latest.runtimeAttemptDisplay?.requestModel ||
          latest.runtimeAttemptDisplay?.preSnapshotModel ||
          '—'
        )
      }</div></div>

      <div><div class="label">REQUEST EFFORT</div><div class="value">${
        esc(
          latest.runtimeAttemptDisplay?.requestEffort ||
          latest.runtimeAttemptDisplay?.effortHint ||
          '—'
        )
      }</div></div>

      <div><div class="label">RESPONSE STATUS</div><div class="value">${
        latest.runtimeAttemptDisplay?.responseStatus ?? '—'
      }</div></div>

      <div><div class="label">RESPONSE BYTES</div><div class="value">${
        latest.runtimeAttemptDisplay?.responseBytes != null
          ? fmt(latest.runtimeAttemptDisplay.responseBytes) + ' B'
          : '—'
      }</div></div>

      <div class="wide"><div class="label">REQUEST PATH</div><div class="value tiny-value">${
        esc(latest.runtimeAttemptDisplay?.requestPath || '—')
      }</div></div>

      <div class="wide"><div class="label">REQUEST KEYS</div><div class="value tiny-value">${
        esc(
          Array.isArray(latest.runtimeAttemptDisplay?.requestKeys)
            ? latest.runtimeAttemptDisplay.requestKeys.join(', ')
            : '—'
        )
      }</div></div>

      <div class="wide"><div class="label">ATTACHED PREFLIGHT</div><div class="value tiny-value">${
        esc(attemptPreflightSummary(latest.runtimeAttemptDisplay?.preflight))
      }</div></div>

      <div class="wide"><div class="label">PREFLIGHT DISPATCH HINTS</div><div class="value tiny-value">${
        latest.runtimeAttemptDisplay?.preflight
          ? esc(JSON.stringify({
              ...(latest.runtimeAttemptDisplay.preflight.requestDispatchHints || {}),
              ...(latest.runtimeAttemptDisplay.preflight.responseDispatchHints || {})
            }))
          : '—'
      }</div></div>

      <div class="wide"><div class="label">TRANSPORT SUMMARY</div><div class="value tiny-value">${
        esc(attemptTransportSummary(latest.runtimeAttemptDisplay))
      }</div></div>

      <div class="wide"><div class="label">FETCH/SSE STREAM</div><div class="value tiny-value">${
        esc(attemptStreamSummary(latest.runtimeAttemptDisplay))
      }</div></div>

      <div class="wide"><div class="label">STREAM EVENT TYPES</div><div class="value tiny-value">${
        esc(attemptStreamEventsText(latest.runtimeAttemptDisplay,24))
      }</div></div>

      <div class="wide"><div class="label">DOM MUTATION FALLBACK</div><div class="value tiny-value">${
        esc(attemptDOMSummary(latest.runtimeAttemptDisplay))
      }</div></div>

      <div class="wide"><div class="label">RECENT TRANSPORT EVENTS</div><div class="value tiny-value">${
        esc(attemptRecentTransportText(latest.runtimeAttemptDisplay,12))
      }</div></div>

      <div class="wide"><div class="label">WEBSOCKET URLS</div><div class="value tiny-value">${
        esc(
          Array.isArray(latest.runtimeAttemptDisplay?.transportStats?.websocketURLs)
            ? latest.runtimeAttemptDisplay.transportStats.websocketURLs.join(' | ')
            : '—'
        )
      }</div></div>

      <div><div class="label">MODEL BEFORE ATTEMPT</div><div class="value tiny-value">${esc(latest.runtimeAttemptDisplay?.preSnapshotModel || '—')}</div></div>
      <div><div class="label">EFFORT HINT</div><div class="value">${esc(latest.runtimeAttemptDisplay?.effortHint || '—')}</div></div>
      <div><div class="label">NETWORK EVENTS STORED</div><div class="value">${latest.runtimeAttemptDisplay?.networkEvents?.length ?? 0}</div></div>
      <div><div class="label">NETWORK EVENTS TOTAL</div><div class="value">${attemptNetworkTotalCount(latest.runtimeAttemptDisplay)}</div></div>
      <div><div class="label">NETWORK MAX EVENT</div><div class="value">${
        latest.runtimeAttemptDisplay ? fmt(latest.runtimeAttemptDisplay.networkMaxBytes || 0)+' B' : '—'
      }</div></div>
      <div><div class="label">ATTEMPTS STORED</div><div class="value">${latest.runtimeAttemptCount ?? 0}</div></div>
      <div class="wide"><div class="label">ATTEMPT SUMMARY</div><div class="value tiny-value">${esc(attemptSummaryText(latest.runtimeAttemptDisplay))}</div></div>
      <div class="wide"><div class="label">PRE-ATTEMPT DIRECT</div><div class="value tiny-value">${esc(lifecycleObsText(latest.runtimeAttemptDisplay?.pre?.direct))}</div></div>
      <div class="wide"><div class="label">PRE-ATTEMPT BATCH</div><div class="value tiny-value">${esc(lifecycleObsText(latest.runtimeAttemptDisplay?.pre?.batch))}</div></div>
      <div class="wide"><div class="label">DIRECT GENERATION PEAK</div><div class="value tiny-value">${esc(attemptFamilyPeakText(latest.runtimeAttemptDisplay,'direct'))}</div></div>
      <div class="wide"><div class="label">BATCH GENERATION PEAK</div><div class="value tiny-value">${esc(attemptFamilyPeakText(latest.runtimeAttemptDisplay,'batch'))}</div></div>
      <div class="wide"><div class="label">NETWORK BY SOURCE FAMILY</div><div class="value tiny-value">${esc(attemptNetworkText(latest.runtimeAttemptDisplay))}</div></div>
      <div class="wide"><div class="label">POST-ATTEMPT DELTA</div><div class="value tiny-value">${
        latest.runtimeAttemptDisplay?.deltas ? esc(JSON.stringify(latest.runtimeAttemptDisplay.deltas)) : '—'
      }</div></div>
      <div class="wide"><div class="label">RECENT ATTEMPT OUTCOMES</div><div class="value tiny-value">${esc(attemptRecentText(latest.runtimeAttemptHistory,12))}</div></div>
    </div>

    <div class="section-title">SOURCE-SEPARATED BASELINES — V2.22</div>

    <div class="capture-note">
      DIRECT and BATCH are different conversation representations.
      Only DIRECT stable snapshots use the calibrated headline risk.
      BATCH/OTHER values are diagnostics and never overwrite DIRECT.
    </div>

    <div class="stats-grid">
      <div>
        <div class="label">CURRENT SOURCE</div>
        <div class="value">
          ${esc(lifecycleFamilyLabel(latest.lifecycleCurrentSourceFamily))}
        </div>
      </div>

      <div>
        <div class="label">SOURCE SWITCHES TRACKED</div>
        <div class="value">${latest.lifecycleSourceSwitchCount ?? 0}</div>
      </div>

      <div>
        <div class="label">DIRECT STABLE RETAINED</div>
        <div class="value">
          ${latest.lifecycleDirect?.lastStable?.retainedBytes != null
            ? fmt(latest.lifecycleDirect.lastStable.retainedBytes) + ' B'
            : '—'}
        </div>
      </div>

      <div>
        <div class="label">DIRECT STABLE ACTIVE</div>
        <div class="value">
          ${latest.lifecycleDirect?.lastStable?.activeBranchBytes != null
            ? fmt(latest.lifecycleDirect.lastStable.activeBranchBytes) + ' B'
            : '—'}
        </div>
      </div>

      <div>
        <div class="label">DIRECT NODES</div>
        <div class="value">
          ${latest.lifecycleDirect?.lastStable?.branchNodes ?? '—'}
        </div>
      </div>

      <div>
        <div class="label">DIRECT MAX EVENTS</div>
        <div class="value">
          ${latest.lifecycleDirect?.maxEvents?.length ?? 0}
        </div>
      </div>

      <div>
        <div class="label">BATCH STABLE RETAINED</div>
        <div class="value">
          ${latest.lifecycleBatch?.lastStable?.retainedBytes != null
            ? fmt(latest.lifecycleBatch.lastStable.retainedBytes) + ' B'
            : '—'}
        </div>
      </div>

      <div>
        <div class="label">BATCH STABLE ACTIVE</div>
        <div class="value">
          ${latest.lifecycleBatch?.lastStable?.activeBranchBytes != null
            ? fmt(latest.lifecycleBatch.lastStable.activeBranchBytes) + ' B'
            : '—'}
        </div>
      </div>

      <div>
        <div class="label">BATCH NODES</div>
        <div class="value">
          ${latest.lifecycleBatch?.lastStable?.branchNodes ?? '—'}
        </div>
      </div>

      <div>
        <div class="label">BATCH MAX EVENTS</div>
        <div class="value">
          ${latest.lifecycleBatch?.maxEvents?.length ?? 0}
        </div>
      </div>

      <div class="wide">
        <div class="label">DIRECT LAST STABLE</div>
        <div class="value tiny-value">
          ${esc(lifecycleObsText(latest.lifecycleDirect?.lastStable))}
        </div>
      </div>

      <div class="wide">
        <div class="label">BATCH LAST STABLE</div>
        <div class="value tiny-value">
          ${esc(lifecycleObsText(latest.lifecycleBatch?.lastStable))}
        </div>
      </div>

      <div class="wide">
        <div class="label">DIRECT LAST MAX</div>
        <div class="value tiny-value">
          ${latest.lifecycleDirect?.lastMaxEvent
            ? esc(JSON.stringify(latest.lifecycleDirect.lastMaxEvent))
            : '—'}
        </div>
      </div>

      <div class="wide">
        <div class="label">BATCH LAST MAX</div>
        <div class="value tiny-value">
          ${latest.lifecycleBatch?.lastMaxEvent
            ? esc(JSON.stringify(latest.lifecycleBatch.lastMaxEvent))
            : '—'}
        </div>
      </div>

      <div class="wide">
        <div class="label">DIRECT RECOVERY</div>
        <div class="value tiny-value">
          ${latest.lifecycleDirect?.lastRecovery
            ? esc(
                `CONFIRMED · retained ${lifecycleDelta(latest.lifecycleDirect.lastRecovery.delta?.retainedBytes,'B')} · ` +
                `active ${lifecycleDelta(latest.lifecycleDirect.lastRecovery.delta?.activeBranchBytes,'B')} · ` +
                `nodes ${lifecycleDelta(latest.lifecycleDirect.lastRecovery.delta?.branchNodes)} · ` +
                `users ${lifecycleDelta(latest.lifecycleDirect.lastRecovery.delta?.userMessages)} · ` +
                `assistants ${lifecycleDelta(latest.lifecycleDirect.lastRecovery.delta?.assistantMessages)}`
              )
            : latest.lifecycleDirect?.recoveryPending
              ? esc(`NOT CONFIRMED · ${latest.lifecycleDirect.recoveryPending.reason}`)
              : '—'}
        </div>
      </div>

      <div class="wide">
        <div class="label">BATCH RECOVERY</div>
        <div class="value tiny-value">
          ${latest.lifecycleBatch?.lastRecovery
            ? esc(
                `CONFIRMED · retained ${lifecycleDelta(latest.lifecycleBatch.lastRecovery.delta?.retainedBytes,'B')} · ` +
                `active ${lifecycleDelta(latest.lifecycleBatch.lastRecovery.delta?.activeBranchBytes,'B')} · ` +
                `nodes ${lifecycleDelta(latest.lifecycleBatch.lastRecovery.delta?.branchNodes)} · ` +
                `users ${lifecycleDelta(latest.lifecycleBatch.lastRecovery.delta?.userMessages)} · ` +
                `assistants ${lifecycleDelta(latest.lifecycleBatch.lastRecovery.delta?.assistantMessages)}`
              )
            : latest.lifecycleBatch?.recoveryPending
              ? esc(`NOT CONFIRMED · ${latest.lifecycleBatch.recoveryPending.reason}`)
              : '—'}
        </div>
      </div>

      <div class="wide">
        <div class="label">RECENT SOURCE-SWITCHED SNAPSHOTS</div>
        <div class="value tiny-value">
          ${esc(lifecycleRowsText(latest.lifecycleObservations,16))}
        </div>
      </div>
    </div>

    <div class="risk-card">
      <div class="risk-card-top">
        <div>
          <div class="risk-label">STATIC DIRECT-SOURCE DIAGNOSTIC (SECONDARY)</div>
          <div class="risk-band">
            ${latest.lifecycleCanonicalRiskAvailable
              ? v213RiskLabel(latest.lifecycleCanonicalRiskBand)
              : 'NO DIRECT BASELINE'}
          </div>
        </div>

        <div style="text-align:right">
          <div class="risk-label">DIRECT STABLE RETAINED</div>
          <div class="value">
            ${latest.lifecycleCanonicalRetainedBytes != null
              ? fmt(latest.lifecycleCanonicalRetainedBytes) + ' B'
              : '—'}
          </div>
        </div>
      </div>

      <div class="risk-meter-shell">
        <div
          class="risk-meter-fill"
          style="width:${latest.lifecycleCanonicalRetainedBytes != null
            ? Math.max(
                0,
                Math.min(
                  100,
                  latest.lifecycleCanonicalRetainedBytes /
                  V215_RISK_CALIBRATION.smallestObservedMaxBytes * 100
                )
              )
            : 0}%"
        ></div>
      </div>

      <div class="risk-explain">
        ${latest.lifecycleCanonicalRetainedBytes != null
          ? esc(
              `DIRECT stable ${fmt(latest.lifecycleCanonicalRetainedBytes)}B · ` +
              v215ObservedDeltaText(latest.lifecycleCanonicalRetainedBytes)
            )
          : 'A fresh DIRECT /backend-api/conversation/<id> snapshot is needed before calibrated risk is shown.'}
      </div>

      <div class="density-card normal">
        <div class="risk-label">CURRENT SOURCE DIAGNOSTIC</div>
        <div class="value">
          ${esc(lifecycleFamilyLabel(latest.lifecycleCurrentSourceFamily))}
        </div>
        <div class="risk-explain">
          ${latest.experimentalRiskRetainedBytes != null
            ? esc(
                `${fmt(latest.experimentalRiskRetainedBytes)}B retained · ` +
                `${latest.activeBranchSerializedBytes != null
                  ? fmt(latest.activeBranchSerializedBytes) + 'B active'
                  : '— active'}`
              )
            : '—'}
        </div>
      </div>

      <div class="risk-calibration">
        Static DIRECT calibration is retained only as a secondary diagnostic
        in V2.18. Runtime attempt SUCCESS/MAX correlation is now the primary
        experiment because identical static snapshots can occur in both states.
      </div>
    </div>

    <div class="headroom" style="margin-top:8px;text-align:left">
      Structural diagnostics + experimental warning heuristic. These values are not the model context window and are not a universal “% remaining.”
    </div>

    <div class="section-title">ACTIVE BRANCH — TEXT / ROLES</div>
    <div class="stats-grid">
      <div>
        <div class="label">BRANCH NODES</div>
        <div class="value">${latest.activeBranchNodes ?? '—'}</div>
      </div>

      <div>
        <div class="label">MESSAGE NODES</div>
        <div class="value">${latest.activeMessageNodes ?? '—'}</div>
      </div>

      <div>
        <div class="label">ROLE U/A TEXT</div>
        <div class="value">${latest.tokens != null ? '~' + fmt(latest.tokens) + ' tok' : '—'}</div>
      </div>

      <div>
        <div class="label">DISPLAY-LIKE TEXT</div>
        <div class="value">${latest.activeDisplayLikeTextTokens != null ? '~' + fmt(latest.activeDisplayLikeTextTokens) + ' tok' : '—'}</div>
      </div>

      <div>
        <div class="label">ALL-ROLE TEXT</div>
        <div class="value">${latest.activeAllTextTokens != null ? '~' + fmt(latest.activeAllTextTokens) + ' tok' : '—'}</div>
      </div>

      <div>
        <div class="label">HIDDEN TEXT</div>
        <div class="value">${latest.activeHiddenTextTokens != null ? '~' + fmt(latest.activeHiddenTextTokens) + ' tok' : '—'}</div>
      </div>

      <div class="wide">
        <div class="label">ACTIVE ROLES</div>
        <div class="value tiny-value">${esc(compactCounts(latest.activeRoleCounts, 20))}</div>
      </div>

      <div class="wide">
        <div class="label">ACTIVE CONTENT TYPES</div>
        <div class="value tiny-value">${esc(compactCounts(latest.activeContentTypeCounts, 24))}</div>
      </div>
    </div>

    <div class="section-title">TOOLS — FIXED CLASSIFIER</div>
    <div class="stats-grid">
      <div>
        <div class="label">EXPLICIT TOOL ROLE</div>
        <div class="value">${latest.activeExplicitToolRoleNodes ?? '—'}</div>
      </div>

      <div>
        <div class="label">TOOL-LIKE TOTAL</div>
        <div class="value">${latest.activeToolishNodes ?? '—'}</div>
      </div>

      <div>
        <div class="label">TOOL CALLS</div>
        <div class="value">${latest.activeToolCallNodes ?? '—'}</div>
      </div>

      <div>
        <div class="label">TOOL RESULTS</div>
        <div class="value">${latest.activeToolResultNodes ?? '—'}</div>
      </div>

      <div>
        <div class="label">TOOL CALL JSON</div>
        <div class="value">${latest.activeToolCallBytes != null ? fmt(latest.activeToolCallBytes) + ' B' : '—'}</div>
      </div>

      <div>
        <div class="label">TOOL RESULT JSON</div>
        <div class="value">${latest.activeToolResultBytes != null ? fmt(latest.activeToolResultBytes) + ' B' : '—'}</div>
      </div>

      <div class="wide">
        <div class="label">TOOL CALL NAMES</div>
        <div class="value tiny-value">${esc(compactCounts(latest.activeToolCallNames, 24))}</div>
      </div>

      <div class="wide">
        <div class="label">TOOL RESULT NAMES</div>
        <div class="value tiny-value">${esc(compactCounts(latest.activeToolResultNames, 24))}</div>
      </div>

      <div class="wide">
        <div class="label">NON-GENERIC RECIPIENTS</div>
        <div class="value tiny-value">${esc(compactCounts(latest.activeRecipientCounts, 24))}</div>
      </div>
    </div>

    <div class="section-title">IMAGE / FILE / ASSET DIAGNOSTICS</div>
    <div class="stats-grid">
      <div>
        <div class="label">IMAGE-GEN CALLS</div>
        <div class="value">${latest.activeImageGenCallNodes ?? '—'}</div>
      </div>

      <div>
        <div class="label">IMAGE-GEN RESULTS</div>
        <div class="value">${latest.activeImageGenResultNodes ?? '—'}</div>
      </div>

      <div>
        <div class="label">GENERATED IMAGE NODES</div>
        <div class="value">${latest.activeGeneratedImageNodes ?? '—'}</div>
      </div>

      <div>
        <div class="label">UPLOADED IMAGE NODES</div>
        <div class="value">${latest.activeUploadedImageNodes ?? '—'}</div>
      </div>

      <div>
        <div class="label">UNIQUE IMAGE ASSETS</div>
        <div class="value">${latest.activeUniqueImageAssetIds ?? '—'}</div>
      </div>

      <div>
        <div class="label">UNIQUE FILE ASSETS</div>
        <div class="value">${latest.activeUniqueFileAssetIds ?? '—'}</div>
      </div>

      <div>
        <div class="label">GEN IMAGE ASSETS</div>
        <div class="value">${latest.activeUniqueGeneratedImageAssetIds ?? '—'}</div>
      </div>

      <div>
        <div class="label">UPLOADED IMG ASSETS</div>
        <div class="value">${latest.activeUniqueUploadedImageAssetIds ?? '—'}</div>
      </div>

      <div>
        <div class="label">IMAGE-NODE JSON</div>
        <div class="value">${latest.activeImageNodeBytes != null ? fmt(latest.activeImageNodeBytes) + ' B' : '—'}</div>
      </div>

      <div>
        <div class="label">ASSET-NODE JSON</div>
        <div class="value">${latest.activeAssetNodeBytes != null ? fmt(latest.activeAssetNodeBytes) + ' B' : '—'}</div>
      </div>

      <div>
        <div class="label">IMAGE REF OCCURRENCES</div>
        <div class="value">${latest.activeImageReferenceOccurrences ?? '—'}</div>
      </div>

      <div>
        <div class="label">FILE REF OCCURRENCES</div>
        <div class="value">${latest.activeFileReferenceOccurrences ?? '—'}</div>
      </div>
    </div>

    <div class="section-title">MODEL METADATA</div>
    <div class="stats-grid">
      <div>
        <div class="label">GPT-6 PRO-LABELED NODES</div>
        <div class="value">${latest.activeGpt6ProMessageNodes ?? '—'}</div>
      </div>

      <div>
        <div class="label">MODEL LABELS FOUND</div>
        <div class="value">${latest.activeModelCounts ? Object.keys(latest.activeModelCounts).length : '—'}</div>
      </div>

      <div class="wide">
        <div class="label">ACTIVE MODEL DISTRIBUTION</div>
        <div class="value tiny-value">${esc(compactCounts(latest.activeModelCounts, 20))}</div>
      </div>
    </div>


    <div class="section-title">CONTEXT-HISTORY TOPOLOGY — V2.12</div>

    <div class="capture-note">
      ${
        !latest.topologySnapshotPresent
          ? '⚠ Current saved snapshot predates V2.11 topology'
          : latest.topologyOk
            ? '✓ Lightweight topology captured'
            : `⚠ Topology capture error: ${esc(latest.topologyError || 'unknown')}`
      }
    </div>

    <div class="stats-grid">
      <div>
        <div class="label">CURRENT DEPTH</div>
        <div class="value">${latest.currentDepth ?? '—'}</div>
      </div>

      <div>
        <div class="label">LATEST MODEL</div>
        <div class="value tiny-value">${esc(latest.currentModel || '—')}</div>
      </div>

      <div>
        <div class="label">MODEL SEGMENTS</div>
        <div class="value">${latest.modelSegmentCount ?? '—'}</div>
      </div>

      <div>
        <div class="label">GPT-6 PRO SEGMENTS</div>
        <div class="value">${latest.gpt6ProSegmentCount ?? '—'}</div>
      </div>

      <div class="wide">
        <div class="label">RECENT MODEL SEGMENTS</div>
        <div class="value tiny-value">${esc(modelSegmentsTextV2114(latest.modelSegments, 14))}</div>
      </div>

      <div class="wide">
        <div class="label">LONGEST GPT-6 PRO SEGMENT</div>
        <div class="value tiny-value">${esc(segmentTextV2114(latest.longestGpt6ProSegment))}</div>
      </div>

      <div>
        <div class="label">LAST GPT-6 PRO DEPTH</div>
        <div class="value">${latest.lastGpt6ProDepth ?? '—'}</div>
      </div>

      <div>
        <div class="label">NODES SINCE PRO</div>
        <div class="value">${latest.nodesSinceLastGpt6Pro ?? '—'}</div>
      </div>

      <div class="wide">
        <div class="label">GPT-6 PRO DEPTHS</div>
        <div class="value tiny-value">${esc(compactDepthsV2114(latest.gpt6ProDepths, 36))}</div>
      </div>

      <div>
        <div class="label">LAST IMAGE-GEN DEPTH</div>
        <div class="value">${latest.lastImageGenDepth ?? '—'}</div>
      </div>

      <div>
        <div class="label">NODES SINCE IMAGE-GEN</div>
        <div class="value">${latest.nodesSinceLastImageGen ?? '—'}</div>
      </div>

      <div class="wide">
        <div class="label">IMAGE-GEN EVENT DEPTHS</div>
        <div class="value tiny-value">${esc(compactDepthsV2114(latest.imageGenDepths, 36))}</div>
      </div>

      <div>
        <div class="label">INFERRED IMG PAIRS</div>
        <div class="value">${latest.imageGenPairCount ?? '—'}</div>
      </div>

      <div>
        <div class="label">UNPAIRED IMG RESULTS</div>
        <div class="value">${latest.imageGenUnpairedResults ?? '—'}</div>
      </div>

      <div>
        <div class="label">CTX MARKERS</div>
        <div class="value">${latest.strongContextMarkerCount ?? '—'}</div>
      </div>

      <div>
        <div class="label">NODES SINCE CTX</div>
        <div class="value">${latest.nodesSinceLastStrongContextMarker ?? '—'}</div>
      </div>

      <div>
        <div class="label">RECAP MARKERS</div>
        <div class="value">${latest.recapMarkerCount ?? '—'}</div>
      </div>

      <div>
        <div class="label">NODES SINCE RECAP</div>
        <div class="value">${latest.nodesSinceLastRecap ?? '—'}</div>
      </div>

      <div>
        <div class="label">BRANCHES NEAR IMG ±32</div>
        <div class="value">${latest.branchPointsNearImageGen32 ?? '—'}</div>
      </div>

      <div>
        <div class="label">BRANCHES NEAR PRO ±32</div>
        <div class="value">${latest.branchPointsNearGpt6Pro32 ?? '—'}</div>
      </div>

      <div class="wide">
        <div class="label">RECENT WINDOWS</div>
        <div class="value tiny-value">${esc(recentWindowsTextV2114(latest.recentWindows))}</div>
      </div>

      <div class="wide">
        <div class="label">SINCE LAST CONTEXT MARKER</div>
        <div class="value tiny-value">
          ${
            latest.sinceLastContext
              ? esc(JSON.stringify(latest.sinceLastContext))
              : '—'
          }
        </div>
      </div>
    </div>



    <div class="section-title">ABSOLUTE RETAINED-STATE RISK — V2.15</div>
    <div class="stats-grid">
      <div>
        <div class="label">PRIMARY RISK BAND</div>
        <div class="value">
          ${latest.experimentalRiskAvailable
            ? v213RiskLabel(latest.experimentalRiskBand)
            : '—'}
        </div>
      </div>

      <div>
        <div class="label">ABSOLUTE RETAINED PROXY</div>
        <div class="value">
          ${latest.experimentalRiskRetainedBytes != null
            ? fmt(latest.experimentalRiskRetainedBytes) + ' B'
            : '—'}
        </div>
      </div>

      <div>
        <div class="label">SECONDARY PROXY SHARE</div>
        <div class="value">
          ${latest.experimentalRiskProxyShare != null
            ? latest.experimentalRiskProxyShare.toFixed(2) + '%'
            : '—'}
        </div>
      </div>

      <div>
        <div class="label">VS SMALLEST OBSERVED MAX</div>
        <div class="value tiny-value">
          ${latest.experimentalRiskRetainedBytes != null
            ? esc(v215ObservedDeltaText(latest.experimentalRiskRetainedBytes))
            : '—'}
        </div>
      </div>

      <div>
        <div class="label">HIGHEST HEALTHY OBSERVED</div>
        <div class="value">
          ${fmt(V215_RISK_CALIBRATION.highestHealthyObservedBytes)} B
        </div>
      </div>

      <div>
        <div class="label">SMALLEST MAX OBSERVED</div>
        <div class="value">
          ${fmt(V215_RISK_CALIBRATION.smallestObservedMaxBytes)} B
        </div>
      </div>

      <div>
        <div class="label">SECOND MAX OBSERVED</div>
        <div class="value">
          ${fmt(V215_RISK_CALIBRATION.secondObservedMaxBytes)} B
        </div>
      </div>

      <div>
        <div class="label">DENSITY ADVISORY</div>
        <div class="value">
          ${esc(v214DensityLabel(latest.experimentalDensityLevel))}
        </div>
      </div>

      <div>
        <div class="label">128-NODE HOT STATE</div>
        <div class="value">
          ${latest.experimentalRiskHot128Bytes != null
            ? fmt(latest.experimentalRiskHot128Bytes) + ' B'
            : '—'}
        </div>
      </div>

      <div>
        <div class="label">256-NODE HOT STATE</div>
        <div class="value">
          ${latest.experimentalRiskHot256Bytes != null
            ? fmt(latest.experimentalRiskHot256Bytes) + ' B'
            : '—'}
        </div>
      </div>

      <div class="wide">
        <div class="label">PRIMARY BAND REASON</div>
        <div class="value tiny-value">
          ${esc(v213RiskExplanation({
            available: latest.experimentalRiskAvailable,
            reasons: latest.experimentalRiskReasons
          }))}
        </div>
      </div>

      <div class="wide">
        <div class="label">DENSITY DETAILS</div>
        <div class="value tiny-value">
          ${esc(v214DensityExplanation({            densityReasons: latest.experimentalDensityReasons
          }))}
        </div>
      </div>

      <div class="wide">
        <div class="label">V2.15 CALIBRATION</div>
        <div class="value tiny-value">
          Primary retained-proxy bands:
          Low &lt;5.0MB;
          Elevated 5.0–6.0MB;
          High 6.0–6.5MB;
          Very High 6.5–7.0MB;
          Observed MAX Zone ≥7.0MB.
          Highest confirmed healthy sample: 6,826,995 B.
          Independent MAX samples: 7,015,394 B and 7,293,688 B.
          These are empirical values from this script, not an official
          ChatGPT byte limit.
        </div>
      </div>
    </div>

    <div class="section-title">RETAINED-STATE PROFILER — V2.12</div>

    <div class="capture-note">
      ${
        latest.retainedStatePresent
          ? '✓ Retained-state depth profiler captured'
          : '⚠ Retained-state profiler unavailable in this snapshot'
      }
    </div>

    <div class="stats-grid">
      <div>
        <div class="label">SPECIAL NODE JSON</div>
        <div class="value">
          ${latest.activeSpecialNodeBytes != null
            ? fmt(latest.activeSpecialNodeBytes) + ' B'
            : '—'}
        </div>
      </div>

      <div>
        <div class="label">SPECIAL SHARE</div>
        <div class="value">
          ${latest.activeSpecialSharePercent != null
            ? latest.activeSpecialSharePercent.toFixed(1) + '%'
            : '—'}
        </div>
      </div>

      <div>
        <div class="label">RETAINED PROXY JSON</div>
        <div class="value">
          ${latest.retainedStateProxyBytes != null
            ? fmt(latest.retainedStateProxyBytes) + ' B'
            : '—'}
        </div>
      </div>

      <div>
        <div class="label">PROXY / ACTIVE BRANCH</div>
        <div class="value">
          ${latest.retainedStateProxySharePercent != null
            ? latest.retainedStateProxySharePercent.toFixed(1) + '%'
            : '—'}
        </div>
      </div>

      <div>
        <div class="label">ALT SUBTREE JSON</div>
        <div class="value">
          ${latest.retainedAlternateSubtreeBytesTotal != null
            ? fmt(latest.retainedAlternateSubtreeBytesTotal) + ' B'
            : '—'}
        </div>
      </div>

      <div>
        <div class="label">LARGEST ALT SUBTREE</div>
        <div class="value">
          ${latest.retainedAlternateSubtreeBytesMax != null
            ? fmt(latest.retainedAlternateSubtreeBytesMax) + ' B'
            : '—'}
        </div>
      </div>

      <div class="wide">
        <div class="label">HOTTEST 100-NODE BUCKETS BY SPECIAL JSON</div>
        <div class="value tiny-value">
          ${esc(v212BucketText(latest.retainedHottestBuckets, 10))}
        </div>
      </div>

      <div class="wide">
        <div class="label">HOTTEST 128-NODE WINDOW</div>
        <div class="value tiny-value">
          ${esc(v212HotWindowText(latest.retainedHotWindows?.w128))}
        </div>
      </div>

      <div class="wide">
        <div class="label">HOTTEST 256-NODE WINDOW</div>
        <div class="value tiny-value">
          ${esc(v212HotWindowText(latest.retainedHotWindows?.w256))}
        </div>
      </div>

      <div class="wide">
        <div class="label">HOTTEST 512-NODE WINDOW</div>
        <div class="value tiny-value">
          ${esc(v212HotWindowText(latest.retainedHotWindows?.w512))}
        </div>
      </div>

      <div class="wide">
        <div class="label">BRANCH RETENTION / ±32 NEIGHBORHOODS</div>
        <div class="value tiny-value">
          ${esc(v212BranchRetentionText(latest.retainedBranchDetails, 16))}
        </div>
      </div>

      <div class="wide">
        <div class="label">GPT-6 PRO SEGMENT SPECIAL STATE</div>
        <div class="value tiny-value">
          ${esc(v212ProSegmentsText(latest.retainedProSegments, 16))}
        </div>
      </div>

      <div>
        <div class="label">IMG-GEN RESULT JSON</div>
        <div class="value">
          ${latest.retainedImageGenResultTotalBytes != null
            ? fmt(latest.retainedImageGenResultTotalBytes) + ' B'
            : '—'}
        </div>
      </div>

      <div>
        <div class="label">LARGEST IMG-GEN RESULT</div>
        <div class="value">
          ${latest.retainedLargestImageGenResultBytes != null
            ? fmt(latest.retainedLargestImageGenResultBytes) + ' B'
            : '—'}
        </div>
      </div>

      <div class="wide">
        <div class="label">TOP IMAGE-GEN RESULTS BY NODE JSON</div>
        <div class="value tiny-value">
          ${esc(v212ImageGenResultsText({
            top: latest.retainedTopImageGenResults
          }))}
        </div>
      </div>

      <div>
        <div class="label">UNIQUE ASSETS SEEN</div>
        <div class="value">
          ${latest.retainedUniqueAssetsObserved ?? '—'}
        </div>
      </div>

      <div>
        <div class="label">IMG-GEN-ASSOC ASSETS</div>
        <div class="value">
          ${latest.retainedImageGenAssociatedAssetIds ?? '—'}
        </div>
      </div>

      <div>
        <div class="label">OLD ASSETS REFERENCED AFTER LAST IMG</div>
        <div class="value">
          ${latest.retainedAssetsReferencedAfterLastImage ?? '—'}
        </div>
      </div>

      <div>
        <div class="label">IMG-GEN ASSETS REFERENCED LATER</div>
        <div class="value">
          ${latest.retainedImageGenAssetsReferencedAfterLastImage ?? '—'}
        </div>
      </div>

      <div class="wide">
        <div class="label">POST-IMG NODES REFERENCING PRE-IMG ASSETS</div>
        <div class="value">
          ${latest.retainedAssetReferenceNodesAfterLastImage ?? '—'}
        </div>
      </div>
    </div>

    <div class="section-title">MAPPING / BRANCH TOPOLOGY</div>
    <div class="stats-grid">
      <div>
        <div class="label">TOTAL MAPPING NODES</div>
        <div class="value">${latest.mappingNodes ?? '—'}</div>
      </div>

      <div>
        <div class="label">OFF-BRANCH NODES</div>
        <div class="value">${latest.offBranchNodes ?? '—'}</div>
      </div>

      <div>
        <div class="label">LEAVES</div>
        <div class="value">${latest.leafNodes ?? '—'}</div>
      </div>

      <div>
        <div class="label">ALL BRANCH POINTS</div>
        <div class="value">${latest.branchPoints ?? '—'}</div>
      </div>

      <div>
        <div class="label">ACTIVE BRANCH POINTS</div>
        <div class="value">${latest.activeBranchPoints ?? '—'}</div>
      </div>

      <div>
        <div class="label">NODES SINCE LAST BRANCH</div>
        <div class="value">${latest.nodesSinceLastBranchPoint ?? '—'}</div>
      </div>

      <div>
        <div class="label">ALT SUBTREE NODES TOTAL</div>
        <div class="value">${latest.alternateSubtreeNodesTotal ?? '—'}</div>
      </div>

      <div>
        <div class="label">LARGEST ALT SUBTREE</div>
        <div class="value">${latest.alternateSubtreeNodesMax ?? '—'}</div>
      </div>

      <div class="wide">
        <div class="label">ACTIVE BRANCH-POINT DEPTHS</div>
        <div class="value tiny-value">${esc(Array.isArray(latest.activeBranchPointDepths) && latest.activeBranchPointDepths.length ? latest.activeBranchPointDepths.join(', ') : '—')}</div>
      </div>

      <div class="wide">
        <div class="label">BRANCH-POINT DETAILS</div>
        <div class="value tiny-value">${esc(compactBranchDetails(latest.branchPointDetails))}</div>
      </div>
    </div>

    <div class="section-title">SERIALIZED BY ROLE / CONTENT</div>
    <div class="stats-grid">
      <div class="wide">
        <div class="label">NODE JSON BY ROLE</div>
        <div class="value tiny-value">${esc(compactByteCounts(latest.activeNodeBytesByRole, 20))}</div>
      </div>

      <div class="wide">
        <div class="label">NODE JSON BY CONTENT TYPE</div>
        <div class="value tiny-value">${esc(compactByteCounts(latest.activeNodeBytesByContentType, 24))}</div>
      </div>

      <div class="wide">
        <div class="label">LARGEST ACTIVE NODE</div>
        <div class="value tiny-value">${esc(describeLargest(latest.activeLargestNode))}</div>
      </div>

      <div class="wide">
        <div class="label">LARGEST TOOL RESULT</div>
        <div class="value tiny-value">${esc(describeLargest(latest.activeLargestToolResult))}</div>
      </div>

      <div class="wide">
        <div class="label">LARGEST IMAGE-LIKE NODE</div>
        <div class="value tiny-value">${esc(describeLargest(latest.activeLargestImageNode))}</div>
      </div>
    </div>

    <div class="section-title">WHOLE MAPPING / NETWORK</div>
    <div class="stats-grid">
      <div>
        <div class="label">ACTIVE BRANCH JSON</div>
        <div class="value">${latest.activeBranchSerializedBytes != null ? fmt(latest.activeBranchSerializedBytes) + ' B' : '—'}</div>
      </div>

      <div>
        <div class="label">MAPPING JSON</div>
        <div class="value">${latest.mappingSerializedBytes != null ? fmt(latest.mappingSerializedBytes) + ' B' : '—'}</div>
      </div>

      <div>
        <div class="label">MAX FULL RESPONSE</div>
        <div class="value">${latest.maxFullPayloadBytes != null ? fmt(latest.maxFullPayloadBytes) + ' B' : '—'}</div>
      </div>

      <div>
        <div class="label">LAST NETWORK EVENT</div>
        <div class="value">${latest.lastPayloadBytes != null ? fmt(latest.lastPayloadBytes) + ' B' : '—'}</div>
      </div>

      <div class="wide">
        <div class="label">DATA SOURCE</div>
        <div class="value">${esc(latest.source)}</div>
      </div>

      <div class="wide">
        <div class="label">FULL SNAPSHOT AGE</div>
        <div class="value">${esc(formatAge(latest.fullCapturedAt))}</div>
      </div>
    </div>

    <div class="expanded-status ${st.cls}">
      ${esc(st.text)}
    </div>

    <div class="action-grid bottom-actions">
      <button
        class="wide-button"
        data-action="save-max-sample"
        ${latest.full && latest.liveMaximum ? '' : 'disabled'}
      >
        Save verified MAX sample
      </button>
    </div>

    ${feedbackMarkup()}

    <div class="capture-note">
      ${
        latest.liveMaximum
          ? '✓ Red maximum-length banner visible. Saving now freezes the V2.10.1 tool/media/branch diagnostics for this MAX event.'
          : 'A verified MAX sample can only be saved while ChatGPT’s red maximum-length banner is actually visible.'
      }
    </div>

    <div class="cal-note warn">
      V2.10.1 keeps V2.10 diagnostics but makes the expanded panel viewport-safe and keeps Copy diagnostics pinned at the top. It also fixes the V2.9 tool classifier and separately measures tool calls/results, image generation, assets, model metadata, branch depth and serialized byte distribution.
    </div>
  `;

  panel.querySelector('[data-action="expand"]').textContent =
    S.expanded ? '−' : '+';

  checkNotifications(latest);
}

function updateUI() {
  if (!panel || !document.body?.contains(panel)) {
    if (document.body) createUI();
    return;
  }

  render();
}

function saveCurrentVerifiedMaxSample() {
  if (!latest?.full) {
    alert('No full network conversation snapshot has been captured yet.');
    return false;
  }

  if (!visibleHardMax()) {
    alert(
      'The red ChatGPT maximum-length banner is not visible right now.\n\n' +
      'V2.10.1 will not label this chat as maxed based on memory or a manual guess.'
    );
    return false;
  }

  const sample = {
    version: '2.10',
    time: Date.now(),
    chatId: latest.id,

    archiveTokens: latest.tokens,
    archiveCharacters: latest.chars,
    messages: latest.messages,
    userMessages: latest.userMessages,
    assistantMessages: latest.assistantMessages,

    displayLikeTextTokens: latest.activeDisplayLikeTextTokens,
    displayLikeTextCharacters: latest.activeDisplayLikeTextChars,
    displayLikeMessages: latest.activeDisplayLikeMessages,

    activeBranchNodes: latest.activeBranchNodes,
    activeMessageNodes: latest.activeMessageNodes,
    activeAllTextCharacters: latest.activeAllTextChars,
    activeAllTextTokens: latest.activeAllTextTokens,
    activeHiddenMessageNodes: latest.activeHiddenMessageNodes,
    activeHiddenTextCharacters: latest.activeHiddenTextChars,
    activeHiddenTextTokens: latest.activeHiddenTextTokens,
    activeEmptyMessageNodes: latest.activeEmptyMessageNodes,

    activeExplicitToolRoleNodes: latest.activeExplicitToolRoleNodes,
    activeToolishNodes: latest.activeToolishNodes,
    activeToolCallNodes: latest.activeToolCallNodes,
    activeToolResultNodes: latest.activeToolResultNodes,
    activeToolCallBytes: latest.activeToolCallBytes,
    activeToolResultBytes: latest.activeToolResultBytes,
    activeToolCallNames: latest.activeToolCallNames,
    activeToolResultNames: latest.activeToolResultNames,
    activeRecipientCounts: latest.activeRecipientCounts,

    activeContextLikeNodes: latest.activeContextLikeNodes,
    activeAttachmentNodes: latest.activeAttachmentNodes,
    activeImageNodes: latest.activeImageNodes,
    activeFileNodes: latest.activeFileNodes,

    activeImageGenCallNodes: latest.activeImageGenCallNodes,
    activeImageGenResultNodes: latest.activeImageGenResultNodes,
    activeGeneratedImageNodes: latest.activeGeneratedImageNodes,
    activeUploadedImageNodes: latest.activeUploadedImageNodes,

    activeUniqueAssetIds: latest.activeUniqueAssetIds,
    activeUniqueImageAssetIds: latest.activeUniqueImageAssetIds,
    activeUniqueFileAssetIds: latest.activeUniqueFileAssetIds,
    activeUniqueGeneratedImageAssetIds: latest.activeUniqueGeneratedImageAssetIds,
    activeUniqueUploadedImageAssetIds: latest.activeUniqueUploadedImageAssetIds,

    activeImageReferenceOccurrences: latest.activeImageReferenceOccurrences,
    activeFileReferenceOccurrences: latest.activeFileReferenceOccurrences,
    activeAssetNodeBytes: latest.activeAssetNodeBytes,
    activeImageNodeBytes: latest.activeImageNodeBytes,
    activeFileNodeBytes: latest.activeFileNodeBytes,

    activeModelCounts: latest.activeModelCounts,
    activeGpt6ProMessageNodes: latest.activeGpt6ProMessageNodes,
    activeRoleCounts: latest.activeRoleCounts,
    activeContentTypeCounts: latest.activeContentTypeCounts,
    activeNodeBytesByRole: latest.activeNodeBytesByRole,
    activeNodeBytesByContentType: latest.activeNodeBytesByContentType,
    activeLargestNode: latest.activeLargestNode,
    activeLargestToolResult: latest.activeLargestToolResult,
    activeLargestImageNode: latest.activeLargestImageNode,

    activeBranchSerializedBytes: latest.activeBranchSerializedBytes,

    mappingNodes: latest.mappingNodes,
    offBranchNodes: latest.offBranchNodes,
    leafNodes: latest.leafNodes,
    branchPoints: latest.branchPoints,
    maxChildren: latest.maxChildren,

    activeBranchPoints: latest.activeBranchPoints,
    activeBranchPointDepths: latest.activeBranchPointDepths,
    lastBranchPointDepth: latest.lastBranchPointDepth,
    nodesSinceLastBranchPoint: latest.nodesSinceLastBranchPoint,
    alternateSubtreeNodesTotal: latest.alternateSubtreeNodesTotal,
    alternateSubtreeNodesMax: latest.alternateSubtreeNodesMax,
    branchPointDetails: latest.branchPointDetails,

    mappingToolCallNodes: latest.mappingToolCallNodes,
    mappingToolResultNodes: latest.mappingToolResultNodes,
    mappingImageGenCallNodes: latest.mappingImageGenCallNodes,
    mappingImageGenResultNodes: latest.mappingImageGenResultNodes,
    mappingGeneratedImageNodes: latest.mappingGeneratedImageNodes,
    mappingUploadedImageNodes: latest.mappingUploadedImageNodes,
    mappingUniqueImageAssetIds: latest.mappingUniqueImageAssetIds,
    mappingUniqueFileAssetIds: latest.mappingUniqueFileAssetIds,
    mappingModelCounts: latest.mappingModelCounts,
    mappingGpt6ProMessageNodes: latest.mappingGpt6ProMessageNodes,

    mappingSerializedBytes: latest.mappingSerializedBytes,


    retainedStateProfile: {
      activeSpecialNodeBytes: latest.activeSpecialNodeBytes,
      activeSpecialSharePercent: latest.activeSpecialSharePercent,
      retainedStateProxyBytes: latest.retainedStateProxyBytes,
      retainedStateProxySharePercent: latest.retainedStateProxySharePercent,
      retainedAlternateSubtreeBytesTotal: latest.retainedAlternateSubtreeBytesTotal,
      retainedAlternateSubtreeBytesMax: latest.retainedAlternateSubtreeBytesMax,
      hottestBuckets: latest.retainedHottestBuckets,
      hotWindows: latest.retainedHotWindows,
      branchDetails: latest.retainedBranchDetails,
      proSegments: latest.retainedProSegments,
      imageGenResultCount: latest.retainedImageGenResultCount,
      imageGenResultTotalBytes: latest.retainedImageGenResultTotalBytes,
      largestImageGenResultBytes: latest.retainedLargestImageGenResultBytes,
      topImageGenResults: latest.retainedTopImageGenResults,
      uniqueAssetsObserved: latest.retainedUniqueAssetsObserved,
      imageGenAssociatedAssetIds: latest.retainedImageGenAssociatedAssetIds,
      assetsReferencedAfterLastImage: latest.retainedAssetsReferencedAfterLastImage,
      imageGenAssetsReferencedAfterLastImage:
        latest.retainedImageGenAssetsReferencedAfterLastImage,
      assetReferenceNodesAfterLastImage:
        latest.retainedAssetReferenceNodesAfterLastImage
    },

    maxFullPayloadBytes: latest.maxFullPayloadBytes,
    lastPayloadBytes: latest.lastPayloadBytes,
    source: latest.source
  };

  saveVerifiedMaxSample(sample);
  render();
  return true;
}

function clearSnapshot() {
  const k = snapshotKey();

  if (k && confirm('Clear the saved network snapshot for this chat?')) {
    localStorage.removeItem(k);
    render();
    return true;
  }

  return false;
}

function clearVerifiedSamplesUI() {
  if (!confirm('Clear all verified max diagnostic samples?')) return false;
  clearVerifiedMaxSamples();
  render();
  return true;
}

// ============================================================
// Clipboard / notifications
// ============================================================

async function copyStats() {
  if (!latest) return false;

  const lines = [
    'ChatGPT Conversation Size Meter V2.22 SSE OUTCOME + POST CORRELATION',
    '',
    `Full snapshot captured: ${latest.full ? 'Yes' : 'No'}`,
    `Data source: ${latest.source}`,
    `Full snapshot age: ${formatAge(latest.fullCapturedAt)}`,
    `Red maximum banner visible now: ${latest.liveMaximum ? 'Yes' : 'No'}`,
    `Verified MAX events stored: ${latest.verifiedMaxSamples}`,

    `V2.11 topology snapshot present: ${latest.topologySnapshotPresent ? 'Yes' : 'No'}`,
    `V2.11 topology calculation OK: ${latest.topologyOk ? 'Yes' : 'No'}`,
    `V2.11 topology error: ${latest.topologyError || 'None'}`,
    '',
    'ACTIVE BRANCH — TEXT / ROLES',
    `Role-based user/assistant token estimate: ${latest.tokens ?? 'Unavailable'}`,
    `Role-based user/assistant characters: ${latest.chars ?? 'Unavailable'}`,
    `Role-based user/assistant messages: ${latest.messages}`,
    `User messages: ${latest.userMessages}`,
    `Assistant messages: ${latest.assistantMessages}`,
    `Display-like token estimate (heuristic): ${latest.activeDisplayLikeTextTokens ?? 'Unavailable'}`,
    `Display-like characters (heuristic): ${latest.activeDisplayLikeTextChars ?? 'Unavailable'}`,
    `Display-like messages (heuristic): ${latest.activeDisplayLikeMessages ?? 'Unavailable'}`,
    `Active branch nodes: ${latest.activeBranchNodes ?? 'Unavailable'}`,
    `Active message nodes: ${latest.activeMessageNodes ?? 'Unavailable'}`,
    `All-role text token estimate: ${latest.activeAllTextTokens ?? 'Unavailable'}`,
    `All-role text characters: ${latest.activeAllTextChars ?? 'Unavailable'}`,
    `Hidden/internal message nodes: ${latest.activeHiddenMessageNodes ?? 'Unavailable'}`,
    `Hidden/internal text token estimate: ${latest.activeHiddenTextTokens ?? 'Unavailable'}`,
    `Hidden/internal text characters: ${latest.activeHiddenTextChars ?? 'Unavailable'}`,
    `Empty message nodes: ${latest.activeEmptyMessageNodes ?? 'Unavailable'}`,
    `Active role counts: ${compactCounts(latest.activeRoleCounts, 40)}`,
    `Active content types: ${compactCounts(latest.activeContentTypeCounts, 40)}`,
    '',
    'TOOLS — V2.10.1 FIXED CLASSIFIER',
    `Explicit tool/function role nodes: ${latest.activeExplicitToolRoleNodes ?? 'Unavailable'}`,
    `Tool-like nodes: ${latest.activeToolishNodes ?? 'Unavailable'}`,
    `Tool call nodes: ${latest.activeToolCallNodes ?? 'Unavailable'}`,
    `Tool result nodes: ${latest.activeToolResultNodes ?? 'Unavailable'}`,
    `Tool call serialized node bytes: ${latest.activeToolCallBytes ?? 'Unavailable'}`,
    `Tool result serialized node bytes: ${latest.activeToolResultBytes ?? 'Unavailable'}`,
    `Tool call names: ${compactCounts(latest.activeToolCallNames, 60)}`,
    `Tool result names: ${compactCounts(latest.activeToolResultNames, 60)}`,
    `Non-generic recipient distribution: ${compactCounts(latest.activeRecipientCounts, 60)}`,
    '',
    'IMAGE / FILE / ASSET DIAGNOSTICS',
    `Attachment-like nodes: ${latest.activeAttachmentNodes ?? 'Unavailable'}`,
    `Image-like nodes: ${latest.activeImageNodes ?? 'Unavailable'}`,
    `File-like nodes: ${latest.activeFileNodes ?? 'Unavailable'}`,
    `Audio-like nodes: ${latest.activeAudioNodes ?? 'Unavailable'}`,
    `Video-like nodes: ${latest.activeVideoNodes ?? 'Unavailable'}`,
    `Image-generation call nodes: ${latest.activeImageGenCallNodes ?? 'Unavailable'}`,
    `Image-generation result nodes: ${latest.activeImageGenResultNodes ?? 'Unavailable'}`,
    `Generated-image nodes: ${latest.activeGeneratedImageNodes ?? 'Unavailable'}`,
    `Uploaded-image nodes: ${latest.activeUploadedImageNodes ?? 'Unavailable'}`,
    `Unique asset IDs: ${latest.activeUniqueAssetIds ?? 'Unavailable'}`,
    `Unique image asset IDs: ${latest.activeUniqueImageAssetIds ?? 'Unavailable'}`,
    `Unique file asset IDs: ${latest.activeUniqueFileAssetIds ?? 'Unavailable'}`,
    `Unique generated-image asset IDs: ${latest.activeUniqueGeneratedImageAssetIds ?? 'Unavailable'}`,
    `Unique uploaded-image asset IDs: ${latest.activeUniqueUploadedImageAssetIds ?? 'Unavailable'}`,
    `Image reference occurrences: ${latest.activeImageReferenceOccurrences ?? 'Unavailable'}`,
    `File reference occurrences: ${latest.activeFileReferenceOccurrences ?? 'Unavailable'}`,
    `Asset-like serialized node bytes: ${latest.activeAssetNodeBytes ?? 'Unavailable'}`,
    `Image-like serialized node bytes: ${latest.activeImageNodeBytes ?? 'Unavailable'}`,
    `File-like serialized node bytes: ${latest.activeFileNodeBytes ?? 'Unavailable'}`,
    '',
    'MODEL METADATA',
    `Active model distribution: ${compactCounts(latest.activeModelCounts, 60)}`,
    `GPT-6 Pro-labeled message nodes: ${latest.activeGpt6ProMessageNodes ?? 'Unavailable'}`,
    '',


    'CONTEXT-HISTORY TOPOLOGY — V2.12',
    `Current active depth: ${latest.currentDepth ?? 'Unavailable'}`,
    `Latest/current model label: ${latest.currentModel ?? 'Unavailable'}`,
    `Model segment count: ${latest.modelSegmentCount ?? 'Unavailable'}`,
    `Recent model segments: ${modelSegmentsTextV2114(latest.modelSegments, 40)}`,
    `GPT-6 Pro segment count: ${latest.gpt6ProSegmentCount ?? 'Unavailable'}`,
    `Longest GPT-6 Pro segment: ${segmentTextV2114(latest.longestGpt6ProSegment)}`,
    `Latest GPT-6 Pro segment: ${segmentTextV2114(latest.latestGpt6ProSegment)}`,
    `GPT-6 Pro depth count: ${latest.gpt6ProDepthCount ?? 'Unavailable'}`,
    `GPT-6 Pro depths: ${compactDepthsV2114(latest.gpt6ProDepths, 120)}`,
    `First GPT-6 Pro depth: ${latest.firstGpt6ProDepth ?? 'Unavailable'}`,
    `Last GPT-6 Pro depth: ${latest.lastGpt6ProDepth ?? 'Unavailable'}`,
    `Nodes since last GPT-6 Pro node: ${latest.nodesSinceLastGpt6Pro ?? 'Unavailable'}`,
    `Image-generation event depth count: ${latest.imageGenDepthCount ?? 'Unavailable'}`,
    `Image-generation event depths: ${compactDepthsV2114(latest.imageGenDepths, 120)}`,
    `Generated-image depth count: ${latest.generatedImageDepthCount ?? 'Unavailable'}`,
    `Generated-image depths: ${compactDepthsV2114(latest.generatedImageDepths, 120)}`,
    `Last image-generation depth: ${latest.lastImageGenDepth ?? 'Unavailable'}`,
    `Nodes since last image-generation event: ${latest.nodesSinceLastImageGen ?? 'Unavailable'}`,
    `Inferred image-generation pairs: ${latest.imageGenPairCount ?? 'Unavailable'}`,
    `Unpaired image-generation results: ${latest.imageGenUnpairedResults ?? 'Unavailable'}`,
    `Inferred image-generation call names: ${compactCounts(latest.imageGenInferredCallNames, 60)}`,
    `Image-generation pair distance min/max/avg: ${latest.imageGenPairDistanceMin ?? 'Unavailable'} / ${latest.imageGenPairDistanceMax ?? 'Unavailable'} / ${latest.imageGenPairDistanceAverage != null ? latest.imageGenPairDistanceAverage.toFixed(2) : 'Unavailable'}`,
    `Strong context marker count: ${latest.strongContextMarkerCount ?? 'Unavailable'}`,
    `Strong context marker depths: ${compactDepthsV2114(latest.strongContextMarkerDepths, 120)}`,
    `Nodes since last strong context marker: ${latest.nodesSinceLastStrongContextMarker ?? 'Unavailable'}`,
    `Reasoning recap marker count: ${latest.recapMarkerCount ?? 'Unavailable'}`,
    `Reasoning recap depths: ${compactDepthsV2114(latest.recapDepths, 120)}`,
    `Nodes since last reasoning recap: ${latest.nodesSinceLastRecap ?? 'Unavailable'}`,
    `Branch points after last image-gen: ${latest.branchPointsAfterLastImageGen ?? 'Unavailable'}`,
    `Branch points after last GPT-6 Pro node: ${latest.branchPointsAfterLastGpt6Pro ?? 'Unavailable'}`,
    `Branch points within ±32 nodes of image-gen: ${latest.branchPointsNearImageGen32 ?? 'Unavailable'}`,
    `Branch points within ±32 nodes of GPT-6 Pro: ${latest.branchPointsNearGpt6Pro32 ?? 'Unavailable'}`,
    `Nearest branch distance to last image-gen: ${latest.nearestBranchDistanceToLastImageGen ?? 'Unavailable'}`,
    `Nearest branch distance to last GPT-6 Pro: ${latest.nearestBranchDistanceToLastGpt6Pro ?? 'Unavailable'}`,
    `Recent windows: ${recentWindowsTextV2114(latest.recentWindows)}`,
    `Since last strong context marker: ${latest.sinceLastContext ? JSON.stringify(latest.sinceLastContext) : 'Unavailable'}`,
    '',





    'SSE OUTCOME + POST CORRELATION — V2.22',
    `Current attempt: ${latest.runtimeAttemptCurrent ? attemptSummaryText(latest.runtimeAttemptCurrent) : 'None'}`,
    `Last attempt: ${latest.runtimeAttemptLast ? attemptSummaryText(latest.runtimeAttemptLast) : 'Unavailable'}`,
    `Outcome confirmed by: ${attemptOutcomeConfirmationText(latest.runtimeAttemptDisplay)}`,
    `Outcome confirmed timestamp: ${latest.runtimeAttemptDisplay?.outcomeConfirmedAt ?? 'Unavailable'}`,
    `Post-outcome source correlation: ${attemptPostCorrelationText(latest.runtimeAttemptDisplay)}`,
    `Post-outcome captures: ${latest.runtimeAttemptDisplay?.postCorrelation?.captureCount ?? 0}`,
    `Post-outcome snapshots by family: ${latest.runtimeAttemptDisplay?.postCorrelation ? JSON.stringify(latest.runtimeAttemptDisplay.postCorrelation.snapshotsByFamily) : 'Unavailable'}`,
    `Post-outcome deltas by family: ${latest.runtimeAttemptDisplay?.postCorrelation ? JSON.stringify(latest.runtimeAttemptDisplay.postCorrelation.deltasByFamily) : 'Unavailable'}`,
    `Attempts stored: ${latest.runtimeAttemptCount ?? 0}`,
    `Prompt chars: ${latest.runtimeAttemptDisplay?.requestPromptChars ?? latest.runtimeAttemptDisplay?.promptChars ?? 'Unavailable'}`,
    `Attempt trigger: ${latest.runtimeAttemptDisplay?.trigger ?? 'Unavailable'}`,
    `Request URL: ${latest.runtimeAttemptDisplay?.requestURL ?? 'Unavailable'}`,
    `Request path: ${latest.runtimeAttemptDisplay?.requestPath ?? 'Unavailable'}`,
    `Request method: ${latest.runtimeAttemptDisplay?.requestMethod ?? 'Unavailable'}`,
    `Request body bytes: ${latest.runtimeAttemptDisplay?.requestBodyBytes ?? 'Unavailable'}`,
    `Request action: ${latest.runtimeAttemptDisplay?.requestAction ?? 'Unavailable'}`,
    `Request model: ${latest.runtimeAttemptDisplay?.requestModel ?? 'Unavailable'}`,
    `Request effort: ${latest.runtimeAttemptDisplay?.requestEffort ?? 'Unavailable'}`,
    `Request conversation ID: ${latest.runtimeAttemptDisplay?.requestConversationId ?? 'Unavailable'}`,
    `Request parent message ID: ${latest.runtimeAttemptDisplay?.requestParentMessageId ?? 'Unavailable'}`,
    `Request keys: ${Array.isArray(latest.runtimeAttemptDisplay?.requestKeys) ? latest.runtimeAttemptDisplay.requestKeys.join(', ') : 'Unavailable'}`,
    `Attached preflight: ${latest.runtimeAttemptDisplay?.preflight ? JSON.stringify(latest.runtimeAttemptDisplay.preflight) : 'Unavailable'}`,
    `Transport summary: ${attemptTransportSummary(latest.runtimeAttemptDisplay)}`,
    `Fetch/SSE stream summary: ${attemptStreamSummary(latest.runtimeAttemptDisplay)}`,
    `Stream observed: ${latest.runtimeAttemptDisplay?.streamStats?.observed ? 'Yes' : 'No'}`,
    `Stream chunk count: ${latest.runtimeAttemptDisplay?.streamStats?.chunkCount ?? 0}`,
    `Stream total bytes: ${latest.runtimeAttemptDisplay?.streamStats?.totalBytes ?? 0}`,
    `Stream largest chunk bytes: ${latest.runtimeAttemptDisplay?.streamStats?.maxChunkBytes ?? 0}`,
    `Stream first-byte timestamp: ${latest.runtimeAttemptDisplay?.streamStats?.firstByteAt ?? 'Unavailable'}`,
    `Stream ended timestamp: ${latest.runtimeAttemptDisplay?.streamStats?.endedAt ?? 'Unavailable'}`,
    `Stream done signals: ${latest.runtimeAttemptDisplay?.streamStats?.doneSignals ?? 0}`,
    `Stream MAX text detected: ${latest.runtimeAttemptDisplay?.streamStats?.maxTextDetected ? 'Yes' : 'No'}`,
    `Stream read error: ${latest.runtimeAttemptDisplay?.streamStats?.readError ?? 'None'}`,
    `Stream read error benign after completion: ${latest.runtimeAttemptDisplay?.streamStats?.readErrorBenign ? 'Yes' : 'No'}`,
    `Stream event types: ${attemptStreamEventsText(latest.runtimeAttemptDisplay,60)}`,
    `DOM mutation summary: ${attemptDOMSummary(latest.runtimeAttemptDisplay)}`,
    `DOM observer events: ${latest.runtimeAttemptDisplay?.domStats?.observerEvents ?? 0}`,
    `DOM assistant changes: ${latest.runtimeAttemptDisplay?.domStats?.assistantChanges ?? 0}`,
    `DOM generation starts: ${latest.runtimeAttemptDisplay?.domStats?.generationStarts ?? 0}`,
    `DOM generation stops: ${latest.runtimeAttemptDisplay?.domStats?.generationStops ?? 0}`,
    `Recent transport events: ${attemptRecentTransportText(latest.runtimeAttemptDisplay,40)}`,
    `WebSocket URLs: ${Array.isArray(latest.runtimeAttemptDisplay?.transportStats?.websocketURLs) ? latest.runtimeAttemptDisplay.transportStats.websocketURLs.join(' | ') : 'Unavailable'}`,
    `WebSocket inbound messages: ${latest.runtimeAttemptDisplay?.transportStats?.websocketInCount ?? 0}`,
    `WebSocket inbound bytes: ${latest.runtimeAttemptDisplay?.transportStats?.websocketInBytes ?? 0}`,
    `WebSocket outbound messages: ${latest.runtimeAttemptDisplay?.transportStats?.websocketOutCount ?? 0}`,
    `WebSocket outbound bytes: ${latest.runtimeAttemptDisplay?.transportStats?.websocketOutBytes ?? 0}`,
    `WebSocket largest message bytes: ${latest.runtimeAttemptDisplay?.transportStats?.websocketMaxBytes ?? 0}`,
    `Transport done signals: ${latest.runtimeAttemptDisplay?.transportStats?.doneSignals ?? 0}`,
    `Response status: ${latest.runtimeAttemptDisplay?.responseStatus ?? 'Unavailable'}`,
    `Response content type: ${latest.runtimeAttemptDisplay?.responseContentType ?? 'Unavailable'}`,
    `Response bytes: ${latest.runtimeAttemptDisplay?.responseBytes ?? 'Unavailable'}`,
    `Response MAX text detected: ${latest.runtimeAttemptDisplay?.responseMaxTextDetected ? 'Yes' : 'No'}`,
    `Pre-attempt model label: ${latest.runtimeAttemptDisplay?.preSnapshotModel ?? 'Unavailable'}`,
    `Effort UI hint: ${latest.runtimeAttemptDisplay?.effortHint ?? 'Unavailable'}`,
    `Pre-attempt DIRECT: ${lifecycleObsText(latest.runtimeAttemptDisplay?.pre?.direct)}`,
    `Pre-attempt BATCH: ${lifecycleObsText(latest.runtimeAttemptDisplay?.pre?.batch)}`,
    `DIRECT generation peak: ${attemptFamilyPeakText(latest.runtimeAttemptDisplay,'direct')}`,
    `BATCH generation peak: ${attemptFamilyPeakText(latest.runtimeAttemptDisplay,'batch')}`,
    `OTHER generation peak: ${attemptFamilyPeakText(latest.runtimeAttemptDisplay,'other')}`,
    `Network events stored (rolling rows): ${latest.runtimeAttemptDisplay?.networkEvents?.length ?? 0}`,
    `Network events total (family counters): ${attemptNetworkTotalCount(latest.runtimeAttemptDisplay)}`,
    `Largest network event bytes: ${latest.runtimeAttemptDisplay?.networkMaxBytes ?? 'Unavailable'}`,
    `Network families: ${attemptNetworkText(latest.runtimeAttemptDisplay)}`,
    `Attempt MAX snapshot: ${latest.runtimeAttemptDisplay?.maxSnapshot ? JSON.stringify(latest.runtimeAttemptDisplay.maxSnapshot) : 'Unavailable'}`,
    `Attempt post snapshot: ${latest.runtimeAttemptDisplay?.post ? JSON.stringify(latest.runtimeAttemptDisplay.post) : 'Unavailable'}`,
    `Attempt post delta: ${latest.runtimeAttemptDisplay?.deltas ? JSON.stringify(latest.runtimeAttemptDisplay.deltas) : 'Unavailable'}`,
    `Recent attempts: ${attemptRecentText(latest.runtimeAttemptHistory,30)}`,
    '',

    'SOURCE-SEPARATED BASELINES — V2.22',
    `Current source family: ${lifecycleFamilyLabel(latest.lifecycleCurrentSourceFamily)}`,
    `Source switches tracked: ${latest.lifecycleSourceSwitchCount ?? 0}`,
    `Canonical risk source: DIRECT`,
    `Canonical DIRECT risk available: ${latest.lifecycleCanonicalRiskAvailable ? 'Yes' : 'No'}`,
    `Canonical DIRECT risk band: ${latest.lifecycleCanonicalRiskAvailable ? v213RiskLabel(latest.lifecycleCanonicalRiskBand) : 'Unavailable'}`,
    `Canonical DIRECT stable retained bytes: ${latest.lifecycleCanonicalRetainedBytes ?? 'Unavailable'}`,
    `DIRECT stable snapshot: ${lifecycleObsText(latest.lifecycleDirect?.lastStable)}`,
    `DIRECT inflight snapshot: ${lifecycleObsText(latest.lifecycleDirect?.lastInflight)}`,
    `DIRECT MAX events tracked: ${latest.lifecycleDirect?.maxEvents?.length ?? 0}`,
    `DIRECT last MAX: ${latest.lifecycleDirect?.lastMaxEvent ? JSON.stringify(latest.lifecycleDirect.lastMaxEvent) : 'Unavailable'}`,
    `DIRECT recovery: ${latest.lifecycleDirect?.lastRecovery ? JSON.stringify(latest.lifecycleDirect.lastRecovery) : latest.lifecycleDirect?.recoveryPending ? JSON.stringify(latest.lifecycleDirect.recoveryPending) : 'Unavailable'}`,
    `BATCH stable snapshot: ${lifecycleObsText(latest.lifecycleBatch?.lastStable)}`,
    `BATCH inflight snapshot: ${lifecycleObsText(latest.lifecycleBatch?.lastInflight)}`,
    `BATCH MAX events tracked: ${latest.lifecycleBatch?.maxEvents?.length ?? 0}`,
    `BATCH last MAX: ${latest.lifecycleBatch?.lastMaxEvent ? JSON.stringify(latest.lifecycleBatch.lastMaxEvent) : 'Unavailable'}`,
    `BATCH recovery: ${latest.lifecycleBatch?.lastRecovery ? JSON.stringify(latest.lifecycleBatch.lastRecovery) : latest.lifecycleBatch?.recoveryPending ? JSON.stringify(latest.lifecycleBatch.recoveryPending) : 'Unavailable'}`,
    `OTHER stable snapshot: ${lifecycleObsText(latest.lifecycleOther?.lastStable)}`,
    `Recent source-separated snapshot history: ${lifecycleRowsText(latest.lifecycleObservations,40)}`,
    '',

    'CURRENT-SOURCE RETAINED DIAGNOSTIC — V2.22',
    `Risk meter available: ${latest.experimentalRiskAvailable ? 'Yes' : 'No'}`,
    `Primary experimental risk band: ${latest.experimentalRiskAvailable ? v213RiskLabel(latest.experimentalRiskBand) : 'Unavailable'}`,
    `Absolute retained-state proxy bytes: ${latest.experimentalRiskRetainedBytes ?? 'Unavailable'}`,
    `Secondary retained-state proxy share: ${latest.experimentalRiskProxyShare != null ? latest.experimentalRiskProxyShare.toFixed(2) + '%' : 'Unavailable'}`,
    `Delta vs smallest observed MAX sample: ${latest.experimentalRiskRetainedBytes != null ? v215ObservedDeltaText(latest.experimentalRiskRetainedBytes) : 'Unavailable'}`,
    `Highest confirmed healthy retained proxy: ${V215_RISK_CALIBRATION.highestHealthyObservedBytes}`,
    `Smallest observed MAX retained proxy: ${V215_RISK_CALIBRATION.smallestObservedMaxBytes}`,
    `Second observed MAX retained proxy: ${V215_RISK_CALIBRATION.secondObservedMaxBytes}`,
    `Density advisory: ${v214DensityLabel(latest.experimentalDensityLevel)}`,
    `128-node hottest special-state bytes: ${latest.experimentalRiskHot128Bytes ?? 'Unavailable'}`,
    `256-node hottest special-state bytes: ${latest.experimentalRiskHot256Bytes ?? 'Unavailable'}`,
    `Primary risk reasons: ${Array.isArray(latest.experimentalRiskReasons) ? latest.experimentalRiskReasons.join(' | ') : 'Unavailable'}`,
    `Density reasons: ${Array.isArray(latest.experimentalDensityReasons) ? latest.experimentalDensityReasons.join(' | ') : 'Unavailable'}`,
    'Primary calibration: Low <5.0MB; Elevated 5.0–6.0MB; High 6.0–6.5MB; Very High 6.5–7.0MB; Observed MAX Zone >=7.0MB retained proxy.',
    'Calibration evidence: highest confirmed healthy 6,826,995 B; independent MAX samples 7,015,394 B and 7,293,688 B.',
    'This is an empirical script heuristic, not an official OpenAI byte limit or remaining-capacity value.',
    '',

    'RETAINED-STATE PROFILER — V2.12',
    `Retained-state profiler present: ${latest.retainedStatePresent ? 'Yes' : 'No'}`,
    `Deduplicated active special-node JSON bytes: ${latest.activeSpecialNodeBytes ?? 'Unavailable'}`,
    `Active special-node share: ${latest.activeSpecialSharePercent != null ? latest.activeSpecialSharePercent.toFixed(2) + '%' : 'Unavailable'}`,
    `Retained-state proxy bytes (active special + alternate subtrees): ${latest.retainedStateProxyBytes ?? 'Unavailable'}`,
    `Retained-state proxy / active branch: ${latest.retainedStateProxySharePercent != null ? latest.retainedStateProxySharePercent.toFixed(2) + '%' : 'Unavailable'}`,
    `Active tool-result JSON bytes: ${latest.retainedActiveToolResultBytes ?? 'Unavailable'}`,
    `Active image-like JSON bytes: ${latest.retainedActiveImageLikeBytes ?? 'Unavailable'}`,
    `Active GPT-6 Pro-labeled JSON bytes: ${latest.retainedActiveGpt6ProBytes ?? 'Unavailable'}`,
    `Alternate subtree JSON bytes total: ${latest.retainedAlternateSubtreeBytesTotal ?? 'Unavailable'}`,
    `Largest alternate subtree JSON bytes: ${latest.retainedAlternateSubtreeBytesMax ?? 'Unavailable'}`,
    `Hottest 100-node buckets: ${v212BucketText(latest.retainedHottestBuckets, 20)}`,
    `Hottest 128-node window: ${v212HotWindowText(latest.retainedHotWindows?.w128)}`,
    `Hottest 256-node window: ${v212HotWindowText(latest.retainedHotWindows?.w256)}`,
    `Hottest 512-node window: ${v212HotWindowText(latest.retainedHotWindows?.w512)}`,
    `Branch retained-state details: ${v212BranchRetentionText(latest.retainedBranchDetails, 40)}`,
    `GPT-6 Pro segment retained-state: ${v212ProSegmentsText(latest.retainedProSegments, 40)}`,
    `Image-generation result count: ${latest.retainedImageGenResultCount ?? 'Unavailable'}`,
    `Image-generation result JSON bytes total: ${latest.retainedImageGenResultTotalBytes ?? 'Unavailable'}`,
    `Average image-generation result JSON bytes: ${latest.retainedImageGenResultAverageBytes ?? 'Unavailable'}`,
    `Largest image-generation result JSON bytes: ${latest.retainedLargestImageGenResultBytes ?? 'Unavailable'}`,
    `Top image-generation results: ${v212ImageGenResultsText({top: latest.retainedTopImageGenResults})}`,
    `Unique asset IDs observed in active branch: ${latest.retainedUniqueAssetsObserved ?? 'Unavailable'}`,
    `Image-generation-associated asset IDs: ${latest.retainedImageGenAssociatedAssetIds ?? 'Unavailable'}`,
    `Assets existing by last image-gen event: ${latest.retainedAssetsExistingByLastImage ?? 'Unavailable'}`,
    `Old assets referenced after last image-gen event: ${latest.retainedAssetsReferencedAfterLastImage ?? 'Unavailable'}`,
    `Image-gen-associated assets referenced after last image-gen event: ${latest.retainedImageGenAssetsReferencedAfterLastImage ?? 'Unavailable'}`,
    `Post-image nodes referencing pre-image assets: ${latest.retainedAssetReferenceNodesAfterLastImage ?? 'Unavailable'}`,
    '',

    'MAPPING / BRANCH TOPOLOGY',
    `Total mapping nodes: ${latest.mappingNodes ?? 'Unavailable'}`,
    `Off-branch nodes: ${latest.offBranchNodes ?? 'Unavailable'}`,
    `Leaf nodes: ${latest.leafNodes ?? 'Unavailable'}`,
    `Branch points (>1 child): ${latest.branchPoints ?? 'Unavailable'}`,
    `Maximum children on one node: ${latest.maxChildren ?? 'Unavailable'}`,
    `Branch points on active ancestry: ${latest.activeBranchPoints ?? 'Unavailable'}`,
    `Active branch-point depths: ${Array.isArray(latest.activeBranchPointDepths) ? latest.activeBranchPointDepths.join(', ') : 'Unavailable'}`,
    `Last branch-point depth: ${latest.lastBranchPointDepth ?? 'Unavailable'}`,
    `Nodes since last branch point: ${latest.nodesSinceLastBranchPoint ?? 'Unavailable'}`,
    `Alternate subtree nodes total: ${latest.alternateSubtreeNodesTotal ?? 'Unavailable'}`,
    `Largest alternate subtree nodes: ${latest.alternateSubtreeNodesMax ?? 'Unavailable'}`,
    `Branch-point details: ${compactBranchDetails(latest.branchPointDetails, 30)}`,
    '',
    'SERIALIZED BY ROLE / CONTENT TYPE',
    `Active node JSON bytes by role: ${compactByteCounts(latest.activeNodeBytesByRole, 60)}`,
    `Active node JSON bytes by content type: ${compactByteCounts(latest.activeNodeBytesByContentType, 60)}`,
    `Largest active node: ${describeLargest(latest.activeLargestNode)}`,
    `Largest active tool result: ${describeLargest(latest.activeLargestToolResult)}`,
    `Largest active image-like node: ${describeLargest(latest.activeLargestImageNode)}`,
    '',
    'WHOLE MAPPING — SELECTED DEEP COUNTERS',
    `Mapping explicit tool/function role nodes: ${latest.mappingExplicitToolRoleNodes ?? 'Unavailable'}`,
    `Mapping tool-like nodes: ${latest.mappingToolishNodes ?? 'Unavailable'}`,
    `Mapping tool call nodes: ${latest.mappingToolCallNodes ?? 'Unavailable'}`,
    `Mapping tool result nodes: ${latest.mappingToolResultNodes ?? 'Unavailable'}`,
    `Mapping image-generation call nodes: ${latest.mappingImageGenCallNodes ?? 'Unavailable'}`,
    `Mapping image-generation result nodes: ${latest.mappingImageGenResultNodes ?? 'Unavailable'}`,
    `Mapping generated-image nodes: ${latest.mappingGeneratedImageNodes ?? 'Unavailable'}`,
    `Mapping uploaded-image nodes: ${latest.mappingUploadedImageNodes ?? 'Unavailable'}`,
    `Mapping unique image asset IDs: ${latest.mappingUniqueImageAssetIds ?? 'Unavailable'}`,
    `Mapping unique file asset IDs: ${latest.mappingUniqueFileAssetIds ?? 'Unavailable'}`,
    `Mapping model distribution: ${compactCounts(latest.mappingModelCounts, 60)}`,
    `Mapping GPT-6 Pro-labeled message nodes: ${latest.mappingGpt6ProMessageNodes ?? 'Unavailable'}`,
    '',
    'SERIALIZED / NETWORK SIZE',
    `Active branch serialized JSON bytes: ${latest.activeBranchSerializedBytes ?? 'Unavailable'}`,
    `Full mapping serialized JSON bytes: ${latest.mappingSerializedBytes ?? 'Unavailable'}`,
    `Largest captured full conversation response bytes: ${latest.maxFullPayloadBytes ?? 'Unavailable'}`,
    `Largest observed conversation-network event bytes: ${latest.maxObservedPayloadBytes ?? 'Unavailable'}`,
    `Last observed conversation-network event bytes: ${latest.lastPayloadBytes ?? 'Unavailable'}`,
    '',
    'Note: V2.22 confirms SUCCESS directly from explicit SSE completion signals, records outcome-confirmation evidence, treats post-completion clone aborts as benign, and collects optional post-outcome source-family correlation while preserving preflight/WebSocket/source separation; heuristic classifiers for display-like content, tool names, image generation, assets and model metadata because these internal payload fields are not a public stable schema. Counts are for comparison across chats, not a universal remaining-capacity percentage.'
  ];

  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    return true;
  } catch {
    alert(lines.join('\n'));
    return false;
  }
}

async function enableNotifications() {
  if (!('Notification' in window)) return false;

  if (Notification.permission === 'granted') return true;

  if (Notification.permission === 'denied') {
    alert('Notifications are blocked for chatgpt.com.');
    return false;
  }

  return (await Notification.requestPermission()) === 'granted';
}

function checkNotifications(s) {
  if (
    !S.notifications ||
    !s.liveMaximum ||
    !('Notification' in window) ||
    Notification.permission !== 'granted'
  ) {
    return;
  }

  const k = `${P}:notify:${s.id}:live-max`;
  if (sessionStorage.getItem(k)) return;

  sessionStorage.setItem(k, '1');

  new Notification(
    'ChatGPT conversation maxed out',
    {
      body: 'The maximum-length banner is visible in this conversation.'
    }
  );
}

// ============================================================
// Settings UI
// ============================================================

function fillSettings() {
  panel.querySelector('[data-setting="charsPerToken"]').value =
    S.charsPerToken;

  panel.querySelector('[data-setting="notifications"]').checked =
    S.notifications;
}

async function saveSettingsForm() {
  const c = Number(
    panel.querySelector('[data-setting="charsPerToken"]').value
  );

  let n = panel.querySelector('[data-setting="notifications"]').checked;

  if (!Number.isFinite(c) || c < 2 || c > 8) {
    alert('Chars/token must be between 2 and 8.');
    return false;
  }

  if (n && !S.notifications) {
    n = await enableNotifications();
  }

  S.charsPerToken = c;
  S.notifications = n;
  S.calibrationTokens = null;

  saveSettings();
  settingsBox.classList.remove('open');
  render();
  return true;
}

// ============================================================
// Styles
// ============================================================

function injectStyles() {
  if (
    document.getElementById(`${P}:css`)
  ) {
    return;
  }

  const s = document.createElement('style');
  s.id = `${P}:css`;

  s.textContent = `
#${P}{
  --bg:rgba(20,92,55,.97);
  --muted:rgba(255,255,255,.68);

  position:fixed;
  right:22px;
  bottom:88px;
  z-index:2147483000;
  width:166px;

  background:var(--bg);
  color:#fff;

  border:1px solid rgba(255,255,255,.16);
  border-radius:12px;

  box-shadow:0 7px 25px rgba(0,0,0,.32);
  backdrop-filter:blur(12px);

  font:11px/1.55 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;

  overflow:hidden;
  transition:width .18s,background .25s;
}

#${P} *{box-sizing:border-box}

#${P}.theme-normal{--bg:rgba(20,92,55,.97)}
#${P}.theme-large{--bg:rgba(100,83,20,.97)}
#${P}.theme-warning{--bg:rgba(127,66,19,.97)}
#${P}.theme-critical,
#${P}.theme-maximum{--bg:rgba(119,27,27,.98)}
#${P}.theme-waiting{--bg:rgba(55,62,70,.97)}

#${P} .hdr{
  position:sticky;
  top:0;
  z-index:4;
  background:var(--bg);
  display:flex;
  justify-content:space-between;
  align-items:center;
  padding:9px 10px 4px;
  cursor:move;
  user-select:none;
}

#${P} .title{font-weight:800}

#${P} .expand{
  width:19px;
  height:19px;
  padding:0;
  border:0;
  border-radius:5px;
  background:rgba(255,255,255,.09);
  color:#fff;
  font:inherit;
  cursor:pointer;
}

#${P} .compact{
  padding:0 11px 10px;
  font-weight:600;
}

#${P} .divider{
  height:1px;
  margin:7px 0 6px;
  background:rgba(255,255,255,.3);
}

#${P} .compact-status{
  display:flex;
  gap:5px;
  align-items:center;
  font-weight:800;
  white-space:nowrap;
}

#${P} .dot{font-size:13px}
#${P} .dot.normal{color:#70f3b6}
#${P} .dot.large{color:#ffe36b}#${P} .dot.warning{color:#ffad5c}
#${P} .dot.critical,
#${P} .dot.maximum{color:#ff7777}
#${P} .dot.waiting{color:#b8c0c8}

#${P} .source-note{
  margin-top:5px;
  color:var(--muted);
  font-size:9px;
}

#${P} .detail{
  display:none;
  padding:2px 11px 10px;
  overflow-y:auto;
  overscroll-behavior:contain;
  scrollbar-gutter:stable;
  min-height:0;
}

#${P}.expanded{
  width:360px;
  max-height:88vh;
  display:flex;
  flex-direction:column;
}
#${P}.expanded .compact{display:none}
#${P}.expanded .detail{
  display:block;
  flex:1 1 auto;
  min-height:0;
  overflow-y:auto;
}

#${P} .expanded-top{
  display:flex;
  justify-content:space-between;
  align-items:flex-end;
}

#${P} .big-number{
  font-size:22px;
  font-weight:800;
  line-height:1.1;
}

#${P} .percent{
  font-size:17px;
  font-weight:800;
}

#${P} .muted,
#${P} .headroom{
  color:var(--muted);
  font-size:9px;
}

#${P} .progress-shell{
  height:7px;
  margin:10px 0 4px;
  background:rgba(0,0,0,.22);
  border-radius:999px;
  overflow:hidden;
}

#${P} .progress-bar{
  height:100%;
  border-radius:999px;
}

#${P} .headroom{
  text-align:right;
  margin-bottom:10px;
}

#${P} .stats-grid{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:7px 10px;
}

#${P} .wide{grid-column:1/-1}
#${P} .label{color:var(--muted);font-size:8px}
#${P} .value{font-weight:700}
#${P} .tiny-value{font-size:8px;line-height:1.35;overflow-wrap:anywhere}

#${P} .section-title{
  margin:10px 0 6px;
  padding-top:7px;
  border-top:1px solid rgba(255,255,255,.16);
  color:rgba(255,255,255,.82);
  font-size:8px;
  font-weight:800;
  letter-spacing:.45px;
}

#${P} .expanded-status{
  margin-top:11px;
  padding:7px;
  border-radius:7px;
  background:rgba(0,0,0,.18);
  text-align:center;
  font-weight:800;
}

#${P} .action-grid{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:5px;
  margin-top:7px;
}

#${P} .wide-button{grid-column:1/-1}

#${P} .quick-actions{
  position:sticky;
  top:0;
  z-index:3;
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:6px;
  margin:0 -2px 8px;
  padding:4px 2px 7px;
  background:linear-gradient(
    to bottom,
    var(--bg) 0%,
    var(--bg) 78%,
    rgba(0,0,0,0) 100%
  );
}

#${P} .quick-actions button{
  padding:7px 6px;
  border:1px solid rgba(255,255,255,.16);
  border-radius:7px;
  background:rgba(0,0,0,.28);
  color:#fff;
  font-size:9px;
  font-weight:800;
  cursor:pointer;
}

#${P} .quick-actions button:hover{
  background:rgba(0,0,0,.40);
}

#${P} .detail::-webkit-scrollbar,
#${P} .settings::-webkit-scrollbar{
  width:8px;
}

#${P} .detail::-webkit-scrollbar-thumb,
#${P} .settings::-webkit-scrollbar-thumb{
  background:rgba(255,255,255,.22);
  border-radius:999px;
}

#${P} .detail::-webkit-scrollbar-track,
#${P} .settings::-webkit-scrollbar-track{
  background:rgba(0,0,0,.08);
}


#${P} button{font-family:inherit}

#${P} .action-grid button,
#${P} .settings-btn,
#${P} .settings-actions button,
#${P} .expand{
  transition:
    transform .07s ease,
    background .10s ease,
    border-color .10s ease,
    box-shadow .10s ease,
    filter .10s ease;
}

#${P} .action-grid button,
#${P} .settings-btn,
#${P} .settings-actions button{
  padding:6px 5px;
  border:1px solid rgba(255,255,255,.1);
  border-radius:6px;
  background:rgba(0,0,0,.2);
  color:#fff;
  font-size:9px;
  cursor:pointer;
  box-shadow:0 1px 0 rgba(255,255,255,.05);
}

#${P} button:not(:disabled):hover{
  background:rgba(0,0,0,.29);
  border-color:rgba(255,255,255,.18);
}

#${P} button:not(:disabled):active,
#${P} button.press-flash{
  transform:translateY(1px) scale(.975);
  background:rgba(255,255,255,.16);
  border-color:rgba(255,255,255,.34);
  box-shadow:inset 0 2px 5px rgba(0,0,0,.28);
  filter:brightness(1.13);
}


#${P} button{
  transition:
    transform .07s ease,
    filter .07s ease,
    box-shadow .07s ease,
    background .07s ease;
}

#${P} button:active:not(:disabled){
  transform:translateY(2px) scale(.985);
  filter:brightness(1.35);
  box-shadow:
    inset 0 2px 5px rgba(0,0,0,.38),
    0 0 0 1px rgba(255,255,255,.18);
}

#${P} button:disabled{
  opacity:.48;
  cursor:not-allowed;
}

#${P} .button-feedback{
  margin-top:6px;
  padding:5px 6px;
  border-radius:6px;
  text-align:center;
  font-size:8px;
  font-weight:800;
  background:rgba(0,0,0,.18);
  border:1px solid rgba(255,255,255,.10);
}

#${P} .button-feedback.ok{color:#9af8c8}
#${P} .button-feedback.busy{color:#d6e7ff}
#${P} .button-feedback.warn{color:#ffe38a}
#${P} .button-feedback.error{color:#ffaaaa}


#${P} .risk-card{
  margin:8px 0 10px;
  padding:8px;
  border-radius:8px;
  border:1px solid rgba(255,255,255,.16);
  background:rgba(0,0,0,.18);
}


#${P} .density-advisory{
  color:#ffe38a;
  font-weight:800;
}

#${P} .density-card{
  margin-top:7px;
  padding:6px;
  border-radius:6px;
  background:rgba(0,0,0,.14);
  border:1px solid rgba(255,255,255,.10);
}

#${P} .density-card.normal{
  border-color:rgba(112,243,182,.18);
}

#${P} .density-card.dense{
  border-color:rgba(255,227,107,.35);
}

#${P} .density-card.extreme{
  border-color:rgba(255,119,119,.48);
}

#${P} .risk-card-top{
  display:flex;
  justify-content:space-between;
  gap:8px;
  align-items:center;
}

#${P} .risk-label{
  font-size:8px;
  color:var(--muted);
  font-weight:800;
  letter-spacing:.35px;
}

#${P} .risk-band{
  font-size:13px;
  font-weight:900;
}

#${P} .risk-meter-shell{
  height:7px;
  margin:7px 0 5px;
  border-radius:999px;
  overflow:hidden;
  background:rgba(0,0,0,.28);
}

#${P} .risk-meter-fill{
  height:100%;
  border-radius:999px;
  background:rgba(255,255,255,.72);
}

#${P} .risk-explain{
  color:rgba(255,255,255,.76);
  font-size:8px;
  line-height:1.4;
}

#${P} .risk-calibration{
  margin-top:5px;
  color:rgba(255,255,255,.55);
  font-size:7px;
  line-height:1.35;
}

#${P} .capture-note,
#${P} .diag,
#${P} .cal-note{
  margin-top:6px;
  text-align:center;
  font-size:8px;
}

#${P} .capture-note,
#${P} .diag{
  color:rgba(255,255,255,.72);
}

#${P} .cal-note.good{color:#8ff7c1}
#${P} .cal-note.warn{color:#ffe38a}

#${P} .settings-toggle{
  flex:0 0 auto;
  background:var(--bg);
  display:none;
  padding:0 11px 9px;
}

#${P}.expanded .settings-toggle{display:block}

#${P} .settings-btn{width:100%}

#${P} .settings{
  flex:0 0 auto;
  max-height:42vh;
  overflow-y:auto;
  display:none;
  padding:9px 11px 11px;
  border-top:1px solid rgba(255,255,255,.15);
  background:rgba(0,0,0,.1);
}

#${P} .settings.open{display:block}

#${P} .row{margin-bottom:8px}

#${P} .row label{
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap:10px;
}

#${P} .row span{font-size:9px}

#${P} input[type="number"]{
  width:79px;
  padding:4px;
  border:1px solid rgba(255,255,255,.14);
  border-radius:5px;
  background:rgba(0,0,0,.2);
  color:#fff;
  font:9px inherit;
}

#${P} .settings-actions{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:5px;
  margin-top:9px;
}

#${P} .settings-wide{grid-column:1/-1}
`;

  (
    document.head ||
    document.documentElement
  ).appendChild(s);
}


// ============================================================
// UI creation / dragging
// ============================================================

function createUI() {
  panel?.remove();
  injectStyles();

  panel = document.createElement('div');
  panel.id = P;

  panel.innerHTML = `
    <div class="hdr">
      <div class="title">CHAT SIZE</div>

      <button class="expand" data-action="expand">+</button>
    </div>

    <div class="compact"></div>
    <div class="detail"></div>

    <div class="settings-toggle">
      <button class="settings-btn" data-action="settings">
        Settings
      </button>
    </div>

    <div class="settings">
      <div class="row">
        <label>
          <span>Chars / token estimate</span>
          <input
            data-setting="charsPerToken"
            type="number"
            min="2"
            max="8"
            step="0.1"
          >
        </label>
      </div>

      <div class="row">
        <label>
          <span>Notify on real MAX banner</span>
          <input
            data-setting="notifications"
            type="checkbox"
          >
        </label>
      </div>

      <div class="settings-actions">
        <button data-action="save-settings">Save</button>

        <button data-action="clear-snapshot">
          Clear chat snapshot
        </button>

        <button
          class="settings-wide"
          data-action="clear-max-samples"
        >
          Clear verified max samples
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(panel);

  compact = panel.querySelector('.compact');
  detail = panel.querySelector('.detail');
  settingsBox = panel.querySelector('.settings');

  restorePosition();
  fillSettings();
  bindUI();
  render();
}

function restorePosition() {
  let pos = null;

  for (const k of [
    POSITION_KEY,
    'cgpt-size-meter-v210:position',
    'cgpt-size-meter-v29:position',
    'cgpt-size-meter-v26:position',
    'cgpt-size-meter-v25:position',
    'cgpt-size-meter-v24:position'
  ]) {
    try {
      const x = JSON.parse(
        localStorage.getItem(k)
      );

      if (x) {
        pos = x;
        break;
      }
    } catch {}
  }

  if (
    !pos ||
    !Number.isFinite(pos.left) ||
    !Number.isFinite(pos.top)
  ) {
    return;
  }

  panel.style.left = `${pos.left}px`;
  panel.style.top = `${pos.top}px`;
  panel.style.right = 'auto';
  panel.style.bottom = 'auto';
}

function savePosition() {
  const r = panel.getBoundingClientRect();

  localStorage.setItem(
    POSITION_KEY,
    JSON.stringify({
      left: r.left,
      top: r.top
    })
  );
}

function bindUI() {
  panel.addEventListener(
    'pointerdown',
    e => {
      const b = e.target.closest('button:not(:disabled)');
      if (!b) return;
      b.classList.add('press-flash');
      setTimeout(() => b.classList.remove('press-flash'), 130);
    }
  );

  panel.addEventListener(
    'click',
    async e => {
      const b = e.target.closest('[data-action]');
      if (!b || b.disabled) return;

      switch (b.dataset.action) {
        case 'expand':
          S.expanded = !S.expanded;
          saveSettings();
          render();
          break;

        case 'settings': {
          const opening = !settingsBox.classList.contains('open');
          settingsBox.classList.toggle('open');
          b.textContent = opening ? 'Settings ▲' : 'Settings';
          break;
        }

        case 'retry': {
          b.textContent = 'Capturing…';
          b.disabled = true;
          showFeedback('Forcing fresh V2.22 mapping…', 'busy', 12000);

          const fresh = await retryCapture();
          const refreshed = calculateStats();

          showFeedback(
            fresh
              ? (
                  refreshed.topologyOk
                    ? 'Fresh topology captured ✓'
                    : 'Fresh mapping captured; topology error logged'
                )
              : 'No fresh full mapping received',
            fresh
              ? (refreshed.topologyOk ? 'ok' : 'warn')
              : 'warn',
            2400
          );

          break;
        }

        case 'copy': {
          b.textContent = 'Copying…';
          const ok = await copyStats();
          showFeedback(
            ok ? 'Diagnostics copied ✓' : 'Copy failed',
            ok ? 'ok' : 'error',
            1500
          );
          break;
        }

        case 'save-max-sample': {
          b.textContent = 'Saving…';
          const ok = saveCurrentVerifiedMaxSample();
          if (ok) {
            showFeedback('Verified MAX sample saved ✓', 'ok', 1700);
          }
          break;
        }

        case 'save-settings': {
          b.textContent = 'Saving…';
          const ok = await saveSettingsForm();
          if (ok) showFeedback('Settings saved ✓', 'ok', 1300);
          break;
        }

        case 'clear-snapshot': {
          const ok = clearSnapshot();
          if (ok) showFeedback('Chat snapshot cleared ✓', 'ok', 1300);
          break;
        }

        case 'clear-max-samples': {
          const ok = clearVerifiedSamplesUI();
          if (ok) showFeedback('Verified MAX samples cleared ✓', 'ok', 1300);
          break;
        }
      }
    }
  );

  panel.querySelector('.hdr').addEventListener(
    'mousedown',
    e => {
      if (
        e.button !== 0 ||
        e.target.closest('button')
      ) {
        return;
      }

      const r = panel.getBoundingClientRect();

      drag = true;
      dx = e.clientX - r.left;
      dy = e.clientY - r.top;

      panel.style.right = 'auto';
      panel.style.bottom = 'auto';

      e.preventDefault();
    }
  );

  document.addEventListener(
    'mousemove',
    e => {
      if (!drag) return;

      panel.style.left =
        Math.max(
          0,
          Math.min(
            innerWidth - panel.offsetWidth,
            e.clientX - dx
          )
        ) + 'px';

      panel.style.top =
        Math.max(
          0,
          Math.min(
            innerHeight - panel.offsetHeight,
            e.clientY - dy
          )
        ) + 'px';
    }
  );

  document.addEventListener(
    'mouseup',
    () => {
      if (!drag) return;
      drag = false;
      savePosition();
    }
  );
}


// ============================================================
// Start
// ============================================================

function startUI() {
  if (!document.body) {
    setTimeout(startUI, 100);
    return;
  }

  createUI();
  installAttemptDOMObserver();

  /*
    A direct retry shortly after the page settles. Network hooks are already
    active from document-start, so this is only a backup.
  */
  setTimeout(
    retryCapture,
    1800
  );

  directRetryTimer = setInterval(
    () => {
      const id = chatIdFromURL();

      if (id) {
        const snap = loadSnapshot(id);

        if (
          !snap.full ||
          !snap.structure ||
          !snap.structure.contextTopology
        ) {
          retryCapture();
        }
      }
    },
    15000
  );

  setInterval(
    () => {
      if (location.href !== lastURL) {
        lastURL = location.href;

        setTimeout(
          () => {
            render();
            retryCapture();
          },
          400
        );
      } else {
        render();
      }
    },
    3000
  );
}

startUI();

})();