'use client'
import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import { useWebSocket } from './useWebSocket'

const DEFAULT = {
  devices: [], queue: 0, done: 0, errors: 0,
  pilot_running: false, logs: [], ws_connected: false,
  queueItems: [],   // { pid, name, price, commission, status }
  currentItem: null,
  genProgress: null,  // { pid, stage, detail, error }
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
          logs: [...prev.logs.slice(-199), { time: new Date().toLocaleTimeString(), msg: msg.msg }]
        }))
        break

      // New products added to queue
      case 'queue_items':
        setState(prev => ({
          ...prev,
          queueItems: [...prev.queueItems, ...msg.items],
        }))
        break

      // Generation progress (prompt → submit → rendering → downloading → done/error)
      case 'gen_progress':
        patch({
          genProgress: {
            pid: msg.pid, stage: msg.stage, detail: msg.detail,
            error: msg.stage === 'error' ? msg.detail : null,
            ts: Date.now(),
          }
        })
        break

      // Worker status update for a specific product
      case 'worker_status':
        setState(prev => ({
          ...prev,
          currentItem: msg.status !== 'done' && msg.status !== 'error'
            ? prev.queueItems.find(i => i.pid === msg.pid) ?? prev.currentItem
            : prev.currentItem,
          queueItems: prev.queueItems.map(item =>
            item.pid === msg.pid ? { ...item, status: msg.status } : item
          ),
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

  useEffect(() => {
    api.status().then(d => patch({
      devices: d.devices, queue: d.queue,
      done: d.done, errors: d.errors,
      pilot_running: d.pilot_running,
    })).catch(() => {})
  }, [patch])

  return { state, patch }
}
