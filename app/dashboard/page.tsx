'use client'

import { useEffect, useRef, useState } from 'react'

interface Lead {
  leadId: number
  customerName: string
  phone: string
  city: string
  service: string
  assignedAt: string
}

interface Provider {
  id: number
  name: string
  quotaUsed: number
  quotaRemaining: number
  leads: Lead[]
}

type ConnStatus = 'connecting' | 'live' | 'disconnected'

function formatIST(dateStr: string) {
  return new Date(dateStr).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

export default function Dashboard() {
  const [providers, setProviders] = useState<Provider[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [conn, setConn] = useState<ConnStatus>('connecting')
  const [flashIds, setFlashIds] = useState<Set<number>>(new Set())
  const esRef = useRef<EventSource | null>(null)

  async function fetchProviders() {
    const res = await fetch('/api/providers')
    const data: Provider[] = await res.json()
    setProviders(data)
    setLoading(false)
  }

  function flash(ids: number[]) {
    setFlashIds(new Set(ids))
    setTimeout(() => setFlashIds(new Set()), 2000)
  }

  useEffect(() => {
    fetchProviders()
    const es = new EventSource('/api/events')
    esRef.current = es
    es.addEventListener('open', () => setConn('live'))
    es.addEventListener('lead-assigned', (e) => {
      const data = JSON.parse(e.data)
      fetchProviders()
      flash(data.providers?.map((p: { id: number }) => p.id) ?? [])
    })
    es.addEventListener('quota-reset', () => fetchProviders())
    es.addEventListener('error', () => setConn('disconnected'))
    return () => es.close()
  }, [])

  const selectedProvider = providers.find(p => p.id === selected)

  if (loading) return <div className="p-8 text-gray-400 text-sm">Loading…</div>

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">

      <div className="flex items-center justify-between mb-7">
        <h1 className="text-2xl font-bold">Provider Dashboard</h1>
        <div className="flex items-center gap-1.5 text-sm text-gray-500">
          <span className={`w-2 h-2 rounded-full ${conn === 'live' ? 'bg-green-500' : conn === 'connecting' ? 'bg-yellow-400' : 'bg-red-400'}`} />
          {conn === 'live' ? 'Live' : conn === 'connecting' ? 'Connecting…' : 'Disconnected'}
        </div>
      </div>

      {/* Provider cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {providers.map(p => (
          <button
            key={p.id}
            onClick={() => setSelected(prev => prev === p.id ? null : p.id)}
            className={[
              'p-4 rounded-lg border text-left transition-all',
              selected === p.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300',
              flashIds.has(p.id) ? 'ring-2 ring-green-400' : '',
            ].join(' ')}
          >
            <p className="font-semibold text-sm mb-2">{p.name}</p>
            <div className="h-1.5 bg-gray-100 rounded-full mb-2 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${p.quotaUsed >= 10 ? 'bg-red-400' : p.quotaUsed >= 7 ? 'bg-amber-400' : 'bg-blue-500'}`}
                style={{ width: `${(p.quotaUsed / 10) * 100}%` }}
              />
            </div>
            <p className="text-xs text-gray-500">{p.quotaRemaining} / 10 remaining</p>
            <p className="text-xs text-gray-400 mt-0.5">{p.leads.length} lead{p.leads.length !== 1 ? 's' : ''}</p>
          </button>
        ))}
      </div>

      {/* Detail table */}
      {selectedProvider ? (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-200 flex items-center justify-between bg-gray-50">
            <span className="font-medium text-sm">{selectedProvider.name} — {selectedProvider.leads.length} leads</span>
            <button
              onClick={() => setSelected(null)}
              className="text-gray-400 hover:text-gray-600 text-xs"
            >
              close
            </button>
          </div>

          {selectedProvider.leads.length === 0 ? (
            <p className="px-5 py-8 text-sm text-gray-400">No leads assigned yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs text-gray-400">
                    <th className="px-5 py-3 font-medium">ID</th>
                    <th className="px-5 py-3 font-medium">Name</th>
                    <th className="px-5 py-3 font-medium">Phone</th>
                    <th className="px-5 py-3 font-medium">City</th>
                    <th className="px-5 py-3 font-medium">Service</th>
                    <th className="px-5 py-3 font-medium">Assigned</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedProvider.leads.map((lead, i) => (
                    <tr key={lead.leadId} className={`border-b border-gray-100 last:border-0 ${i % 2 === 0 ? '' : 'bg-gray-50/50'}`}>
                      <td className="px-5 py-3 text-gray-400">#{lead.leadId}</td>
                      <td className="px-5 py-3 font-medium">{lead.customerName}</td>
                      <td className="px-5 py-3 text-gray-500">{lead.phone}</td>
                      <td className="px-5 py-3 text-gray-500">{lead.city}</td>
                      <td className="px-5 py-3 text-gray-500">{lead.service}</td>
                      <td className="px-5 py-3 text-gray-400 text-xs">{formatIST(lead.assignedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-gray-400 text-center py-4">
          Click a provider card to see their leads.
        </p>
      )}
    </div>
  )
}
