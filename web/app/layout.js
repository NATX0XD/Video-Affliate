import './globals.css'
import { Inter, IBM_Plex_Sans_Thai } from 'next/font/google'

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
  title: 'Shopee VDO Gen — Auto Pilot',
  description: 'Shopee affiliate video automation — near-zero-touch',
}

export default function RootLayout({ children }) {
  return (
    <html lang="th" data-theme="dark"
          className={`h-full ${inter.variable} ${thai.variable}`}>
      <body className="h-full bg-base text-ink antialiased">
        {children}
      </body>
    </html>
  )
}
