import type { Metadata } from 'next'
import Link from 'next/link'
import './globals.css'

export const metadata: Metadata = {
  title: 'Prowider Mini',
  description: 'Lead distribution system',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-white text-gray-900 min-h-screen">
        <nav className="border-b border-gray-200 px-6 py-4 flex items-center gap-8">
          <Link href="/" className="font-semibold text-gray-900">
            Prowider Mini
          </Link>
          <div className="flex gap-5 text-sm text-gray-500">
            <Link href="/request-service" className="hover:text-gray-900">Request Service</Link>
            <Link href="/dashboard" className="hover:text-gray-900">Dashboard</Link>
            <Link href="/test-tools" className="hover:text-gray-900">Test Tools</Link>
          </div>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  )
}
