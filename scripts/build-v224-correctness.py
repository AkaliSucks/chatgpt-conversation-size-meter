"""Only replace the pressure fragment and candidate identity in exact V2.24.0."""
from pathlib import Path
import subprocess
import hashlib
import sys
root = Path(__file__).resolve().parent.parent
parent = '2c4e78d80cae6763c3a333841db728060ff669b0'
source = subprocess.check_output(['git','show',parent+':releases/v2.24.0/chatgpt_chat_size_meter_v224_empirical_pressure.js'],cwd=root)
assert hashlib.sha256(source).hexdigest() == 'b4f042e04f4369c8e830d0f6dd41239054b5134c580cf5d3d1c58b89cdaef866'
original = subprocess.check_output(['git','show',parent+':src/v224/pressure-calibration.js'],cwd=root)
revised = (root / 'src/v224-correctness/pressure-calibration.js').read_bytes()
assert b'\r' not in revised
assert source.count(original) == 1
source = source.replace(original,revised)
assert source.count(b'V2.24 EMPIRICAL PRESSURE') == 3
source = source.replace(b'V2.24 EMPIRICAL PRESSURE',b'V2.24 CALIBRATION CORRECTNESS')
target = root / 'releases/v2.24.0-calibration-correctness/chatgpt_chat_size_meter_v2240_calibration_correctness.js'
if '--check' in sys.argv:
    assert target.read_bytes() == source
    print('PASS exact parent + pressure fragment + three candidate identity labels; all other bytes unchanged')
else:
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_bytes(source)
    print(f'Built {target.name}: {len(source)} bytes')
