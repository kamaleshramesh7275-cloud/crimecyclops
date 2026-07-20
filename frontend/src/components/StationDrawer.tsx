import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

interface Props {
  stationId: number | null;
  open: boolean;
  onClose: () => void;
}

export default function StationDrawer({ stationId, open, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const isKn = i18n.language === 'kn';
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !stationId) return;
    setLoading(true);
    fetch(`/api/geo/stations/${stationId}`)
      .then((r) => r.json())
      .then((res) => {
        setData(res);
        setLoading(false);
      });
  }, [stationId, open]);

  if (!open) return null;

  return (
    <div className={`station-drawer ${open ? 'open' : ''}`}>
      <div className="drawer-header">
        <div className="dh-left">
          <h2>{data?.station?.name || 'Loading...'}</h2>
          <span className="dh-sub">{data?.station?.district_name} District • {data?.station?.beat}</span>
        </div>
        <button className="drawer-close" onClick={onClose}>×</button>
      </div>

      <div className="drawer-content">
        {loading || !data ? (
          <div className="drawer-loader">Loading intelligence data...</div>
        ) : (
          <>
            {/* Status overview */}
            <div className="drawer-grid-2">
              <div className="ds-stat">
                <span className="ds-val">
                  {data.status_summary.reduce((acc: number, cur: any) => acc + cur.count, 0)}
                </span>
                <span className="ds-key">{isKn ? 'ಒಟ್ಟು ಪ್ರಕರಣಗಳು' : 'Total FIRs'}</span>
              </div>
              <div className="ds-stat">
                <span className="ds-val">
                  {(() => {
                    const total = data.status_summary.reduce((acc: number, cur: any) => acc + cur.count, 0);
                    const closed = data.status_summary.find((s: any) => s.status === 'closed')?.count || 0;
                    return total > 0 ? ((closed / total) * 100).toFixed(0) + '%' : '0%';
                  })()}
                </span>
                <span className="ds-key">{isKn ? 'ತೆರವು ದರ' : 'Clearance Rate'}</span>
              </div>
            </div>

            {/* Monthly Trend */}
            <div className="drawer-section">
              <h3>{isKn ? 'ಮಾಸಿಕ ಪ್ರವೃತ್ತಿ' : 'Monthly Trend'}</h3>
              <div style={{ width: '100%', height: 180 }}>
                <ResponsiveContainer>
                  <AreaChart data={data.trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="month" stroke="#64748b" fontSize={12} tickFormatter={(val) => val.slice(5)} />
                    <Tooltip contentStyle={{ background: '#0f172a', border: 'none' }} />
                    <Area type="monotone" dataKey="count" stroke="#c084fc" fill="#c084fc" fillOpacity={0.2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Crime Breakdown */}
            <div className="drawer-section">
              <h3>{isKn ? 'ಅಪರಾಧ ವಿಶ್ಲೇಷಣೆ' : 'Crime Breakdown'}</h3>
              <div style={{ width: '100%', height: 220 }}>
                <ResponsiveContainer>
                  <BarChart data={data.crime_breakdown.slice(0, 5)} layout="vertical" margin={{ left: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                    <XAxis type="number" stroke="#64748b" />
                    <YAxis type="category" dataKey="crime_type" stroke="#e2e8f0" fontSize={12} width={100} />
                    <Tooltip contentStyle={{ background: '#0f172a', border: 'none' }} cursor={{ fill: '#1e293b' }} />
                    <Bar dataKey="count" fill="#818cf8" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Operations */}
            <div className="drawer-grid-2">
              <div className="drawer-section">
                <h3>{isKn ? 'ಅಧಿಕಾರಿಗಳ ಹೊರೆ' : 'Officer Workload'}</h3>
                <ul className="drawer-list">
                  {data.officers.slice(0, 3).map((o: any, i: number) => (
                    <li key={i}>
                      <span>{o.name}</span>
                      <span className="workload-badge">{o.workload} cases</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="drawer-section">
                <h3>{isKn ? 'ನ್ಯಾಯಾಲಯದ ಫಲಿತಾಂಶ' : 'Court Outcomes'}</h3>
                <ul className="drawer-list">
                  {data.court_outcomes.map((co: any, i: number) => (
                    <li key={i}>
                      <span style={{textTransform: 'capitalize'}}>{co.outcome}</span>
                      <span>{co.count} ({(co.avg_rate * 100).toFixed(0)}%)</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
