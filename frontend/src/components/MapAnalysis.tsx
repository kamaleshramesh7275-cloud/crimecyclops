import { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import StationDrawer from './StationDrawer';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
  LineChart, Line,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar
} from 'recharts';

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
    // Restore Dark Matter Tactical Map Tiles for geographical context
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap contributors, © CARTO',
      maxZoom: 19,
    }).addTo(map);
    
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
      
      // Calculate a height for the 3D pillar (between 20px and 120px)
      const normalizedHeight = Math.max(20, (dist.total_firs / max) * 120);

      const htmlContent = `
        <div class="sci-fi-pillar" style="height: ${normalizedHeight}px; --pillar-color: ${color};">
          <div class="pillar-top"></div>
          <div class="pillar-front"></div>
          <div class="pillar-right"></div>
        </div>
      `;

      const marker = L.marker([dist.centroid_lat, dist.centroid_lon], {
        icon: L.divIcon({
          className: 'custom-pillar-icon',
          html: htmlContent,
          iconSize: [20, normalizedHeight],
          iconAnchor: [10, normalizedHeight] // Anchor at the bottom of the pillar
        })
      });

      marker.bindTooltip(
        `<strong>${isKn ? (dist as any).name_kn || dist.name : dist.name}</strong><br/>FIRs: ${dist.total_firs}`,
        { sticky: true, className: 'custom-tooltip' }
      );

      marker.on('click', () => drillToDistrict(dist));
      marker.addTo(layerGroup);
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
  

  // Real data for charts based on districts
  const topDistricts = [...districts].sort((a, b) => b.total_firs - a.total_firs).slice(0, 10);
  
  const contrastData = topDistricts.map(d => ({
    name: d.name.substring(0, 4), // short name for x-axis
    open: d.open_cases,
    closed: d.total_firs - d.open_cases
  }));

  const distributionData = topDistricts.map((d, i) => ({
    name: d.name,
    value: d.total_firs,
    color: ['#f43f5e', '#38bdf8', '#fbbf24', '#34d399', '#c084fc', '#fb7185', '#60a5fa', '#fcd34d', '#4ade80', '#a78bfa'][i % 10]
  }));

  const curvesData = [
    { name: 'Jan', val1: 40, val2: 24 },
    { name: 'Feb', val1: 30, val2: 13 },
    { name: 'Mar', val1: 20, val2: 98 },
    { name: 'Apr', val1: 27, val2: 39 },
    { name: 'May', val1: 18, val2: 48 },
  ];

  const radarChartData = [
    { subject: 'Mountain', A: 120, B: 110, fullMark: 150 },
    { subject: 'Ocean', A: 98, B: 130, fullMark: 150 },
    { subject: 'Forest', A: 86, B: 130, fullMark: 150 },
    { subject: 'Desert', A: 99, B: 100, fullMark: 150 },
    { subject: 'City', A: 85, B: 90, fullMark: 150 },
  ];

  return (
    <div className="sci-fi-dashboard">
      
      {/* LEFT COLUMN */}
      <div className="sci-fi-col-left" style={{ width: '380px' }}>
        
        {/* STATISTIC */}
        <div className="sci-fi-panel" style={{ flex: '0 0 auto' }}>
          <div className="sci-fi-panel-header">
            <span className="crosshair">+</span>
            <span>Statistic</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded bg-blue-900/40 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold">F</div>
              <div className="flex flex-col">
                <span className="text-[10px] text-gray-500 uppercase tracking-widest">Total FIRs</span>
                <span className="text-xl font-bold text-gray-100">{totalFIRs.toLocaleString()}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded bg-red-900/40 border border-red-500/30 flex items-center justify-center text-red-400 font-bold">O</div>
              <div className="flex flex-col">
                <span className="text-[10px] text-gray-500 uppercase tracking-widest">Open Cases</span>
                <span className="text-xl font-bold text-gray-100">{totalOpen.toLocaleString()}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded bg-emerald-900/40 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold">S</div>
              <div className="flex flex-col">
                <span className="text-[10px] text-gray-500 uppercase tracking-widest">Stations</span>
                <span className="text-xl font-bold text-gray-100">{totalStations.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* CONTRAST (Bar Chart) */}
        <div className="sci-fi-panel" style={{ flex: '1 1 200px' }}>
          <div className="sci-fi-panel-header">
            <span className="crosshair">+</span>
            <span>Contrast</span>
          </div>
          <div className="w-full h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={contrastData} margin={{ top: 10, right: 0, left: -25, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: 'rgba(56,189,248,0.1)' }} contentStyle={{ backgroundColor: '#0f172a', borderColor: '#38bdf8' }} />
                <Bar dataKey="open" fill="#38bdf8" radius={[2, 2, 0, 0]} />
                <Bar dataKey="closed" fill="#f43f5e" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* DISTRIBUTION (Donut Chart) */}
        <div className="sci-fi-panel" style={{ flex: '1 1 200px' }}>
          <div className="sci-fi-panel-header">
            <span className="crosshair">+</span>
            <span>Distribution</span>
          </div>
          <div className="w-full h-[180px] flex items-center">
            <div className="flex-1 h-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={distributionData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={5} dataKey="value" stroke="none">
                    {distributionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#38bdf8' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-[120px] flex flex-col gap-2">
               {distributionData.map(d => (
                 <div key={d.name} className="flex items-center gap-2 text-xs">
                   <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }}></div>
                   <span className="text-gray-300 flex-1">{d.name}</span>
                 </div>
               ))}
            </div>
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
      <div className="sci-fi-col-right" style={{ width: '380px' }}>
        
        {/* OVERVIEW (Glowing Spheres) */}
        <div className="sci-fi-panel" style={{ flex: '0 0 auto' }}>
          <div className="sci-fi-panel-header">
            <span className="crosshair">+</span>
            <span>Overview</span>
          </div>
          <div className="flex justify-around items-center py-4">
             <div className="flex flex-col items-center gap-2">
               <div className="w-16 h-16 rounded-full flex items-center justify-center relative">
                 <div className="absolute inset-0 rounded-full border-2 border-dashed border-sky-400 animate-spin-slow"></div>
                 <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-sky-900 to-sky-400 opacity-80 shadow-[0_0_20px_#38bdf8]"></div>
               </div>
               <span className="text-[10px] text-gray-400 uppercase tracking-widest">Earth</span>
               <span className="text-sm font-bold text-sky-200">1231<span className="text-[9px] text-gray-500">km/h</span></span>
             </div>
             <div className="flex flex-col items-center gap-2">
               <div className="w-16 h-16 rounded-full flex items-center justify-center relative">
                 <div className="absolute inset-0 rounded-full border-2 border-dashed border-rose-400 animate-spin-slow" style={{ animationDirection: 'reverse' }}></div>
                 <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-rose-900 to-rose-400 opacity-80 shadow-[0_0_20px_#fb7185]"></div>
               </div>
               <span className="text-[10px] text-gray-400 uppercase tracking-widest">Mars</span>
               <span className="text-sm font-bold text-rose-200">1187<span className="text-[9px] text-gray-500">km/h</span></span>
             </div>
          </div>
        </div>

        {/* CURVES (Line Chart) */}
        <div className="sci-fi-panel" style={{ flex: '1 1 180px' }}>
          <div className="sci-fi-panel-header">
            <span className="crosshair">+</span>
            <span>Curves</span>
          </div>
          <div className="w-full h-[150px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={curvesData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#38bdf8' }} />
                <Line type="monotone" dataKey="val1" stroke="#38bdf8" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="val2" stroke="#f43f5e" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* RADAR */}
        <div className="sci-fi-panel" style={{ flex: '1 1 200px' }}>
          <div className="sci-fi-panel-header">
            <span className="crosshair">+</span>
            <span>Radar</span>
          </div>
          <div className="w-full h-[200px]">
             <ResponsiveContainer width="100%" height="100%">
               <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarChartData}>
                 <PolarGrid stroke="rgba(56,189,248,0.2)" />
                 <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                 <PolarRadiusAxis angle={30} domain={[0, 150]} tick={false} axisLine={false} />
                 <Radar name="Mike" dataKey="A" stroke="#38bdf8" fill="#38bdf8" fillOpacity={0.4} />
                 <Radar name="Lily" dataKey="B" stroke="#f43f5e" fill="#f43f5e" fillOpacity={0.4} />
               </RadarChart>
             </ResponsiveContainer>
          </div>
        </div>

        {/* LIST */}
        <div className="sci-fi-panel" style={{ flex: '1 1 180px' }}>
          <div className="sci-fi-panel-header">
            <span className="crosshair">+</span>
            <span>District Index</span>
          </div>
          <div className="flex flex-col overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-sky-500/50 max-h-[150px]">
            {districts.map(d => (
              <div key={d.id} className="flex justify-between items-center py-2 border-b border-sky-500/10 text-xs hover:bg-sky-500/10 transition-colors px-2 rounded cursor-pointer" onClick={() => drillToDistrict(d)}>
                 <div className="flex items-center gap-3">
                   <div className="w-2 h-2 rounded-full shadow-[0_0_8px_currentColor]" style={{ backgroundColor: getDistrictColor(d.total_firs, Math.max(...districts.map(dx => dx.total_firs))) }}></div>
                   <span className="text-gray-200">{d.name}</span>
                 </div>
                 <span className="text-gray-500">{d.total_firs} FIRs</span>
                 <span className="text-sky-400 cursor-pointer hover:text-sky-300">View</span>
              </div>
            ))}
          </div>
        </div>

      </div>

    </div>
  );
}
