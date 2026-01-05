import './globals.css'
import { Metadata } from 'next'
import { Providers } from './providers'

export const metadata: Metadata = {
  title: `${process.env.NEXT_PUBLIC_SERVER_NAME || 'Server'} - Whitelist Application`,
  description: 'Apply to join our server',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
