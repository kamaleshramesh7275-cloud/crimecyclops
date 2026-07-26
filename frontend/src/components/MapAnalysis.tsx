import { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import StationDrawer from './StationDrawer';

// @ts-ignore
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
// @ts-ignore
import markerIcon from 'leaflet/dist/images/marker-icon.png';
// @ts-ignore
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

export type DrillLevel = 'state' | 'district' | 'station';

export interface DistrictSummary {
  id: number;
  name: string;
  total_firs: number;
  open_cases: number;
  top_crime_type: string | null;
  station_count: number;
  centroid_lat: number;
  centroid_lon: number;
}

export interface StationSummary {
  id: number;
  name: string;
  beat: string;
  latitude: number;
  longitude: number;
  fir_count: number;
  open_cases: number;
}

function getDistrictColor(count: number, max: number): string {
  const ratio = max > 0 ? count / max : 0;
  if (ratio > 0.8) return '#f43f5e'; // Rose 500 (neon pinkish red)
  if (ratio > 0.6) return '#fb923c'; // Orange 400
  if (ratio > 0.4) return '#fbbf24'; // Amber 400
  if (ratio > 0.2) return '#c084fc'; // Sky 400 (neon blue)
  return '#34d399'; // Emerald 400 (neon green)
}

export default function MapAnalysis() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const mapRef = useRef<L.Map | null>(null);
  const mapDivRef = useRef<HTMLDivElement>(null);
  const geoLayerRef = useRef<L.GeoJSON | null>(null);
  const stationLayersRef = useRef<L.LayerGroup | null>(null);

  const [districts, setDistricts] = useState<DistrictSummary[]>([]);
  const [level, setLevel] = useState<DrillLevel>('state');
  const [activeDistrict, setActiveDistrict] = useState<DistrictSummary | null>(null);
  const [activeStations, setActiveStations] = useState<StationSummary[]>([]);
  const [activeStationId, setActiveStationId] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [geoJson, setGeoJson] = useState<any>(null);

  // Filters
  const [crimeFilter, setCrimeFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');

  // Live Feed
  const [recentActivities, setRecentActivities] = useState<any[]>([]);

  const isKn = i18n.language === 'kn';

  // Fetch GeoJSON and Recent Activities once
  useEffect(() => {
    document.title = 'CrimeCyclops | Map Analysis';
    fetch('/karnataka-districts.geojson')
      .then((r) => r.json())
      .then(setGeoJson);
      
    // Fetch live feed
    fetch('/api/dashboard/recent-activity')
      .then((r) => r.json())
      .then((data) => setRecentActivities(data.recent || []));
  }, []);

  // Initialize map once
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;
    const map = L.map(mapDivRef.current, {
      center: [15.3173, 75.7139],
      zoom: 7,
      zoomControl: true,
    });
    // No base map tiles! Keep it completely dark/holographic
    // L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    //   attribution: '© OpenStreetMap contributors, © CARTO',
    //   maxZoom: 19,
    // }).addTo(map);
    
    stationLayersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
  }, []);

  // Fetch Districts data when filters change
  useEffect(() => {
    let url = '/api/geo/districts?';
    if (crimeFilter !== 'All') url += `crime_type=${encodeURIComponent(crimeFilter)}&`;
    if (statusFilter !== 'All') url += `status=${encodeURIComponent(statusFilter)}&`;
    
    fetch(url)
      .then((r) => r.json())
      .then((data) => setDistricts(data.districts || []));
  }, [crimeFilter, statusFilter]);

  // Fetch Active District's Station Data when filters change (if drilled down)
  useEffect(() => {
    if (level !== 'state' && activeDistrict) {
      let url = `/api/geo/districts/${activeDistrict.id}?`;
      if (crimeFilter !== 'All') url += `crime_type=${encodeURIComponent(crimeFilter)}&`;
      if (statusFilter !== 'All') url += `status=${encodeURIComponent(statusFilter)}&`;

      fetch(url)
        .then((r) => r.json())
        .then((data) => {
          const stations: StationSummary[] = data.stations || [];
          setActiveStations(stations);
          renderStationMarkers(stations);
        });
    }
  }, [crimeFilter, statusFilter, activeDistrict, level]);

  // Render holographic bubble map when districts are loaded
  useEffect(() => {
    if (!mapRef.current || districts.length === 0 || !geoJson) return;
    if (geoLayerRef.current) geoLayerRef.current.remove();

    const max = Math.max(...districts.map((d) => d.total_firs));
    const layerGroup = L.featureGroup();

    // Draw the GeoJSON state/district boundaries first
    L.geoJSON(geoJson, {
      style: {
        color: '#38bdf8', // Neon blue
        weight: 1.5,
        opacity: 0.6,
        fillColor: '#0a0f26',
        fillOpacity: 0.4,
        dashArray: '4 4'
      }
    }).addTo(layerGroup);

    districts.forEach(dist => {
      if (!dist.centroid_lat || !dist.centroid_lon) return;
      
      const color = getDistrictColor(dist.total_firs, max);
      const radiusInMeters = 15000 + (dist.total_firs / max) * 30000;

      // Draw sci-fi glowing circles instead of flat filled circles
      const circle = L.circle([dist.centroid_lat, dist.centroid_lon], {
        radius: radiusInMeters,
        fillColor: 'transparent',
        color: color,
        weight: 3,
        opacity: 0.9,
        className: 'pulse-circle'
      });

      // Add a smaller dense core
      const core = L.circle([dist.centroid_lat, dist.centroid_lon], {
        radius: radiusInMeters * 0.2,
        fillColor: color,
        color: 'transparent',
        fillOpacity: 0.8
      });

      circle.bindTooltip(
        `<strong>${isKn ? (dist as any).name_kn || dist.name : dist.name}</strong><br/>FIRs: ${dist.total_firs}`,
        { sticky: true, className: 'custom-tooltip' }
      );

      circle.on('click', () => drillToDistrict(dist));
      core.on('click', () => drillToDistrict(dist));

      circle.addTo(layerGroup);
      core.addTo(layerGroup);
    });

    layerGroup.addTo(mapRef.current);
    geoLayerRef.current = layerGroup as any;
  }, [districts, isKn, geoJson]);

  function drillToDistrict(dist: DistrictSummary) {
    setActiveDistrict(dist);
    setLevel('district');

    if (mapRef.current && dist.centroid_lat && dist.centroid_lon) {
      // Smoother zoom level (9.5) so it doesn't jump too aggressively, with a longer duration.
      mapRef.current.flyTo([dist.centroid_lat, dist.centroid_lon], 9.5, { 
        duration: 1.5,
        easeLinearity: 0.25
      });
    }
  }

  function renderStationMarkers(stations: StationSummary[]) {
    if (!stationLayersRef.current || !mapRef.current) return;
    stationLayersRef.current.clearLayers();

    stations.forEach((st) => {
      if (!st.latitude || !st.longitude) return;
      
      const crimeLevel = st.fir_count > 30 ? 'high' : st.fir_count > 15 ? 'mid' : 'low';
      let color = '#34d399'; // Low
      if (crimeLevel === 'high') color = '#f43f5e';
      else if (crimeLevel === 'mid') color = '#fb923c';

      const icon = L.divIcon({
        className: 'bg-transparent border-none',
        html: `
          <div class="radar-pulse-marker ${crimeLevel === 'low' ? 'safe' : ''}">
            <div class="radar-pulse-core" style="background-color: ${color}; box-shadow: 0 0 10px ${color}"></div>
            <div class="radar-pulse-ring" style="border-color: ${color}; animation-duration: ${crimeLevel === 'high' ? '1s' : '2s'}"></div>
          </div>
        `,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      });

      const marker = L.marker([st.latitude, st.longitude], { icon });
      marker.bindTooltip(`<strong>${st.name}</strong><br/>FIRs: ${st.fir_count}<br/>Open: ${st.open_cases}`, { sticky: true });
      marker.on('click', () => {
        setActiveStationId(st.id);
        setLevel('station');
        setDrawerOpen(true);
      });
      stationLayersRef.current!.addLayer(marker);
    });
  }

  function goBack() {
    if (level === 'station') {
      setDrawerOpen(false);
      setActiveStationId(null);
      setLevel('district');
    } else if (level === 'district') {
      setActiveDistrict(null);
      setActiveStations([]);
      setLevel('state');
      stationLayersRef.current?.clearLayers();
      mapRef.current?.flyTo([15.3173, 75.7139], 7, { duration: 1.2 });
    }
  }

  (window as any).__ccDrillToDistrict = (name: string) => {
    const dist = districts.find((d) => d.name.toLowerCase().includes(name.toLowerCase()));
    if (dist) drillToDistrict(dist);
  };
  (window as any).__ccGoBack = goBack;
  (window as any).__ccCloseDrawer = () => {
    setDrawerOpen(false);
    setActiveStationId(null);
  };

  // Data aggregations for the panels
  const totalFIRs = districts.reduce((acc, d) => acc + d.total_firs, 0);
  const totalOpen = districts.reduce((acc, d) => acc + d.open_cases, 0);
  const totalStations = districts.reduce((acc, d) => acc + d.station_count, 0);
  
  const topDistricts = [...districts].sort((a, b) => b.total_firs - a.total_firs).slice(0, 5);
  const radarData = [
    { label: 'Theft', value: 34 },
    { label: 'Cyber', value: 21 },
    { label: 'Assault', value: 15 },
    { label: 'Drugs', value: 12 },
    { label: 'Fraud', value: 18 }
  ];

  return (
    <div className="sci-fi-dashboard">
      
      {/* LEFT COLUMN */}
      <div className="sci-fi-col-left">
        <div className="sci-fi-panel" style={{ flex: 1 }}>
          <div className="sci-fi-panel-header">
            <span className="crosshair">+</span>
            <span>Statistic Overview</span>
          </div>
          <div className="sci-fi-stat-row">
            <div className="sci-fi-stat-icon">📄</div>
            <div className="sci-fi-stat-info">
              <div className="sci-fi-stat-label">Total FIRs</div>
              <div className="sci-fi-stat-value text-blue-400">{totalFIRs.toLocaleString()}</div>
            </div>
          </div>
          <div className="sci-fi-stat-row">
            <div className="sci-fi-stat-icon text-red-400">🚨</div>
            <div className="sci-fi-stat-info">
              <div className="sci-fi-stat-label">Open Cases</div>
              <div className="sci-fi-stat-value text-red-400">{totalOpen.toLocaleString()}</div>
            </div>
          </div>
          <div className="sci-fi-stat-row">
            <div className="sci-fi-stat-icon text-emerald-400">🏢</div>
            <div className="sci-fi-stat-info">
              <div className="sci-fi-stat-label">Active Stations</div>
              <div className="sci-fi-stat-value text-emerald-400">{totalStations.toLocaleString()}</div>
            </div>
          </div>
        </div>

        <div className="sci-fi-panel" style={{ flex: 1 }}>
          <div className="sci-fi-panel-header">
            <span className="crosshair">+</span>
            <span>Distribution</span>
          </div>
          <div className="flex flex-col gap-3">
             {topDistricts.map(d => (
               <div key={d.id} className="flex flex-col gap-1">
                 <div className="flex justify-between text-[11px] text-gray-300">
                    <span>{d.name}</span>
                    <span className="text-blue-400 font-bold">{d.total_firs}</span>
                 </div>
                 <div className="w-full h-1 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 shadow-[0_0_8px_#3b82f6]" style={{ width: `${(d.total_firs / (topDistricts[0]?.total_firs || 1)) * 100}%` }}></div>
                 </div>
               </div>
             ))}
          </div>
        </div>
      </div>

      {/* CENTER COLUMN (MAP) */}
      <div className="sci-fi-col-center">
        <div className="sci-fi-header-overlay">
           <div className="sci-fi-title">Map Data Visualization</div>
        </div>
        <div className="sci-fi-map-container" ref={mapDivRef} />
        
        {/* GeoHierarchy Breadcrumb (Sci-Fi Style) */}
        <div className="absolute top-24 z-[400] w-full flex justify-center pointer-events-none">
           <div className="pointer-events-auto flex items-center gap-2 bg-gray-900/80 backdrop-blur-md border border-sky-500/30 px-6 py-2 rounded-full shadow-[0_0_15px_rgba(56,189,248,0.2)]">
             <button 
                className={`text-sm font-bold uppercase tracking-wider transition-colors ${level === 'state' ? 'text-sky-400 cursor-default' : 'text-gray-400 hover:text-sky-300 cursor-pointer'}`}
                onClick={() => level !== 'state' && goBack()}
             >
               Karnataka
             </button>
             {activeDistrict && (
               <>
                 <span className="text-sky-500/50">›</span>
                 <span className="text-sm font-bold uppercase tracking-wider text-sky-400">
                   {activeDistrict.name}
                 </span>
               </>
             )}
             {level === 'station' && (
                <>
                 <span className="text-sky-500/50">›</span>
                 <span className="text-sm font-bold uppercase tracking-wider text-sky-400">
                   Station View
                 </span>
               </>
             )}
           </div>
        </div>
        
        <StationDrawer
          stationId={activeStationId}
          open={drawerOpen}
          onClose={() => {
            setDrawerOpen(false);
            setActiveStationId(null);
          }}
        />
      </div>

      {/* RIGHT COLUMN */}
      <div className="sci-fi-col-right">
        <div className="sci-fi-panel" style={{ flex: 1 }}>
          <div className="sci-fi-panel-header">
            <span className="crosshair">+</span>
            <span>Radar Metrics</span>
          </div>
          <div className="flex flex-col h-full justify-center gap-2">
            {radarData.map(item => (
              <div key={item.label} className="flex justify-between items-center text-xs">
                 <span className="text-gray-400">{item.label}</span>
                 <div className="flex-1 mx-3 border-b border-dashed border-gray-700"></div>
                 <span className="text-emerald-400 font-bold">{item.value}%</span>
              </div>
            ))}
          </div>
        </div>

        <div className="sci-fi-panel" style={{ flex: 1.5 }}>
          <div className="sci-fi-panel-header">
            <span className="crosshair">+</span>
            <span>Live Activity Feed</span>
          </div>
          <div className="flex flex-col gap-2 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-sky-500/50 max-h-[300px]">
             {recentActivities.map(act => (
               <div key={act.id} 
                    className="p-2 border border-sky-500/20 bg-sky-900/10 rounded cursor-pointer hover:bg-sky-500/20 transition-all flex flex-col gap-1"
                    onClick={() => (window as any).__ccDrillToDistrict(act.district_name)}>
                 <div className="flex justify-between text-[10px] text-sky-400 uppercase tracking-widest font-bold">
                    <span>{act.crime_type}</span>
                    <span className="text-gray-500">{new Date(act.incident_date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                 </div>
                 <div className="text-sm text-gray-200">{act.district_name} District</div>
                 <div className="text-[10px] text-gray-500 truncate">{act.station_name}</div>
               </div>
             ))}
             {recentActivities.length === 0 && <div className="text-xs text-gray-500 text-center">Awaiting data...</div>}
          </div>
        </div>
      </div>

    </div>
  );
}
