'use client'
import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import { useWebSocket } from './useWebSocket'

const DEFAULT = {
  devices: [], queue: 0, done: 0, errors: 0,
  pilot_running: false, logs: [], ws_connected: false,
  jobs: { by_status: {}, total: 0, total_cost: 0 },
  budget: null,
  queueItems: [],
  currentItem: null,
  genProgress: null,
  extension: { connected: false, last_ping_ts: 0 },   // สัญญาณส่วนเสริม (P2.1) — onboarding เช็ค "เชื่อมแล้ว"
}

export function useStatus() {
  const [state, setState] = useState(DEFAULT)

  const patch = useCallback((updates) =>
    setState(prev => ({ ...prev, ...updates })), [])

  const handleMsg = useCallback((msg) => {
    switch (msg.type) {
      case 'ws_connected':    patch({ ws_connected: true });  break
      case 'ws_disconnected': patch({ ws_connected: false }); break
      case 'devices':         patch({ devices: msg.devices }); break

      case 'stats':
        patch({ done: msg.done, errors: msg.errors, queue: msg.queue })
        break

      case 'log':
        setState(prev => ({
          ...prev,
          logs: [...prev.logs.slice(-199), {
            time: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            msg: msg.msg, level: msg.level, source: msg.source,
          }]
        }))
        break

      case 'queue_items':
        setState(prev => ({ ...prev, queueItems: [...prev.queueItems, ...msg.items] }))
        break

      case 'gen_progress':
        patch({ genProgress: {
          jobId: msg.jobId ?? msg.pid, pid: msg.jobId ?? msg.pid,
          stage: msg.stage, detail: msg.detail, pct: msg.pct ?? null,
          error: msg.stage === 'error' ? msg.detail : null, ts: Date.now(),
        }})
        break

      case 'worker_status':
        setState(prev => ({
          ...prev,
          currentItem: msg.status !== 'done' && msg.status !== 'error'
            ? prev.queueItems.find(i => i.pid === msg.pid) ?? prev.currentItem
            : prev.currentItem,
          queueItems: prev.queueItems.map(item =>
            item.pid === msg.pid ? { ...item, status: msg.status } : item),
        }))
        break

      case 'mirror_state':
        setState(prev => ({
          ...prev,
          devices: prev.devices.map(d =>
            d.serial === msg.serial ? { ...d, streaming: msg.running } : d)
        }))
        break

      default: break
    }
  }, [patch])

  useWebSocket(handleMsg)

  // ดึงสถานะครั้งเดียว (ใช้ทั้ง poll และปุ่ม "เช็คอีกครั้ง"/"สแกน" ใน onboarding)
  const refresh = useCallback(() => api.status().then(d => {
    patch({
      devices: d.devices, queue: d.queue, done: d.done, errors: d.errors,
      pilot_running: d.pilot_running,
      jobs: d.jobs || DEFAULT.jobs,
      budget: d.budget ?? null,
      extension: d.extension || DEFAULT.extension,
    })
  }).catch(() => {}), [patch])

  // โหลดสถานะ + poll เป็นระยะ (jobs/budget/devices ไม่ได้มาทาง WS ทุกตัว)
  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 5000)
    return () => clearInterval(id)
  }, [refresh])

  return { state, patch, refresh }
}
