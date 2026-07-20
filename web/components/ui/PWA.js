'use client'
import { useEffect } from 'react'

// เดิมลงทะเบียน service worker (PWA) — ตัดออกแล้ว เพราะแอปเปิดเป็น Chrome --app อยู่แล้ว
// SW ที่ค้างในโปรไฟล์ทำให้ Chrome หน่วง (intercept ทุก static GET รวมเฟรมจอสด + ค้างแม้ปิดแอป)
// คอมโพเนนต์นี้จึงทำหน้าที่ "ล้าง" SW เก่า + cache ที่เคยลงไว้ แล้วไม่ลงใหม่
export function PWA() {
  useEffect(() => {
    try {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations?.()
          .then((rs) => rs.forEach((r) => r.unregister()))
          .catch(() => {})
      }
      if (typeof caches !== 'undefined' && caches.keys) {
        caches.keys().then((ks) => ks.forEach((k) => caches.delete(k))).catch(() => {})
      }
    } catch {}
  }, [])
  return null
}
