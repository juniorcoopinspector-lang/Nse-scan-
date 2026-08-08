export default function Header() {
  return (
    <header className="w-full border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-black">
      <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold tracking-tight">NSE FNO Scanner</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
            Live
          </span>
        </div>
        <nav className="flex gap-4 text-sm font-medium">
          <a href="/" className="hover:text-blue-600 transition">Dashboard</a>
          <a href="#" className="hover:text-blue-600 transition">Scanner</a>
          <a href="#" className="hover:text-blue-600 transition">Settings</a>
        </nav>
      </div>
    </header>
  )
}
