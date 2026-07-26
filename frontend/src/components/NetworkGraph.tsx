import { useEffect, useRef, useCallback, useState, useMemo } from 'react';

interface GraphNode {
  id: string;
  label: string;
  group: string;
  node_type: string;
  district: string;
  degree: number;
  degree_centrality: number;
  betweenness: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
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
  selectedNodeId?: string | null;
  searchQuery?: string;
  onNodeClick?: (node: GraphNode) => void;
}

const GROUP_COLORS: Record<string, string> = {
  suspect: 'border-orange-500 bg-orange-950/50 text-orange-400',
  witness: 'border-sky-500 bg-sky-950/50 text-sky-400',
  victim: 'border-rose-500 bg-rose-950/50 text-rose-400',
  accused: 'border-fuchsia-500 bg-fuchsia-950/50 text-fuchsia-400',
  complainant: 'border-emerald-500 bg-emerald-950/50 text-emerald-400',
  fir: 'border-indigo-500 bg-indigo-950/50 text-indigo-400',
  unknown: 'border-slate-500 bg-slate-950/50 text-slate-400',
};

const getBadgeStyle = (group: string) => GROUP_COLORS[group.toLowerCase()] || GROUP_COLORS.unknown;

export default function NetworkGraph({ nodes, links, selectedNodeId, searchQuery, onNodeClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);
  const [simNodes, setSimNodes] = useState<GraphNode[]>([]);
  const simLinks = useRef<Array<{ source: GraphNode; target: GraphNode; weight: number; type?: string }>>([]);
  const dragging = useRef<GraphNode | null>(null);
  const transform = useRef({ scale: 1, tx: 0, ty: 0 });
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  
  const [viewBox, setViewBox] = useState('0 0 1000 800');
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  
  const width = 1200;
  const height = 800;

  useEffect(() => {
    if (nodes.length === 0) return;
    
    // Cluster nodes hierarchically to center
    const newNodes = nodes.map((n, i) => {
      const radius = n.node_type === 'FIR' ? 100 : 300;
      const angle = (i / nodes.length) * Math.PI * 2;
      return {
        ...n,
        x: width / 2 + Math.cos(angle) * radius,
        y: height / 2 + Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
        fx: null,
        fy: null,
      };
    });
    
    const nodeMap = new Map(newNodes.map(n => [n.id, n]));
    simLinks.current = links
      .map(l => {
        const source = nodeMap.get(l.source);
        const target = nodeMap.get(l.target);
        if (!source || !target) return null;
        return { source, target, weight: l.weight, type: l.type };
      })
      .filter(Boolean) as any;
      
    setSimNodes(newNodes);
  }, [nodes, links]);

  // Physics Simulation
  const tick = useCallback(() => {
    setSimNodes(currentNodes => {
      const sn = [...currentNodes];
      const sl = simLinks.current;
      
      const W = width;
      const H = height;

      // Link forces
      sl.forEach(link => {
        const dx = link.target.x! - link.source.x!;
        const dy = link.target.y! - link.source.y!;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const targetDist = link.source.node_type === 'FIR' ? 150 : 80;
        const force = (dist - targetDist) * 0.05;
        
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        
        if (link.source !== dragging.current) {
          link.source.vx! += fx;
          link.source.vy! += fy;
        }
        if (link.target !== dragging.current) {
          link.target.vx! -= fx;
          link.target.vy! -= fy;
        }
      });

      // Repulsion & Centering
      for (let i = 0; i < sn.length; i++) {
        const n1 = sn[i];
        
        // Centering
        if (n1 !== dragging.current) {
          n1.vx! += (W / 2 - n1.x!) * 0.005;
          n1.vy! += (H / 2 - n1.y!) * 0.005;
        }

        // Repulsion
        for (let j = i + 1; j < sn.length; j++) {
          const n2 = sn[j];
          const dx = n2.x! - n1.x!;
          const dy = n2.y! - n1.y!;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          if (dist < 200) {
            const force = 300 / (dist * dist);
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            
            if (n1 !== dragging.current) { n1.vx! -= fx; n1.vy! -= fy; }
            if (n2 !== dragging.current) { n2.vx! += fx; n2.vy! += fy; }
          }
        }
      }

      // Update positions
      sn.forEach(n => {
        if (n === dragging.current && n.fx !== null && n.fy !== null) {
          n.x = n.fx;
          n.y = n.fy;
          n.vx = 0;
          n.vy = 0;
        } else {
          n.vx! *= 0.85; // friction
          n.vy! *= 0.85;
          n.x! += n.vx!;
          n.y! += n.vy!;
          // bounds
          n.x = Math.max(50, Math.min(W - 50, n.x!));
          n.y = Math.max(50, Math.min(H - 50, n.y!));
        }
      });
      return sn;
    });
    
    animRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [tick]);

  // Interactivity
  const handleMouseDown = (e: React.MouseEvent, node: GraphNode) => {
    e.stopPropagation();
    dragging.current = node;
    node.fx = node.x;
    node.fy = node.y;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragging.current && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left - transform.current.tx) / transform.current.scale;
      const y = (e.clientY - rect.top - transform.current.ty) / transform.current.scale;
      dragging.current.fx = x;
      dragging.current.fy = y;
    } else if (isPanning.current) {
      transform.current.tx = panStart.current.tx + (e.clientX - panStart.current.x);
      transform.current.ty = panStart.current.ty + (e.clientY - panStart.current.y);
      setViewBox(`\${-transform.current.tx} \${-transform.current.ty} \${width / transform.current.scale} \${height / transform.current.scale}`);
    }
  };

  const handleMouseUp = () => {
    if (dragging.current) {
      dragging.current.fx = null;
      dragging.current.fy = null;
      dragging.current = null;
    }
    isPanning.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const scale = transform.current.scale * (e.deltaY > 0 ? 0.9 : 1.1);
    transform.current.scale = Math.max(0.1, Math.min(scale, 4));
    setViewBox(`\${-transform.current.tx} \${-transform.current.ty} \${width / transform.current.scale} \${height / transform.current.scale}`);
  };
  
  // Highlighting Logic
  const connectedNodeIds = useMemo(() => {
      if (!hoveredNode) return new Set<string>();
      const connected = new Set<string>();
      connected.add(hoveredNode.id);
      simLinks.current.forEach(l => {
          if (l.source.id === hoveredNode.id) connected.add(l.target.id);
          if (l.target.id === hoveredNode.id) connected.add(l.source.id);
      });
      return connected;
  }, [hoveredNode, simLinks.current]);

  return (
    <div 
      className="relative w-full h-[600px] bg-slate-950 rounded-xl border border-slate-800 overflow-hidden"
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      onMouseDown={(e) => {
          isPanning.current = true;
          panStart.current = { x: e.clientX, y: e.clientY, tx: transform.current.tx, ty: transform.current.ty };
      }}
    >
      <svg 
        viewBox={viewBox} 
        className="w-full h-full cursor-grab active:cursor-grabbing"
      >
        {/* Links */}
        <g strokeOpacity={0.6}>
          {simLinks.current.map((link, i) => {
            const isHighlighted = hoveredNode && (connectedNodeIds.has(link.source.id) && connectedNodeIds.has(link.target.id));
            const isFaded = hoveredNode && !isHighlighted;
            
            return (
              <line
                key={i}
                x1={link.source.x}
                y1={link.source.y}
                x2={link.target.x}
                y2={link.target.y}
                stroke={isHighlighted ? "#facc15" : "#475569"}
                strokeWidth={isHighlighted ? 2 : Math.max(0.5, link.weight / 2)}
                opacity={isFaded ? 0.1 : 0.8}
                className="transition-all duration-300"
              />
            );
          })}
        </g>
        
        {/* Nodes */}
        <g>
          {simNodes.map(node => {
            const isSearched = searchQuery && node.label.toLowerCase().includes(searchQuery.toLowerCase());
            const isSelected = selectedNodeId === node.id;
            const isFaded = hoveredNode && !connectedNodeIds.has(node.id);
            const isHighlighted = hoveredNode && connectedNodeIds.has(node.id);
            
            const radius = node.node_type === 'FIR' ? 14 : Math.min(25, 8 + node.degree * 1.5);
            
            // Icon
            const icon = node.node_type === 'FIR' ? '📄' : '👤';

            return (
              <g
                key={node.id}
                transform={`translate(\${node.x}, \${node.y})`}
                onMouseDown={(e) => handleMouseDown(e, node)}
                onClick={() => onNodeClick?.(node)}
                onMouseEnter={() => setHoveredNode(node)}
                onMouseLeave={() => setHoveredNode(null)}
                className={`cursor-pointer transition-opacity duration-300 \${isFaded ? 'opacity-20' : 'opacity-100'}`}
              >
                {/* Node Shape */}
                <circle
                  r={radius}
                  className={`\${node.node_type === 'FIR' ? 'fill-indigo-900 stroke-indigo-400' : 'fill-slate-800 stroke-slate-400'}`}
                  strokeWidth={isSelected || isSearched || isHighlighted ? 3 : 1.5}
                  stroke={isSelected || isSearched || isHighlighted ? '#facc15' : undefined}
                />
                
                {/* Search / Select Glow */}
                {(isSelected || isSearched) && (
                    <circle r={radius + 6} fill="none" stroke="#facc15" strokeWidth="2" strokeDasharray="4 4" className="animate-spin-slow" />
                )}
                
                {/* Icon Text */}
                <text textAnchor="middle" dy=".3em" fontSize={radius * 0.9} className="pointer-events-none select-none">
                  {icon}
                </text>
                
                {/* Label Text */}
                {(!isFaded || isHighlighted) && (
                    <text 
                        y={radius + 14} 
                        textAnchor="middle" 
                        className="fill-slate-200 text-[10px] font-medium pointer-events-none select-none drop-shadow-md"
                    >
                    {node.label.length > 20 ? node.label.substring(0, 17) + '...' : node.label}
                    </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
      
      {/* Legend & Instructions */}
      <div className="absolute top-4 left-4 bg-slate-900/80 p-3 rounded-lg border border-slate-800 backdrop-blur-sm pointer-events-none">
          <div className="text-sm font-semibold text-slate-200 mb-2">Network Legend</div>
          <div className="flex gap-4">
              <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-indigo-900 border border-indigo-400"></div>
                  <span className="text-xs text-slate-300">FIR Record</span>
              </div>
              <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-slate-800 border border-slate-400"></div>
                  <span className="text-xs text-slate-300">Person</span>
              </div>
          </div>
          <div className="text-[10px] text-slate-500 mt-2">Scroll to Zoom • Drag to Pan</div>
      </div>
    </div>
  );
}
