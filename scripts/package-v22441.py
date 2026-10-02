"""Deterministic single-file V2.24.4.1 ZIP, including only anonymous seeded JS."""
from pathlib import Path
import hashlib
import zipfile
root=Path(__file__).resolve().parent.parent
folder=root/'releases/v2.24.4.1'
source=folder/'chatgpt_chat_size_meter_v22441_current_model_identity.js'
archive=source.with_suffix('.zip')
info=zipfile.ZipInfo(source.name,date_time=(2026,10,2,0,0,0))
info.create_system=3
info.external_attr=0o100644 << 16
info.compress_type=zipfile.ZIP_DEFLATED
with zipfile.ZipFile(archive,'w') as out:
    out.writestr(info,source.read_bytes(),compresslevel=9)
with zipfile.ZipFile(archive) as check:
    assert check.namelist()==[source.name]
    assert check.read(source.name)==source.read_bytes()
rows=[]
for file in (source,archive):
    data=file.read_bytes()
    digest=hashlib.sha256(data).hexdigest()
    rows.append(f'{digest}  {file.name}')
    print(f'{file.name}: {len(data)} bytes; SHA-256 {digest}')
(folder/'SHA256SUMS').write_bytes(('\n'.join(rows)+'\n').encode('ascii'))
