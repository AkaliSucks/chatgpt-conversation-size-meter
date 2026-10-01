"""Full reference/revision validation with immutable-parent byte checks."""
from pathlib import Path
import subprocess
root = Path(__file__).resolve().parent.parent
folder = root / 'releases/v2.24.0-calibration-correctness'
candidate = folder / 'chatgpt_chat_size_meter_v2240_calibration_correctness.js'
parent = '2c4e78d80cae6763c3a333841db728060ff669b0'
log = []
def run(args,output=None):
    result = subprocess.run(args,cwd=root,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
    text = result.stdout.decode('utf-8',errors='replace').replace('\r\n','\n')
    log.append('$ '+subprocess.list2cmdline(args)+'\n'+text)
    if output:
        (folder / output).write_bytes(text.encode())
    print(text.strip().split('\n')[-1] if text.strip() else 'PASS '+subprocess.list2cmdline(args),flush=True)
    if result.returncode:
        (folder / 'VALIDATION.txt').write_bytes(('\n'.join(log)).encode())
        raise SystemExit(result.returncode)
run(['node','--version'])
run(['python','--version'])
run([r'C:\Program Files\Git\bin\bash.exe','-c',
     'export PATH="/usr/bin:/c/Program Files/nodejs:$PATH"; bash scripts/verify-baseline.sh'])
for path in [candidate,root / 'src/v224-correctness/pressure-calibration.js',*sorted((root / 'scripts').glob('*v224-correctness*.js'))]:
    run(['node','--check',str(path)])
run(['node','scripts/verify-v2235-protected.js'])
run(['node','scripts/verify-v224-protected.js'])
run(['node','scripts/verify-v224-correctness.js'])
run(['node','scripts/test-v223.js'],'FROZEN_HOTFIX_120.txt')
run(['node','scripts/test-v224-prior.js'],'FROZEN_CHECKPOINT_99.txt')
run(['node','scripts/test-v224.js'],'FROZEN_V224_59.txt')
run(['node','scripts/test-v224-correctness-regressions.js','--v223'],'REGRESSION_120.txt')
run(['node','scripts/test-v224-correctness-regressions.js'],'REGRESSION_59.txt')
run(['node','scripts/test-v224-correctness.js'],'CORRECTNESS_TESTS.txt')
run(['python','scripts/package-v224-correctness.py'])
archive = candidate.with_suffix('.zip')
first = archive.read_bytes(),(folder / 'SHA256SUMS').read_bytes()
run(['python','scripts/package-v224-correctness.py'])
assert first == (archive.read_bytes(),(folder / 'SHA256SUMS').read_bytes())
log.append('PASS deterministic archive/checksums across two builds; exact single-file payload')
for prefix in ['releases/v2.23.5','releases/v2.24.0','src/baseline','src/v224','scripts/test-v223.js','scripts/test-v224.js']:
    for name in subprocess.check_output(['git','ls-tree','-r','--name-only',parent,prefix],cwd=root).decode().splitlines():
        assert (root / name).read_bytes() == subprocess.check_output(['git','show',parent+':'+name],cwd=root),name
log.append('PASS frozen V2.23.5/V2.24.0 artifacts, baseline, original pressure fragment and test files equal exact parent bytes')
result = subprocess.run(['git','diff','--no-index','--',
    'releases/v2.24.0/chatgpt_chat_size_meter_v224_empirical_pressure.js',str(candidate.relative_to(root))],cwd=root,stdout=subprocess.PIPE)
assert result.returncode == 1
(folder / 'SOURCE_DIFF.patch').write_bytes(result.stdout.replace(b'\r\n',b'\n'))
log.append('PASS reference 120/120 + 99/99 + 59/59; revised 120/120 + 59/59 + 31/31. 210 distinct active cases, 488 total executions. Native candidate validation pending.')
(folder / 'VALIDATION.txt').write_bytes(('\n'.join(log)+'\n').encode())
print(log[-1])
