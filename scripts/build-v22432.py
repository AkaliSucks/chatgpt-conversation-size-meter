"""Exact V2.24.3.1 parent plus Medium alias and seven identity literals."""
from pathlib import Path
import subprocess,hashlib,sys
root=Path(__file__).resolve().parent.parent
parent='849e75ac78c55d5359efa16003783bbb8228c83b'
get=lambda name:subprocess.check_output(['git','show',parent+':'+name],cwd=root)
source=get('releases/v2.24.3.1/chatgpt_chat_size_meter_v22431_effort_normalization.js')
assert hashlib.sha256(source).hexdigest()=='5ee71a060d08570073a202dcef25700d5eeb559472f872613206b37f6e98efde'
old=get('src/v22431/canonical-effort.js')
new=(root/'src/v22432/canonical-effort.js').read_bytes()
assert new==old.replace(b'Extra High/max and High/extended.',b'Extra High/max, High/extended, Medium/standard.').replace(
 b"effort==='extended' ? 'high' : effort;",b"effort==='extended' ? 'high' : effort==='standard' ? 'medium' : effort;")
assert source.count(old)==1 and b'\r' not in new
source=source.replace(old,new)
assert source.count(b'V2.24.3.1 CANONICAL EFFORT REPAIR')==3
source=source.replace(b'V2.24.3.1 CANONICAL EFFORT REPAIR',b'V2.24.3.2 MEDIUM EFFORT REPAIR')
assert source.count(b"'2.24.3.1'")==3
source=source.replace(b"'2.24.3.1'",b"'2.24.3.2'")
assert source.count(b'// @version      2.24.3.1')==1
source=source.replace(b'// @version      2.24.3.1',b'// @version      2.24.3.2')
target=root/'releases/v2.24.3.2/chatgpt_chat_size_meter_v22432_medium_effort_repair.js'
if '--check' in sys.argv:
 assert target.read_bytes()==source
 print('PASS exact frozen parent plus standard -> medium alias/comment and seven identity fields; all other bytes unchanged')
else:
 target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(source)
 print(f'Built {target.name}: {len(source)} bytes')
