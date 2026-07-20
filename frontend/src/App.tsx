import { Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import StatCard from './components/StatCard';
import MapAnalysis from './components/MapAnalysis';
import VoiceControl from './components/VoiceControl';
import { AIChatbot } from './components/AIChatbot';
import NetworkGraph from './components/NetworkGraph';

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
  node_type: string;
  district: string;
  degree: number;
  degree_centrality: number;
  betweenness: number;
  
  // Person fields
  age_band?: string;
  gender?: string;
  occupation?: string;
  
  // FIR fields
  description?: string;
  incident_date?: string;
  status?: string;
  case_giver?: string;
  case_giver_phone?: string;
  instruments?: string;
  similar_cases?: string[];
};

type NetworkLink = {
  source: string;
  target: string;
  weight: number;
  type?: string;
};

type NetworkStats = {
  total_nodes: number;
  total_links: number;
  total_persons: number;
  total_firs: number;
  crime_breakdown: { crime_type: string; count: number }[];
  top_connected: { id: string; label: string; degree: number; betweenness: number }[];
  avg_degree: number;
  density: number;
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
    document.title = 'CrimeCyclops | Dashboard';
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
        <StatCard title={t('overview')} value={overview.total_firs} accent="#c084fc" />
        <StatCard title="Districts" value={overview.total_districts} accent="#38bdf8" />
        <StatCard title="Stations" value={overview.total_stations} accent="#34d399" />
        <StatCard title="Open Cases" value={overview.open_cases} accent="#fb7185" />
      </div>

      <section className="panel list-card chart-card">
        <h3>Incident Trend View</h3>
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#c084fc" stopOpacity={0.7} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.18)" />
              <XAxis dataKey="name" stroke="#9fb5d5" />
              <YAxis stroke="#9fb5d5" allowDecimals={false} />
              <Tooltip contentStyle={{ background: '#0b172a', border: '1px solid rgba(148, 163, 184, 0.25)' }} />
              <Area type="monotone" dataKey="count" stroke="#c084fc" fill="url(#trendFill)" strokeWidth={3} />
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
    document.title = 'CrimeCyclops | Public Safety';
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
  const [stats, setStats] = useState<NetworkStats | null>(null);
  const [selectedNode, setSelectedNode] = useState<NetworkNode | null>(null);
  const [filterGroups, setFilterGroups] = useState<string[]>(['suspect', 'witness', 'victim', 'accused', 'informer', 'fir', 'unknown']);
  const [searchQuery, setSearchQuery] = useState<string>('');

  useEffect(() => {
    document.title = 'CrimeCyclops | Network';
    fetch('/api/network/graph')
      .then((r) => r.json())
      .then((data) => {
        setNodes(data.nodes || []);
        setLinks(data.links || []);
        setStats(data.stats || null);
      });
  }, []);

  const filteredNodes = nodes.filter(n => filterGroups.includes(n.group));
  const filteredLinks = links.filter(l =>
    filteredNodes.some(n => n.id === l.source) && filteredNodes.some(n => n.id === l.target)
  );

  const maxCrime = stats?.crime_breakdown?.[0]?.count ?? 1;

  const GROUP_COLORS: Record<string, string> = {
    suspect: '#f97316', witness: '#38bdf8', victim: '#fb7185',
    accused: '#e879f9', informer: '#34d399', fir: '#a78bfa', unknown: '#94a3b8',
  };

  return (
    <div className="network-page">
      {/* Header */}
      <div className="network-hero">
        <h1>Criminal Intelligence Network</h1>
        <p>Interactive force-directed graph — drag nodes, scroll to zoom, click for analytics</p>
      </div>

      {/* Stats strip */}
      {stats && (
        <div className="network-stat-row">
          <div className="net-stat-chip"><span>Nodes</span><strong>{stats.total_nodes}</strong></div>
          <div className="net-stat-chip"><span>Links</span><strong>{stats.total_links}</strong></div>
          <div className="net-stat-chip"><span>Persons</span><strong>{stats.total_persons}</strong></div>
          <div className="net-stat-chip"><span>FIRs</span><strong>{stats.total_firs}</strong></div>
          <div className="net-stat-chip"><span>Avg Degree</span><strong>{stats.avg_degree}</strong></div>
          <div className="net-stat-chip"><span>Density</span><strong>{stats.density}</strong></div>
        </div>
      )}

      {/* Main workspace */}
      <div className="network-workspace">
        {/* Canvas */}
        <div className="network-canvas-wrap">
          <NetworkGraph
            nodes={filteredNodes}
            links={filteredLinks}
            selectedNodeId={selectedNode?.id}
            searchQuery={searchQuery}
            onNodeClick={setSelectedNode}
          />

          {/* Legend */}
          <div className="network-legend">
            <h4>Node Types</h4>
            {Object.entries(GROUP_COLORS).map(([group, color]) => (
              <div key={group} className="legend-item">
                <div className="legend-dot" style={{ background: color }} />
                <span style={{ textTransform: 'capitalize' }}>{group}</span>
              </div>
            ))}
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(148,163,184,0.1)', fontSize: 11, color: '#64748b' }}>
              Dashed = co-offender link
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="network-sidebar">
          {/* Filters & Search */}
          <div className="net-panel">
            <h3>Search & Filter</h3>
            <input 
              type="text" 
              placeholder="Search by name or ID..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%', background: 'rgba(20,15,42,0.9)', border: '1px solid rgba(148,163,184,0.22)',
                color: '#eef4ff', borderRadius: 8, padding: '6px 10px', fontSize: 13, outline: 'none', marginBottom: 12,
                boxSizing: 'border-box'
              }}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {Object.keys(GROUP_COLORS).map(g => (
                <label key={g} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={filterGroups.includes(g)}
                    onChange={(e) => {
                      if (e.target.checked) setFilterGroups([...filterGroups, g]);
                      else setFilterGroups(filterGroups.filter(x => x !== g));
                    }}
                  />
                  <span style={{ textTransform: 'capitalize', color: filterGroups.includes(g) ? '#e2e8f0' : '#64748b' }}>{g}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Selected node detail */}
          {selectedNode && (
            <div className="node-detail-panel">
              <div className="node-detail-title">{selectedNode.label}</div>
              <div className="node-detail-sub">{selectedNode.group} · {selectedNode.node_type}</div>
              
              {selectedNode.node_type === 'person' && (
                <div style={{ marginTop: 10, padding: 10, background: 'rgba(0,0,0,0.2)', borderRadius: 8 }}>
                  <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 4 }}>DEMOGRAPHICS</div>
                  <div style={{ fontSize: 13, color: '#e2e8f0', marginBottom: 2 }}><strong>Age:</strong> {selectedNode.age_band || 'Unknown'}</div>
                  <div style={{ fontSize: 13, color: '#e2e8f0', marginBottom: 2 }}><strong>Gender:</strong> {selectedNode.gender || 'Unknown'}</div>
                  <div style={{ fontSize: 13, color: '#e2e8f0' }}><strong>Occupation:</strong> {selectedNode.occupation || 'Unknown'}</div>
                </div>
              )}

              {selectedNode.node_type === 'fir' && (
                <div style={{ marginTop: 10, padding: 10, background: 'rgba(0,0,0,0.2)', borderRadius: 8 }}>
                  <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 4 }}>CASE DETAILS</div>
                  <div style={{ fontSize: 12, color: '#e2e8f0', marginBottom: 6, fontStyle: 'italic', lineHeight: 1.4 }}>"{selectedNode.description}"</div>
                  <div style={{ fontSize: 12, color: '#e2e8f0', marginBottom: 2 }}><strong>Date:</strong> {selectedNode.incident_date}</div>
                  <div style={{ fontSize: 12, color: '#e2e8f0', marginBottom: 2 }}><strong>Status:</strong> <span style={{ textTransform: 'capitalize', color: selectedNode.status === 'open' ? '#f87171' : '#34d399' }}>{selectedNode.status}</span></div>
                  <div style={{ fontSize: 12, color: '#e2e8f0', marginBottom: 2 }}><strong>Complainant:</strong> {selectedNode.case_giver}</div>
                  <div style={{ fontSize: 12, color: '#e2e8f0', marginBottom: 2 }}><strong>Phone:</strong> {selectedNode.case_giver_phone}</div>
                  <div style={{ fontSize: 12, color: '#e2e8f0', marginBottom: 6 }}><strong>Instruments:</strong> {selectedNode.instruments}</div>
                  
                  {selectedNode.similar_cases && selectedNode.similar_cases.length > 0 && (
                     <>
                       <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 4, marginTop: 8 }}>SIMILAR CASES</div>
                       <div style={{ fontSize: 12, color: '#38bdf8' }}>{selectedNode.similar_cases.map(id => `#${id}`).join(', ')}</div>
                     </>
                  )}
                </div>
              )}

              <div className="node-detail-grid" style={{ marginTop: 12 }}>
                <div className="node-metric">
                  <div className="node-metric-label">Degree</div>
                  <div className="node-metric-value" style={{ color: '#c084fc' }}>{selectedNode.degree}</div>
                </div>
                <div className="node-metric">
                  <div className="node-metric-label">Centrality</div>
                  <div className="node-metric-value" style={{ color: '#38bdf8' }}>{(selectedNode.degree_centrality * 100).toFixed(1)}%</div>
                </div>
                <div className="node-metric">
                  <div className="node-metric-label">Betweenness</div>
                  <div className="node-metric-value" style={{ color: '#fb7185' }}>{(selectedNode.betweenness * 100).toFixed(1)}%</div>
                </div>
                <div className="node-metric">
                  <div className="node-metric-label">District</div>
                  <div className="node-metric-value" style={{ color: '#34d399', fontSize: 13 }}>{selectedNode.district || '—'}</div>
                </div>
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                style={{
                  marginTop: 10, width: '100%', padding: '6px', borderRadius: 8,
                  background: 'rgba(192,132,252,0.1)', border: '1px solid rgba(192,132,252,0.25)',
                  color: '#c084fc', cursor: 'pointer', fontSize: 12
                }}
              >✕ Dismiss</button>
            </div>
          )}

          {/* Top connected nodes */}
          {stats && (
            <div className="net-panel">
              <h3>Most Connected</h3>
              {stats.top_connected.map(node => (
                <div key={node.id} className="top-node-row">
                  <span className="top-node-name">{node.label}</span>
                  <span className="top-node-badge">{node.degree} links</span>
                </div>
              ))}
            </div>
          )}

          {/* Crime breakdown */}
          {stats && (
            <div className="net-panel">
              <h3>Crime Breakdown</h3>
              {stats.crime_breakdown.slice(0, 8).map(item => (
                <div key={item.crime_type} className="crime-bar-row">
                  <div className="crime-bar-label">
                    <span>{item.crime_type}</span>
                    <span>{item.count}</span>
                  </div>
                  <div className="crime-bar-track">
                    <div className="crime-bar-fill" style={{ width: `${(item.count / maxCrime) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Instructions */}
          <div className="net-panel" style={{ color: '#64748b', fontSize: 12, lineHeight: 1.8 }}>
            <h3>Controls</h3>
            Drag nodes to reposition<br />
            Scroll to zoom in/out<br />
            Drag canvas to pan<br />
            Click node for details
          </div>
        </div>
      </div>
    </div>
  );
}

function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);

  useEffect(() => {
    document.title = 'CrimeCyclops | Alerts';
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
    document.title = 'CrimeCyclops | Reports';
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

  useEffect(() => {
    document.title = 'CrimeCyclops | Sign In';
  }, []);

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

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.detail || `Unable to sign in (${response.status}).`);
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
          <NavLink className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} to="/map">{t('map', 'Map')}</NavLink>
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

      <VoiceControl />
      <AIChatbot />

      <Routes>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/map" element={<MapAnalysis />} />
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
