import { useEffect, useRef, useState } from 'react';

interface GraphNode {
  id: string;
  label: string;
  group: string;
  node_type: string;
  district: string;
  degree: number;
  degree_centrality: number;
  betweenness: number;
  // Physics properties
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  size?: number;
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
  suspect: '#f97316', // Neon Orange
  witness: '#38bdf8', // Neon Sky Blue
  victim: '#fb7185',  // Neon Rose
  accused: '#ef4444', // Neon Red
  complainant: '#34d399', // Neon Emerald
  fir: '#6366f1',     // Neon Indigo
  unknown: '#94a3b8',
};

// Helper for rounded rectangles
const drawRoundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) => {
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

export default function NetworkGraph({ nodes, links, selectedNodeId, searchQuery, onNodeClick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Physics state
  const simNodes = useRef<GraphNode[]>([]);
  const simLinks = useRef<Array<{ source: GraphNode; target: GraphNode; weight: number }>>([]);
  const animRef = useRef<number>(0);
  
  // Interaction state
  const transform = useRef({ x: 0, y: 0, k: 0.6 });
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
    
    const width = canvasRef.current?.width || 1200;
    const height = canvasRef.current?.height || 800;

    const newNodes = nodes.map((n, i) => {
      const angle = (i / nodes.length) * Math.PI * 2;
      const radius = 300;
      
      // Calculate square size based on importance (degree)
      let size = 40; // Default small
      if (n.degree > 20) size = 80;
      else if (n.degree > 10) size = 60;
      else if (n.node_type === 'FIR') size = 50;
      
      return {
        ...n,
        x: width / 2 + Math.cos(angle) * radius,
        y: height / 2 + Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
        size
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
    transform.current = { x: 0, y: 0, k: 0.6 };
  }, [nodes, links]);

  // Main Physics & Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const tick = () => {
      const w = canvas.width;
      const h = canvas.height;

      // 1. Calculate Forces
      // Link Springs
      simLinks.current.forEach(link => {
        const dx = link.target.x! - link.source.x!;
        const dy = link.target.y! - link.source.y!;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        
        // Desired distance is slightly larger for larger nodes
        const targetDist = (link.source.size! + link.target.size!) / 2 + 100;
        
        const force = (dist - targetDist) * 0.05;
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

      // Repulsion & Collision
      simNodes.current.forEach(n => {
        // Weak gravity to center to keep them on screen
        if (n !== draggedNode.current) {
          n.vx! += (w / 2 - n.x!) * 0.001;
          n.vy! += (h / 2 - n.y!) * 0.001;
        }
      });

      for (let i = 0; i < simNodes.current.length; i++) {
        for (let j = i + 1; j < simNodes.current.length; j++) {
          const n1 = simNodes.current[i];
          const n2 = simNodes.current[j];
          
          const dx = n2.x! - n1.x!;
          const dy = n2.y! - n1.y!;
          const distSq = dx * dx + dy * dy;
          
          // Collision distance is half the size of both squares + padding
          const minD = (n1.size! + n2.size!) / 2 + 20;
          
          if (distSq < minD * minD && distSq > 0) {
            const dist = Math.sqrt(distSq);
            // Strong collision force to prevent overlap
            const force = (minD - dist) * 0.5;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            
            if (n1 !== draggedNode.current) { n1.vx! -= fx; n1.vy! -= fy; }
            if (n2 !== draggedNode.current) { n2.vx! += fx; n2.vy! += fy; }
          } else if (distSq < 90000) {
             // General N-body repulsion (300px range)
             const dist = Math.sqrt(distSq);
             const force = 1000 / distSq;
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

      // 3. Render
      ctx.fillStyle = '#111827'; // Dark gray/black bg (slate-900)
      ctx.fillRect(0, 0, w, h);
      
      ctx.save();
      ctx.translate(transform.current.x, transform.current.y);
      ctx.scale(transform.current.k, transform.current.k);

      // Draw Links with Arrows
      simLinks.current.forEach(link => {
        const isHighlighted = hoveredNode.current && connected.has(link.source.id) && connected.has(link.target.id);
        const isFaded = hoveredNode.current && !isHighlighted;
        
        const dx = link.target.x! - link.source.x!;
        const dy = link.target.y! - link.source.y!;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        // Stop the line at the edge of the square
        const targetRadius = link.target.size! / 2;
        const arrowX = link.target.x! - (dx / dist) * targetRadius;
        const arrowY = link.target.y! - (dy / dist) * targetRadius;

        ctx.beginPath();
        ctx.moveTo(link.source.x!, link.source.y!);
        ctx.lineTo(arrowX, arrowY);
        
        ctx.lineWidth = isHighlighted ? 2.5 : 1;
        
        if (isHighlighted) {
            // Neon color based on source
            ctx.strokeStyle = GROUP_COLORS[link.source.group.toLowerCase()] || '#facc15';
            ctx.shadowBlur = 10;
            ctx.shadowColor = ctx.strokeStyle;
        } else if (isFaded) {
            ctx.strokeStyle = 'rgba(75, 85, 99, 0.1)';
            ctx.shadowBlur = 0;
        } else {
            // Default grey
            ctx.strokeStyle = 'rgba(156, 163, 175, 0.3)';
            ctx.shadowBlur = 0;
        }
        ctx.stroke();
        
        // Draw Arrowhead
        const arrowLength = isHighlighted ? 12 : 8;
        const angle = Math.atan2(dy, dx);
        
        ctx.beginPath();
        ctx.moveTo(arrowX, arrowY);
        ctx.lineTo(arrowX - arrowLength * Math.cos(angle - Math.PI / 6), arrowY - arrowLength * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(arrowX - arrowLength * Math.cos(angle + Math.PI / 6), arrowY - arrowLength * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        
        ctx.fillStyle = ctx.strokeStyle;
        ctx.fill();
      });

      ctx.shadowBlur = 0; // reset

      // Draw Nodes
      simNodes.current.forEach(n => {
        // Update physics
        if (n !== draggedNode.current) {
          n.vx! *= 0.8; // friction
          n.vy! *= 0.8;
          n.x! += n.vx!;
          n.y! += n.vy!;
        }

        const isSearched = searchQuery && n.label.toLowerCase().includes(searchQuery.toLowerCase());
        const isSelected = selectedNodeId === n.id;
        const isHighlighted = hoveredNode.current && connected.has(n.id);
        const isFaded = hoveredNode.current && !connected.has(n.id);
        
        const size = n.size!;
        const halfSize = size / 2;
        const x = n.x! - halfSize;
        const y = n.y! - halfSize;
        
        const baseColor = GROUP_COLORS[n.group.toLowerCase()] || GROUP_COLORS.unknown;
        
        ctx.globalAlpha = isFaded ? 0.2 : 1.0;

        // Draw Square Node Background
        drawRoundRect(ctx, x, y, size, size, 8);
        
        if (isHighlighted || isSelected || isSearched) {
            ctx.shadowBlur = 20;
            ctx.shadowColor = baseColor;
            ctx.strokeStyle = baseColor;
            ctx.lineWidth = 3;
            // Add a stronger tint of the base color to the background
            ctx.fillStyle = baseColor; 
            ctx.globalAlpha = 0.35;
            ctx.fill();
            ctx.globalAlpha = 1.0;
        } else {
            ctx.shadowBlur = 0;
            ctx.strokeStyle = baseColor; // Use vibrant border instead of gray
            ctx.lineWidth = 1.5;
            // Always-On vibrant color tint
            ctx.fillStyle = baseColor;
            ctx.globalAlpha = 0.15;
            ctx.fill();
            ctx.globalAlpha = isFaded ? 0.2 : 1.0;
        }
        
        ctx.stroke(); // draw border
        
        ctx.shadowBlur = 0; // reset

        // Draw Icon / Badge Inside (Top Left)
        ctx.fillStyle = baseColor;
        ctx.font = `bold ${size * 0.25}px Inter`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(n.node_type === 'FIR' ? '📄' : n.group.charAt(0).toUpperCase(), x + 6, y + 6);
        
        // Draw Node ID / Small text top right
        ctx.fillStyle = '#9ca3af'; // gray-400
        ctx.font = `${size * 0.15}px Inter`;
        ctx.textAlign = 'right';
        ctx.fillText(`#${n.id.substring(0,4)}`, x + size - 6, y + 6);

        // Draw Label Inside (Centered)
        const labelText = n.label.length > 10 && size < 60 ? n.label.substring(0, 8) + '..' : n.label;
        
        // Only show text if it's large enough or hovered, to prevent extreme clutter
        if (size >= 60 || isHighlighted || isSelected) {
            ctx.fillStyle = isHighlighted ? '#ffffff' : '#f3f4f6'; // white or gray-100
            ctx.font = `${size * 0.18}px Inter`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            // Text wrapping for squares
            const words = labelText.split(' ');
            if (words.length > 1 && size >= 60) {
                ctx.fillText(words[0], n.x!, n.y! - 5);
                ctx.fillText(words.slice(1).join(' '), n.x!, n.y! + 10);
            } else {
                ctx.fillText(labelText, n.x!, n.y! + (size * 0.1));
            }
        }
        
        ctx.globalAlpha = 1.0; // Reset
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
    
    // Check hit against squares
    for (let i = simNodes.current.length - 1; i >= 0; i--) {
      const n = simNodes.current[i];
      const halfSize = n.size! / 2;
      if (pos.x >= n.x! - halfSize && pos.x <= n.x! + halfSize &&
          pos.y >= n.y! - halfSize && pos.y <= n.y! + halfSize) {
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
      for (let i = simNodes.current.length - 1; i >= 0; i--) {
        const n = simNodes.current[i];
        const halfSize = n.size! / 2;
        if (pos.x >= n.x! - halfSize && pos.x <= n.x! + halfSize &&
            pos.y >= n.y! - halfSize && pos.y <= n.y! + halfSize) {
          hovered = n;
          break;
        }
      }
      hoveredNode.current = hovered;
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (draggedNode.current && !isDraggingCanvas.current && onNodeClick) {
        onNodeClick(draggedNode.current);
    }
    draggedNode.current = null;
    isDraggingCanvas.current = false;
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
    <div ref={containerRef} className="relative w-full h-full min-h-[600px] bg-gray-900 overflow-hidden">
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        className="block w-full h-full cursor-grab active:cursor-grabbing"
      />

      <div className="absolute top-4 left-4 bg-gray-800/90 p-4 rounded-xl border border-gray-700 backdrop-blur-md shadow-xl z-10 pointer-events-auto">
          <div className="text-sm font-bold text-gray-100 mb-3 tracking-wide flex justify-between items-center">
              FORCE NETWORK LEGEND
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            {Object.entries(GROUP_COLORS).map(([role, color]) => (
                <div key={role} className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded" style={{ backgroundColor: color }}></div>
                    <span className="text-xs font-medium text-gray-300 capitalize">{role}</span>
                </div>
            ))}
          </div>
          <div className="text-[10px] text-gray-400 mt-4 uppercase tracking-wider font-semibold">
              Hover to view exact paths
          </div>
      </div>

      {selectedNodeId && (
          <div className="absolute top-4 right-4 bottom-4 w-80 bg-gray-800/95 p-6 rounded-xl border border-gray-700 backdrop-blur-xl shadow-2xl z-10 pointer-events-auto overflow-y-auto transform transition-all translate-x-0 duration-300 flex flex-col">
              {(() => {
                  const sNode = nodes.find(n => n.id === selectedNodeId);
                  if (!sNode) return null;
                  const bColor = GROUP_COLORS[sNode.group.toLowerCase()] || GROUP_COLORS.unknown;
                  return (
                      <>
                        <div className="pb-5 mb-5 border-b border-gray-700">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="w-10 h-10 rounded-lg flex items-center justify-center text-xl" style={{ backgroundColor: `${bColor}20`, color: bColor, border: `1px solid ${bColor}50` }}>
                                    {sNode.node_type === 'FIR' ? '📄' : '👤'}
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-gray-100">{sNode.label}</h2>
                                    <div className="text-xs uppercase tracking-widest font-bold" style={{ color: bColor }}>{sNode.node_type} - {sNode.group}</div>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col gap-3 flex-1">
                            <div className="bg-gray-900/50 p-4 rounded-xl border border-gray-700/50 flex justify-between items-center">
                                <span className="text-gray-400 text-sm font-medium">Direct Connections</span>
                                <span className="text-gray-100 font-bold text-lg">{sNode.degree}</span>
                            </div>
                            <div className="bg-gray-900/50 p-4 rounded-xl border border-gray-700/50 flex justify-between items-center">
                                <span className="text-gray-400 text-sm font-medium">Network Centrality</span>
                                <span className="text-gray-100 font-bold text-lg">{(sNode.degree_centrality * 100).toFixed(1)}%</span>
                            </div>
                            <div className="bg-gray-900/50 p-4 rounded-xl border border-gray-700/50 flex flex-col gap-1">
                                <span className="text-gray-400 text-sm font-medium">Primary District</span>
                                <span className="text-gray-100 font-bold">{sNode.district || 'Unknown Jurisdiction'}</span>
                            </div>
                            <div className="bg-gray-900/50 p-4 rounded-xl border border-gray-700/50 flex flex-col gap-1">
                                <span className="text-gray-400 text-sm font-medium">System ID</span>
                                <span className="text-gray-500 font-mono text-xs break-all">{sNode.id}</span>
                            </div>
                        </div>
                      </>
                  );
              })()}
          </div>
      )}
    </div>
  );
}
