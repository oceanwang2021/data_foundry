import type { Metadata } from 'next'
import './globals.css'
import { cn } from '@/lib/utils'
import AppShell from '@/components/AppShell'

export const metadata: Metadata = {
  title: 'Data Foundry',
  description: 'Data Foundry 平台',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh">
      <body className={cn("min-h-screen bg-background antialiased font-sans")}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
