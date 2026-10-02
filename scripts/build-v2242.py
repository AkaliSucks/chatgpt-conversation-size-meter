"""Reconstruct V2.24.2 from frozen V2.24.1 plus anonymous static seed."""
from pathlib import Path
import subprocess
import hashlib
import sys
root=Path(__file__).resolve().parent.parent
parent='2658874a7acf71c8805677098c08f7e79c7422cc'
source=subprocess.check_output(['git','show',parent+':releases/v2.24.1/chatgpt_chat_size_meter_v2241_dual_axis_pressure.js'],cwd=root)
assert hashlib.sha256(source).hexdigest()=='4466fffc8040905d367c3d4acad05a7108d16599b62c5143e8fbeda5488abac5'
original=subprocess.check_output(['git','show',parent+':src/v2241/pressure-calibration.js'],cwd=root)
seed=(root/'src/v2242/anonymous-seed.js').read_bytes()+b'\n'
revised=(root/'src/v2242/pressure-calibration.js').read_bytes()
assert b'\r' not in seed+revised and source.count(original)==1
source=source.replace(original,seed+revised)
assert source.count(b'V2.24.1 DUAL AXIS PRESSURE')==3
source=source.replace(b'V2.24.1 DUAL AXIS PRESSURE',b'V2.24.2 ANONYMOUS SEED CALIBRATION')
for before,after in [(b'// @version      2.24.1',b'// @version      2.24.2'),
    (b"health.candidateVersion = '2.24.1'",b"health.candidateVersion = '2.24.2'"),
    (b"version:'2.24.1'",b"version:'2.24.2'")]:
    assert source.count(before)==1,before
    source=source.replace(before,after)
target=root/'releases/v2.24.2/chatgpt_chat_size_meter_v2242_anonymous_seed_calibration.js'
if '--check' in sys.argv:
    assert target.read_bytes()==source
    print('PASS exact frozen parent + anonymous seed + pressure fragment + six identity fields; all other bytes unchanged')
else:
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_bytes(source)
    print(f'Built {target.name}: {len(source)} bytes')
