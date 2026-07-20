import './globals.css'
import { Inter, IBM_Plex_Sans_Thai } from 'next/font/google'
import { ToastProvider } from '@/components/ui/Toast'
import { PWA } from '@/components/ui/PWA'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})
const thai = IBM_Plex_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-thai',
  display: 'swap',
})

export const metadata = {
  title: 'VDO Gen Auto Pilot',
  description: 'ระบบโพสต์คลิปอัตโนมัติหลายแพลตฟอร์ม — near-zero-touch',
  manifest: '/manifest.webmanifest',
  icons: {
    apple: '/favicon.png',
  },
}

export const viewport = {
  themeColor: '#16131c',
}

export default function RootLayout({ children }) {
  return (
    <html lang="th" data-theme="dark"
          className={`h-full ${inter.variable} ${thai.variable}`}>
      <body className="h-full bg-base text-ink antialiased">
        {/* PWA/หน้าต่าง --app ไม่ถูก Chrome throttle ตอน background → ทำแท็บอื่นแล็ค
            สคริปต์นี้ทำให้หน้าต่าง"เงียบเอง"เมื่อไม่ได้ focus: หยุด setInterval polling ทั้งหมด
            + ใส่ .anim-paused (หยุด CSS animation). รันก่อน hydrate → ครอบ interval ทุกตัวในแอป */}
        <script dangerouslySetInnerHTML={{ __html:
          "(function(){var a=true,r=document.documentElement;function s(v){a=v;r.classList[v?'remove':'add']('anim-paused')}"
          + "var O=window.setInterval;window.setInterval=function(f,m){if(typeof f==='function'){var g=[].slice.call(arguments,2);"
          + "return O(function(){if(a)f.apply(null,g)},m)}return O.apply(window,arguments)};"
          + "addEventListener('blur',function(){s(false)});addEventListener('focus',function(){s(true)});"
          + "document.addEventListener('visibilitychange',function(){s(!document.hidden)});"
          + "if(document.hidden||!document.hasFocus())s(false)})();"
        }} />
        <ToastProvider>
          {children}
          <PWA />
        </ToastProvider>
      </body>
    </html>
  )
}
