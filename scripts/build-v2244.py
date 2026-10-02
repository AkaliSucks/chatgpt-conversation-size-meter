"""Exact native-validated V2.24.3.2 plus multi-effort static registry."""
from pathlib import Path
import subprocess,hashlib,sys
root=Path(__file__).resolve().parent.parent
parent='decc7a38ad6a842015092c8c36bee09f7166289a'
get=lambda name:subprocess.check_output(['git','show',parent+':'+name],cwd=root)
source=get('releases/v2.24.3.2/chatgpt_chat_size_meter_v22432_medium_effort_repair.js')
assert hashlib.sha256(source).hexdigest()=='a1e26197db6a6ad4a2344e79da2bf3798f4c1ab29e2b26ac6ebab68fc527dfa6'
old=get('src/v2243/seed-registry.js')
new=(root/'src/v2244/seed-registry.js').read_bytes()
assert source.count(old)==1 and b'\r' not in new
source=source.replace(old,new)
assert get('src/v2242/anonymous-seed.js') in source
assert get('src/v22432/canonical-effort.js') in source
assert source.count(b'V2.24.3.2 MEDIUM EFFORT REPAIR')==3
source=source.replace(b'V2.24.3.2 MEDIUM EFFORT REPAIR',b'V2.24.4 MULTI-EFFORT ANONYMOUS SEEDS')
assert source.count(b"'2.24.3.2'")==3
source=source.replace(b"'2.24.3.2'",b"'2.24.4'")
assert source.count(b'// @version      2.24.3.2')==1
source=source.replace(b'// @version      2.24.3.2',b'// @version      2.24.4')
target=root/'releases/v2.24.4/chatgpt_chat_size_meter_v2244_multi_effort_seeds.js'
if '--check' in sys.argv:
 assert target.read_bytes()==source
 print('PASS exact frozen parent plus static registry and seven identity fields; all scorer/privacy/parser/storage bytes unchanged')
else:
 target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(source)
 print(f'Built {target.name}: {len(source)} bytes')
