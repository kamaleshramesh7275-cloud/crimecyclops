import { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import GeoHierarchy from './GeoHierarchy';
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

  const isKn = i18n.language === 'kn';

  // Fetch GeoJSON once
  useEffect(() => {
    document.title = 'CrimeCyclops | Map Analysis';
    fetch('/karnataka-districts.geojson')
      .then((r) => r.json())
      .then(setGeoJson);
  }, []);

  // Initialize map once
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;
    const map = L.map(mapDivRef.current, {
      center: [15.3173, 75.7139],
      zoom: 7,
      zoomControl: true,
    });
    // Dark Matter Tactical Map Tiles
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
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

  // Render bubble map when districts are loaded
  useEffect(() => {
    if (!mapRef.current || districts.length === 0) return;
    if (geoLayerRef.current) geoLayerRef.current.remove();

    const max = Math.max(...districts.map((d) => d.total_firs));
    const layerGroup = L.featureGroup();

    districts.forEach(dist => {
      if (!dist.centroid_lat || !dist.centroid_lon) return;
      
      const color = getDistrictColor(dist.total_firs, max);
      // Use geographic radius (meters) so the circle doesn't shrink when zooming in.
      // Base radius of 15km, scaling up to 45km based on crime count.
      const radiusInMeters = 15000 + (dist.total_firs / max) * 30000;

      const circle = L.circle([dist.centroid_lat, dist.centroid_lon], {
        radius: radiusInMeters,
        fillColor: color,
        color: color,
        weight: 2,
        opacity: 0.8,
        fillOpacity: 0.35,
        className: 'pulse-circle'
      });

      circle.bindTooltip(
        `<strong>${isKn ? (dist as any).name_kn || dist.name : dist.name}</strong><br/>FIRs: ${dist.total_firs}`,
        { sticky: true, className: 'custom-tooltip' }
      );

      circle.on('click', () => {
        drillToDistrict(dist);
      });

      circle.on('mouseover', () => {
        circle.setStyle({ fillOpacity: 0.6, weight: 3 });
      });

      circle.on('mouseout', () => {
        circle.setStyle({ fillOpacity: 0.3, weight: 2 });
      });

      circle.addTo(layerGroup);
    });

    layerGroup.addTo(mapRef.current);
    geoLayerRef.current = layerGroup as any;
  }, [districts, isKn]);

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
        className: '',
        html: `<div class="station-pin" style="background:${color}; border-color:${color}">
          <span>${st.fir_count}</span>
        </div>`,
        iconSize: [40, 40],
        iconAnchor: [20, 40],
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

  return (
    <div className="map-page">
      <GeoHierarchy
        level={level}
        districts={districts}
        activeDistrict={activeDistrict}
        stations={activeStations}
        onSelectDistrict={drillToDistrict}
        onSelectStation={(st) => {
          setActiveStationId(st.id);
          setLevel('station');
          setDrawerOpen(true);
        }}
        onBack={goBack}
      />

      <div className="map-container" ref={mapDivRef} />

      {/* Floating Filter Bar */}
      <div className="map-filter-bar">
        <div className="map-filter-group">
          <span className="map-filter-label">{isKn ? 'ಅಪರಾಧದ ಪ್ರಕಾರ' : 'Crime Type'}:</span>
          <select className="map-filter-select" value={crimeFilter} onChange={e => setCrimeFilter(e.target.value)}>
            <option value="All">{isKn ? 'ಎಲ್ಲಾ' : 'All'}</option>
            <option value="Theft">{isKn ? 'ಕಳ್ಳತನ (Theft)' : 'Theft'}</option>
            <option value="Burglary">{isKn ? 'ಕನ್ನ (Burglary)' : 'Burglary'}</option>
            <option value="Assault">{isKn ? 'ಹಲ್ಲೆ (Assault)' : 'Assault'}</option>
            <option value="Cyber Fraud">{isKn ? 'ಸೈಬರ್ ವಂಚನೆ (Cyber Fraud)' : 'Cyber Fraud'}</option>
            <option value="Drug Trafficking">{isKn ? 'ಮಾದಕವಸ್ತು ಸಾಗಣೆ (Drugs)' : 'Drug Trafficking'}</option>
          </select>
        </div>
        <div className="map-filter-group">
          <span className="map-filter-label">{isKn ? 'ಸ್ಥಿತಿ' : 'Status'}:</span>
          <select className="map-filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="All">{isKn ? 'ಎಲ್ಲಾ' : 'All'}</option>
            <option value="Open">{isKn ? 'ತೆರೆದ (Open)' : 'Open'}</option>
            <option value="Closed">{isKn ? 'ಮುಚ್ಚಿದ (Closed)' : 'Closed'}</option>
          </select>
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

      <div className="map-legend">
        <div className="legend-title">{t('crimeIntensity', 'Crime Intensity')}</div>
        {[
          { color: '#f43f5e', label: t('veryHigh', 'Very High') },
          { color: '#fb923c', label: t('high', 'High') },
          { color: '#fbbf24', label: t('medium', 'Medium') },
          { color: '#c084fc', label: t('low', 'Low') },
          { color: '#34d399', label: t('veryLow', 'Very Low') },
        ].map(({ color, label }) => (
          <div key={color} className="legend-row">
            <span className="legend-swatch" style={{ background: color }} />
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
