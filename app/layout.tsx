import { headers } from 'next/headers'
import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { ThemeProvider } from 'next-themes'
import './globals.css'

const geist = Geist({ subsets: ['latin'], display: 'swap', variable: '--font-geist-sans' })
const geistMono = Geist_Mono({ subsets: ['latin'], display: 'swap', variable: '--font-geist-mono' })

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
  themeColor: '#111214',
}

export const metadata: Metadata = {
  title: 'DoneWell Audio — Acoustic Feedback Detection',
  description: 'Real-time acoustic feedback detection and EQ advisory for live sound engineers. Works offline.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'DoneWellAudio',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const hdrs = await headers()
  const nonce = hdrs.get('x-nonce') ?? undefined

  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <body className="font-sans antialiased" nonce={nonce} suppressHydrationWarning>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:rounded focus:bg-primary focus:text-primary-foreground focus:text-sm focus:font-medium focus:ring-[3px] focus:ring-ring/50 focus:outline-none">
          Skip to main content
        </a>
        <ThemeProvider attribute="class" defaultTheme="dark" storageKey="dwa-theme" disableTransitionOnChange>
          <main id="main">{children}</main>
        </ThemeProvider>
      </body>
    </html>
  )
}
