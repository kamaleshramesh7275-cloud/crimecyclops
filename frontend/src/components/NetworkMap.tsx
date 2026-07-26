import { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface GraphNode {
  id: string;
  label: string;
  group: string;
  node_type: string;
  district: string;
  degree: number;
  latitude?: number;
  longitude?: number;
  incident_date?: string;
  description?: string;
  status?: string;
}

interface GraphLink {
  source: string;
  target: string;
  weight: number;
  type?: string;
}

interface Props {
  nodes: GraphNode[];
  links: GraphLink[];
  onNodeClick?: (node: any) => void;
}

export default function NetworkMap({ nodes, links, onNodeClick }: Props) {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const geoLayerRef = useRef<L.GeoJSON | null>(null);
  const pathsLayerRef = useRef<L.LayerGroup | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);

  const [geoJson, setGeoJson] = useState<any>(null);

  // Fetch Karnataka boundaries
  useEffect(() => {
    fetch('/karnataka-districts.geojson')
      .then((r) => r.json())
      .then(setGeoJson);
  }, []);

  // Filter case nodes that have valid coordinates
  const spatialCases = useMemo(() => {
    return nodes
      .filter(n => n.node_type === 'fir' && n.latitude && n.longitude)
      .map(n => {
        const fullNode = nodes.find(orig => orig.id === n.id) as any;
        return {
          ...n,
          latitude: Number(n.latitude),
          longitude: Number(n.longitude),
          incident_date: fullNode?.incident_date || '2026-01-01',
          description: fullNode?.description || '',
          status: fullNode?.status || 'open'
        };
      });
  }, [nodes]);

  // Compute case-to-case connections (sharing suspects) for drawing map pipelines
  const mapConnections = useMemo(() => {
    const connections: Array<{ source: string; target: string; personName: string; personRole: string }> = [];
    const personToCases: Record<string, string[]> = {};
    const personDetails: Record<string, { name: string; role: string }> = {};

    links.forEach(l => {
      if (l.type === 'person_fir') {
        const personId = l.source;
        const caseId = l.target;
        if (!personToCases[personId]) {
          personToCases[personId] = [];
        }
        personToCases[personId].push(caseId);

        const personNode = nodes.find(n => n.id === personId);
        if (personNode) {
          personDetails[personId] = {
            name: personNode.label,
            role: personNode.group
          };
        }
      }
    });

    Object.entries(personToCases).forEach(([personId, caseIds]) => {
      if (caseIds.length > 1) {
        const details = personDetails[personId];
        for (let i = 0; i < caseIds.length; i++) {
          for (let j = i + 1; j < caseIds.length; j++) {
            connections.push({
              source: caseIds[i],
              target: caseIds[j],
              personName: details?.name || 'Unknown',
              personRole: details?.role || 'suspect'
            });
          }
        }
      }
    });

    return connections;
  }, [links, nodes]);

  // Initialize Map
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;

    const map = L.map(mapDivRef.current, {
      center: [15.3173, 75.7139],
      zoom: 7,
      zoomControl: true
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
      maxZoom: 19
    }).addTo(map);

    pathsLayerRef.current = L.layerGroup().addTo(map);
    markersLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    setTimeout(() => {
      map.invalidateSize();
    }, 250);

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Render boundaries, markers, and path curves
  useEffect(() => {
    if (!mapRef.current || !geoJson) return;

    // 1. Draw boundary outlines
    if (geoLayerRef.current) geoLayerRef.current.remove();
    const boundaries = L.geoJSON(geoJson, {
      style: {
        color: '#38bdf8',
        weight: 1,
        opacity: 0.3,
        fillColor: '#0c0f24',
        fillOpacity: 0.2
      }
    }).addTo(mapRef.current);
    geoLayerRef.current = boundaries;

    // 2. Clear old paths & markers
    pathsLayerRef.current?.clearLayers();
    markersLayerRef.current?.clearLayers();

    // 3. Draw neon connectors between linked cases
    const spatialCaseMap = new Map(spatialCases.map(c => [c.id, c]));
    
    mapConnections.forEach(conn => {
      const src = spatialCaseMap.get(conn.source);
      const dest = spatialCaseMap.get(conn.target);
      if (src && dest) {
        // Draw straight connection line
        const polyline = L.polyline(
          [[src.latitude!, src.longitude!], [dest.latitude!, dest.longitude!]],
          {
            color: '#f43f5e', // Rose neon
            weight: 2,
            opacity: 0.8,
            dashArray: '5, 8' // dotted movement line
          }
        );

        polyline.bindTooltip(
          `<strong>Shared Suspect Movement</strong><br/>Link: ${conn.personName} (${conn.personRole})`,
          { sticky: true }
        );

        polyline.addTo(pathsLayerRef.current!);
      }
    });

    // 4. Draw case nodes (markers)
    spatialCases.forEach(c => {
      const isRed = c.status === 'open' || c.status === 'under investigation';
      const markerColor = isRed ? '#f43f5e' : '#34d399';

      const customHtml = `
        <div class="network-map-marker" style="background: ${markerColor}; box-shadow: 0 0 10px ${markerColor};">
          <div class="marker-pulse" style="border-color: ${markerColor};"></div>
        </div>
      `;

      const marker = L.marker([c.latitude!, c.longitude!], {
        icon: L.divIcon({
          className: 'custom-net-marker-icon',
          html: customHtml,
          iconSize: [12, 12],
          iconAnchor: [6, 6]
        })
      });

      marker.bindTooltip(
        `<strong>${c.label}</strong><br/>
         District: ${c.district}<br/>
         Date: ${c.incident_date}<br/>
         Status: ${c.status}`,
        { sticky: true, className: 'custom-tooltip' }
      );

      marker.on('click', () => {
        onNodeClick?.(c);
      });

      marker.addTo(markersLayerRef.current!);
    });

    // 5. Force Leaflet to recalculate size to prevent grey/unloaded tiles
    if (mapRef.current) {
      setTimeout(() => {
        mapRef.current?.invalidateSize();
      }, 100);
    }

  }, [geoJson, spatialCases, mapConnections]);

  return (
    <div className="network-map-workspace" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
      <div className="absolute top-4 left-4 z-[400] bg-slate-950/80 border border-sky-500/30 px-4 py-2 rounded shadow-lg backdrop-blur-md">
        <span className="text-[10px] text-sky-400 font-bold uppercase tracking-wider">Geospatial Link Map</span>
        <p className="text-[9px] text-gray-400 mt-1">Dotted rose lines map active travel trajectories of shared suspects.</p>
      </div>
      <div ref={mapDivRef} style={{ width: '100%', height: '100%', background: '#020617' }} />
    </div>
  );
}
