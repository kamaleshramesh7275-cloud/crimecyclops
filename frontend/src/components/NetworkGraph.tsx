import { useEffect, useRef, useState, useMemo } from 'react';

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
  radius?: number;
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
  suspect: '#f97316',
  witness: '#38bdf8',
  victim: '#fb7185',
  accused: '#c084fc',
  complainant: '#34d399',
  fir: '#6366f1',
  unknown: '#94a3b8',
};

export default function NetworkGraph({ nodes, links, selectedNodeId, searchQuery, onNodeClick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Physics state
  const simNodes = useRef<GraphNode[]>([]);
  const simLinks = useRef<Array<{ source: GraphNode; target: GraphNode; weight: number }>>([]);
  const animRef = useRef<number>(0);
  
  // Interaction state
  const transform = useRef({ x: 0, y: 0, k: 1 });
  const isDraggingCanvas = useRef(false);
  const draggedNode = useRef<GraphNode | null>(null);
  const hoveredNode = useRef<GraphNode | null>(null);
  const lastMousePos = useRef({ x: 0, y: 0 });

  // Handle Resize
  useEffect(() => {
    const handleResize = () => {
      if (!canvasRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      canvasRef.current.width = rect.width;
      canvasRef.current.height = rect.height;
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Initialize Physics
  useEffect(() => {
    if (!nodes.length) return;
    
    const width = canvasRef.current?.width || 1000;
    const height = canvasRef.current?.height || 800;

    const newNodes = nodes.map((n, i) => {
      const angle = (i / nodes.length) * Math.PI * 2;
      const r = n.node_type === 'FIR' ? 100 : 300;
      return {
        ...n,
        x: width / 2 + Math.cos(angle) * r,
        y: height / 2 + Math.sin(angle) * r,
        vx: 0,
        vy: 0,
        radius: n.node_type === 'FIR' ? 12 : Math.min(20, 6 + n.degree * 1.2)
      };
    });

    const nodeMap = new Map(newNodes.map(n => [n.id, n]));
    
    simLinks.current = links.map(l => {
      const source = nodeMap.get(l.source);
      const target = nodeMap.get(l.target);
      if (source && target) return { source, target, weight: l.weight };
      return null;
    }).filter(Boolean) as any;
    
    simNodes.current = newNodes;
  }, [nodes, links]);

  // Main Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const tick = () => {
      const w = canvas.width;
      const h = canvas.height;

      // 1. Calculate Forces
      simLinks.current.forEach(link => {
        const dx = link.target.x! - link.source.x!;
        const dy = link.target.y! - link.source.y!;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const targetDist = link.source.node_type === 'FIR' ? 120 : 60;
        
        // Spring force
        const force = (dist - targetDist) * 0.02;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        if (link.source !== draggedNode.current) {
          link.source.vx! += fx;
          link.source.vy! += fy;
        }
        if (link.target !== draggedNode.current) {
          link.target.vx! -= fx;
          link.target.vy! -= fy;
        }
      });

      simNodes.current.forEach(n => {
        // Center gravity
        if (n !== draggedNode.current) {
          n.vx! += (w / 2 - n.x!) * 0.003;
          n.vy! += (h / 2 - n.y!) * 0.003;
        }
      });

      // Simple N-body repulsion (optimized)
      for (let i = 0; i < simNodes.current.length; i++) {
        for (let j = i + 1; j < simNodes.current.length; j++) {
          const n1 = simNodes.current[i];
          const n2 = simNodes.current[j];
          const dx = n2.x! - n1.x!;
          const dy = n2.y! - n1.y!;
          const distSq = dx * dx + dy * dy;
          
          if (distSq > 0 && distSq < 15000) { // Only repel if close
            const dist = Math.sqrt(distSq);
            const force = 250 / distSq; // Repulsion strength
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            
            if (n1 !== draggedNode.current) { n1.vx! -= fx; n1.vy! -= fy; }
            if (n2 !== draggedNode.current) { n2.vx! += fx; n2.vy! += fy; }
          }
        }
      }

      // 2. Build connection map for highlighting
      const connected = new Set<string>();
      if (hoveredNode.current) {
          connected.add(hoveredNode.current.id);
          simLinks.current.forEach(l => {
              if (l.source.id === hoveredNode.current?.id) connected.add(l.target.id);
              if (l.target.id === hoveredNode.current?.id) connected.add(l.source.id);
          });
      }

      // 3. Render & Update Position
      ctx.fillStyle = '#020617'; // slate-950
      ctx.fillRect(0, 0, w, h);
      
      ctx.save();
      ctx.translate(transform.current.x, transform.current.y);
      ctx.scale(transform.current.k, transform.current.k);

      // Draw Links
      ctx.lineWidth = 1.5;
      simLinks.current.forEach(link => {
        const isHighlighted = hoveredNode.current && connected.has(link.source.id) && connected.has(link.target.id);
        const isFaded = hoveredNode.current && !isHighlighted;
        
        ctx.beginPath();
        ctx.moveTo(link.source.x!, link.source.y!);
        ctx.lineTo(link.target.x!, link.target.y!);
        ctx.strokeStyle = isHighlighted ? '#facc15' : (isFaded ? 'rgba(71, 85, 105, 0.1)' : 'rgba(71, 85, 105, 0.6)');
        ctx.stroke();
      });

      // Draw Nodes
      simNodes.current.forEach(n => {
        // Update physics
        if (n !== draggedNode.current) {
          n.vx! *= 0.85; // friction
          n.vy! *= 0.85;
          n.x! += n.vx!;
          n.y! += n.vy!;
        }

        const isSearched = searchQuery && n.label.toLowerCase().includes(searchQuery.toLowerCase());
        const isSelected = selectedNodeId === n.id;
        const isHighlighted = hoveredNode.current && connected.has(n.id);
        const isFaded = hoveredNode.current && !connected.has(n.id);
        
        ctx.beginPath();
        ctx.arc(n.x!, n.y!, n.radius!, 0, 2 * Math.PI);
        
        ctx.fillStyle = GROUP_COLORS[n.group.toLowerCase()] || GROUP_COLORS.unknown;
        ctx.fill();
        
        if (isFaded) {
            ctx.fillStyle = 'rgba(2, 6, 23, 0.8)'; // Dim faded nodes
            ctx.fill();
        }

        ctx.lineWidth = isSelected || isSearched || isHighlighted ? 3 : 1.5;
        ctx.strokeStyle = isSelected || isSearched || isHighlighted ? '#facc15' : '#1e293b';
        ctx.stroke();

        // Label
        if (!isFaded || isHighlighted) {
            ctx.fillStyle = '#f8fafc';
            ctx.font = '500 10px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(n.label.length > 20 ? n.label.substring(0, 17) + '...' : n.label, n.x!, n.y! + n.radius! + 12);
        }
      });
      
      ctx.restore();
      animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [searchQuery, selectedNodeId]);

  // Input Handling
  const getMousePos = (e: React.MouseEvent | MouseEvent) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - transform.current.x) / transform.current.k,
      y: (e.clientY - rect.top - transform.current.y) / transform.current.k
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const pos = getMousePos(e);
    let hit = false;
    for (const n of simNodes.current) {
      const dx = pos.x - n.x!;
      const dy = pos.y - n.y!;
      if (dx * dx + dy * dy <= n.radius! * n.radius!) {
        draggedNode.current = n;
        hit = true;
        break;
      }
    }
    
    if (!hit) {
        isDraggingCanvas.current = true;
        lastMousePos.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const pos = getMousePos(e);
    
    if (draggedNode.current) {
      draggedNode.current.x = pos.x;
      draggedNode.current.y = pos.y;
      draggedNode.current.vx = 0;
      draggedNode.current.vy = 0;
    } else if (isDraggingCanvas.current) {
      transform.current.x += e.clientX - lastMousePos.current.x;
      transform.current.y += e.clientY - lastMousePos.current.y;
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    } else {
      let hovered: GraphNode | null = null;
      for (const n of simNodes.current) {
        const dx = pos.x - n.x!;
        const dy = pos.y - n.y!;
        if (dx * dx + dy * dy <= n.radius! * n.radius!) {
          hovered = n;
          break;
        }
      }
      hoveredNode.current = hovered;
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (draggedNode.current && !isDraggingCanvas.current && onNodeClick) {
        // Quick check for click vs drag
        onNodeClick(draggedNode.current);
    }
    draggedNode.current = null;
    isDraggingCanvas.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const ds = e.deltaY > 0 ? 0.9 : 1.1;
    const newK = Math.max(0.1, Math.min(transform.current.k * ds, 4));
    
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    transform.current.x = mouseX - (mouseX - transform.current.x) * (newK / transform.current.k);
    transform.current.y = mouseY - (mouseY - transform.current.y) * (newK / transform.current.k);
    transform.current.k = newK;
  };

  return (
    <div ref={containerRef} className="relative w-full h-full min-h-[600px] bg-slate-950">
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        className="block w-full h-full cursor-grab active:cursor-grabbing"
      />
      
      {/* Legend & Instructions */}
      <div className="absolute top-4 left-4 bg-slate-900/90 p-4 rounded-xl border border-slate-800 backdrop-blur-md pointer-events-none shadow-xl">
          <div className="text-sm font-bold text-slate-100 mb-3 tracking-wide">NETWORK LEGEND</div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            {Object.entries(GROUP_COLORS).map(([role, color]) => (
                <div key={role} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: color }}></div>
                    <span className="text-xs font-medium text-slate-300 capitalize">{role}</span>
                </div>
            ))}
          </div>
          <div className="text-[10px] text-slate-500 mt-4 uppercase tracking-wider font-semibold">
              Scroll to Zoom • Drag to Pan
          </div>
      </div>
    </div>
  );
}
