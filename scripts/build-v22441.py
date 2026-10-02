"""Pinned V2.24.4 plus current pressure identity selection and version metadata."""
from pathlib import Path
import subprocess,hashlib,sys
root=Path(__file__).resolve().parent.parent
parent='904798397da384c1eee4190035647a22b521464f'
get=lambda name:subprocess.check_output(['git','show',parent+':'+name],cwd=root)
source=get('releases/v2.24.4/chatgpt_chat_size_meter_v2244_multi_effort_seeds.js')
assert hashlib.sha256(source).hexdigest()=='6904e1095b94109dcfda934fe0b54ae78b5b3a869c00b5b454f33ffd9f4983e3'
start=source.index(b'function pressureCurrent(')
end=source.index(b'function pressureEffectiveMax(',start)
new=(root/'src/v22441/pressure-current.js').read_bytes()
assert b'\r' not in new and new.endswith(b'\n')
source=source[:start]+new+source[end:]
for name in ['src/v2244/seed-registry.js','src/v2242/anonymous-seed.js','src/v22432/canonical-effort.js']:
 assert get(name) in source,name
assert source.count(b'V2.24.4 MULTI-EFFORT ANONYMOUS SEEDS')==3
source=source.replace(b'V2.24.4 MULTI-EFFORT ANONYMOUS SEEDS',b'V2.24.4.1 CURRENT MODEL IDENTITY REPAIR')
assert source.count(b"'2.24.4'")==3
source=source.replace(b"'2.24.4'",b"'2.24.4.1'")
assert source.count(b'// @version      2.24.4')==1
source=source.replace(b'// @version      2.24.4',b'// @version      2.24.4.1')
target=root/'releases/v2.24.4.1/chatgpt_chat_size_meter_v22441_current_model_identity.js'
if '--check' in sys.argv:
 assert target.read_bytes()==source
 print('PASS pinned parent plus pressureCurrent and seven identity literals only')
else:
 target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(source)
 print(f'Built {target.name}: {len(source)} bytes')
