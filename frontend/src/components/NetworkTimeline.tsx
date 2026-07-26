import { useState, useMemo, useRef, useEffect } from 'react';

interface GraphNode {
  id: string;
  label: string;
  group: string;
  node_type: string;
  district: string;
  degree: number;
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

export default function NetworkTimeline({ nodes, links, onNodeClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredCaseId, setHoveredCaseId] = useState<string | null>(null);
  const [cardPositions, setCardPositions] = useState<Record<string, { x: number; y: number; width: number }>>({});
  const [, setScrollTrigger] = useState(0); // Trigger re-render on scroll to redraw SVGs

  // Filter & sort case nodes (FIRs)
  const caseNodes = useMemo(() => {
    return nodes
      .filter(n => n.node_type === 'fir')
      .map(n => {
        // Find incident date from database or set default
        const fullNode = nodes.find(orig => orig.id === n.id) as any;
        return {
          ...n,
          incident_date: fullNode?.incident_date || '2026-01-01',
          description: fullNode?.description || 'No description available',
          status: fullNode?.status || 'open'
        };
      })
      .sort((a, b) => new Date(a.incident_date).getTime() - new Date(b.incident_date).getTime());
  }, [nodes]);

  // Find connections (shared suspects/people) between cases
  const caseConnections = useMemo(() => {
    const connections: Array<{ source: string; target: string; personName: string; personRole: string }> = [];
    
    // Group people by cases they belong to
    const personToCases: Record<string, string[]> = {};
    const personDetails: Record<string, { name: string; role: string }> = {};

    // Build mapping: person_id -> list of case_ids
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

    // Intersect cases sharing same people
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

  // Map case nodes to their linked individuals for rendering inside the cards
  const caseToPeople = useMemo(() => {
    const mapping: Record<string, Array<{ name: string; role: string }>> = {};
    links.forEach(l => {
      if (l.type === 'person_fir') {
        const personId = l.source;
        const caseId = l.target;
        const pNode = nodes.find(n => n.id === personId);
        if (pNode) {
          if (!mapping[caseId]) mapping[caseId] = [];
          mapping[caseId].push({ name: pNode.label, role: pNode.group });
        }
      }
    });
    return mapping;
  }, [links, nodes]);

  // Recalculate card positions relative to container
  const updatePositions = () => {
    if (!containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const positions: Record<string, { x: number; y: number; width: number }> = {};
    
    caseNodes.forEach(c => {
      const el = document.getElementById(`timeline-card-${c.id}`);
      if (el) {
        const rect = el.getBoundingClientRect();
        positions[c.id] = {
          x: rect.left - containerRect.left + containerRef.current!.scrollLeft,
          y: rect.top - containerRect.top,
          width: rect.width
        };
      }
    });
    setCardPositions(positions);
  };

  useEffect(() => {
    updatePositions();
    window.addEventListener('resize', updatePositions);
    return () => window.removeEventListener('resize', updatePositions);
  }, [caseNodes]);

  const handleScroll = () => {
    setScrollTrigger(prev => prev + 1);
  };

  return (
    <div className="network-timeline-workspace h-full flex flex-col relative" style={{ overflow: 'hidden' }}>
      
      {/* Scrollable Timeline Stream */}
      <div 
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-x-auto overflow-y-hidden flex items-center gap-12 px-12 py-8 scrollbar-thin scrollbar-thumb-sky-500/30 relative"
        style={{ minHeight: '400px' }}
      >
        
        {/* SVG overlay for arching connections */}
        <svg 
          className="absolute inset-0 pointer-events-none z-10"
          style={{ 
            width: containerRef.current ? `${containerRef.current.scrollWidth}px` : '100%',
            height: '100%' 
          }}
        >
          {caseConnections.map((conn, idx) => {
            const start = cardPositions[conn.source];
            const end = cardPositions[conn.target];
            if (!start || !end) return null;

            // Highlight connection if either case is hovered
            const isHighlighted = hoveredCaseId === conn.source || hoveredCaseId === conn.target;
            
            // Calculate anchor points (center top of cards)
            const x1 = start.x + start.width / 2;
            const y1 = 120; // Fixed y coordinate above cards
            const x2 = end.x + end.width / 2;
            const y2 = 120;

            const dx = Math.abs(x2 - x1);
            // Draw neat bezier curves arching upwards
            const controlY = Math.max(20, y1 - dx * 0.25);

            return (
              <g key={idx}>
                <path 
                  d={`M ${x1} ${y1} Q ${(x1 + x2) / 2} ${controlY} ${x2} ${y2}`}
                  fill="none"
                  stroke={isHighlighted ? '#f43f5e' : 'rgba(56, 189, 248, 0.15)'}
                  strokeWidth={isHighlighted ? 3 : 1}
                  className="transition-all duration-300"
                />
                {isHighlighted && (
                  <text 
                    x={(x1 + x2) / 2} 
                    y={controlY - 8}
                    fill="#f43f5e"
                    fontSize="10"
                    textAnchor="middle"
                    className="font-mono bg-slate-950 font-bold px-1"
                  >
                    {conn.personName} ({conn.personRole})
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* Timeline Axis Track */}
        <div 
          className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-sky-500/10 via-sky-500/50 to-sky-500/10 pointer-events-none"
          style={{ top: '120px', width: containerRef.current ? `${containerRef.current.scrollWidth}px` : '100%' }}
        />

        {/* Case Cards rendering */}
        {caseNodes.map(c => {
          const people = caseToPeople[c.id] || [];
          const isHovered = hoveredCaseId === c.id;

          return (
            <div 
              key={c.id}
              id={`timeline-card-${c.id}`}
              className={`flex-shrink-0 w-80 rounded border p-4 bg-slate-950/80 backdrop-blur-sm transition-all duration-300 relative flex flex-col gap-3 cursor-pointer select-none z-20 ${
                isHovered 
                  ? 'border-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.25)] scale-105' 
                  : 'border-sky-500/30 hover:border-sky-500/60 shadow-[0_0_10px_rgba(56,189,248,0.05)]'
              }`}
              style={{ marginTop: '160px' }} // position cards below the SVG arcs
              onMouseEnter={() => setHoveredCaseId(c.id)}
              onMouseLeave={() => setHoveredCaseId(null)}
              onClick={() => onNodeClick?.(c)}
            >
              {/* Connector Pin on Axis Line */}
              <div 
                className={`absolute left-1/2 -translate-x-1/2 rounded-full border transition-all duration-300 ${
                  isHovered 
                    ? 'w-4 h-4 bg-rose-500 border-white shadow-[0_0_10px_#f43f5e]' 
                    : 'w-3 h-3 bg-sky-500 border-sky-300'
                }`}
                style={{ top: '-46px' }}
              />
              <div 
                className={`absolute left-1/2 -translate-x-1/2 w-0.5 h-10 bg-dashed transition-all duration-300 ${
                  isHovered ? 'bg-rose-500/70' : 'bg-sky-500/30'
                }`}
                style={{ top: '-38px' }}
              />

              {/* Case Details */}
              <div className="flex justify-between items-center text-[10px] uppercase font-bold tracking-widest text-sky-400">
                <span>{c.incident_date}</span>
                <span className={`px-2 py-0.5 rounded ${
                  c.status === 'closed' ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-500/30' : 'bg-red-950/40 text-red-400 border border-red-500/30'
                }`}>{c.status}</span>
              </div>

              <div className="flex flex-col">
                <span className="text-gray-100 font-bold text-sm tracking-wide truncate">{c.label}</span>
                <span className="text-[10px] text-gray-500">Case ID: #{c.id.replace('fir:', '')} | {c.district}</span>
              </div>

              <p className="text-gray-400 text-[11px] line-clamp-2 leading-relaxed">{c.description}</p>

              {/* Linked People inside Card */}
              {people.length > 0 && (
                <div className="border-t border-sky-500/10 pt-2 flex flex-col gap-1">
                  <span className="text-[9px] text-gray-500 uppercase tracking-widest font-bold">Linked Entities</span>
                  <div className="flex flex-wrap gap-1.5">
                    {people.map((p, idx) => (
                      <span 
                        key={idx} 
                        className={`text-[9px] px-2 py-0.5 rounded font-mono ${
                          p.role === 'suspect' || p.role === 'accused' 
                            ? 'bg-red-900/20 text-red-400 border border-red-500/20' 
                            : 'bg-sky-900/20 text-sky-400 border border-sky-500/20'
                        }`}
                      >
                        {p.name} ({p.role.substring(0, 3)})
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      
    </div>
  );
}
