const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`API ${method} ${path} → ${res.status}`)
  return res.json()
}

export const api = {
  status:          ()         => req('GET',  '/api/status'),
  scan:            ()         => req('POST', '/api/scan'),
  getSettings:     ()         => req('GET',  '/api/settings'),
  saveSettings:    (data)     => req('POST', '/api/settings', data),
  platforms:       ()         => req('GET',  '/api/platforms'),
  reports:         ()         => req('GET',  '/api/reports'),
  jobs:            ()         => req('GET',  '/api/jobs'),
  deleteJob:       (id)       => req('DELETE', `/api/jobs/${id}`),
  postJob:         (id)       => req('POST', `/api/jobs/${id}/post`),
  getSetup:        ()         => req('GET',  '/api/setup'),
  saveSetup:       (data)     => req('POST', '/api/setup', data),
  logs:            (q = '')   => req('GET',  `/api/logs${q}`),
  diagnostics:     ()         => req('GET',  '/api/diagnostics'),
  mirrorStart:     (serial)   => req('POST', `/api/mirror/start/${serial}`),
  mirrorStop:      (serial)   => req('POST', `/api/mirror/stop/${serial}`),
  mirrorStartAll:  ()         => req('POST', '/api/mirror/start_all'),
  mirrorStopAll:   ()         => req('POST', '/api/mirror/stop_all'),
  wifiConnect:     (ip)       => req('POST', '/api/wifi_connect', { ip }),
  openShopee:      (serial)   => req('POST', `/api/adb/open_shopee/${serial}`),
  adbTap:          (s, x, y)  => req('POST', `/api/adb/tap/${s}`, { x, y }),
  adbSwipe:        (s, x1,y1,x2,y2,ms) =>
                               req('POST', `/api/adb/swipe/${s}`, {x1,y1,x2,y2,ms}),
  adbKey:          (s, code)  => req('POST', `/api/adb/key/${s}`, { code }),
  pilotStart:      (serial)   => req('POST', '/api/pilot/start', { serial }),
  pilotStop:       ()         => req('POST', '/api/pilot/stop'),
  testPost:        (serial, dryRun = true) => req('POST', '/api/test/post', { serial, dry_run: dryRun }),
  videoModels:     ()         => req('GET',  '/api/video/models'),
  videoTest:       ()         => req('POST', '/api/video/test', {}),
  genStart:        (products, profile) => req('POST', '/api/gen/start', { products, profile }),
  genStop:         ()         => req('POST', '/api/gen/stop'),
  genStatus:       ()         => req('GET',  '/api/gen/status'),
  listVideos:      ()         => req('GET',  '/api/videos'),
  videoFileUrl:    (folder, name) => `${BASE}/video/${folder}/${name}`,
  postAllStart:    (serial)   => req('POST', '/api/post/start', { serial }),
  postAllStop:     ()         => req('POST', '/api/post/stop'),
  postAllStatus:   ()         => req('GET',  '/api/post/status'),
  generate:        (products) => req('POST', '/api/generate', { products }),
  flowEnqueue:     (products) => req('POST', '/api/flow/enqueue', { products }),
  streamUrl:       (serial)   => `${BASE}/stream/${serial}`,
  snapshotUrl:     (serial)   => `${BASE}/snapshot/${serial}`,
}
