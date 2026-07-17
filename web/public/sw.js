// Service worker ขั้นต่ำ — ทำให้ติดตั้งเป็นแอปได้ (PWA installable) + โหลด shell เร็วขึ้น
// หมายเหตุ: แอปคุยกับ backend :3001 (API/WS) แบบ realtime — เราจึง "ไม่ cache API/WS"
// cache เฉพาะไฟล์ static ของหน้าเว็บ (app shell) เพื่อกันหน้าไม่ขึ้นตอน backend ยังไม่พร้อม
const CACHE = 'vdogen-shell-v1'
const SHELL = ['/dashboard/', '/icons/icon-192.png', '/manifest.webmanifest']

self.addEventListener('install', (e) => {
  self.skipWaiting()
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  // อย่าแตะ API/WebSocket/สตรีม — ต้อง realtime เสมอ
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api') ||
      url.pathname.startsWith('/ws') || url.pathname.startsWith('/stream')) {
    return
  }
  // static: network ก่อน (ได้ของใหม่เสมอ) → ล้มค่อยใช้ cache (กันหน้าไม่ขึ้น)
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {})
        }
        return res
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('/dashboard/')))
  )
})
