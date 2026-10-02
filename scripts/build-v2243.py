"""Surgical reconstruction from frozen V2.24.2, with unchanged scorer."""
from pathlib import Path
import subprocess,hashlib,sys
root=Path(__file__).resolve().parent.parent
parent='be93e49e6c69bf8bd87a7de8e830382afb71f810'
get=lambda name:subprocess.check_output(['git','show',parent+':'+name],cwd=root)
source=get('releases/v2.24.2/chatgpt_chat_size_meter_v2242_anonymous_seed_calibration.js')
assert hashlib.sha256(source).hexdigest()=='6c298711d9d6f8fe16e3495fc478a240da5f0669e1c63377aef2e481e77028b5'
old=get('src/v2242/pressure-calibration.js')
assert (root/'src/v2243/anonymous-seed.js').read_bytes()==get('src/v2242/anonymous-seed.js')
fragment=b'\n'.join((root/('src/v2243/'+name+'.js')).read_bytes() for name in ['seed-registry','pressure-calibration','anonymous-schema','anonymous-export'])
assert b'\r' not in fragment and source.count(old)==1
source=source.replace(old,fragment)
assert source.count(b'V2.24.2 ANONYMOUS SEED CALIBRATION')==3
source=source.replace(b'V2.24.2 ANONYMOUS SEED CALIBRATION',b'V2.24.3 MULTI-PROFILE ANONYMOUS BUILDER')
changes=[(b'// @version      2.24.2',b'// @version      2.24.3'),
 (b"health.candidateVersion = '2.24.2'",b"health.candidateVersion = '2.24.3'"),(b"version:'2.24.2'",b"version:'2.24.3'"),
 (b"retry:{running:false,label:'Retry capture',token:0}",b"retry:{running:false,label:'Retry capture',token:0},\n  anon:{running:false,label:'Copy anon sample',token:0}"),
 (b"${button('copy','Copy diagnostics')}${button('retry','Retry capture')}",b"${button('copy','Copy diagnostics')}${button('retry','Retry capture')}${button('anon','Copy anon sample')}"),
 (b"for (const action of ['copy','retry'])",b"for (const action of ['copy','retry','anon'])"),
 (b"        case 'copy':",b"        case 'anon':\n          await runAnonymousCopy();\n          break;\n\n        case 'copy':")]
for before,after in changes:
 assert source.count(before)==1,before
 source=source.replace(before,after)
target=root/'releases/v2.24.3/chatgpt_chat_size_meter_v2243_anonymous_seed_builder.js'
if '--check' in sys.argv:
 assert target.read_bytes()==source
 print('PASS exact parent plus four source fragments, four expanded-control edits, six identity fields')
else:
 target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(source)
 print(f'Built {target.name}: {len(source)} bytes')
