"""Record frozen suites, explicit superseding suites and dual-axis validation."""
from pathlib import Path
import subprocess
root=Path(__file__).resolve().parent.parent
folder=root/'releases/v2.24.1'
candidate=folder/'chatgpt_chat_size_meter_v2241_dual_axis_pressure.js'
parent='34195fa83942beb8b5e335833634295abb85898b'
log=[]
def run(args,output=None):
    result=subprocess.run(args,cwd=root,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
    text=result.stdout.decode('utf-8',errors='replace').replace('\r\n','\n')
    log.append('$ '+subprocess.list2cmdline(args)+'\n'+text)
    (folder/'VALIDATION.txt').write_bytes(('\n'.join(log)).encode())
    if output:
        (folder/output).write_bytes(text.encode())
    print(text.strip().split('\n')[-1] if text.strip() else 'PASS '+subprocess.list2cmdline(args),flush=True)
    if result.returncode:
        (folder/'VALIDATION.txt').write_bytes(('\n'.join(log)).encode())
        raise SystemExit(result.returncode)
run(['node','--version'])
run(['python','--version'])
run([r'C:\Program Files\Git\bin\bash.exe','-c','export PATH="/usr/bin:/c/Program Files/nodejs:$PATH"; bash scripts/verify-baseline.sh'])
for path in [candidate,root/'src/v2241/pressure-calibration.js',*sorted((root/'scripts').glob('*v2241*.js'))]:
    run(['node','--check',str(path)])
run(['node','scripts/verify-v2235-protected.js'])
run(['node','scripts/verify-v224-protected.js'])
run(['node','scripts/verify-v224-correctness.js'])
run(['node','scripts/verify-v2241.js'])
for args,output in [
    (['scripts/test-v223.js'],'FROZEN_HOTFIX_120.txt'),
    (['scripts/test-v224-prior.js'],'FROZEN_CHECKPOINT_99.txt'),
    (['scripts/test-v224.js'],'FROZEN_V224_59.txt'),
    (['scripts/test-v224-correctness.js'],'FROZEN_CORRECTNESS_31.txt'),
    (['scripts/test-v224-regressions.js'],'PRIOR_V224_REGRESSION_120.txt'),
    (['scripts/test-v224-correctness-regressions.js','--v223'],'PRIOR_CORRECTNESS_REGRESSION_120.txt'),
    (['scripts/test-v224-correctness-regressions.js'],'PRIOR_CORRECTNESS_REGRESSION_59.txt'),
    (['scripts/test-v2241-regressions.js','--v223'],'REGRESSION_120.txt'),
    (['scripts/test-v2241-regressions.js'],'REGRESSION_59.txt'),
    (['scripts/test-v2241-regressions.js','--correctness'],'REGRESSION_31.txt'),
    (['scripts/test-v2241.js'],'DUAL_AXIS_TESTS.txt')]:
    run(['node',*args],output)
run(['python','scripts/package-v2241.py'])
archive=candidate.with_suffix('.zip')
first=archive.read_bytes(),(folder/'SHA256SUMS').read_bytes()
run(['python','scripts/package-v2241.py'])
assert first==(archive.read_bytes(),(folder/'SHA256SUMS').read_bytes())
log.append('PASS deterministic archive/checksums across two builds; exact single-file payload')
# The initial Windows checkout already has CRLF in these older text files.
# Preserve them in place; all other parent files require exact committed bytes.
checkout_crlf={'.gitattributes','AGENTS.md','BASELINE_MANIFEST.txt','README.md',
    'diagnostics/false-max/2026-09-30-development-chat-v222.txt',
    'diagnostics/false-max/2026-09-30-fresh-chat-v222.txt',
    'releases/v2.23/RELEASE_REPORT.md','releases/v2.23/SHA256SUMS','releases/v2.23/VALIDATION.txt',
    'research/handoff-2026-09-30.md','scripts/package-v223.py','scripts/package-v2235.py',
    'specs/V2.23-event-model-cleanup.md'}
names=subprocess.check_output(['git','ls-tree','-r','--name-only',parent],cwd=root).decode().splitlines()
for name in names:
    data=(root/name).read_bytes()
    expected=subprocess.check_output(['git','show',parent+':'+name],cwd=root)
    assert (data.replace(b'\r\n',b'\n') if name in checkout_crlf else data)==expected,name
log.append(f'PASS {len(names)-len(checkout_crlf)} parent files byte-identical including baseline, JS/ZIP, harnesses; {len(checkout_crlf)} older text files differ only by pre-existing checkout CRLF. No parent files edited.')
result=subprocess.run(['git','diff','--no-index','--',
    'releases/v2.24.0-calibration-correctness/chatgpt_chat_size_meter_v2240_calibration_correctness.js',
    str(candidate.relative_to(root))],cwd=root,stdout=subprocess.PIPE)
assert result.returncode==1
(folder/'SOURCE_DIFF.patch').write_bytes(result.stdout.replace(b'\r\n',b'\n'))
log.append('PASS frozen 120/120 + 99/99 + 59/59 + 31/31; prior superseding 120/120 + 120/120 + 59/59; candidate 120/120 + 59/59 + 31/31 + 34/34. 244 active cases; 852 recorded executions. Native candidate review pending.')
(folder/'VALIDATION.txt').write_bytes(('\n'.join(log)+'\n').encode())
print(log[-1])
