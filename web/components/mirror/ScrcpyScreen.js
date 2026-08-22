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

export function ScrcpyScreen({
  serial,
  interactive = true,
  maxSize = 1024,
  maxFps = 30,
  className = '',
  style,
  onSize,
  onStatus,
  onTapRatio,      // (r:{x,y}) — เรียกตอนแตะ (ไม่ใช่ลาก) ใช้ตอนคาลิเบรตพิกัด
}) {
  const canvasRef = useRef(null)
  const wsRef     = useRef(null)
  const decRef    = useRef(null)
  const configRef = useRef(null)     // SPS/PPS ล่าสุด รอต่อหน้า key frame ถัดไป
  const codecRef  = useRef('')
  const tsRef     = useRef(0)
  const downRef   = useRef(false)
  const statusRef = useRef('connecting')
  const [size, setSize]     = useState({ w: 0, h: 0 })
  const [status, setStatus] = useState('connecting')   // connecting | live | error | closed

  const mark = useCallback(s => {
    if (statusRef.current === s) return
    statusRef.current = s
    setStatus(s)
    onStatus?.(s)
  }, [onStatus])

  useEffect(() => {
    if (!serial || !hasWebCodecs()) return
    let alive = true
    let retry = null
    let ws

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
      dec.configure({ codec, optimizeForLatency: true })
      codecRef.current = codec
      decRef.current = dec
      return dec
    }

    const connect = () => {
      if (!alive) return
      mark('connecting')
      ws = new WebSocket(wsUrl(serial, maxSize, maxFps))
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws

      ws.onmessage = ev => {
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
          } else if (m.type === 'error') {
            mark('error')
          } else if (m.type === 'closed') {
            mark('closed')
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
          if (dec.state !== 'configured') return
          tsRef.current += 1000000 / Math.max(1, maxFps)
          dec.decode(new EncodedVideoChunk({
            type: isKey ? 'key' : 'delta',
            timestamp: Math.round(tsRef.current),
            data: payload,
          }))
          mark('live')
        } catch {
          resetDecoder()
          try { ws.send(JSON.stringify({ t: 'key_frame' })) } catch {}
        }
      }

      ws.onclose = () => {
        resetDecoder()
        if (!alive) return
        mark('closed')
        retry = setTimeout(connect, 1500)      // เครื่องหลุด/backend restart → ต่อใหม่เอง
      }
      ws.onerror = () => { try { ws.close() } catch {} }
    }

    connect()
    return () => {
      alive = false
      clearTimeout(retry)
      try { ws?.close() } catch {}
      resetDecoder()
      wsRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serial, maxSize, maxFps])

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
