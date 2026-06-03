'use client'
import { useEffect, useRef, useCallback } from 'react'

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001/ws'

export function useWebSocket(onMessage) {
  const wsRef      = useRef(null)
  const retryTimer = useRef(null)
  const onMsgRef   = useRef(onMessage)
  onMsgRef.current = onMessage

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      clearTimeout(retryTimer.current)
      onMsgRef.current?.({ type: 'ws_connected' })
    }

    ws.onmessage = (e) => {
      try { onMsgRef.current?.(JSON.parse(e.data)) } catch {}
    }

    ws.onclose = () => {
      onMsgRef.current?.({ type: 'ws_disconnected' })
      retryTimer.current = setTimeout(connect, 3000)
    }

    ws.onerror = () => ws.close()
  }, [])

  useEffect(() => {
    connect()
    return () => {
      clearTimeout(retryTimer.current)
      wsRef.current?.close()
    }
  }, [connect])

  const send = useCallback((data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN)
      wsRef.current.send(JSON.stringify(data))
  }, [])

  return { send }
}
