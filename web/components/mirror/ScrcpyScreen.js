'use client'
import { useEffect, useRef, useState, useCallback } from 'react'

/**
 * จอสดจาก scrcpy — รับ H.264 ดิบผ่าน WebSocket แล้ว decode ด้วย WebCodecs
 * ดีเลย์ ~50-100ms (MJPEG เดิม ~1-2 วิ) และคุมเครื่องผ่าน control socket ของ scrcpy โดยตรง
 *
 * โปรโตคอลจาก backend (/ws/scrcpy/{serial}):
 *   text  → {"type":"meta","codec","width","height"} | {"type":"closed"} | {"type":"error"}
 *   binary→ [flags 1B][H.264 annex-B payload]   flags: bit0 = config(SPS/PPS), bit1 = key frame
 * ส่งกลับ (text JSON):
 *   {"t":"touch","action":0|1|2,"x":0..1,"y":0..1}  {"t":"scroll",...}  {"t":"key","code":"KEYCODE_BACK"}
 */

const BASE = process.env.NEXT_PUBLIC_API_URL
  || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001')

const wsUrl = (serial, maxSize, maxFps) =>
  `${BASE.replace(/^http/, 'ws')}/ws/scrcpy/${serial}?max_size=${maxSize}&max_fps=${maxFps}`

export const hasWebCodecs = () =>
  typeof window !== 'undefined' && typeof window.VideoDecoder === 'function'

/** อ่าน profile/level จาก SPS เพื่อสร้าง codec string ที่ VideoDecoder ยอมรับ */
function codecFromConfig(bytes) {
  for (let i = 0; i + 4 < bytes.length; i++) {
    const isStart3 = bytes[i] === 0 && bytes[i + 1] === 0 && bytes[i + 2] === 1
    const isStart4 = bytes[i] === 0 && bytes[i + 1] === 0 && bytes[i + 2] === 0 && bytes[i + 3] === 1
    if (!isStart3 && !isStart4) continue
    const nal = i + (isStart4 ? 4 : 3)
    if ((bytes[nal] & 0x1f) !== 7) continue           // ต้องเป็น SPS
    const hex = n => n.toString(16).padStart(2, '0')
    return `avc1.${hex(bytes[nal + 1])}${hex(bytes[nal + 2])}${hex(bytes[nal + 3])}`
  }
  return 'avc1.42e01e'                                 // baseline — เผื่อหา SPS ไม่เจอ
}

// ต่อใหม่แบบถอยหลัง — ทุกครั้งที่ต่อ backend จะ push jar (timeout 30 วิ) + spawn app_process
// ยิงรัวทุก 1.5 วิ × การ์ด 20 ใบ = แย่ง executor จน flow โพสต์ที่ใช้ adb ช้าตาม
const RETRY_BASE  = 1500
const RETRY_MAX   = 30000
const RETRY_LIMIT = 5      // ครบแล้วหยุด รอผู้ใช้กด "ลองใหม่" (retryKey)
const NO_FRAME_TIMEOUT = 12000   // ต่อติดแล้วไม่มีเฟรมภายในเท่านี้ = พัง (ต้องมีปุ่มลองใหม่ให้กด)
const STABLE_MS        = 10000   // อยู่รอดเกินเท่านี้ถึงถือว่า "ต่อติดจริง" แล้วล้างตัวนับ backoff
const CONNECTS_PER_MIN = 8       // เพดานแข็ง กันวนต่อใหม่รัวทุกกรณี
const CONFIG_FAIL_LIMIT = 3      // configure decoder พังกี่ครั้งถึงยอมแพ้ (แทนการวนขอ key frame)

export function ScrcpyScreen({
  serial,
  interactive = true,
  maxSize = 1024,
  maxFps = 30,
  className = '',
  style,
  onSize,
  onStatus,        // (status, message) — message มีค่าเมื่อ status === 'error'
  onTapRatio,      // (r:{x,y}) — เรียกตอนแตะ (ไม่ใช่ลาก) ใช้ตอนคาลิเบรตพิกัด
  retryKey = 0,    // เปลี่ยนค่า = สั่งต่อใหม่ตั้งแต่ต้น (ล้างตัวนับ backoff)
}) {
  const canvasRef = useRef(null)
  const wsRef     = useRef(null)
  const decRef    = useRef(null)
  const configRef = useRef(null)     // SPS/PPS ล่าสุด รอต่อหน้า key frame ถัดไป
  const codecRef  = useRef('')
  const tsRef     = useRef(0)
  const downRef   = useRef(false)
  const statusRef = useRef('connecting')
  const errRef    = useRef('')
  const triesRef  = useRef(0)
  const [size, setSize]     = useState({ w: 0, h: 0 })
  const [status, setStatus] = useState('connecting')   // connecting | live | error | closed

  const mark = useCallback((s, msg = '') => {
    if (statusRef.current === s && errRef.current === msg) return
    statusRef.current = s
    errRef.current = msg
    setStatus(s)
    onStatus?.(s, msg)
  }, [onStatus])

  useEffect(() => {
    if (!serial || !hasWebCodecs()) return
    let alive = true
    let retry = null
    let watchdog = null
    let openedAt = 0
    let cfgFails = 0
    let gaveUp = false
    let ws
    triesRef.current = 0
    errRef.current   = ''
    statusRef.current = ''      // ล้าง error เก่าตอนกด "ลองใหม่" ไม่งั้น mark('connecting') โดนกันไว้
    const connectLog = []       // เวลาที่เริ่มต่อแต่ละครั้ง — ใช้เป็นเพดานแข็งต่อ 1 นาที

    const giveUp = msg => {
      // ธงนี้จำเป็น: ws.close() ข้างล่างจะไปปลุก onclose ซึ่งตั้ง retry ใหม่ทันที
      // (alive ยัง true อยู่) → "ยอมแพ้" กลายเป็นวนต่ออีกหลายรอบ
      gaveUp = true
      clearTimeout(retry); retry = null
      clearTimeout(watchdog); watchdog = null
      try { ws?.close() } catch {}
      mark('error', msg || errRef.current)   // ข้อความล่าสุดเจาะจงกว่า — อย่าให้อันแรกเหนียว
    }

    const resetDecoder = () => {
      try { decRef.current?.close() } catch {}
      decRef.current = null
      configRef.current = null
      codecRef.current = ''
    }

    const draw = frame => {
      const cv = canvasRef.current
      if (!cv) { frame.close(); return }
      if (cv.width !== frame.displayWidth || cv.height !== frame.displayHeight) {
        cv.width  = frame.displayWidth
        cv.height = frame.displayHeight
      }
      const ctx = cv.getContext('2d')
      ctx.drawImage(frame, 0, 0)
      frame.close()
    }

    const ensureDecoder = (chunkBytes) => {
      if (decRef.current) return decRef.current
      if (cfgFails >= CONFIG_FAIL_LIMIT) return null   // เลิกขอ key frame รัวใส่ encoder ของมือถือ
      const codec = codecFromConfig(chunkBytes)
      const dec = new VideoDecoder({
        output: draw,
        error: () => {
          if (!alive) return
          resetDecoder()
          try { wsRef.current?.send(JSON.stringify({ t: 'key_frame' })) } catch {}
        },
      })
      // ไม่ล็อก hardwareAcceleration — บาง environment ไม่มี hw decoder แล้ว configure จะ error เงียบๆ
      try {
        dec.configure({ codec, optimizeForLatency: true })
      } catch (e) {
        // configure พัง (codec string จาก SPS ไม่รองรับ) → ห้ามวนขอ key frame ไม่รู้จบ
        // เพราะทุกครั้งคือสั่ง TYPE_RESET_VIDEO ใส่ encoder ของมือถือ ส่วนจอยังดำเงียบๆ
        try { dec.close() } catch {}
        if (++cfgFails >= CONFIG_FAIL_LIMIT) giveUp(`ถอดรหัสวิดีโอไม่ได้ (${codec}) — กดลองใหม่`)
        return null
      }
      codecRef.current = codec
      decRef.current = dec
      return dec
    }

    const armWatchdog = () => {
      // นับใหม่ทุกครั้งที่ backend ส่งอะไรมา (รวม "starting" ระหว่างรอคิว executor)
      // ไม่งั้นการ์ดท้ายคิวของฟาร์ม 20 เครื่องจะขึ้น error ทั้งที่ backend แค่ยังไม่ถึงคิว
      clearTimeout(watchdog)
      watchdog = setTimeout(() => {
        if (alive && !gaveUp && statusRef.current !== 'live') giveUp('ต่อได้แต่ไม่มีภาพ — กดลองใหม่')
      }, NO_FRAME_TIMEOUT)
    }

    const connect = () => {
      if (!alive || gaveUp) return
      // เพดานแข็ง: ต่อกี่ครั้งก็ได้ แต่ห้ามเกิน N ครั้งต่อนาที — กัน reconnect storm ทุกกรณี
      const now = Date.now()
      while (connectLog.length && now - connectLog[0] > 60000) connectLog.shift()
      if (connectLog.length >= CONNECTS_PER_MIN) {
        giveUp('ต่อจอใหม่ถี่เกินไป — กดลองใหม่')
        return
      }
      connectLog.push(now)
      openedAt = now
      // ห้ามทับ error เดิม — ไม่งั้นผู้ใช้เห็นแค่ "กำลังเชื่อมจอ…" วนไปตลอดโดยไม่รู้ว่าพังเพราะอะไร
      if (statusRef.current !== 'error') mark('connecting')
      ws = new WebSocket(wsUrl(serial, maxSize, maxFps))
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws

      // ต่อติดแต่ไม่มีเฟรมเลย (subscribe เข้า session ที่ตายแล้ว / encoder ไม่เริ่ม)
      // ws ไม่ปิด → onclose ไม่ยิง → ไม่มีอะไรพาไปสถานะ error → ปุ่มลองใหม่ไม่โผล่ตลอดกาล
      armWatchdog()

      ws.onmessage = ev => {
        armWatchdog()
        if (typeof ev.data === 'string') {
          const m = JSON.parse(ev.data)
          if (m.type === 'meta') {
            if (m.width && m.height) {
              setSize(prev => {
                // ขนาด/มุมจอเปลี่ยนเท่านั้นที่ต้องล้าง decoder (meta ซ้ำจะเข้ามาตอน subscribe ด้วย)
                if (prev.w !== m.width || prev.h !== m.height) resetDecoder()
                return { w: m.width, h: m.height }
              })
              onSize?.(m.width, m.height)
            }
          } else if (m.type === 'starting') {
            // backend รับงานแล้ว กำลังรอคิว executor — armWatchdog() ข้างบนเลื่อนเวลาให้แล้ว
            if (statusRef.current !== 'error') mark('connecting')
          } else if (m.type === 'error') {
            mark('error', m.message || 'เปิดจอสดไม่ได้')
          } else if (m.type === 'closed') {
            if (statusRef.current !== 'error') mark('closed')
          }
          return
        }

        const buf   = new Uint8Array(ev.data)
        const flags = buf[0]
        const data  = buf.subarray(1)
        const isConfig = !!(flags & 0b01)
        const isKey    = !!(flags & 0b10)

        if (isConfig) { configRef.current = data; return }   // เก็บไว้ต่อหน้า key frame

        let payload = data
        if (isKey && configRef.current) {
          payload = new Uint8Array(configRef.current.length + data.length)
          payload.set(configRef.current, 0)
          payload.set(data, configRef.current.length)
        }
        if (!decRef.current && !isKey) return                // ยังไม่มี key frame → decode ไม่ได้

        try {
          const dec = ensureDecoder(payload)
          if (!dec || dec.state !== 'configured') return
          tsRef.current += 1000000 / Math.max(1, maxFps)
          dec.decode(new EncodedVideoChunk({
            type: isKey ? 'key' : 'delta',
            timestamp: Math.round(tsRef.current),
            data: payload,
          }))
          clearTimeout(watchdog); watchdog = null
          // ล้างตัวนับ backoff เฉพาะเมื่อสตรีม "อยู่รอด" จริง ไม่ใช่แค่ได้เฟรมแรก
          // (session ที่โดน stop/replace ซ้ำๆ จะให้ภาพ 1-2 เฟรมแล้วตาย → ถ้ารีเซ็ตทุกครั้ง
          //  ดีเลย์เด้งกลับไป 1.5 วิตลอด = reconnect storm แบบเดิม)
          if (Date.now() - openedAt > STABLE_MS) triesRef.current = 0
          mark('live')
        } catch {
          resetDecoder()
          try { ws.send(JSON.stringify({ t: 'key_frame' })) } catch {}
        }
      }

      ws.onclose = () => {
        // ห้ามล้าง decoder ถ้า effect นี้ถูก cleanup ไปแล้ว — decRef/configRef แชร์กับ connection ใหม่
        // (กดลองใหม่ → onclose ของ ws เก่ามาทีหลัง → ล้าง SPS/PPS ของตัวใหม่ = ภาพดำ 1-2 วิ)
        if (!alive) return
        resetDecoder()
        clearTimeout(watchdog); watchdog = null
        if (gaveUp) return               // ยอมแพ้ไปแล้ว — ห้ามตั้ง retry ใหม่จาก close ที่ตัวเองสั่ง
        const n = ++triesRef.current
        if (n > RETRY_LIMIT) {
          mark('error', errRef.current || `เชื่อมจอไม่ได้ (ลอง ${RETRY_LIMIT} ครั้ง) — กดลองใหม่`)
          return
        }
        if (statusRef.current !== 'error') mark('closed')
        // เครื่องหลุด/backend restart → ต่อใหม่เอง แต่ถอยหลังทีละเท่าตัว 1.5 → 30 วิ
        retry = setTimeout(connect, Math.min(RETRY_MAX, RETRY_BASE * 2 ** (n - 1)))
      }
      ws.onerror = () => { try { ws.close() } catch {} }
    }

    connect()
    return () => {
      alive = false
      clearTimeout(retry)
      clearTimeout(watchdog)
      try { ws?.close() } catch {}
      resetDecoder()
      wsRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serial, maxSize, maxFps, retryKey])

  // ── control ────────────────────────────────────────────────
  const send = msg => {
    const ws = wsRef.current
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg))
  }
  const ratio = e => {
    const r = canvasRef.current?.getBoundingClientRect()
    if (!r || !r.width) return null
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top)  / r.height)),
    }
  }
  const touch = (action, e) => {
    const p = ratio(e)
    if (p) send({ t: 'touch', action, x: p.x, y: p.y })
  }

  const handlers = interactive ? {
    onPointerDown: e => {
      e.currentTarget.setPointerCapture?.(e.pointerId)
      downRef.current = { x: e.clientX, y: e.clientY }
      touch(0, e)
    },
    onPointerMove: e => { if (downRef.current) touch(2, e) },
    onPointerUp:   e => {
      if (!downRef.current) return
      const start = downRef.current
      downRef.current = false
      touch(1, e)
      const moved = Math.abs(e.clientX - start.x) > 8 || Math.abs(e.clientY - start.y) > 8
      if (!moved) {
        const p = ratio(e)
        if (p) onTapRatio?.(p)
      }
    },
    onPointerCancel: e => { if (downRef.current) { downRef.current = false; touch(1, e) } },
    onContextMenu: e => { e.preventDefault(); send({ t: 'key', code: 'KEYCODE_BACK' }) },
    onWheel: e => {
      const p = ratio(e)
      if (p) send({ t: 'scroll', x: p.x, y: p.y, h: 0, v: -e.deltaY / 100 })
    },
  } : {}

  const ar = size.w && size.h ? size.w / size.h : undefined

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        display: 'block', background: '#000', touchAction: 'none',
        cursor: interactive ? 'crosshair' : 'default',
        ...(ar ? { aspectRatio: String(ar) } : {}),
        ...style,
      }}
      data-status={status}
      {...handlers}
    />
  )
}
