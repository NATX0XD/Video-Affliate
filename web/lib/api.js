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
  platforms:       ()         => req('GET',  '/api/platforms'),
  reports:         ()         => req('GET',  '/api/reports'),
  jobs:            ()         => req('GET',  '/api/jobs'),
  deleteJob:       (id)       => req('DELETE', `/api/jobs/${id}`),
  postJob:         (id)       => req('POST', `/api/jobs/${id}/post`),
  dryPostJob:      (id)       => req('POST', `/api/jobs/${id}/dryrun`),
  getSetup:        ()         => req('GET',  '/api/setup'),
  saveSetup:       (data)     => req('POST', '/api/setup', data),
  logs:            (q = '')   => req('GET',  `/api/logs${q}`),
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
  listVideos:      ()         => req('GET',  '/api/videos'),
  uploadClip:      (formData)  => fetch(`${BASE}/api/clips/upload`, { method: 'POST', body: formData })
                                   .then(r => { if (!r.ok) throw new Error('upload failed'); return r.json() }),
  updateClip:      (id, meta)  => req('POST', `/api/clips/${id}/meta`, meta),
  uploadCover:     (id, formData) => fetch(`${BASE}/api/clips/${id}/cover`, { method: 'POST', body: formData })
                                      .then(r => { if (!r.ok) throw new Error('cover upload failed'); return r.json() }),
  deleteNoLink:    ()         => req('POST', '/api/videos/delete_nolink'),
  videoFileUrl:    (folder, name) => `${BASE}/video/${folder}/${name}`,
  postResults:     ()         => req('GET',  '/api/post-results'),
  streamUrl:       (serial)   => `${BASE}/stream/${serial}`,
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
