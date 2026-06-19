# PyInstaller spec — สร้าง binary ชื่อ vgap-server
# รัน: pyinstaller vgap-server.spec --distpath dist/
from PyInstaller.utils.hooks import collect_submodules, collect_data_files

block_cipher = None

a = Analysis(
    ['main.py'],
    pathex=['.'],
    binaries=[],
    datas=[
        # รวมทุก services/ เผื่อมีไฟล์ที่ไม่ใช่ .py
        ('services', 'services'),
        ('config.py', '.'),
    ],
    hiddenimports=[
        # FastAPI + Uvicorn
        'uvicorn.lifespan.on',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.logging',
        'fastapi',
        'fastapi.middleware.cors',
        # PIL (Pillow) สำหรับ screenshot
        'PIL',
        'PIL.Image',
        # อื่นๆ
        'anyio',
        'anyio._backends._asyncio',
        'starlette',
        'starlette.routing',
        'multipart',
        'python_multipart',
    ] + collect_submodules('uvicorn') + collect_submodules('fastapi'),
    hookspath=[],
    runtime_hooks=[],
    excludes=['tkinter', 'matplotlib', 'scipy', 'numpy'],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz, a.scripts, a.binaries, a.zipfiles, a.datas,
    [],
    name='vgap-server',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,           # แสดง log ใน dev; ตั้ง False ถ้าไม่อยากเห็น console ใน production
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
