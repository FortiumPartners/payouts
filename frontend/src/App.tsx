import { Routes, Route } from 'react-router-dom';
import { DollarSign, RefreshCw } from 'lucide-react';

function Dashboard() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="h-6 w-6" />
            <h1 className="text-xl font-semibold">Fortium Payouts</h1>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="container mx-auto px-4 py-8">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="rounded-lg border bg-card p-6">
            <p className="text-sm text-muted-foreground">Ready to Pay</p>
            <p className="text-2xl font-bold">0</p>
            <p className="text-sm text-muted-foreground">$0.00</p>
          </div>
          <div className="rounded-lg border bg-card p-6">
            <p className="text-sm text-muted-foreground">Pending Controls</p>
            <p className="text-2xl font-bold">0</p>
          </div>
          <div className="rounded-lg border bg-card p-6">
            <p className="text-sm text-muted-foreground">Paid Today</p>
            <p className="text-2xl font-bold">0</p>
            <p className="text-sm text-muted-foreground">$0.00</p>
          </div>
        </div>

        {/* Bills table placeholder */}
        <div className="rounded-lg border bg-card">
          <div className="border-b px-6 py-4">
            <h2 className="font-semibold">Bills</h2>
          </div>
          <div className="p-6 text-center text-muted-foreground">
            <p>Connect to PartnerConnect to view bills.</p>
            <p className="text-sm mt-2">Configure API credentials in environment variables.</p>
          </div>
        </div>
      </main>
    </div>
  );
}

function Login() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="rounded-lg border bg-card p-8 max-w-md w-full">
        <div className="flex items-center justify-center gap-2 mb-6">
          <DollarSign className="h-8 w-8" />
          <h1 className="text-2xl font-semibold">Fortium Payouts</h1>
        </div>
        <p className="text-center text-muted-foreground mb-6">
          Sign in with your Fortium Partners Google account.
        </p>
        <a
          href="/auth/login"
          className="block w-full text-center px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
        >
          Sign in with Google
        </a>
      </div>
    </div>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Dashboard />} />
    </Routes>
  );
}

export default App;
