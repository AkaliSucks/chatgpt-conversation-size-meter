"""Full immutable references and current-model identity candidate validation, with transcripts."""
from pathlib import Path
import subprocess
root=Path(__file__).resolve().parent.parent
folder=root/'releases/v2.24.4.1'
candidate=folder/'chatgpt_chat_size_meter_v22441_current_model_identity.js'
parent='904798397da384c1eee4190035647a22b521464f'
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
        raise SystemExit(result.returncode)
run(['node','--version'])
run(['python','--version'])
run([r'C:\Program Files\Git\bin\bash.exe','-c','export PATH="/usr/bin:/c/Program Files/nodejs:$PATH"; bash scripts/verify-baseline.sh'])
for path in [candidate,*sorted((root/'src/v22441').glob('*.js')),*sorted((root/'scripts').glob('*v22441*.js'))]:
    run(['node','--check',str(path)])
run(['node','scripts/verify-v2235-protected.js'])
run(['node','scripts/verify-v224-protected.js'])
run(['node','scripts/verify-v224-correctness.js'])
run(['node','scripts/verify-v2241.js'])
run(['node','scripts/verify-v2242.js'])
run(['node','scripts/verify-v2243.js'])
run(['node','scripts/verify-v22431.js'])
run(['node','scripts/verify-v22432.js'])
run(['node','scripts/verify-v2244.js'])
run(['node','scripts/verify-v22441.js'])
for args,output in [
    (['scripts/test-v223.js'],'FROZEN_HOTFIX_120.txt'),
    (['scripts/test-v224-prior.js'],'FROZEN_CHECKPOINT_99.txt'),
    (['scripts/test-v224.js'],'FROZEN_V224_59.txt'),
    (['scripts/test-v224-correctness.js'],'FROZEN_CORRECTNESS_31.txt'),
    (['scripts/test-v224-regressions.js'],'PRIOR_V224_REGRESSION_120.txt'),
    (['scripts/test-v224-correctness-regressions.js','--v223'],'PRIOR_CORRECTNESS_REGRESSION_120.txt'),
    (['scripts/test-v224-correctness-regressions.js'],'PRIOR_CORRECTNESS_REGRESSION_59.txt'),
    (['scripts/test-v2241-regressions.js','--v223'],'FROZEN_V241_REGRESSION_120.txt'),
    (['scripts/test-v2241-regressions.js'],'FROZEN_V241_REGRESSION_59.txt'),
    (['scripts/test-v2241-regressions.js','--correctness'],'FROZEN_V241_REGRESSION_31.txt'),
    (['scripts/test-v2241.js'],'FROZEN_V241_DUAL_AXIS_34.txt'),
    (['scripts/test-v2242-regressions.js','--v223'],'FROZEN_V242_REGRESSION_120.txt'),
    (['scripts/test-v2242-regressions.js'],'FROZEN_V242_REGRESSION_59.txt'),
    (['scripts/test-v2242-regressions.js','--correctness'],'FROZEN_V242_REGRESSION_31.txt'),
    (['scripts/test-v2242-regressions.js','--dual'],'FROZEN_V242_REGRESSION_34.txt'),
    (['scripts/test-v2242.js'],'FROZEN_V242_SEED_TESTS_40.txt'),
    (['scripts/test-v2243-regressions.js','--v223'],'FROZEN_V243_REGRESSION_120.txt'),
    (['scripts/test-v2243-regressions.js'],'FROZEN_V243_REGRESSION_59.txt'),
    (['scripts/test-v2243-regressions.js','--correctness'],'FROZEN_V243_REGRESSION_31.txt'),
    (['scripts/test-v2243-regressions.js','--dual'],'FROZEN_V243_REGRESSION_34.txt'),
    (['scripts/test-v2243-regressions.js','--seed'],'FROZEN_V243_SEED_TESTS_40.txt'),
    (['scripts/test-v2243.js'],'FROZEN_V243_ANONYMOUS_TESTS_45.txt'),
    (['scripts/test-v22431-regressions.js','--v223'],'FROZEN_V2431_REGRESSION_120.txt'),
    (['scripts/test-v22431-regressions.js'],'FROZEN_V2431_REGRESSION_59.txt'),
    (['scripts/test-v22431-regressions.js','--correctness'],'FROZEN_V2431_REGRESSION_31.txt'),
    (['scripts/test-v22431-regressions.js','--dual'],'FROZEN_V2431_REGRESSION_34.txt'),
    (['scripts/test-v22431-regressions.js','--seed'],'FROZEN_V2431_SEED_TESTS_40.txt'),
    (['scripts/test-v22431-regressions.js','--anonymous'],'FROZEN_V2431_ANONYMOUS_TESTS_45.txt'),
    (['scripts/test-v22431.js'],'FROZEN_V2431_EFFORT_TESTS_31.txt'),
    (['scripts/test-v22432-regressions.js','--v223'],'FROZEN_V2432_REGRESSION_120.txt'),
    (['scripts/test-v22432-regressions.js'],'FROZEN_V2432_REGRESSION_59.txt'),
    (['scripts/test-v22432-regressions.js','--correctness'],'FROZEN_V2432_REGRESSION_31.txt'),
    (['scripts/test-v22432-regressions.js','--dual'],'FROZEN_V2432_REGRESSION_34.txt'),
    (['scripts/test-v22432-regressions.js','--seed'],'FROZEN_V2432_SEED_TESTS_40.txt'),
    (['scripts/test-v22432-regressions.js','--anonymous'],'FROZEN_V2432_ANONYMOUS_TESTS_45.txt'),
    (['scripts/test-v22432-regressions.js','--effort'],'FROZEN_V2432_EFFORT_TESTS_31.txt'),
    (['scripts/test-v22432.js'],'FROZEN_V2432_MEDIUM_TESTS_29.txt'),
    (['scripts/test-v2244-regressions.js','--v223'],'FROZEN_V244_REGRESSION_120.txt'),
    (['scripts/test-v2244-regressions.js'],'FROZEN_V244_REGRESSION_59.txt'),
    (['scripts/test-v2244-regressions.js','--correctness'],'FROZEN_V244_REGRESSION_31.txt'),
    (['scripts/test-v2244-regressions.js','--dual'],'FROZEN_V244_REGRESSION_34.txt'),
    (['scripts/test-v2244-regressions.js','--seed'],'FROZEN_V244_LEGACY_FIXTURE_SEED_40.txt'),
    (['scripts/test-v2244-regressions.js','--anonymous'],'FROZEN_V244_LEGACY_FIXTURE_ANONYMOUS_45.txt'),
    (['scripts/test-v2244-regressions.js','--effort'],'FROZEN_V244_LEGACY_FIXTURE_EFFORT_31.txt'),
    (['scripts/test-v2244-regressions.js','--medium'],'FROZEN_V244_LEGACY_FIXTURE_MEDIUM_29.txt'),
    (['scripts/test-v2244.js'],'FROZEN_V244_MULTI_EFFORT_TESTS_43.txt'),
    (['scripts/test-v22441-regressions.js','--v223'],'REGRESSION_120.txt'),
    (['scripts/test-v22441-regressions.js'],'REGRESSION_59.txt'),
    (['scripts/test-v22441-regressions.js','--correctness'],'REGRESSION_31.txt'),
    (['scripts/test-v22441-regressions.js','--dual'],'REGRESSION_34.txt'),
    (['scripts/test-v22441-regressions.js','--seed'],'LEGACY_FIXTURE_SEED_40.txt'),
    (['scripts/test-v22441-regressions.js','--anonymous'],'LEGACY_FIXTURE_ANONYMOUS_45.txt'),
    (['scripts/test-v22441-regressions.js','--effort'],'LEGACY_FIXTURE_EFFORT_31.txt'),
    (['scripts/test-v22441-regressions.js','--medium'],'LEGACY_FIXTURE_MEDIUM_29.txt'),
    (['scripts/test-v22441-regressions.js','--registry'],'MULTI_EFFORT_TESTS_43.txt'),
    (['scripts/test-v22441.js'],'IDENTITY_TESTS_27.txt')]:
    run(['node',*args],output)
run(['python','scripts/package-v22441.py'])
archive=candidate.with_suffix('.zip')
first=archive.read_bytes(),(folder/'SHA256SUMS').read_bytes()
run(['python','scripts/package-v22441.py'])
assert first==(archive.read_bytes(),(folder/'SHA256SUMS').read_bytes())
log.append('PASS deterministic archive/checksums across two builds; exact JS-only payload including tested anonymous seed bytes')
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
log.append(f'PASS {len(names)-len(checkout_crlf)} parent files byte-identical including baseline, JS/ZIP, harnesses; {len(checkout_crlf)} older text files retain pre-existing checkout CRLF only. No parent files edited.')
result=subprocess.run(['git','diff','--no-index','--',
    'releases/v2.24.4/chatgpt_chat_size_meter_v2244_multi_effort_seeds.js',candidate.relative_to(root).as_posix()],cwd=root,stdout=subprocess.PIPE)
assert result.returncode==1
(folder/'SOURCE_DIFF.patch').write_bytes(result.stdout.replace(b'\r\n',b'\n'))
log.append('PASS all 2646 frozen/prior case executions; candidate full three-entry registry 244 foundation/local-only + 43 multi-effort + 27 identity cases; legacy single-seed registry fixture 145 old cases. 459 candidate case executions; 3105 total recorded case executions. Native candidate review pending.')
(folder/'VALIDATION.txt').write_bytes(('\n'.join(log)+'\n').encode())
print(log[-1])
