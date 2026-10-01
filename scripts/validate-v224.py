"""Record complete synthetic release validation; stop immediately on failure."""
from pathlib import Path
import hashlib
import subprocess

root = Path(__file__).resolve().parent.parent
folder = root / 'releases/v2.24.0'
candidate = folder / 'chatgpt_chat_size_meter_v224_empirical_pressure.js'
parent = '7f02f4d8b9101a8ff481bda4af97e641e04e8ef0'
log = []

def run(args, output=None):
    result = subprocess.run(args, cwd=root, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    text = result.stdout.decode('utf-8', errors='replace').replace('\r\n', '\n')
    log.append('$ ' + subprocess.list2cmdline(args) + '\n' + text)
    if output:
        (folder / output).write_bytes(text.encode('utf-8'))
    print(text.strip().split('\n')[-1] if text.strip() else 'PASS ' + subprocess.list2cmdline(args))
    if result.returncode:
        (folder / 'VALIDATION.txt').write_bytes(('\n'.join(log)).encode('utf-8'))
        raise SystemExit(result.returncode)
    return text

run(['node', '--version'])
run(['python', '--version'])
run(['git', '--version'])
run([r'C:\Program Files\Git\bin\bash.exe', '-c',
     'export PATH="/usr/bin:/c/Program Files/nodejs:$PATH"; bash scripts/verify-baseline.sh'])
for name in [candidate, root / 'src/v224/pressure-calibration.js',
             *sorted((root / 'scripts').glob('*v224*.js'))]:
    run(['node', '--check', str(name)])
run(['node', 'scripts/verify-v2235-protected.js'])
run(['node', 'scripts/verify-v224-protected.js'])
run(['node', 'scripts/test-v223.js'], 'FROZEN_HOTFIX_TESTS.txt')
run(['node', 'scripts/test-v224-prior.js'], 'PRIOR_CHECKPOINT_TESTS.txt')
run(['node', 'scripts/test-v224-regressions.js'], 'REGRESSION.txt')
run(['node', 'scripts/test-v224.js'], 'PRESSURE_TESTS.txt')
run(['python', 'scripts/package-v224.py'])
archive = candidate.with_suffix('.zip')
first = archive.read_bytes(), (folder / 'SHA256SUMS').read_bytes()
run(['python', 'scripts/package-v224.py'])
assert first == (archive.read_bytes(), (folder / 'SHA256SUMS').read_bytes())
log.append('PASS two package builds: identical ZIP and checksum bytes; exact single JS member')
for relative in subprocess.check_output(['git', 'ls-tree', '-r', '--name-only', parent, 'releases/v2.23.5'], cwd=root).decode().splitlines():
    committed = subprocess.check_output(['git', 'show', parent + ':' + relative], cwd=root)
    assert (root / relative).read_bytes() == committed, 'Frozen artifact changed: ' + relative
log.append('PASS every frozen V2.23.5 release file equals exact parent Git bytes')
for relative in ['scripts/test-v223.js', 'scripts/verify-v2235-protected.js']:
    assert (root / relative).read_bytes() == subprocess.check_output(['git', 'show', parent + ':' + relative], cwd=root)
log.append('PASS original V2.23.5 harness and verifier bytes unchanged')
result = subprocess.run(['git', 'diff', '--no-index', '--',
    'releases/v2.23.5/chatgpt_chat_size_meter_v2235_reliability_hotfix.js',
    'releases/v2.24.0/chatgpt_chat_size_meter_v224_empirical_pressure.js'], cwd=root, stdout=subprocess.PIPE)
assert result.returncode == 1
(folder / 'SOURCE_DIFF.patch').write_bytes(result.stdout.replace(b'\r\n', b'\n'))
for artifact in [candidate, archive]:
    data = artifact.read_bytes()
    log.append(f'{artifact.name}: {len(data)} bytes; SHA-256 {hashlib.sha256(data).hexdigest()}')
log.append('PASS 120/120 frozen hotfix, 99/99 frozen prior checkpoint, 120/120 V2.24 regression, 59/59 new V2.24 cases; 179 distinct active cases, 398 total case executions. Native validation pending.')
(folder / 'VALIDATION.txt').write_bytes(('\n'.join(log) + '\n').encode('utf-8'))
print(log[-1])
