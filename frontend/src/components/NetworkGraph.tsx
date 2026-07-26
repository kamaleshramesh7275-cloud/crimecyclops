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
  // Computed tree layout properties
  depth?: number;
  parent?: GraphNode | null;
  angle?: number;
  r?: number;
  x?: number;
  y?: number;
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
  
  // Layout state
  const simNodes = useRef<GraphNode[]>([]);
  const simLinks = useRef<Array<{ source: GraphNode; target: GraphNode; weight: number }>>([]);
  const animRef = useRef<number>(0);
  const maxDepth = useRef<number>(0);
  
  // Interaction state
  const transform = useRef({ x: 0, y: 0, k: 1 });
  const isDraggingCanvas = useRef(false);
  const hoveredNode = useRef<GraphNode | null>(null);
  const lastMousePos = useRef({ x: 0, y: 0 });

  // Resize handler
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

  // Compute Radial Hierarchy Layout
  useEffect(() => {
    if (!nodes.length || !canvasRef.current) return;
    
    const w = canvasRef.current.width || 1200;
    const h = canvasRef.current.height || 800;
    const cx = w / 2;
    const cy = h / 2;

    const nodeMap = new Map(nodes.map(n => [n.id, { ...n, radius: n.node_type === 'FIR' ? 12 : Math.min(20, 6 + n.degree * 1.5) }]));
    
    // Build adjacency list for BFS
    const adj = new Map<string, string[]>();
    nodes.forEach(n => adj.set(n.id, []));
    
    links.forEach(l => {
        adj.get(l.source)?.push(l.target);
        adj.get(l.target)?.push(l.source);
    });

    // Find absolute Kingpin (root)
    let root = nodes[0];
    for (const n of nodes) {
        if (n.degree > root.degree) root = n;
    }

    // BFS to assign depths
    const rootNode = nodeMap.get(root.id)!;
    rootNode.depth = 0;
    rootNode.parent = null;
    
    const queue = [rootNode];
    const visited = new Set([rootNode.id]);
    
    let currentMaxDepth = 0;
    const levels: Record<number, GraphNode[]> = {};

    while (queue.length > 0) {
        const curr = queue.shift()!;
        if (!levels[curr.depth!]) levels[curr.depth!] = [];
        levels[curr.depth!].push(curr);
        
        currentMaxDepth = Math.max(currentMaxDepth, curr.depth!);

        const neighbors = adj.get(curr.id) || [];
        for (const nid of neighbors) {
            if (!visited.has(nid)) {
                visited.add(nid);
                const neighbor = nodeMap.get(nid)!;
                neighbor.depth = curr.depth! + 1;
                neighbor.parent = curr;
                queue.push(neighbor);
            }
        }
    }

    // Nodes disconnected from the main component get assigned to the outermost ring
    const disconnectedDepth = currentMaxDepth + 1;
    for (const [id, n] of nodeMap) {
        if (!visited.has(id)) {
            n.depth = disconnectedDepth;
            if (!levels[disconnectedDepth]) levels[disconnectedDepth] = [];
            levels[disconnectedDepth].push(n);
        }
    }
    
    maxDepth.current = Math.max(currentMaxDepth, disconnectedDepth);
    const ringSpacing = 160;

    // Calculate polar coordinates per level
    Object.keys(levels).forEach(depthStr => {
        const d = parseInt(depthStr);
        const levelNodes = levels[d];
        
        // Sort level nodes by parent ID to minimize crossed lines
        levelNodes.sort((a, b) => (a.parent?.id || "").localeCompare(b.parent?.id || ""));
        
        levelNodes.forEach((n, i) => {
            if (d === 0) {
                n.x = cx;
                n.y = cy;
                n.r = 0;
                n.angle = 0;
            } else {
                n.r = d * ringSpacing;
                n.angle = (i / levelNodes.length) * 2 * Math.PI - Math.PI / 2;
                n.x = cx + n.r * Math.cos(n.angle);
                n.y = cy + n.r * Math.sin(n.angle);
            }
        });
    });

    simNodes.current = Array.from(nodeMap.values());
    simLinks.current = links.map(l => {
      const source = nodeMap.get(l.source);
      const target = nodeMap.get(l.target);
      if (source && target) return { source, target, weight: l.weight };
      return null;
    }).filter(Boolean) as any;
    
    // Reset transform to center the graph
    transform.current = { x: 0, y: 0, k: 0.8 };

  }, [nodes, links]);

  // Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;

      ctx.fillStyle = '#020617'; // slate-950
      ctx.fillRect(0, 0, w, h);
      
      ctx.save();
      ctx.translate(transform.current.x, transform.current.y);
      ctx.scale(transform.current.k, transform.current.k);

      // Draw Radar Concentric Rings
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(71, 85, 105, 0.2)'; // slate-600 very dim
      ctx.setLineDash([5, 15]);
      for (let i = 1; i <= maxDepth.current; i++) {
          ctx.beginPath();
          ctx.arc(cx, cy, i * 160, 0, 2 * Math.PI);
          ctx.stroke();
      }
      ctx.setLineDash([]);

      // Highlight logic (Spotlight tracing)
      const connected = new Set<string>();
      if (hoveredNode.current) {
          connected.add(hoveredNode.current.id);
          // Highlight direct neighbors
          simLinks.current.forEach(l => {
              if (l.source.id === hoveredNode.current?.id) connected.add(l.target.id);
              if (l.target.id === hoveredNode.current?.id) connected.add(l.source.id);
          });
          // Trace path up to root
          let p = hoveredNode.current.parent;
          while (p) {
              connected.add(p.id);
              p = p.parent;
          }
      }

      // Draw Links
      simLinks.current.forEach(link => {
        const isHighlighted = hoveredNode.current && connected.has(link.source.id) && connected.has(link.target.id);
        const isFaded = hoveredNode.current && !isHighlighted;
        
        ctx.beginPath();
        ctx.moveTo(link.source.x!, link.source.y!);
        
        // Curved cubic bezier arcs for cooler radar aesthetic
        if (!isHighlighted) {
            ctx.lineTo(link.target.x!, link.target.y!);
        } else {
            // Curving highlighted paths slightly
            const controlX = (link.source.x! + link.target.x!) / 2;
            const controlY = (link.source.y! + link.target.y!) / 2 - 50;
            ctx.quadraticCurveTo(controlX, controlY, link.target.x!, link.target.y!);
        }
        
        ctx.lineWidth = isHighlighted ? 2.5 : Math.max(0.5, link.weight / 2);
        
        if (isHighlighted) {
            ctx.strokeStyle = '#facc15'; // Bright yellow
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#facc15';
        } else if (isFaded) {
            ctx.strokeStyle = 'rgba(71, 85, 105, 0.05)';
            ctx.shadowBlur = 0;
        } else {
            // Normal state color code links by source group
            const sourceColor = GROUP_COLORS[link.source.group.toLowerCase()] || GROUP_COLORS.unknown;
            ctx.strokeStyle = sourceColor;
            ctx.globalAlpha = 0.3; // Make lines subtle
            ctx.shadowBlur = 0;
        }
        ctx.stroke();
        ctx.globalAlpha = 1.0; // Reset alpha
        ctx.shadowBlur = 0; // Reset shadow
      });

      // Draw Nodes
      simNodes.current.forEach(n => {
        const isSearched = searchQuery && n.label.toLowerCase().includes(searchQuery.toLowerCase());
        const isSelected = selectedNodeId === n.id;
        const isHighlighted = hoveredNode.current && connected.has(n.id);
        const isFaded = hoveredNode.current && !connected.has(n.id);
        
        ctx.beginPath();
        ctx.arc(n.x!, n.y!, n.radius!, 0, 2 * Math.PI);
        
        const baseColor = GROUP_COLORS[n.group.toLowerCase()] || GROUP_COLORS.unknown;
        ctx.fillStyle = baseColor;
        
        if (isFaded) {
            ctx.fillStyle = 'rgba(15, 23, 42, 0.5)'; // Very dark slate for faded
            ctx.strokeStyle = 'rgba(71, 85, 105, 0.2)';
            ctx.lineWidth = 1;
        } else {
            if (isHighlighted || isSelected || isSearched) {
                ctx.shadowBlur = 20;
                ctx.shadowColor = isHighlighted ? '#facc15' : baseColor;
                ctx.strokeStyle = isHighlighted ? '#facc15' : baseColor;
                ctx.lineWidth = 3;
            } else {
                ctx.shadowBlur = n.depth === 0 ? 30 : 0; // Root node glows constantly
                ctx.shadowColor = baseColor;
                ctx.strokeStyle = '#1e293b';
                ctx.lineWidth = 1.5;
            }
        }
        
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0; // Reset shadow

        // Label rendering
        if (!isFaded || isHighlighted) {
            ctx.fillStyle = isHighlighted ? '#ffffff' : '#cbd5e1';
            ctx.font = isHighlighted ? 'bold 11px Inter, sans-serif' : '500 10px Inter, sans-serif';
            ctx.textAlign = 'center';
            const textY = n.y! + n.radius! + (isHighlighted ? 15 : 12);
            ctx.fillText(n.label.length > 20 ? n.label.substring(0, 17) + '...' : n.label, n.x!, textY);
            
            // Draw root badge
            if (n.depth === 0) {
                ctx.fillStyle = '#fef08a'; // yellow-200
                ctx.fillText("KINGPIN", n.x!, n.y! - n.radius! - 8);
            }
        }
      });
      
      ctx.restore();
      animRef.current = requestAnimationFrame(render);
    };

    animRef.current = requestAnimationFrame(render);
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
    isDraggingCanvas.current = true;
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const pos = getMousePos(e);
    
    if (isDraggingCanvas.current) {
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
    isDraggingCanvas.current = false;
    if (hoveredNode.current && onNodeClick) {
        // Quick check for click vs drag (simplified)
        onNodeClick(hoveredNode.current);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const ds = e.deltaY > 0 ? 0.9 : 1.1;
    const newK = Math.max(0.05, Math.min(transform.current.k * ds, 4));
    
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    transform.current.x = mouseX - (mouseX - transform.current.x) * (newK / transform.current.k);
    transform.current.y = mouseY - (mouseY - transform.current.y) * (newK / transform.current.k);
    transform.current.k = newK;
  };

  return (
    <div ref={containerRef} className="relative w-full h-full min-h-[600px] bg-slate-950 overflow-hidden">
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        className="block w-full h-full cursor-grab active:cursor-grabbing"
      />
      
      {/* Target Crosshair Overlay (subtle visual effect) */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-10">
          <div className="w-[1px] h-full bg-cyan-400"></div>
          <div className="h-[1px] w-full bg-cyan-400 absolute"></div>
      </div>

      {/* Legend & Instructions */}
      <div className="absolute top-4 left-4 bg-slate-900/90 p-4 rounded-xl border border-slate-800 backdrop-blur-md pointer-events-none shadow-xl">
          <div className="text-sm font-bold text-slate-100 mb-3 tracking-wide">RADIAL NETWORK LEGEND</div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            {Object.entries(GROUP_COLORS).map(([role, color]) => (
                <div key={role} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: color }}></div>
                    <span className="text-xs font-medium text-slate-300 capitalize">{role}</span>
                </div>
            ))}
          </div>
          <div className="text-[10px] text-slate-500 mt-4 uppercase tracking-wider font-semibold">
              Center: Kingpin • Outer: Associates<br/>
              Scroll to Zoom • Drag to Pan
          </div>
      </div>
    </div>
  );
}
