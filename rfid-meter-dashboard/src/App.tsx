import { useEffect, useState } from 'react';
import { Activity, ShieldAlert, CheckCircle2, CreditCard } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

const API_BASE = 'http://localhost:8000';
const WS_URL = 'ws://localhost:8000/ws/logs';

interface AccessLog {
  id: number;
  uid: string;
  owner_name: string;
  status: 'GRANTED' | 'DENIED' | 'COMPLETED';
  units_used: number;
  created_at: string;
}

interface RfidUser {
  uid: string;
  owner_name: string;
  balance: number;
  is_active: number;
}

const STATUS_STYLES: Record<AccessLog['status'], string> = {
  GRANTED: 'bg-emerald-950 text-emerald-400 border border-emerald-800/60',
  COMPLETED: 'bg-blue-950 text-blue-300 border border-blue-800/60',
  DENIED: 'bg-rose-950 text-rose-400 border border-rose-800/60',
};

export default function App() {
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [users, setUsers] = useState<RfidUser[]>([]);
  const [wsConnected, setWsConnected] = useState(false);

  const [uidInput, setUidInput] = useState('01:02:03:04');
  const [ownerInput, setOwnerInput] = useState('Baruch Marambi');
  const [amountInput, setAmountInput] = useState('25');

  const fetchData = async () => {
    try {
      const [logsRes, usersRes] = await Promise.all([
        fetch(`${API_BASE}/api/v1/logs`),
        fetch(`${API_BASE}/api/v1/users`),
      ]);
      setLogs(await logsRes.json());
      setUsers(await usersRes.json());
    } catch (err) {
      console.error('Failed to fetch from FastAPI:', err);
    }
  };

useEffect(() => {
    fetchData();

    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let isMounted = true;

    const connectWebSocket = () => {
      if (!isMounted) return;
      ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        if (isMounted) setWsConnected(true);
      };

      ws.onclose = () => {
        if (isMounted) {
          setWsConnected(false);
          reconnectTimer = setTimeout(connectWebSocket, 2000);
        }
      };

      ws.onerror = () => {
        ws?.close();
      };

      ws.onmessage = (event) => {
        const newLog: AccessLog = JSON.parse(event.data);
        setLogs((prev) => [newLog, ...prev.slice(0, 29)]);
        if (newLog.status === 'COMPLETED') {
          fetch(`${API_BASE}/api/v1/users`)
            .then((r) => r.json())
            .then(setUsers);
        }
      };
    };

    // Short delay avoids React StrictMode closing the socket before handshake finishes
    const initTimer = setTimeout(connectWebSocket, 100);

    return () => {
      isMounted = false;
      clearTimeout(initTimer);
      clearTimeout(reconnectTimer);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, []);

  const handleTopUp = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch(`${API_BASE}/api/v1/users/topup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: uidInput.trim().toUpperCase(),
        owner_name: ownerInput.trim(),
        amount: parseFloat(amountInput),
      }),
    });
    fetchData();
  };

  const totalUnitsUsed = logs
    .filter((l) => l.status === 'COMPLETED')
    .reduce((acc, l) => acc + l.units_used, 0);
  const grantedCount = logs.filter((l) => l.status === 'GRANTED').length;
  const deniedCount = logs.filter((l) => l.status === 'DENIED').length;

  const chartData = logs
    .filter((l) => l.status === 'COMPLETED')
    .slice(0, 8)
    .reverse()
    .map((l) => ({
      name: `#${l.id} (${l.owner_name.split(' ')[0]})`,
      units: l.units_used,
    }));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Smart RFID Metered Resource Monitor
            </h1>
            <p className="text-sm text-slate-400">
              Real-time ESP32 telemetry, token balances, and access audit logs
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold w-fit ${
              wsConnected
                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                : 'bg-rose-950 text-rose-400 border border-rose-800'
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                wsConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'
              }`}
            />
            {wsConnected ? 'Live Telemetry Connected' : 'Backend Disconnected'}
          </span>
        </header>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              <Activity className="w-4 h-4 text-sky-400" />
              Total Units Consumed
            </div>
            <div className="text-3xl font-bold text-white">
              {totalUnitsUsed.toFixed(1)} U
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Authorized Access
            </div>
            <div className="text-3xl font-bold text-white">{grantedCount}</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              Denied Attempts
            </div>
            <div className="text-3xl font-bold text-white">{deniedCount}</div>
          </div>
        </div>

        {/* Chart + Registered Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4">
              Consumption Per Completed Session (Units)
            </h2>
            <div className="w-full h-56">
              <ResponsiveContainer>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
                  <YAxis stroke="#94a3b8" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#334155',
                      borderRadius: '8px',
                    }}
                  />
                  <Bar dataKey="units" fill="#38bdf8" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                <CreditCard className="w-4 h-4 text-violet-400" />
                Registered Cards & Balances
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="py-2 font-medium">UID</th>
                      <th className="py-2 font-medium">Owner</th>
                      <th className="py-2 font-medium">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {users.map((u) => (
                      <tr key={u.uid}>
                        <td className="py-2.5 font-mono text-xs text-slate-300">
                          {u.uid}
                        </td>
                        <td className="py-2.5">{u.owner_name}</td>
                        <td className="py-2.5 font-bold text-emerald-400">
                          {u.balance.toFixed(2)} U
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <form onSubmit={handleTopUp} className="mt-5 pt-4 border-t border-slate-800">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Top-Up / Register Card
              </h3>
              <div className="flex flex-wrap gap-2">
                <input
                  className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm flex-1 min-w-[120px] focus:outline-none focus:border-blue-500"
                  value={uidInput}
                  onChange={(e) => setUidInput(e.target.value)}
                  placeholder="UID (e.g. 01:02:03:04)"
                  required
                />
                <input
                  className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm flex-1 min-w-[120px] focus:outline-none focus:border-blue-500"
                  value={ownerInput}
                  onChange={(e) => setOwnerInput(e.target.value)}
                  placeholder="Owner Name"
                  required
                />
                <input
                  className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm w-24 focus:outline-none focus:border-blue-500"
                  type="number"
                  step="0.5"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  placeholder="Units"
                  required
                />
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors cursor-pointer"
                >
                  Add Units
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Live Audit Logs Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
            Live Access & Metering Logs
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2.5 font-medium">Time (UTC)</th>
                  <th className="py-2.5 font-medium">Card UID</th>
                  <th className="py-2.5 font-medium">User</th>
                  <th className="py-2.5 font-medium">Status</th>
                  <th className="py-2.5 font-medium">Units Used</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-800/40">
                    <td className="py-2.5 text-slate-400 text-xs">
                      {log.created_at}
                    </td>
                    <td className="py-2.5 font-mono text-xs">{log.uid}</td>
                    <td className="py-2.5">{log.owner_name}</td>
                    <td className="py-2.5">
                      <span
                        className={`px-2 py-0.5 rounded-md text-xs font-semibold ${
                          STATUS_STYLES[log.status]
                        }`}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td className="py-2.5 font-medium">
                      {log.units_used > 0 ? `${log.units_used.toFixed(2)} U` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}