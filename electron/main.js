const { app, BrowserWindow, shell, nativeTheme } = require('electron')
const path   = require('path')
const { spawn } = require('child_process')
const http   = require('http')

const isDev        = !app.isPackaged
const BACKEND_PORT = 3001

let mainWin = null
let pyProc  = null

// ── Splash screen ─────────────────────────────────────────────

function createSplash() {
  const w = new BrowserWindow({
    width: 400, height: 260,
    frame: false, transparent: true,
    alwaysOnTop: true, resizable: false,
    webPreferences: { nodeIntegration: false },
  })
  w.loadURL('data:text/html,' + encodeURIComponent(`<!DOCTYPE html>
<html><head><style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#0d0d14;color:#fff;font-family:-apple-system,sans-serif;
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    height:100vh;border-radius:18px;overflow:hidden;-webkit-app-region:drag}
  .logo{width:56px;height:56px;background:#7c3aed22;border:1px solid #7c3aed44;
    border-radius:16px;display:flex;align-items:center;justify-content:center;
    font-size:28px;margin-bottom:16px}
  h1{font-size:17px;font-weight:800;letter-spacing:-.5px}
  p{font-size:12px;color:#6b7280;margin-top:6px}
  .bar{width:140px;height:3px;background:#1f1f2e;border-radius:4px;margin-top:22px;overflow:hidden}
  .fill{height:100%;width:35%;background:#7c3aed;border-radius:4px;
    animation:s 1.1s ease-in-out infinite}
  @keyframes s{0%{transform:translateX(-100%)}100%{transform:translateX(700%)}}
</style></head><body>
  <div class="logo">⚡</div>
  <h1>VDO Gen Auto Pilot</h1>
  <p>กำลังเริ่มต้น…</p>
  <div class="bar"><div class="fill"></div></div>
</body></html>`))
  return w
}

// ── Python backend ────────────────────────────────────────────

function startBackend() {
  let cmd, args, cwd
  const env = { ...process.env }

  if (isDev) {
    cwd  = path.join(__dirname, '..', 'desktop')
    cmd  = process.platform === 'win32' ? 'python' : 'python3'
    args = ['main.py']
  } else {
    cwd  = path.join(process.resourcesPath, 'backend')
    cmd  = path.join(cwd, process.platform === 'win32' ? 'vgap-server.exe' : 'vgap-server')
    args = []
    // ★ binary ที่แถมมากับแอป (adb/scrcpy/ffmpeg) → ใส่ไว้หน้า PATH ให้ server หาเจอก่อน
    //   ลูกค้าไม่ต้องติดตั้งอะไรเพิ่ม (near-zero-touch) — ถ้าเครื่องมีของตัวเองก็ยังใช้ได้ (อยู่ท้าย PATH)
    const binDir = path.join(process.resourcesPath, 'bin')
    env.PATH = binDir + path.delimiter + (env.PATH || '')
    // scrcpy-server jar ที่แถมมา — ชี้ตรงๆ (scrcpy_control.py อ่าน env นี้เป็นอันดับแรก)
    if (!env.SCRCPY_SERVER_PATH) env.SCRCPY_SERVER_PATH = path.join(binDir, 'scrcpy-server')
  }

  pyProc = spawn(cmd, args, { cwd, stdio: 'pipe', env })
  pyProc.stdout?.on('data', d => process.stdout.write('[py] ' + d))
  pyProc.stderr?.on('data', d => process.stderr.write('[py] ' + d))
  pyProc.on('exit', code => { if (code !== 0) console.error('[py] exited with code', code) })
}

function waitForBackend(cb, tries = 50) {
  const req = http.get(`http://localhost:${BACKEND_PORT}/api/status`, res => {
    req.destroy()
    cb()
  })
  req.on('error', () => {
    if (tries <= 0) return cb()   // หมดเวลา → เปิด app ไปก่อน
    setTimeout(() => waitForBackend(cb, tries - 1), 500)
  })
  req.setTimeout(400, () => req.destroy())
}

// ── Main window ───────────────────────────────────────────────

function createWindow() {
  mainWin = new BrowserWindow({
    width: 1400, height: 900,
    minWidth: 960, minHeight: 640,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#0d0d14',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  const url = isDev
    ? 'http://localhost:3000'
    : 'file://' + path.join(app.getAppPath(), '..', 'web', 'out', 'index.html')

  mainWin.loadURL(url)

  // เปิด external links ใน browser แทน Electron
  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWin.on('closed', () => { mainWin = null })
}

// ── Auto-update (electron-updater) ────────────────────────────
// เช็คเวอร์ชันใหม่จาก host (ตั้งใน package.json > build.publish.url) → โหลดเงียบ ๆ → ลงตอนปิดแอป
// ข้อมูลผู้ใช้อยู่ที่ ~/.vgap (นอกโฟลเดอร์โปรแกรม) → อัปเดตทับแล้วคีย์/คิว/คลิปไม่หาย
function setupAutoUpdate() {
  if (isDev) return                       // dev ไม่เช็คอัปเดต
  let autoUpdater
  try { ({ autoUpdater } = require('electron-updater')) }
  catch (e) { return console.error('[update] electron-updater ไม่พร้อม:', e.message) }
  autoUpdater.autoDownload = true
  autoUpdater.on('update-available',  (i) => console.log('[update] พบเวอร์ชันใหม่', i?.version))
  autoUpdater.on('update-downloaded', (i) => console.log('[update] โหลดเสร็จ', i?.version, '— จะติดตั้งตอนปิดแอป'))
  autoUpdater.on('error',             (e) => console.error('[update] error:', e?.message || e))
  autoUpdater.checkForUpdatesAndNotify().catch((e) => console.error('[update]', e?.message || e))
  // เช็คซ้ำทุก 6 ชม. (เผื่อเปิดแอปค้างไว้นาน ๆ)
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 6 * 60 * 60 * 1000)
}

// ── App lifecycle ─────────────────────────────────────────────

app.whenReady().then(() => {
  nativeTheme.themeSource = 'dark'
  const splash = createSplash()

  startBackend()
  waitForBackend(() => {
    createWindow()
    setTimeout(() => splash.close(), 500)
    setupAutoUpdate()
  })
})

app.on('window-all-closed', () => {
  killBackend()
  app.quit()
})

app.on('before-quit', killBackend)

function killBackend() {
  if (pyProc) { pyProc.kill(); pyProc = null }
}
