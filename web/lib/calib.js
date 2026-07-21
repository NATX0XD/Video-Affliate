// พิกัดคาลิเบรตโพสต์ (ratio 0..1) — helper บริสุทธิ์ แยกไว้ทดสอบง่าย
// rect = getBoundingClientRect ของ <img> จอสด, (cx,cy) = พิกัดคลิกบนหน้าจอ
export function ratioFromRect(rect, cx, cy) {
  if (!rect || !rect.width || !rect.height) return null
  return {
    rx: (cx - rect.left) / rect.width,
    ry: (cy - rect.top) / rect.height,
  }
}

// รวม/normalize coords object → { key: {rx,ry} }
export function normalizeCoords(coords) {
  const out = {}
  if (!coords) return out
  for (const [k, v] of Object.entries(coords)) {
    if (v && typeof v.rx === 'number' && typeof v.ry === 'number') out[k] = { rx: v.rx, ry: v.ry }
  }
  return out
}
