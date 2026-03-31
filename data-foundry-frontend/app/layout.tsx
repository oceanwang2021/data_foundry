import type { Metadata } from 'next'
import './globals.css'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Data Foundry',
  description: 'Data Foundry 平台',
}

import Sidebar from '@/components/Sidebar'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh">
      <body className={cn("min-h-screen bg-background antialiased flex font-sans")}>
        <Sidebar />
        <main className="flex-1 overflow-y-auto bg-muted/20">
          {children}
        </main>
      </body>
    </html>
  )
}
