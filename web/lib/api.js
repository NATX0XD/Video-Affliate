// ใช้ origin ของหน้าเว็บเอง (server เสิร์ฟหน้านี้ที่พอร์ตไหน ก็คุยพอร์ตนั้น)
// → กันปัญหาพอร์ต 3001 ชนกับโปรแกรมอื่น แล้ว server ย้ายไปพอร์ตว่างถัดไป
const BASE = process.env.NEXT_PUBLIC_API_URL
  || (typeof window !== 'undefined' && window.location ? window.location.origin : 'http://localhost:3001')

// ── global error hook ─────────────────────────────────────────────
// ToastProvider ลงทะเบียน handler ที่นี่ เพื่อเด้ง toast แทน catch เงียบ
// (ยังคง throw ต่อเหมือนเดิม — ไม่กระทบ caller ที่ catch อยู่แล้ว)
let _errHandler = null
export function setApiErrorHandler(fn) { _errHandler = fn }
function notifyError(info) { try { _errHandler?.(info) } catch {} }

async function req(method, path, body) {
  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch (e) {
    notifyError({ kind: 'network', method, path, error: e?.message })   // ต่อ backend ไม่ได้ / ออฟไลน์
    throw e
  }
  if (!res.ok) {
    notifyError({ kind: 'http', status: res.status, method, path })
    throw new Error(`API ${method} ${path} → ${res.status}`)
  }
  return res.json()
}

export const api = {
  status:          ()         => req('GET',  '/api/status'),
  scan:            ()         => req('POST', '/api/scan'),
  devices:         ()         => req('GET',  '/api/devices'),   // รายการมือถือ + รุ่น/ยี่ห้อ
  getSettings:     ()         => req('GET',  '/api/settings'),
  saveSettings:    (data)     => req('POST', '/api/settings', data),
  // ที่เก็บของหน้าสร้างคลิป (templates / scenes / faces / draft) — อยู่ใน app.db ไม่ใช่ localStorage
  genStore:        (name)        => req('GET',  `/api/gen/store/${name}`),
  genStoreSet:     (name, value) => req('POST', `/api/gen/store/${name}`, { value }),
  // โชว์เฉพาะแพลตฟอร์มที่จูนกับเครื่องจริงแล้ว (ตอนนี้ = Shopee)
  // ตัวที่ยัง "ต้องจูน" มีโค้ดโพสต์อยู่แต่ยังไม่เคยจูนพิกัด กดเลือกได้แล้วโพสต์ล้ม
  // กรองที่จุดเดียวตรงนี้ ทุกหน้าจะเห็นตรงกัน — จูนเสร็จเมื่อไหร่ค่อยตั้ง tuned=True ใน platforms.py
  platforms:       async ()   => { const d = await req('GET', '/api/platforms'); return { ...d, platforms: (d.platforms || []).filter(p => p.tuned) } },
  reports:         ()         => req('GET',  '/api/reports'),
  jobs:            ()         => req('GET',  '/api/jobs'),
  deleteJob:       (id)       => req('DELETE', `/api/jobs/${id}`),
  postJob:         (id)       => req('POST', `/api/jobs/${id}/post`),
  // จับคู่คลิป↔เครื่อง (M2) — serial='' = อัตโนมัติ (ปล่อยระบบเลือก)
  assignJob:       (id, serial)     => req('POST', `/api/jobs/${id}/assign`, { serial: serial || '' }),
  assignJobs:      (ids, serial)    => req('POST', `/api/jobs/assign`, { ids, serial: serial || '' }),
  postJobs:        (ids, serial)    => req('POST', `/api/jobs/post`, { ids, serial: serial || '' }),
  cancelGen:       ()         => req('POST', `/api/flow/cancel`),
  dryPostJob:      (id)       => req('POST', `/api/jobs/${id}/dryrun`),
  cancelJob:       (id)       => req('POST', `/api/jobs/${id}/cancel`),   // ยกเลิกงานค้าง → generated
  getSetup:        ()         => req('GET',  '/api/setup'),
  saveSetup:       (data)     => req('POST', '/api/setup', data),
  logs:            (q = '')   => req('GET',  `/api/logs${q}`),
  clearLogs:       ()         => req('POST', '/api/logs/clear'),
  diagnostics:     ()         => req('GET',  '/api/diagnostics'),
  mirrorStart:     (serial)   => req('POST', `/api/mirror/start/${serial}`),
  mirrorStop:      (serial)   => req('POST', `/api/mirror/stop/${serial}`),
  mirrorStartAll:  ()         => req('POST', '/api/mirror/start_all'),
  mirrorStopAll:   ()         => req('POST', '/api/mirror/stop_all'),
  wifiConnect:     (ip)       => req('POST', '/api/wifi_connect', { ip }),
  // เชื่อมมือถือ (onboarding P2.2) — endpoint คืน {ok, error?} เสมอ (ไม่ throw ตาม logic)
  adbTcpip:        (body)     => req('POST', '/api/adb/tcpip', body),    // {serial, port?}
  adbPair:         (body)     => req('POST', '/api/adb/pair', body),     // {host, port, code}
  adbConnect:      (body)     => req('POST', '/api/adb/connect', body),  // {host|ip, port?}
  adbTest:         (serial)   => req('POST', '/api/adb/test', { serial }),
  testKey:         (key)      => req('POST', '/api/settings/test-key', { google_api_key: key || '' }),
  setDeviceLabel:  (s, label) => req('POST', `/api/devices/${s}/label`, { label }),
  setDevicePlatforms: (s, platforms) => req('POST', `/api/devices/${s}/platforms`, { platforms }),
  adbTap:          (s, x, y)  => req('POST', `/api/adb/tap/${s}`, { x, y }),
  adbSwipe:        (s, x1,y1,x2,y2,ms) =>
                               req('POST', `/api/adb/swipe/${s}`, {x1,y1,x2,y2,ms}),
  adbKey:          (s, code)  => req('POST', `/api/adb/key/${s}`, { code }),
  // คาลิเบรตพิกัดโพสต์ต่อเครื่อง (ratio 0..1) — GET อ่าน, POST บันทึก, DELETE รีเซ็ตเป็นค่าเริ่มต้น(มือถือ)
  getDeviceCoords:   (s)         => req('GET',    `/api/devices/${s}/coords`),
  saveDeviceCoords:  (s, coords) => req('POST',   `/api/devices/${s}/coords`, { coords }),
  resetDeviceCoords: (s)         => req('DELETE', `/api/devices/${s}/coords`),
  // ชุดพิกัดที่บันทึกไว้ — ใช้ซ้ำกับเครื่องรุ่นเดียวกันได้ (มากับโปรแกรม + ที่ผู้ใช้บันทึก)
  coordPresets:      ()          => req('GET',    '/api/coords/presets'),
  saveCoordPreset:   (name, coords) => req('POST', '/api/coords/presets', { name, coords }),
  deleteCoordPreset: (name)      => req('DELETE', `/api/coords/presets/${encodeURIComponent(name)}`),
  listVideos:      ()         => req('GET',  '/api/videos'),
  uploadClip:      (formData)  => fetch(`${BASE}/api/clips/upload`, { method: 'POST', body: formData })
                                   .then(r => { if (!r.ok) throw new Error('upload failed'); return r.json() }),
  updateClip:      (id, meta)  => req('POST', `/api/clips/${id}/meta`, meta),
  uploadCover:     (id, formData) => fetch(`${BASE}/api/clips/${id}/cover`, { method: 'POST', body: formData })
                                      .then(r => { if (!r.ok) throw new Error('cover upload failed'); return r.json() }),
  deleteNoLink:    ()         => req('POST', '/api/videos/delete_nolink'),
  videoFileUrl:    (folder, name) => `${BASE}/video/${folder}/${name}`,
  // เปิดโฟลเดอร์ที่เก็บไฟล์แล้วไฮไลต์ไฟล์ (Finder/Explorer) — เบราว์เซอร์ทำเองไม่ได้
  revealVideo:     (folder, name) => req('POST', '/api/videos/reveal', { folder, name }),
  postResults:     ()         => req('GET',  '/api/post-results'),
  streamUrl:       (serial)   => `${BASE}/stream/${serial}`,
  scrcpyAvailable: ()         => req('GET',  '/api/scrcpy/available'),   // มี scrcpy-server ในเครื่องไหม
  snapshotUrl:     (serial)   => `${BASE}/snapshot/${serial}`,
  licenseStatus:   ()         => req('GET',  '/api/license/status'),
  licenseActivate: (key)      => req('POST', '/api/license/activate', { key }),
  machineId:       ()         => req('GET',  '/api/license/machine-id'),
  // สินค้า (G3): แคตตาล็อกสินค้าที่ดูดมา (DB) — web เห็นครบ
  products:        (q = '')   => req('GET',  `/api/products${q}`),
  pushProduct:     (body)     => req('POST', '/api/products', body),   // สินค้าเดี่ยว {name,price,...} หรือ {products:[...]}
  addProducts:     (body)     => req('POST', '/api/products', body),   // {products:[...]} หรือ product เดี่ยว (คงไว้ — เดิม)
  // คิวงานบน DB (โครงอนาคต)
  queuePush:       (body)     => req('POST', '/api/queue/push', body),
  queueNext:       ()         => req('GET',  '/api/queue/next'),
  queueClaim:      (body = {}) => req('POST', '/api/queue/claim', body),
  // ส่วนขยาย (onboarding): path โฟลเดอร์ extension + สั่ง desktop เปิด chrome://extensions
  extPath:         ()         => req('GET',  '/api/ext/path'),
  openExtPage:     ()         => req('POST', '/api/ext/open'),
  updateExt:       ()         => req('POST', '/api/ext/update'),
  // อัปเดตตัวโปรแกรม (โฟลเดอร์ติดตั้งเป็น git clone → เทียบ commit กับ main)
  appUpdateCheck:  ()         => req('GET',  '/api/app/update-check'),
  appUpdate:       ()         => req('POST', '/api/app/update'),   // ดึง extension ล่าสุด + ให้มัน reload เอง
  // สถานะ Flow/ส่วนขยาย — {ok, queued, ext_online} ใช้เช็กก่อนสั่งสร้างคลิป
  flowStatus:        ()       => req('GET', '/api/flow/status'),
  // บัญชี Google Flow ที่ให้ระบบหมุนเวลาเครดิตหมด (เก็บแค่อีเมล ไม่เก็บรหัสผ่าน)
  flowAccounts:      ()       => req('GET',  '/api/flow/accounts'),
  saveFlowAccounts:  (accounts) => req('POST', '/api/flow/accounts', { accounts }),
  // ตัวเชื่อม Google Flow (adapter override layer) — โชว์เวอร์ชัน + อัปเดตเมื่อ Flow เปลี่ยนหน้าตา
  flowAdapter:       ()       => req('GET', '/api/flow/adapter'),
  // อ่าน body เอง (แม้ status ไม่ 200) เพื่อเอา error ภาษาไทย + version มาโชว์ toast เองที่หน้า
  updateFlowAdapter: (url)    => fetch(`${BASE}/api/flow/adapter/update`, {
                                   method: 'POST',
                                   headers: { 'Content-Type': 'application/json' },
                                   body: JSON.stringify(url ? { url } : {}),
                                 }).then(async r => {
                                   const d = await r.json().catch(() => ({}))
                                   return { ...d, ok: r.ok && d.ok !== false }
                                 }).catch(() => ({ ok: false })),
}
