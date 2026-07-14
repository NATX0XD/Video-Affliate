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
        <ToastProvider>
          {children}
          <PWA />
        </ToastProvider>
      </body>
    </html>
  )
}
