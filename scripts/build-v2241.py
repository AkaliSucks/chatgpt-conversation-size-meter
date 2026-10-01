"""Reconstruct V2.24.1 from the immutable validated correctness checkpoint."""
from pathlib import Path
import subprocess
import hashlib
import sys
root = Path(__file__).resolve().parent.parent
parent = '34195fa83942beb8b5e335833634295abb85898b'
source = subprocess.check_output(['git','show',parent+':releases/v2.24.0-calibration-correctness/chatgpt_chat_size_meter_v2240_calibration_correctness.js'],cwd=root)
assert hashlib.sha256(source).hexdigest() == '106cf0e897c3a20d60e968de50702df22bf3b1b1934dc8e0611d68b7c1f82ca5'
original = subprocess.check_output(['git','show',parent+':src/v224-correctness/pressure-calibration.js'],cwd=root)
revised = (root / 'src/v2241/pressure-calibration.js').read_bytes()
assert b'\r' not in revised and source.count(original) == 1
source = source.replace(original,revised)
assert source.count(b'V2.24 CALIBRATION CORRECTNESS') == 3
source = source.replace(b'V2.24 CALIBRATION CORRECTNESS',b'V2.24.1 DUAL AXIS PRESSURE')
for before,after in [(b'// @version      2.24.0',b'// @version      2.24.1'),
                     (b"health.candidateVersion = '2.24.0'",b"health.candidateVersion = '2.24.1'"),
                     (b"version:'2.24.0'",b"version:'2.24.1'")]:
    assert source.count(before) == 1, before
    source = source.replace(before,after)
target = root / 'releases/v2.24.1/chatgpt_chat_size_meter_v2241_dual_axis_pressure.js'
if '--check' in sys.argv:
    assert target.read_bytes() == source
    print('PASS exact parent + pressure fragment + six candidate identity fields; every other byte unchanged')
else:
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_bytes(source)
    print(f'Built {target.name}: {len(source)} bytes')
