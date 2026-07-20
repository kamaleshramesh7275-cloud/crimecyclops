import { useTranslation } from 'react-i18next';
import type { DrillLevel, DistrictSummary, StationSummary } from './MapAnalysis';

interface Props {
  level: DrillLevel;
  districts: DistrictSummary[];
  activeDistrict: DistrictSummary | null;
  stations: StationSummary[];
  onSelectDistrict: (d: DistrictSummary) => void;
  onSelectStation: (s: StationSummary) => void;
  onBack: () => void;
}

function CrimeBadge({ count }: { count: number }) {
  const cls = count > 30 ? 'badge-danger' : count > 15 ? 'badge-warn' : 'badge-ok';
  return <span className={`crime-badge ${cls}`}>{count}</span>;
}

export default function GeoHierarchy({
  level,
  districts,
  activeDistrict,
  stations,
  onSelectDistrict,
  onSelectStation,
  onBack,
}: Props) {
  const { t, i18n } = useTranslation();
  const isKn = i18n.language === 'kn';

  return (
    <div className="geo-sidebar">
      {/* Breadcrumb */}
      <div className="breadcrumb-bar">
        <span className="bc-chip" onClick={() => level !== 'state' && onBack()}>
          {isKn ? 'ಕರ್ನಾಟಕ' : 'Karnataka'}
        </span>
        {activeDistrict && (
          <>
            <span className="bc-sep">›</span>
            <span className="bc-chip active">{activeDistrict.name}</span>
          </>
        )}
      </div>

      {/* State level: district list */}
      {level === 'state' && (
        <div className="geo-list">
          <div className="geo-list-header">
            <span>{isKn ? 'ಜಿಲ್ಲೆಗಳು' : 'Districts'}</span>
            <span className="geo-list-hint">{isKn ? 'ಒಟ್ಟು ಪ್ರಕರಣಗಳು' : 'Total FIRs'}</span>
          </div>
          {districts.map((d) => (
            <button key={d.id} className="geo-item" onClick={() => onSelectDistrict(d)}>
              <div className="geo-item-left">
                <span className="geo-item-name">{d.name}</span>
                <span className="geo-item-sub">
                  {d.station_count} {isKn ? 'ಠಾಣೆ' : 'stations'} •{' '}
                  {d.top_crime_type ?? '—'}
                </span>
              </div>
              <CrimeBadge count={d.total_firs} />
            </button>
          ))}
        </div>
      )}

      {/* District level: station list */}
      {(level === 'district' || level === 'station') && activeDistrict && (
        <div className="geo-list">
          <button className="back-btn" onClick={onBack}>
            ← {isKn ? 'ಹಿಂದೆ' : 'Back'}
          </button>
          <div className="district-summary-card">
            <div className="ds-stat">
              <span className="ds-val">{activeDistrict.total_firs}</span>
              <span className="ds-key">{isKn ? 'ಒಟ್ಟು ಪ್ರಕರಣಗಳು' : 'Total FIRs'}</span>
            </div>
            <div className="ds-stat">
              <span className="ds-val">{activeDistrict.open_cases}</span>
              <span className="ds-key">{isKn ? 'ತೆರೆದ ಪ್ರಕರಣಗಳು' : 'Open Cases'}</span>
            </div>
            <div className="ds-stat">
              <span className="ds-val">{activeDistrict.top_crime_type ?? '—'}</span>
              <span className="ds-key">{isKn ? 'ಪ್ರಮುಖ ಅಪರಾಧ' : 'Top Crime'}</span>
            </div>
          </div>

          <div className="geo-list-header">
            <span>{isKn ? 'ಠಾಣೆಗಳು (ವಿವರಗಳಿಗಾಗಿ ಕ್ಲಿಕ್ ಮಾಡಿ)' : 'Stations (Click for analysis)'}</span>
            <span className="geo-list-hint">{isKn ? 'ಪ್ರಕರಣಗಳು' : 'FIRs'}</span>
          </div>
          {stations.map((st) => (
            <button key={st.id} className="geo-item" onClick={() => onSelectStation(st)}>
              <div className="geo-item-left">
                <span className="geo-item-name">{st.name}</span>
                <span className="geo-item-sub">
                  {st.beat} • {st.open_cases} {isKn ? 'ತೆರೆದ' : 'open'}
                </span>
              </div>
              <CrimeBadge count={st.fir_count} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
