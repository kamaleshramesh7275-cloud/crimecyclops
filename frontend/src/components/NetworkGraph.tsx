import { useEffect, useRef, useState } from 'react';

interface GraphNode {
  id: string;
  label: string;
  group: string;
  node_type: string;
  district: string;
  degree: number;
  depth?: number;
  parent?: GraphNode | null;
  x?: number;
  y?: number;
  radius?: number;
}

interface GraphLink {
  source: string;
  target: string;
  weight: number;
}

interface Props {
  nodes: GraphNode[];
  links: GraphLink[];
  selectedNodeId?: string | null;
  searchQuery?: string;
  onNodeClick?: (node: GraphNode) => void;
}

// Colors adapted from the user's screenshot vibe, tuned for our dark theme
const GROUP_COLORS: Record<string, { main: string, bg: string, text: string }> = {
  suspect: { main: '#f97316', bg: 'rgba(249, 115, 22, 0.15)', text: '#fdba74' }, // Orange
  witness: { main: '#38bdf8', bg: 'rgba(56, 189, 248, 0.15)', text: '#7dd3fc' }, // Light Blue
  victim: { main: '#fb7185', bg: 'rgba(251, 113, 133, 0.15)', text: '#fda4af' }, // Rose/Pink
  accused: { main: '#c084fc', bg: 'rgba(192, 132, 252, 0.15)', text: '#d8b4fe' }, // Purple
  complainant: { main: '#34d399', bg: 'rgba(52, 211, 153, 0.15)', text: '#6ee7b7' }, // Green
  fir: { main: '#6366f1', bg: 'rgba(99, 102, 241, 0.15)', text: '#a5b4fc' }, // Indigo
  unknown: { main: '#94a3b8', bg: 'rgba(148, 163, 184, 0.15)', text: '#cbd5e1' }, // Slate
};

export default function NetworkGraph({ nodes, links, selectedNodeId, searchQuery, onNodeClick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const simNodes = useRef<GraphNode[]>([]);
  const simLinks = useRef<Array<{ source: GraphNode; target: GraphNode; weight: number }>>([]);
  const animRef = useRef<number>(0);
  
  const transform = useRef({ x: 0, y: 0, k: 0.6 });
  const isDraggingCanvas = useRef(false);
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

  // Compute Bottom-Up Hierarchical Layout
  useEffect(() => {
    if (!nodes.length || !canvasRef.current) return;
    
    const w = canvasRef.current.width || 1200;
    const h = canvasRef.current.height || 800;

    const nodeMap = new Map(nodes.map(n => [
        n.id, 
        { ...n, radius: n.node_type === 'FIR' ? 18 : Math.min(30, 14 + n.degree * 1.5) }
    ]));
    
    // BFS Adjacency
    const adj = new Map<string, string[]>();
    nodes.forEach(n => adj.set(n.id, []));
    links.forEach(l => {
        adj.get(l.source)?.push(l.target);
        adj.get(l.target)?.push(l.source);
    });

    // Find Root (Highest Degree)
    let root = nodes[0];
    for (const n of nodes) {
        if (n.degree > root.degree) root = n;
    }

    const rootNode = nodeMap.get(root.id)!;
    rootNode.depth = 0;
    rootNode.parent = null;
    
    const queue = [rootNode];
    const visited = new Set([rootNode.id]);
    const levels: Record<number, GraphNode[]> = {};
    let maxDepth = 0;

    while (queue.length > 0) {
        const curr = queue.shift()!;
        if (!levels[curr.depth!]) levels[curr.depth!] = [];
        levels[curr.depth!].push(curr);
        maxDepth = Math.max(maxDepth, curr.depth!);

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

    // Handle disconnected nodes
    const disconnectedDepth = maxDepth + 1;
    for (const [id, n] of nodeMap) {
        if (!visited.has(id)) {
            n.depth = disconnectedDepth;
            if (!levels[disconnectedDepth]) levels[disconnectedDepth] = [];
            levels[disconnectedDepth].push(n);
        }
    }

    // Calculate X, Y coordinates (Bottom-Up Tree)
    // Root is at the bottom, branches go up
    const levelHeight = 150;
    const startY = h - 100; // Bottom offset
    
    Object.keys(levels).forEach(depthStr => {
        const d = parseInt(depthStr);
        const levelNodes = levels[d];
        
        // Sort to prevent crossing lines where possible
        levelNodes.sort((a, b) => (a.parent?.id || "").localeCompare(b.parent?.id || ""));
        
        const levelWidth = levelNodes.length * 100; // Spacing between nodes horizontally
        const startX = (w - levelWidth) / 2 + 50;
        
        levelNodes.forEach((n, i) => {
            if (d === 0) {
                // Root perfectly centered at bottom
                n.x = w / 2;
                n.y = startY;
            } else {
                n.x = startX + (i * 100);
                n.y = startY - (d * levelHeight);
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
    
    // Auto-center camera on root
    transform.current = { x: 0, y: 150, k: 0.6 };

  }, [nodes, links]);

  // RoundRect Helper for Pill Labels
  const drawPill = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) => {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  };

  // Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      const w = canvas.width;
      const h = canvas.height;

      // Dark background to contrast with bright glowing UI
      ctx.fillStyle = '#0f172a'; // slate-900
      ctx.fillRect(0, 0, w, h);
      
      ctx.save();
      ctx.translate(transform.current.x, transform.current.y);
      ctx.scale(transform.current.k, transform.current.k);

      // Connected nodes for highlighting
      const connected = new Set<string>();
      if (hoveredNode.current) {
          connected.add(hoveredNode.current.id);
          simLinks.current.forEach(l => {
              if (l.source.id === hoveredNode.current?.id) connected.add(l.target.id);
              if (l.target.id === hoveredNode.current?.id) connected.add(l.source.id);
          });
          let p = hoveredNode.current.parent;
          while (p) {
              connected.add(p.id);
              p = p.parent;
          }
      }

      // Draw Links (Clean straight lines like the screenshot)
      simLinks.current.forEach(link => {
        const isHighlighted = hoveredNode.current && connected.has(link.source.id) && connected.has(link.target.id);
        const isFaded = hoveredNode.current && !isHighlighted;
        
        ctx.beginPath();
        ctx.moveTo(link.source.x!, link.source.y!);
        ctx.lineTo(link.target.x!, link.target.y!);
        
        ctx.lineWidth = isHighlighted ? 2.5 : 1;
        if (isHighlighted) {
            ctx.strokeStyle = '#facc15';
        } else if (isFaded) {
            ctx.strokeStyle = 'rgba(148, 163, 184, 0.05)';
        } else {
            ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
        }
        ctx.stroke();
      });

      // Draw Nodes
      simNodes.current.forEach(n => {
        const isSearched = searchQuery && n.label.toLowerCase().includes(searchQuery.toLowerCase());
        const isSelected = selectedNodeId === n.id;
        const isHighlighted = hoveredNode.current && connected.has(n.id);
        const isFaded = hoveredNode.current && !connected.has(n.id);
        
        const colors = GROUP_COLORS[n.group.toLowerCase()] || GROUP_COLORS.unknown;
        
        // Skip text rendering for non-highlighted nodes if there are too many (unless it's the root)
        const shouldShowLabel = !isFaded || n.depth === 0;

        ctx.globalAlpha = isFaded ? 0.2 : 1.0;

        // 1. Outer Concentric Ring
        ctx.beginPath();
        ctx.arc(n.x!, n.y!, n.radius! + 4, 0, 2 * Math.PI);
        ctx.strokeStyle = colors.main;
        ctx.lineWidth = 1.5;
        if (isHighlighted || isSelected || isSearched) {
            ctx.shadowBlur = 15;
            ctx.shadowColor = colors.main;
            ctx.lineWidth = 3;
        }
        ctx.stroke();
        ctx.shadowBlur = 0;

        // 2. Inner Circle Fill
        ctx.beginPath();
        ctx.arc(n.x!, n.y!, n.radius!, 0, 2 * Math.PI);
        ctx.fillStyle = colors.main;
        ctx.fill();

        // 3. Node Icon (Inside circle)
        ctx.fillStyle = '#ffffff';
        ctx.font = \`\${n.radius! * 0.8}px Arial\`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(n.node_type === 'FIR' ? '📄' : '👤', n.x!, n.y! + 2); // Slight Y offset for emojis

        // 4. Little Top-Right Badge (Like the country flags in screenshot)
        const badgeRadius = n.radius! * 0.35;
        const badgeX = n.x! + n.radius! * 0.7;
        const badgeY = n.y! - n.radius! * 0.7;
        
        ctx.beginPath();
        ctx.arc(badgeX, badgeY, badgeRadius, 0, 2 * Math.PI);
        ctx.fillStyle = '#1e293b'; // Dark background for badge
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
        
        // Badge Icon (first letter of group)
        ctx.fillStyle = '#ffffff';
        ctx.font = \`bold \${badgeRadius * 1.2}px Inter\`;
        ctx.fillText(n.group.charAt(0).toUpperCase(), badgeX, badgeY + 1);

        // 5. Pill-shaped Label Underneath
        if (shouldShowLabel) {
            const labelText = n.label.length > 15 ? n.label.substring(0, 13) + '..' : n.label;
            ctx.font = '600 12px Inter, sans-serif';
            
            const textMetrics = ctx.measureText(labelText);
            const textWidth = textMetrics.width;
            const paddingX = 10;
            const paddingY = 4;
            const pillWidth = textWidth + paddingX * 2;
            const pillHeight = 20;
            
            const pillX = n.x! - pillWidth / 2;
            const pillY = n.y! + n.radius! + 10;

            // Pill Background
            drawPill(ctx, pillX, pillY, pillWidth, pillHeight, 10);
            ctx.fillStyle = colors.bg;
            ctx.fill();
            
            // Pill Border
            ctx.strokeStyle = colors.main;
            ctx.lineWidth = 1;
            ctx.stroke();

            // Pill Text
            ctx.fillStyle = colors.text;
            ctx.textBaseline = 'top';
            ctx.fillText(labelText, n.x!, pillY + paddingY);
        }
        
        ctx.globalAlpha = 1.0; // Reset
      });
      
      ctx.restore();
      animRef.current = requestAnimationFrame(render);
    };

    animRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animRef.current);
  }, [searchQuery, selectedNodeId]);

  // Input Handling
  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingCanvas.current = true;
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left - transform.current.x) / transform.current.k;
    const mouseY = (e.clientY - rect.top - transform.current.y) / transform.current.k;
    
    if (isDraggingCanvas.current) {
      transform.current.x += e.clientX - lastMousePos.current.x;
      transform.current.y += e.clientY - lastMousePos.current.y;
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    } else {
      let hovered: GraphNode | null = null;
      // Search in reverse to catch top-most nodes first
      for (let i = simNodes.current.length - 1; i >= 0; i--) {
        const n = simNodes.current[i];
        const dx = mouseX - n.x!;
        const dy = mouseY - n.y!;
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
    <div ref={containerRef} className="relative w-full h-full min-h-[600px] bg-slate-900 overflow-hidden">
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        className="block w-full h-full cursor-grab active:cursor-grabbing"
      />

      <div className="absolute top-4 left-4 bg-slate-900/90 p-4 rounded-xl border border-slate-700 backdrop-blur-md pointer-events-none shadow-xl">
          <div className="text-sm font-bold text-slate-100 mb-3 tracking-wide">HIERARCHY LEGEND</div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            {Object.entries(GROUP_COLORS).map(([role, colors]) => (
                <div key={role} className="flex items-center gap-2">
                    <div className="relative w-4 h-4 rounded-full flex items-center justify-center" style={{ backgroundColor: colors.main }}>
                        <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full border border-white bg-slate-800"></div>
                    </div>
                    <span className="text-xs font-medium text-slate-300 capitalize">{role}</span>
                </div>
            ))}
          </div>
          <div className="text-[10px] text-slate-500 mt-4 uppercase tracking-wider font-semibold">
              Root at bottom • Branches upwards
          </div>
      </div>
    </div>
  );
}
