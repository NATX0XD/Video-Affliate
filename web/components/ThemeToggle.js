'use client'
// สลับธีมขาว/มืด — จำค่าไว้ใน localStorage (inline script ใน layout อ่านค่านี้ก่อน paint)
import { useEffect, useState } from 'react'
import { Sun, Moon } from 'lucide-react'

export function ThemeToggle({ collapsed = false }) {
  const [theme, setTheme] = useState('light')

  // อ่านค่าที่ inline script เซ็ตไว้แล้ว (กัน mismatch ตอน hydrate)
  useEffect(() => { setTheme(document.documentElement.dataset.theme || 'light') }, [])

  const flip = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    try { localStorage.setItem('theme', next) } catch {}
    setTheme(next)
  }

  const label = theme === 'dark' ? 'ธีมมืด' : 'ธีมขาว'
  const Icon = theme === 'dark' ? Moon : Sun

  return (
    <button type="button" onClick={flip} title={`สลับเป็น${theme === 'dark' ? 'ธีมขาว' : 'ธีมมืด'}`}
      className={`flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-ink-dim
                  hover:text-ink hover:bg-elevated transition-colors ${collapsed ? 'justify-center w-full' : ''}`}>
      <Icon size={15} />
      {!collapsed && <span className="t-cap text-ink-dim">{label}</span>}
    </button>
  )
}
