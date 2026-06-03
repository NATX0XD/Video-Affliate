import './globals.css'

export const metadata = {
  title: 'Shopee VDO Gen — Auto Pilot',
  description: 'Shopee affiliate video automation',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full bg-[#09091a] text-white antialiased">
        {children}
      </body>
    </html>
  )
}
