'use client'
import { useEffect, useState } from 'react'

// ลงทะเบียน service worker + โชว์ปุ่ม "ติดตั้งเป็นแอป" เมื่อ Chrome พร้อมให้ติดตั้ง
export function PWA() {
  const [prompt, setPrompt] = useState(null)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
    const onPrompt = (e) => { e.preventDefault(); setPrompt(e) }
    const onInstalled = () => { setPrompt(null); setHidden(true) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    // ถ้าเปิดในโหมดแอปอยู่แล้ว (standalone / Chrome --app) ไม่ต้องโชว์ปุ่ม
    if (window.matchMedia?.('(display-mode: standalone)').matches) setHidden(true)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (!prompt || hidden) return null

  return (
    <button
      onClick={async () => { prompt.prompt(); try { await prompt.userChoice } catch {} setPrompt(null) }}
      className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl border border-accent/40
                 bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-lift
                 hover:brightness-110 transition"
      title="ติดตั้งเป็นแอปบนเครื่อง (มีไอคอนเหมือนแอปจริง)"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      ติดตั้งเป็นแอป
    </button>
  )
}
