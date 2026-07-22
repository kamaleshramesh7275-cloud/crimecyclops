import { Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import StatCard from './components/StatCard';
import MapAnalysis from './components/MapAnalysis';
import VoiceControl from './components/VoiceControl';
import { AIChatbot } from './components/AIChatbot';
import NetworkGraph from './components/NetworkGraph';
import { AlertDispatchModal } from './components/AlertDispatchModal';
import { ExecutiveBriefingModal } from './components/ExecutiveBriefingModal';


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
  pagerank?: number;
  community_id?: number;
  
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
  id: string;
  type: string;
  district: string;
  severity: string;
  timestamp: string;
  crime_category?: string;
  message: string;
  recommended_action?: string;
  status: string;
};

type ReportSummary = {
  report_type: string;
  aging_stats: {
    under_30_days: number;
    "30_to_90_days": number;
    stagnant_over_90_days: number;
  };
  aging_chart_data: { category: string; cases: number; fill: string }[];
  crime_distribution: { crime_type: string; count: number }[];
  average_workload: number;
  overloaded_investigators: { name: string; station: string; district: string; workload: number }[];
  summary: string[];
  districts: { id: number; name: string }[];
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

/** Fetch with automatic JWT Bearer token from stored session. */
function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const session = getStoredSession();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (session?.token) {
    headers['Authorization'] = `Bearer ${session.token}`;
  }
  return fetch(url, { ...options, headers });
}

// ── types for new dashboard panels ──────────────────────────────
type DashOverview = Overview & {
  closed_cases: number;
  closure_rate_pct: number;
  avg_resolution_days: number;
};
type CrimeCategory = { crime_type: string; count: number; percentage: number; color: string };
type DistrictRow = {
  rank: number; district_name: string; total_firs: number;
  open_cases: number; open_rate_pct: number; open_rate_color: string;
};
type RecentFIR = {
  id: number; crime_type: string; status: string;
  incident_date: string; district_name: string; station_name: string;
};
type TrendSeries = Record<string, number> & { month: string };
type AnomalyItem = { district: string; year_week: string; count: number; deviation: number; anomaly_score: number };
type RiskGrid = { latitude: number; longitude: number; risk_score: number };

const CHART_COLORS = ['#c084fc','#38bdf8','#34d399','#fb7185','#fbbf24','#f97316'];

function DashboardPage() {
  const { t } = useTranslation();
  const [overview,    setOverview]    = useState<DashOverview>({ total_firs:0, total_stations:0, total_districts:0, open_cases:0, closed_cases:0, closure_rate_pct:0, avg_resolution_days:0 });
  const [categories,  setCategories]  = useState<CrimeCategory[]>([]);
  const [trendSeries, setTrendSeries] = useState<TrendSeries[]>([]);
  const [topTypes,    setTopTypes]    = useState<string[]>([]);
  const [districts,   setDistricts]   = useState<DistrictRow[]>([]);
  const [recent,      setRecent]      = useState<RecentFIR[]>([]);
  const [anomalies,   setAnomalies]   = useState<AnomalyItem[]>([]);
  const [riskData,    setRiskData]    = useState<{ predicted_next_month_volume: number; grid: RiskGrid[] } | null>(null);
  const [loading,     setLoading]     = useState(true);

  useEffect(() => {
    document.title = 'CrimeCyclops | Dashboard';
    Promise.all([
      authFetch('/api/dashboard/overview').then(r => r.json()),
      authFetch('/api/dashboard/crime-categories').then(r => r.json()),
      authFetch('/api/dashboard/trends').then(r => r.json()),
      authFetch('/api/dashboard/district-summary').then(r => r.json()),
      authFetch('/api/dashboard/recent-activity').then(r => r.json()),
      authFetch('/api/analytics/anomalies').then(r => r.json()),
      authFetch('/api/analytics/predictive-risk').then(r => r.json()),
    ]).then(([ov, cats, tr, dist, rec, anom, risk]) => {
      setOverview(ov);
      setCategories(cats.categories || []);
      setTrendSeries(tr.data || []);
      setTopTypes(tr.top_types || []);
      setDistricts(dist.districts || []);
      setRecent(rec.recent || []);
      setAnomalies((anom.anomalies || []).slice(0, 5));
      setRiskData(risk);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const rankClass = (r: number) => r === 1 ? 'gold' : r === 2 ? 'silver' : r === 3 ? 'bronze' : 'plain';
  const statusClass = (s: string) => ['open','closed','investigation'].includes(s) ? s : 'default';
  const statusDot   = (s: string) => s === 'open' ? '#fb7185' : s === 'closed' ? '#34d399' : '#fbbf24';
  const riskClass   = (score: number) => score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';
  const tooltipStyle = { background: '#0b172a', border: '1px solid rgba(148,163,184,0.25)', borderRadius: 8, fontSize: 12 };

  return (
    <div className="page">
      {/* ── HERO BANNER ── */}
      <section className="hero-card" style={{ marginBottom: 24 }}>
        <h1 className="hero-title">CrimeCyclops Intelligence Command</h1>
        <p className="hero-subtitle">
          Unified incident visibility for investigators, district officers, and public-facing safety response teams.
        </p>
      </section>

      {/* ── KPI ROW ── */}
      <div className="kpi-grid">
        <div className="kpi-card" style={{ '--kpi-accent': '#c084fc' } as React.CSSProperties}>
          <div className="kpi-label">Total FIRs</div>
          <div className="kpi-value">{overview.total_firs.toLocaleString()}</div>
          <span className="kpi-delta neutral">All Time</span>
        </div>
        <div className="kpi-card" style={{ '--kpi-accent': '#34d399' } as React.CSSProperties}>
          <div className="kpi-label">Closure Rate</div>
          <div className="kpi-value">{overview.closure_rate_pct}%</div>
          <span className={`kpi-delta ${overview.closure_rate_pct >= 60 ? 'up' : 'down'}`}>
            {overview.closure_rate_pct >= 60 ? '↑ On Track' : '↓ Below Target'}
          </span>
        </div>
        <div className="kpi-card" style={{ '--kpi-accent': '#38bdf8' } as React.CSSProperties}>
          <div className="kpi-label">Avg Resolution</div>
          <div className="kpi-value">{overview.avg_resolution_days}<span style={{ fontSize:'1rem', color:'#9fb5d5', marginLeft:4 }}>days</span></div>
          <span className={`kpi-delta ${overview.avg_resolution_days <= 30 ? 'up' : 'down'}`}>
            {overview.avg_resolution_days <= 30 ? '↑ Fast' : '↓ Slow'}
          </span>
        </div>
        <div className="kpi-card" style={{ '--kpi-accent': '#fb7185' } as React.CSSProperties}>
          <div className="kpi-label">Open Cases</div>
          <div className="kpi-value">{overview.open_cases.toLocaleString()}</div>
          <span className="kpi-delta down">Needs Attention</span>
        </div>
        <div className="kpi-card" style={{ '--kpi-accent': '#fbbf24' } as React.CSSProperties}>
          <div className="kpi-label">Districts</div>
          <div className="kpi-value">{overview.total_districts}</div>
          <span className="kpi-delta neutral">{overview.total_stations} Stations</span>
        </div>
      </div>

      {/* ── TREND + CRIME CATEGORIES ── */}
      <div className="dash-row wide-left" style={{ marginBottom: 20 }}>
        <div className="dash-panel">
          <h3 className="dash-panel-title">Monthly Crime Trends (Top Types)</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trendSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
              <XAxis dataKey="month" stroke="#9fb5d5" tick={{ fontSize: 11 }} />
              <YAxis stroke="#9fb5d5" tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#9fb5d5' }} />
              {topTypes.map((type, i) => (
                <Line key={type} type="monotone" dataKey={type} stroke={CHART_COLORS[i % CHART_COLORS.length]}
                  strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="dash-panel">
          <h3 className="dash-panel-title">Crime Category Breakdown</h3>
          <div style={{ marginBottom: 12 }}>
            <ResponsiveContainer width="100%" height={140}>
              <PieChart>
                <Pie data={categories} dataKey="count" nameKey="crime_type" cx="50%" cy="50%"
                  innerRadius={40} outerRadius={65} paddingAngle={3}>
                  {categories.map((cat, i) => <Cell key={i} fill={cat.color} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n: string) => [`${v} cases`, n]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          {categories.slice(0, 6).map(cat => (
            <div key={cat.crime_type} className="crime-bar-row">
              <div className="crime-bar-label" title={cat.crime_type}>{cat.crime_type}</div>
              <div className="crime-bar-track">
                <div className="crime-bar-fill" style={{ width: `${cat.percentage}%`, background: cat.color }} />
              </div>
              <div className="crime-bar-count">{cat.count.toLocaleString()}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── DISTRICT LEADERBOARD + ANOMALY FEED ── */}
      <div className="dash-row" style={{ marginBottom: 20 }}>
        <div className="dash-panel">
          <h3 className="dash-panel-title">District Leaderboard</h3>
          <table className="district-table">
            <thead>
              <tr>
                <th>#</th><th>District</th><th>Total FIRs</th><th>Open Rate</th>
              </tr>
            </thead>
            <tbody>
              {districts.map(d => (
                <tr key={d.rank}>
                  <td><span className={`rank-badge ${rankClass(d.rank)}`}>{d.rank}</span></td>
                  <td style={{ fontWeight: 600 }}>{d.district_name}</td>
                  <td>{d.total_firs.toLocaleString()}</td>
                  <td>
                    <span className="open-rate-pill" style={{
                      background: `${d.open_rate_color}22`,
                      color: d.open_rate_color
                    }}>
                      {d.open_rate_pct}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="dash-panel">
          <h3 className="dash-panel-title">ML Anomaly Detection</h3>
          {loading ? (
            <p style={{ color: '#9fb5d5', fontSize: '0.82rem' }}>Running Isolation Forest analysis...</p>
          ) : anomalies.length === 0 ? (
            <p style={{ color: '#34d399', fontSize: '0.82rem' }}>No anomalies detected in recent data.</p>
          ) : (
            anomalies.map((a, i) => (
              <div key={i} className="anomaly-item">
                <div className="anomaly-dot" />
                <div>
                  <div className="anomaly-district">{a.district}</div>
                  <div className="anomaly-week">Week: {a.year_week} · {a.count} cases</div>
                  <div className="anomaly-deviation">
                    {a.deviation > 0 ? `+${a.deviation}%` : `${a.deviation}%`} vs district avg · Score: {a.anomaly_score.toFixed(2)}
                  </div>
                </div>
              </div>
            ))
          )}

          <div style={{ marginTop: 20 }}>
            <h3 className="dash-panel-title" style={{ marginBottom: 12 }}>Predictive Risk</h3>
            {riskData && (
              <>
                <div className="risk-predicted-banner">
                  <div>
                    <div className="risk-predicted-label">Predicted Next-Month Volume</div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 2 }}>Linear trend projection</div>
                  </div>
                  <div className="risk-predicted-value">{riskData.predicted_next_month_volume?.toLocaleString()}</div>
                </div>
                <div style={{ fontSize: '0.72rem', color: '#9fb5d5', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Top Risk Sectors
                </div>
                {riskData.grid.slice(0, 5).map((g, i) => (
                  <div key={i} className="risk-row">
                    <span style={{ color: '#9fb5d5', fontSize: '0.76rem' }}>
                      {g.latitude.toFixed(2)}°N, {g.longitude.toFixed(2)}°E
                    </span>
                    <span className={`risk-score-pill ${riskClass(g.risk_score)}`}>{g.risk_score.toFixed(1)}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── RECENT ACTIVITY TICKER ── */}
      <div className="dash-panel" style={{ marginBottom: 20 }}>
        <h3 className="dash-panel-title">Recent FIR Activity</h3>
        <div className="activity-ticker">
          {recent.map((fir, i) => (
            <div key={fir.id || i} className="activity-item">
              <div className="activity-status-dot" style={{ background: statusDot(fir.status) }} />
              <div className="activity-type">{fir.crime_type}</div>
              <div className="activity-district">{fir.district_name || '—'}</div>
              <div className="activity-date">{fir.incident_date?.slice(0, 10) || '—'}</div>
              <span className={`status-pill-sm ${statusClass(fir.status)}`}>{fir.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PublicPage() {
  const [safetyData, setSafetyData] = useState<{
    district_safety_scores: {
      district_id: number;
      district_name: string;
      safety_score: number;
      grade: string;
      status: string;
      color: string;
      total_incidents: number;
      resolution_rate_pct: number;
      literacy_rate_pct: number;
    }[];
    helplines: { name: string; number: string; category: string; icon: string }[];
    advisories: { id: string; title: string; category: string; severity: string; date: string; summary: string; tips: string[] }[];
  } | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAdvisory, setSelectedAdvisory] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'CrimeCyclops | Public Safety';
    authFetch('/api/public/safety-index')
      .then((r) => r.json())
      .then(setSafetyData);
  }, []);

  const filteredDistricts = useMemo(() => {
    if (!safetyData) return [];
    return safetyData.district_safety_scores.filter((d) =>
      d.district_name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [safetyData, searchQuery]);

  return (
    <div className="page">
      <section className="hero-card">
        <h1 className="hero-title">Citizen Safety Portal & Public Advisories</h1>
        <p className="hero-subtitle">
          Real-time District Safety Index (DSI) scorecard, active public safety bulletins, and official helpline access.
        </p>
      </section>

      {safetyData ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px' }}>
          
          {/* Section 1: Helplines */}
          <section className="panel" style={{ background: 'rgba(20, 15, 42, 0.4)' }}>
            <h3 style={{ margin: '0 0 12px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              Emergency Helplines & SOS Quick Directory
            </h3>
            <div className="helpline-grid">
              {safetyData.helplines.map((h, i) => (
                <div key={i} className="helpline-card">
                  <div className="helpline-icon" style={{ fontSize: 13, color: '#9fb5d5', fontWeight: 600 }}>{h.category.slice(0,2).toUpperCase()}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{h.category}</div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#f8fafc' }}>{h.name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: 4 }}>
                      <span style={{ fontSize: 16, color: '#38bdf8', fontWeight: 'bold' }}>{h.number}</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(h.number);
                          alert(`Copied number: ${h.number}`);
                        }}
                        style={{
                          background: 'none', border: 'none', color: '#c084fc', cursor: 'pointer', fontSize: 11, padding: 0
                        }}
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '24px' }}>
            
            {/* Section 2: District Safety Index */}
            <section className="panel list-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <h3 style={{ margin: 0 }}>District Safety Scorecard</h3>
                <input
                  type="text"
                  placeholder="Filter by district..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(148,163,184,0.2)',
                    color: '#fff', borderRadius: 8, padding: '4px 10px', fontSize: 12, outline: 'none'
                  }}
                />
              </div>
              <div className="dsi-grid" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {filteredDistricts.map((d) => (
                  <div
                    key={d.district_id}
                    className="dsi-card"
                    style={{
                      flexDirection: 'row', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      background: 'rgba(30, 41, 59, 0.25)', borderLeft: `4px solid ${d.color}`, padding: '10px 14px'
                    }}
                  >
                    <div>
                      <h4 style={{ margin: 0, fontSize: 15, color: '#f8fafc' }}>{d.district_name}</h4>
                      <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#94a3b8' }}>
                        {d.total_incidents} registered cases • {d.resolution_rate_pct}% resolved
                      </p>
                    </div>
                    <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 'bold', color: d.color }}>{d.grade}</div>
                        <div style={{ fontSize: 10, color: '#64748b' }}>Index: {d.safety_score}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Section 3: Advisories */}
            <section className="panel">
              <h3 style={{ marginBottom: 14 }}>Public Safety Bulletins & Alerts</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {safetyData.advisories.map((a) => (
                  <div key={a.id} className="advisory-card" style={{ borderLeft: a.severity === 'high' ? '4px solid #fb7185' : '4px solid #fbbf24' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span className={`severity-badge severity-${a.severity}`} style={{ fontSize: 9 }}>{a.severity.toUpperCase()}</span>
                      <span style={{ fontSize: 11, color: '#64748b' }}>{a.date}</span>
                    </div>
                    <h4 style={{ margin: '0 0 6px 0', color: '#f8fafc', fontSize: 14 }}>{a.title}</h4>
                    <p style={{ margin: '0 0 10px 0', fontSize: 12, color: '#dce8ff', lineHeight: 1.4 }}>{a.summary}</p>
                    
                    <button
                      onClick={() => setSelectedAdvisory(selectedAdvisory === a.id ? null : a.id)}
                      className="chip-button"
                      style={{ padding: '4px 8px', fontSize: 11 }}
                    >
                      {selectedAdvisory === a.id ? 'Hide Prevention Tips' : 'View Prevention Tips'}
                    </button>

                    {selectedAdvisory === a.id && (
                      <ul style={{ margin: '10px 0 0 0', paddingLeft: 18, fontSize: 12, color: '#38bdf8', lineHeight: 1.5 }}>
                        {a.tips.map((tip, idx) => (
                          <li key={idx} style={{ marginBottom: 4 }}>{tip}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </section>

          </div>
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>Loading safety metrics...</div>
      )}
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
    authFetch('/api/network/graph')
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

              {selectedNode.community_id !== undefined && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 8, marginTop: 8 }}>
                  <span style={{ color: '#94a3b8' }}>Gang/Community Cluster</span>
                  <span style={{ color: '#fbbf24', fontWeight: 'bold' }}>#{selectedNode.community_id}</span>
                </div>
              )}
              {selectedNode.pagerank !== undefined && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 4 }}>
                  <span style={{ color: '#94a3b8' }}>PageRank Influence</span>
                  <span style={{ color: '#a78bfa', fontWeight: 'bold' }}>{(selectedNode.pagerank * 100).toFixed(2)}%</span>
                </div>
              )}
              <button
                onClick={() => setSelectedNode(null)}
                style={{
                  marginTop: 10, width: '100%', padding: '6px', borderRadius: 8,
                  background: 'rgba(192,132,252,0.1)', border: '1px solid rgba(192,132,252,0.25)',
                  color: '#c084fc', cursor: 'pointer', fontSize: 12
                }}
              >Dismiss</button>
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
  const [dispatchHistory, setDispatchHistory] = useState<any[]>([]);
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [searchDistrict, setSearchDistrict] = useState<string>('');
  const [selectedAlert, setSelectedAlert] = useState<AlertItem | null>(null);

  const fetchAlerts = () => {
    authFetch('/api/alerts')
      .then((r) => r.json())
      .then((data) => {
        setAlerts(data.alerts || []);
        setDispatchHistory(data.dispatch_history || []);
      });
  };

  useEffect(() => {
    document.title = 'CrimeCyclops | Alerts';
    fetchAlerts();
  }, []);

  const filteredAlerts = useMemo(() => {
    return alerts.filter((item) => {
      const matchSeverity = filterSeverity === 'all' || item.severity.toLowerCase() === filterSeverity.toLowerCase();
      const matchType = filterType === 'all' || item.type.toLowerCase() === filterType.toLowerCase();
      const matchDistrict = !searchDistrict || item.district.toLowerCase().includes(searchDistrict.toLowerCase());
      return matchSeverity && matchType && matchDistrict;
    });
  }, [alerts, filterSeverity, filterType, searchDistrict]);

  return (
    <div className="page">
      <section className="hero-card">
        <h1 className="hero-title">Incident Alert & Dispatch Hub</h1>
        <p className="hero-subtitle">
          Real-time anomaly queues, threshold breach alerts, and official SMS/Email dispatch controls for field units.
        </p>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', alignItems: 'start' }}>
        
        {/* Alerts List panel */}
        <section className="panel list-card">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
            <h3 style={{ margin: 0 }}>Active Alert Queue ({filteredAlerts.length})</h3>
            
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Search district..."
                value={searchDistrict}
                onChange={(e) => setSearchDistrict(e.target.value)}
                style={{
                  background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(148,163,184,0.2)',
                  color: '#fff', borderRadius: 8, padding: '4px 10px', fontSize: 12, outline: 'none', flex: 1
                }}
              />
              <select
                value={filterSeverity}
                onChange={(e) => setFilterSeverity(e.target.value)}
                style={{
                  background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(148,163,184,0.2)',
                  color: '#fff', borderRadius: 8, padding: '4px 10px', fontSize: 12, outline: 'none'
                }}
              >
                <option value="all">All Severities</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                style={{
                  background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(148,163,184,0.2)',
                  color: '#fff', borderRadius: 8, padding: '4px 10px', fontSize: 12, outline: 'none'
                }}
              >
                <option value="all">All Types</option>
                <option value="spike_detected">Spikes</option>
                <option value="hotspot_escalation">Hotspots</option>
                <option value="anomaly">Anomalies</option>
                <option value="realtime_spike">Realtime Surge</option>
              </select>
            </div>
          </div>

          <ul className="hotspot-list" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filteredAlerts.map((item, index) => (
              <li
                key={`${item.id}-${index}`}
                style={{
                  cursor: 'pointer', background: 'rgba(30, 41, 59, 0.3)', padding: 14, borderRadius: 10,
                  border: '1px solid rgba(148,163,184,0.15)', listStyle: 'none', transition: 'all 0.2s ease',
                  display: 'flex', flexDirection: 'column', gap: 6
                }}
                onClick={() => setSelectedAlert(item)}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = 'rgba(192, 132, 252, 0.5)'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.15)'}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span className={`severity-badge severity-${item.severity}`}>{item.severity}</span>
                    <strong style={{ fontSize: 13, color: '#f8fafc' }}>{item.district}</strong>
                  </div>
                  <span style={{ fontSize: 11, color: '#64748b' }}>{item.timestamp}</span>
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>
                  <strong>Type:</strong> <span style={{ textTransform: 'capitalize' }}>{item.type.replace('_', ' ')}</span>
                  {item.crime_category && <span> • <strong>Category:</strong> {item.crime_category}</span>}
                </div>
                <div style={{ fontSize: 13, color: '#e2e8f0', lineHeight: 1.4, marginTop: 4 }}>{item.message}</div>
                <div style={{ fontSize: 11, color: '#38bdf8', fontStyle: 'italic', marginTop: 4 }}>
                  Click to initiate field team dispatch
                </div>
              </li>
            ))}
            {filteredAlerts.length === 0 && (
              <div style={{ textAlign: 'center', padding: '20px 0', color: '#64748b' }}>No alerts match your filter criteria.</div>
            )}
          </ul>
        </section>

        {/* Dispatch History panel */}
        <section className="panel list-card">
          <h3 style={{ marginBottom: 14 }}>Official Dispatch Logs</h3>
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 0, margin: 0 }}>
            {dispatchHistory.map((item, index) => (
              <li
                key={index}
                style={{
                  background: 'rgba(15, 23, 42, 0.5)', padding: 12, borderRadius: 8,
                  border: '1px solid rgba(148, 163, 184, 0.1)', listStyleType: 'none', fontSize: 12
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: '#c084fc', fontWeight: 'bold' }}>{item.alert_id}</span>
                  <span style={{ color: '#64748b' }}>{item.timestamp}</span>
                </div>
                <div style={{ color: '#e2e8f0', marginBottom: 4 }}>{item.message}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8' }}>
                  <span>Sent via <strong>{item.channel.toUpperCase()}</strong> to {item.recipient}</span>
                  <span style={{ color: item.status === 'sent' ? '#34d399' : '#fb7185' }}>
                    ● {item.status.toUpperCase()}
                  </span>
                </div>
              </li>
            ))}
            {dispatchHistory.length === 0 && (
              <div style={{ textAlign: 'center', padding: '20px 0', color: '#64748b' }}>No dispatches logged in current session.</div>
            )}
          </ul>
        </section>

      </div>

      <AlertDispatchModal
        alert={selectedAlert}
        onClose={() => setSelectedAlert(null)}
        onDispatchSuccess={fetchAlerts}
      />
    </div>
  );
}

function ReportsPage() {
  const [report, setReport] = useState<ReportSummary | null>(null);
  const [selectedDistrictId, setSelectedDistrictId] = useState<number | null>(null);
  const [briefingOpen, setBriefingOpen] = useState(false);

  const fetchReport = (districtId: number | null) => {
    const url = districtId !== null ? `/api/reports/summary?district_id=${districtId}` : '/api/reports/summary';
    authFetch(url)
      .then((r) => r.json())
      .then(setReport);
  };

  useEffect(() => {
    document.title = 'CrimeCyclops | Reports';
    fetchReport(selectedDistrictId);
  }, [selectedDistrictId]);

  return (
    <div className="page">
      <section className="hero-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 className="hero-title">Intelligence Reports & Analytics</h1>
          <p className="hero-subtitle">
            Weekly case-aging breakdowns, investigator workload indicators, and official command briefings.
          </p>
        </div>
        <button
          className="action-button primary-button"
          onClick={() => setBriefingOpen(true)}
          style={{ padding: '10px 20px', fontSize: 14, alignSelf: 'center' }}
        >
          Print / View Executive Briefing
        </button>
      </section>

      {report ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px' }}>
          
          {/* Filter Bar */}
          <div className="panel" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', background: 'rgba(20, 15, 42, 0.4)' }}>
            <span style={{ fontSize: 13, color: '#9fb5d5', fontWeight: 600 }}>Filter Command Level:</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className={`chip-button ${selectedDistrictId === null ? 'active' : ''}`}
                onClick={() => setSelectedDistrictId(null)}
              >
                State Level (All)
              </button>
              {report.districts.slice(0, 6).map((d) => (
                <button
                  key={d.id}
                  className={`chip-button ${selectedDistrictId === d.id ? 'active' : ''}`}
                  onClick={() => setSelectedDistrictId(d.id)}
                >
                  {d.name}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '24px' }}>
            
            {/* Section 1: Executive Summaries */}
            <section className="panel list-card">
              <h3>{report.report_type}</h3>
              <ul className="hotspot-list" style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {report.summary.map((item, index) => (
                  <li key={`${item}-${index}`} style={{ background: 'rgba(30, 41, 59, 0.25)', padding: 12, borderRadius: 8, fontSize: 13, color: '#e2e8f0', listStyle: 'none' }}>
                    {item}
                  </li>
                ))}
              </ul>
            </section>

            {/* Section 2: Case Aging Distribution */}
            <section className="panel list-card">
              <h3>Active Case Aging Distribution</h3>
              <div className="chart-wrap" style={{ marginTop: 12 }}>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={report.aging_chart_data} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.1)" />
                    <XAxis type="number" stroke="#9fb5d5" />
                    <YAxis dataKey="category" type="category" stroke="#9fb5d5" width={120} style={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: '#0b172a', border: '1px solid rgba(148,163,184,0.2)' }} />
                    <Bar dataKey="cases">
                      {report.aging_chart_data.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

          </div>

          {/* Section 3: Workload Matrix */}
          <section className="panel list-card">
            <h3 style={{ marginBottom: 12 }}>Investigator Case Workload Matrix</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', color: '#e2e8f0', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid rgba(148,163,184,0.15)', textAlign: 'left' }}>
                    <th style={{ padding: '10px 12px', color: '#9fb5d5' }}>Investigator Name</th>
                    <th style={{ padding: '10px 12px', color: '#9fb5d5' }}>Station / Unit Location</th>
                    <th style={{ padding: '10px 12px', color: '#9fb5d5' }}>District Headquarters</th>
                    <th style={{ padding: '10px 12px', color: '#9fb5d5' }}>Active Caseload</th>
                    <th style={{ padding: '10px 12px', color: '#9fb5d5' }}>Overload Threshold</th>
                  </tr>
                </thead>
                <tbody>
                  {report.overloaded_investigators.map((o, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(148,163,184,0.08)' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 600 }}>{o.name}</td>
                      <td style={{ padding: '10px 12px' }}>{o.station}</td>
                      <td style={{ padding: '10px 12px' }}>{o.district}</td>
                      <td style={{ padding: '10px 12px', color: '#fb7185', fontWeight: 'bold' }}>{o.workload} active cases</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span className="severity-badge severity-high" style={{ fontSize: 9 }}>
                          +{( ((o.workload - report.average_workload) / report.average_workload) * 100 ).toFixed(0)}% limit
                        </span>
                      </td>
                    </tr>
                  ))}
                  {report.overloaded_investigators.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ padding: '20px 0', textAlign: 'center', color: '#64748b' }}>
                        No investigators are currently flagged as overloaded.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>Generating State Intelligence Package...</div>
      )}

      <ExecutiveBriefingModal
        isOpen={briefingOpen}
        onClose={() => setBriefingOpen(false)}
      />
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
