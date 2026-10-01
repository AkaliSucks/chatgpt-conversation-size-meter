"""Surgical, reproducible V2.24 integration over exact frozen V2.23.5 bytes."""
from pathlib import Path
import hashlib
import sys

root = Path(__file__).resolve().parent.parent
base = root / 'releases/v2.23.5/chatgpt_chat_size_meter_v2235_reliability_hotfix.js'
data = base.read_bytes()
assert hashlib.sha256(data).hexdigest() == 'a6b4f536a79dcefba5abbb438eec8223b8eb95cc852529199400934e3c2ec506'
text = data.decode('utf-8')
fragment = (root / 'src/v224/pressure-calibration.js').read_bytes().decode('utf-8')
replacements = [
    ('// @name         ChatGPT Conversation Size Meter V2.23.5 RELIABILITY HOTFIX',
     '// @name         ChatGPT Conversation Size Meter V2.24 EMPIRICAL PRESSURE'),
    ('// @version      2.23.5', '// @version      2.24.0'),
    ("health.candidateVersion = '2.23.5';", "health.candidateVersion = '2.24.0';"),
    ("const trace = {version:'2.23.5'", "const trace = {version:'2.24.0'"),
    ('ChatGPT Conversation Size Meter V2.23.5 EVENT MODEL CLEANUP',
     'ChatGPT Conversation Size Meter V2.24 EMPIRICAL PRESSURE'),
    ('Candidate userscript: V2.23.5 RELIABILITY HOTFIX',
     'Candidate userscript: V2.24 EMPIRICAL PRESSURE'),
    ('function eventStorageError(id, error) {', fragment + '\nfunction eventStorageError(id, error) {'),
    ('  eventSave(id,`${P}:max-episodes-v223:${id}`,state);',
     '  eventSave(id,`${P}:max-episodes-v223:${id}`,state);\n  pressureCollect(id);'),
    ('  eventSave(id, attemptKey(id), x);', '  eventSave(id, attemptKey(id), x);\n  pressureCollect(id);'),
    ('  createUI();\n  installAttemptDOMObserver();',
     '  pressureCollect(chatIdFromURL());\n  createUI();\n  installAttemptDOMObserver();'),
    ("    'STATIC STATE VECTOR',JSON.stringify(eventStaticState(id))];",
     "    'STATIC STATE VECTOR',JSON.stringify(eventStaticState(id)),\n"
     "    'V2.24 PRESSURE CALIBRATION',JSON.stringify(pressureResult(id)),\n"
     "    'CALIBRATION SAMPLE SUMMARY',JSON.stringify(pressureSummary())];"),
    ('  const st = getStatus(latest);\n\n  panel.className',
     '  const st = getStatus(latest);\n  const pressure = pressureResult(latest.id);\n\n  panel.className'),
    ('    <div class="compact-stats">\n      <div>',
     '    <div class="compact-stats">\n      <div><strong>${esc(pressureText(pressure))}</strong></div>\n      <div>'),
    ("'v2.23 event model cleanup'", "'v2.24 empirical pressure'"),
    ("${latest.liveMaximum ? 'MAX NOW' : 'V2.23'}", "${esc(pressureText(pressure))}"),
    ('    ${eventPanelMarkup(latest.id)}',
     '    <div class="section-title">V2.24 PRESSURE CALIBRATION</div>\n'
     '    <div class="capture-note">${esc(pressureText(pressure))} · empirical signal; no official capacity estimate</div>\n'
     '    ${eventPanelMarkup(latest.id)}'),
]
for old, new in replacements:
    assert text.count(old) == 1, repr(old)
    text = text.replace(old, new)
output = root / 'releases/v2.24.0/chatgpt_chat_size_meter_v224_empirical_pressure.js'
candidate = text.encode('utf-8')
assert b'\r' not in candidate
if '--check' in sys.argv:
    assert output.read_bytes() == candidate, 'Candidate differs from exact surgical integration'
    print('PASS exact V2.24 integration over frozen V2.23.5; all other bytes unchanged')
else:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(candidate)
    print(f'Built {output.name}: {len(candidate)} bytes')
