import Header from '@/components/Header'
import ScannerTable from '@/components/ScannerTable'

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <Header />
      
      <main className="max-w-6xl mx-auto px-4 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Real-time NSE Futures & Options scanner
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
            <p className="text-sm text-gray-500 mb-1">Active Symbols</p>
            <p className="text-3xl font-bold">—</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
            <p className="text-sm text-gray-500 mb-1">Signals Today</p>
            <p className="text-3xl font-bold">—</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
            <p className="text-sm text-gray-500 mb-1">Status</p>
            <p className="text-3xl font-bold text-green-600">Ready</p>
          </div>
        </div>

        {/* Scanner Table */}
        <ScannerTable />
      </main>
    </div>
  )
}
