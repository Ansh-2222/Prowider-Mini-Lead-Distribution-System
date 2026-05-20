import Link from 'next/link'

export default function Home() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold mb-2">Prowider Mini</h1>
      <p className="text-gray-500 mb-10">
        A lead distribution system. Customers submit service requests, and the system
        automatically assigns each one to 3 providers based on fixed rules and a fair rotation.
      </p>

      <div className="space-y-3 mb-12">
        <PageLink
          href="/request-service"
          title="Request a service"
          description="Fill out the form to submit a new lead."
        />
        <PageLink
          href="/dashboard"
          title="Provider dashboard"
          description="See each provider's leads and remaining quota. Updates live."
        />
        <PageLink
          href="/test-tools"
          title="Test tools"
          description="Generate bulk leads, trigger the reset webhook, and test idempotency."
        />
      </div>

      <div>
        <p className="text-sm font-medium text-gray-700 mb-3">How leads are assigned</p>
        <div className="border border-gray-200 rounded-lg overflow-hidden text-sm">
          <div className="grid grid-cols-3 bg-gray-50 text-xs text-gray-400 font-medium px-4 py-2 border-b border-gray-200">
            <span>Service</span>
            <span>Always gets the lead</span>
            <span>Rotates in</span>
          </div>
          {[
            { service: 'Service 1', mandatory: 'Provider 1', pool: 'Providers 2, 3, 4' },
            { service: 'Service 2', mandatory: 'Provider 5', pool: 'Providers 6, 7, 8' },
            { service: 'Service 3', mandatory: 'Providers 1 & 4', pool: 'Providers 2, 3, 5, 6, 7, 8' },
          ].map((r, i, arr) => (
            <div
              key={r.service}
              className={`grid grid-cols-3 px-4 py-3 ${i < arr.length - 1 ? 'border-b border-gray-100' : ''}`}
            >
              <span className="text-gray-700 font-medium">{r.service}</span>
              <span className="text-gray-600">{r.mandatory}</span>
              <span className="text-gray-400">{r.pool}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Each lead goes to exactly 3 providers. Monthly quota is 10 per provider.
        </p>
      </div>
    </div>
  )
}

function PageLink({ href, title, description }: { href: string; title: string; description: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between px-4 py-3 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors group"
    >
      <div>
        <p className="font-medium text-gray-900">{title}</p>
        <p className="text-sm text-gray-400 mt-0.5">{description}</p>
      </div>
      <span className="text-gray-300 group-hover:text-gray-500 transition-colors text-lg">→</span>
    </Link>
  )
}
