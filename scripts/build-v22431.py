"""Exact V2.24.3 parent plus canonical effort/schema/metadata repair only."""
from pathlib import Path
import subprocess,hashlib,sys
root=Path(__file__).resolve().parent.parent
parent='913458c7be3a07a2cdadb73736170d591500a52c'
get=lambda name:subprocess.check_output(['git','show',parent+':'+name],cwd=root)
source=get('releases/v2.24.3/chatgpt_chat_size_meter_v2243_anonymous_seed_builder.js')
assert hashlib.sha256(source).hexdigest()=='7c603b00cb7c5b6402e433523f4c4821cade4b590ae636fd682f81b102b6dd81'
for name in ['pressure-calibration','anonymous-schema']:
 old=get('src/v2243/'+name+'.js')
 new=(root/('src/v22431/'+name+'.js')).read_bytes()
 assert source.count(old)==1 and b'\r' not in new
 source=source.replace(old,new)
normalizer=(root/'src/v22431/canonical-effort.js').read_bytes()
assert source.count(normalizer)==1
for name in ['anonymous-seed','seed-registry','anonymous-export']:
 assert get('src/v2243/'+name+'.js') in source,name
assert source.count(b'V2.24.3 MULTI-PROFILE ANONYMOUS BUILDER')==3
source=source.replace(b'V2.24.3 MULTI-PROFILE ANONYMOUS BUILDER',b'V2.24.3.1 CANONICAL EFFORT REPAIR')
for before,after in [(b'// @version      2.24.3',b'// @version      2.24.3.1'),
 (b"health.candidateVersion = '2.24.3'",b"health.candidateVersion = '2.24.3.1'"),
 (b"version:'2.24.3'",b"version:'2.24.3.1'"),
 (b"  if (a.requestEffort) {\n    a.requestEffortDetected = a.requestEffort;\n  }",
  b"  if (a.requestEffort) {\n    a.requestEffortDetected = a.requestEffort;\n  }\n  a.requestCanonicalEffort = pressureEffort(a.requestEffort);")]:
 assert source.count(before)==1,before
 source=source.replace(before,after)
target=root/'releases/v2.24.3.1/chatgpt_chat_size_meter_v22431_effort_normalization.js'
if '--check' in sys.argv:
 assert target.read_bytes()==source
 print('PASS exact frozen parent plus effort/schema repair, canonical request metadata, identity fields; all other bytes unchanged')
else:
 target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(source)
 print(f'Built {target.name}: {len(source)} bytes')
