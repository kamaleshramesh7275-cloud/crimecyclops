import { Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import StatCard from './components/StatCard';

const AUTH_KEY = 'crimecyclops-session';

type SessionUser = {
  token: string;
  user: string;
  role: string;
};

type Overview = {
  total_firs: number;
  total_stations: number;
  total_districts: number;
  open_cases: number;
};

type TrendPoint = {
  incident_date: string;
  crime_type: string;
  count: number;
};

type Hotspot = {
  station_id: number;
  count: number;
  lat: number;
  lon: number;
};

type NetworkNode = {
  id: string;
  label: string;
  group: string;
};

type NetworkLink = {
  source: string;
  target: string;
};

type AlertItem = {
  type: string;
  district: string;
  severity: string;
  message: string;
};

type ReportSummary = {
  report_type: string;
  district: string;
  summary: string[];
};

function getStoredSession(): SessionUser | null {
  const raw = localStorage.getItem(AUTH_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    localStorage.removeItem(AUTH_KEY);
    return null;
  }
}

function DashboardPage() {
  const { t } = useTranslation();
  const [overview, setOverview] = useState<Overview>({ total_firs: 0, total_stations: 0, total_districts: 0, open_cases: 0 });
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [trends, setTrends] = useState<TrendPoint[]>([]);

  useEffect(() => {
    Promise.all([
      fetch('/api/dashboard/overview').then((r) => r.json()),
      fetch('/api/dashboard/hotspots').then((r) => r.json()),
      fetch('/api/dashboard/trends').then((r) => r.json()),
    ]).then(([overviewData, hotspotsData, trendsData]) => {
      setOverview(overviewData);
      setHotspots(hotspotsData.hotspots || []);
      setTrends(trendsData.data || []);
    });
  }, []);

  const chartData = useMemo(
    () =>
      trends.map((item) => ({
        name: item.incident_date,
        count: item.count,
        type: item.crime_type,
      })),
    [trends],
  );

  return (
    <div className="page">
      <section className="hero-card">
        <h1 className="hero-title">CrimeCyclops Intelligence Command</h1>
        <p className="hero-subtitle">
          Unified incident visibility for investigators, district officers, and public-facing safety response teams.
        </p>
      </section>

      <div className="stat-grid">
        <StatCard title={t('overview')} value={overview.total_firs} />
        <StatCard title="Districts" value={overview.total_districts} />
        <StatCard title="Stations" value={overview.total_stations} />
        <StatCard title="Open Cases" value={overview.open_cases} />
      </div>

      <section className="panel list-card chart-card">
        <h3>Incident Trend View</h3>
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.7} />
                  <stop offset="95%" stopColor="#2563eb" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.18)" />
              <XAxis dataKey="name" stroke="#9fb5d5" />
              <YAxis stroke="#9fb5d5" allowDecimals={false} />
              <Tooltip contentStyle={{ background: '#0b172a', border: '1px solid rgba(148, 163, 184, 0.25)' }} />
              <Area type="monotone" dataKey="count" stroke="#38bdf8" fill="url(#trendFill)" strokeWidth={3} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="panel list-card">
        <h3>{t('hotspots')}</h3>
        <ul className="hotspot-list">
          {hotspots.map((item) => (
            <li key={item.station_id}>
              <strong>Station {item.station_id}</strong>
              <span>{item.count} incidents</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function PublicPage() {
  const [overview, setOverview] = useState<Overview>({ total_firs: 0, total_stations: 0, total_districts: 0, open_cases: 0 });
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);

  useEffect(() => {
    Promise.all([
      fetch('/api/dashboard/overview').then((r) => r.json()),
      fetch('/api/dashboard/hotspots').then((r) => r.json()),
    ]).then(([overviewData, hotspotsData]) => {
      setOverview(overviewData);
      setHotspots(hotspotsData.hotspots || []);
    });
  }, []);

  return (
    <div className="page">
      <section className="hero-card">
        <h1 className="hero-title">Citizen Safety Snapshot</h1>
        <p className="hero-subtitle">
          Aggregate-only hotspot summary for public visibility, optimised for transparency and rapid awareness.
        </p>
      </section>

      <div className="stat-grid">
        <StatCard title="FIRs" value={overview.total_firs} />
        <StatCard title="Districts" value={overview.total_districts} />
        <StatCard title="Stations" value={overview.total_stations} />
      </div>

      <section className="panel list-card">
        <h3>Public hotspot distribution</h3>
        <ul className="hotspot-list">
          {hotspots.slice(0, 6).map((item) => (
            <li key={item.station_id}>
              <strong>Station {item.station_id}</strong>
              <span>{item.count} detected incidents</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function NetworkPage() {
  const [nodes, setNodes] = useState<NetworkNode[]>([]);
  const [links, setLinks] = useState<NetworkLink[]>([]);

  useEffect(() => {
    fetch('/api/network/graph')
      .then((r) => r.json())
      .then((data) => {
        setNodes(data.nodes || []);
        setLinks(data.links || []);
      });
  }, []);

  return (
    <div className="page">
      <section className="hero-card">
        <h1 className="hero-title">Network</h1>
        <p className="hero-subtitle">
          NetworkX based criminal network and recurrence detector, mapped to expose recurring behavioural patterns.
        </p>
      </section>

      <section className="panel list-card">
        <h3>Graph entities</h3>
        <div className="grid-two">
          <div>
            <h4>Nodes</h4>
            <ul className="hotspot-list">
              {nodes.map((node) => (
                <li key={node.id}>
                  <strong>{node.label}</strong>
                  <span>{node.group}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4>Links</h4>
            <ul className="hotspot-list">
              {links.map((link, index) => (
                <li key={`${link.source}-${link.target}-${index}`}>
                  <strong>{link.source}</strong>
                  <span>→ {link.target}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}

function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);

  useEffect(() => {
    fetch('/api/alerts')
      .then((r) => r.json())
      .then((data) => setAlerts(data.alerts || []));
  }, []);

  return (
    <div className="page">
      <section className="hero-card">
        <h1 className="hero-title">Alerts</h1>
        <p className="hero-subtitle">
          Dedicated anomaly and escalation queue with a structured handoff path for critical incidents.
        </p>
      </section>

      <section className="panel list-card">
        <h3>Priority queue</h3>
        <ul className="hotspot-list">
          {alerts.map((item, index) => (
            <li key={`${item.district}-${index}`}>
              <strong>{item.type.toUpperCase()}</strong>
              <span>
                {item.district} • {item.severity}
              </span>
              <div>{item.message}</div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function ReportsPage() {
  const [report, setReport] = useState<ReportSummary | null>(null);

  useEffect(() => {
    fetch('/api/reports/summary')
      .then((r) => r.json())
      .then(setReport);
  }, []);

  return (
    <div className="page">
      <section className="hero-card">
        <h1 className="hero-title">Reports</h1>
        <p className="hero-subtitle">
          Weekly intelligence package with district-level trends and field priority recommendations.
        </p>
      </section>

      {report ? (
        <section className="panel list-card">
          <h3>{report.report_type}</h3>
          <p className="report-meta">District: {report.district}</p>
          <ul className="hotspot-list">
            {report.summary.map((item, index) => (
              <li key={`${item}-${index}`}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function LoginPage({ onAuthenticated }: { onAuthenticated: (session: SessionUser) => void }) {
  const navigate = useNavigate();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Unable to sign in.');
      }

      const session = {
        token: data.token,
        role: data.role,
        user: data.user,
      };

      onAuthenticated(session);
      navigate('/dashboard', { replace: true });
    } catch (caughtError: any) {
      setError(caughtError.message || 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>CrimeCyclops</h1>
        <p>Secure intelligence access for authorised investigators and command staff.</p>
        <form onSubmit={handleSubmit}>
          <div className="form-field">
            <label htmlFor="username">Username</label>
            <input id="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
          </div>

          <div className="form-field">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>

          {error ? <p className="form-error">{error}</p> : null}

          <button className="primary-button" type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>

          <p className="inline-note">Demo access: admin / admin123</p>
        </form>
      </div>
    </div>
  );
}

function AppShell({ session, onLogout }: { session: SessionUser | null; onLogout: () => void }) {
  const { t, i18n } = useTranslation();

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-badge">CC</span>
          <span>CrimeCyclops</span>
        </div>

        <nav className="nav-links">
          <NavLink className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} to="/dashboard">{t('dashboard')}</NavLink>
          <NavLink className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} to="/public">{t('public')}</NavLink>
          <NavLink className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} to="/network">{t('network')}</NavLink>
          <NavLink className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} to="/alerts">{t('alerts')}</NavLink>
          <NavLink className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} to="/reports">Reports</NavLink>
        </nav>

        <div className="topbar-actions">
          <button className="secondary-button" onClick={() => i18n.changeLanguage(i18n.language === 'en' ? 'kn' : 'en')}>
            Switch lang
          </button>
          <button className="action-button" onClick={onLogout}>
            Logout {session?.user ? `(${session.user})` : ''}
          </button>
        </div>
      </header>

      <Routes>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/public" element={<PublicPage />} />
        <Route path="/network" element={<NetworkPage />} />
        <Route path="/alerts" element={<AlertsPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState<SessionUser | null>(() => getStoredSession());

  const handleAuthenticated = (nextSession: SessionUser) => {
    localStorage.setItem(AUTH_KEY, JSON.stringify(nextSession));
    setSession(nextSession);
  };

  const handleLogout = () => {
    localStorage.removeItem(AUTH_KEY);
    setSession(null);
  };

  return (
    <Routes>
      <Route path="/" element={session ? <Navigate to="/dashboard" replace /> : <Navigate to="/login" replace />} />
      <Route path="/login" element={<LoginPage onAuthenticated={handleAuthenticated} />} />
      <Route path="/*" element={session ? <AppShell session={session} onLogout={handleLogout} /> : <Navigate to="/login" replace />} />
    </Routes>
  );
}
