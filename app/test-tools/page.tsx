'use client'

import { useState } from 'react'

type BulkResult = { total: number; succeeded: number; failed: number; errors: string[] }
type IdempotencyResult = { key: string; processedCount: number; results: { processed: boolean; reason?: string }[] }
type ResetResult = { message: string; idempotent?: boolean }

export default function TestTools() {
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null)
  const [idempResult, setIdempResult] = useState<IdempotencyResult | null>(null)
  const [resetResult, setResetResult] = useState<ResetResult | null>(null)
  const [loading, setLoading] = useState({ bulk: false, idempotency: false, reset: false })

  async function runBulk() {
    setLoading(l => ({ ...l, bulk: true }))
    try {
      const res = await fetch('/api/test/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
      setBulkResult(await res.json())
    } finally {
      setLoading(l => ({ ...l, bulk: false }))
    }
  }

  async function runIdempotency() {
    setLoading(l => ({ ...l, idempotency: true }))
    try {
      const res = await fetch('/api/test/trigger-webhook', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
      setIdempResult(await res.json())
    } finally {
      setLoading(l => ({ ...l, idempotency: false }))
    }
  }

  async function runReset() {
    setLoading(l => ({ ...l, reset: true }))
    try {
      const res = await fetch('/api/webhook/reset-quota', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-idempotency-key': `manual-reset-${Date.now()}` },
      })
      setResetResult(await res.json())
    } finally {
      setLoading(l => ({ ...l, reset: false }))
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <h1 className="text-2xl font-bold mb-1">Test Tools</h1>
      <p className="text-gray-500 text-sm mb-8">
        Use these to test the system under different conditions.
      </p>

      <div className="space-y-4">

        {/* Bulk leads */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="p-5">
            <p className="font-medium text-gray-900 mb-1">Generate 10 leads at once</p>
            <p className="text-sm text-gray-500 mb-4">
              Sends 10 lead creation requests simultaneously to test concurrency — checks that no quota overflows or duplicate assignments happen.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={runBulk}
                disabled={loading.bulk}
                className="px-4 py-1.5 rounded-md text-sm font-medium bg-gray-900 hover:bg-gray-700 text-white transition-colors disabled:opacity-50"
              >
                {loading.bulk ? 'Running…' : 'Generate leads'}
              </button>
              {bulkResult && <button onClick={() => setBulkResult(null)} className="text-xs text-gray-400 hover:text-gray-600">clear</button>}
            </div>
          </div>
          {bulkResult && (
            <div className="border-t border-gray-200 bg-gray-50 px-5 py-4">
              <div className="flex items-center gap-2 mb-3">
                <span className={`w-2 h-2 rounded-full ${bulkResult.failed === 0 ? 'bg-green-500' : 'bg-amber-400'}`} />
                <span className="text-sm font-medium text-gray-800">
                  {bulkResult.succeeded} of {bulkResult.total} succeeded
                  {bulkResult.failed > 0 && `, ${bulkResult.failed} failed`}
                </span>
              </div>
              {bulkResult.errors.length > 0 && (
                <div className="space-y-1">
                  {bulkResult.errors.map((e, i) => (
                    <p key={i} className="text-xs text-red-600 bg-red-50 px-3 py-1.5 rounded">{e}</p>
                  ))}
                </div>
              )}
              {bulkResult.failed === 0 && (
                <p className="text-xs text-gray-400">All assignments completed correctly with no quota overflows.</p>
              )}
            </div>
          )}
        </div>

        {/* Idempotency */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="p-5">
            <p className="font-medium text-gray-900 mb-1">Test webhook idempotency</p>
            <p className="text-sm text-gray-500 mb-4">
              Calls the reset-quota webhook 3 times with the same key at the same time. Only one should process — the other two should be ignored.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={runIdempotency}
                disabled={loading.idempotency}
                className="px-4 py-1.5 rounded-md text-sm font-medium bg-gray-900 hover:bg-gray-700 text-white transition-colors disabled:opacity-50"
              >
                {loading.idempotency ? 'Running…' : 'Run test'}
              </button>
              {idempResult && <button onClick={() => setIdempResult(null)} className="text-xs text-gray-400 hover:text-gray-600">clear</button>}
            </div>
          </div>
          {idempResult && (
            <div className="border-t border-gray-200 bg-gray-50 px-5 py-4">
              <div className="flex items-center gap-2 mb-3">
                <span className={`w-2 h-2 rounded-full ${idempResult.processedCount === 1 ? 'bg-green-500' : 'bg-red-400'}`} />
                <span className="text-sm font-medium text-gray-800">
                  {idempResult.processedCount === 1 ? 'Correct — exactly 1 call processed' : `${idempResult.processedCount} calls processed (should be 1)`}
                </span>
              </div>
              <div className="space-y-1.5">
                {idempResult.results.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${r.processed ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {r.processed ? 'Processed' : 'Skipped'}
                    </span>
                    {r.reason && <span className="text-gray-400 text-xs">{r.reason}</span>}
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-3">Key used: <span className="font-mono">{idempResult.key}</span></p>
            </div>
          )}
        </div>

        {/* Reset */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="p-5">
            <p className="font-medium text-gray-900 mb-1">Reset all provider quotas</p>
            <p className="text-sm text-gray-500 mb-4">
              Resets every provider's quota back to 10. This simulates a successful monthly payment and triggers a real webhook call.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={runReset}
                disabled={loading.reset}
                className="px-4 py-1.5 rounded-md text-sm font-medium bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50"
              >
                {loading.reset ? 'Resetting…' : 'Reset quotas'}
              </button>
              {resetResult && <button onClick={() => setResetResult(null)} className="text-xs text-gray-400 hover:text-gray-600">clear</button>}
            </div>
          </div>
          {resetResult && (
            <div className="border-t border-gray-200 bg-gray-50 px-5 py-4">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${resetResult.idempotent ? 'bg-yellow-400' : 'bg-green-500'}`} />
                <span className="text-sm text-gray-800">
                  {resetResult.idempotent
                    ? 'Already processed — no changes made (idempotent)'
                    : 'All provider quotas reset to 10'}
                </span>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
