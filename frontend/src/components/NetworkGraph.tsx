import { useEffect, useRef, useCallback, useState } from 'react';

interface GraphNode {
  id: string;
  label: string;
  group: string;
  node_type: string;
  district: string;
  degree: number;
  degree_centrality: number;
  betweenness: number;
  // simulation positions (mutable)
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
  suspect: '#f97316',
  witness: '#38bdf8',
  victim: '#fb7185',
  accused: '#e879f9',
  informer: '#34d399',
  fir: '#a78bfa',
  unknown: '#94a3b8',
};

function getColor(group: string): string {
  return GROUP_COLORS[group.toLowerCase()] ?? '#94a3b8';
}

export default function NetworkGraph({ nodes, links, selectedNodeId, searchQuery, onNodeClick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const simNodes = useRef<GraphNode[]>([]);
  const simLinks = useRef<Array<{ source: GraphNode; target: GraphNode; weight: number; type?: string }>>([]);
  const dragging = useRef<GraphNode | null>(null);
  const hovering = useRef<GraphNode | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; node: GraphNode } | null>(null);
  const transform = useRef({ scale: 1, tx: 0, ty: 0 });
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0, tx: 0, ty: 0 });

  // Initialize simulation nodes from props
  useEffect(() => {
    if (nodes.length === 0) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = canvas.clientWidth || 900;
    const H = canvas.clientHeight || 600;

    simNodes.current = nodes.map((n, i) => ({
      ...n,
      x: W / 2 + (Math.random() - 0.5) * 300,
      y: H / 2 + (Math.random() - 0.5) * 300,
      vx: 0,
      vy: 0,
      fx: null,
      fy: null,
    }));

    const nodeMap = new Map(simNodes.current.map((n) => [n.id, n]));
    simLinks.current = links
      .map((l) => {
        const source = nodeMap.get(l.source);
        const target = nodeMap.get(l.target);
        if (!source || !target) return null;
        return { source, target, weight: l.weight, type: l.type };
      })
      .filter(Boolean) as Array<{ source: GraphNode; target: GraphNode; weight: number; type?: string }>;
  }, [nodes, links]);

  // Force simulation tick
  const tick = useCallback(() => {
    const sn = simNodes.current;
    const sl = simLinks.current;
    if (sn.length === 0) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2;
    const cy = H / 2;

    // Apply forces
    for (const node of sn) {
      if (node.fx != null) { node.x = node.fx; node.vy = 0; }
      if (node.fy != null) { node.y = node.fy; node.vy = 0; }

      // Gravity toward center
      node.vx = (node.vx ?? 0) + (cx - (node.x ?? cx)) * 0.001;
      node.vy = (node.vy ?? 0) + (cy - (node.y ?? cy)) * 0.001;
    }

    // Repulsion between nodes
    for (let i = 0; i < sn.length; i++) {
      for (let j = i + 1; j < sn.length; j++) {
        const a = sn[i], b = sn[j];
        const dx = (b.x ?? 0) - (a.x ?? 0);
        const dy = (b.y ?? 0) - (a.y ?? 0);
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = -800 / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx = (a.vx ?? 0) + fx;
        a.vy = (a.vy ?? 0) + fy;
        b.vx = (b.vx ?? 0) - fx;
        b.vy = (b.vy ?? 0) - fy;
      }
    }

    // Link spring forces
    for (const link of sl) {
      const { source, target } = link;
      const dx = (target.x ?? 0) - (source.x ?? 0);
      const dy = (target.y ?? 0) - (source.y ?? 0);
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const targetLen = link.type === 'co_offender' ? 80 : 120;
      const force = (dist - targetLen) * 0.04;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      if (source.fx == null) { source.vx = (source.vx ?? 0) + fx; source.vy = (source.vy ?? 0) + fy; }
      if (target.fx == null) { target.vx = (target.vx ?? 0) - fx; target.vy = (target.vy ?? 0) - fy; }
    }

    // Integrate positions
    const damping = 0.85;
    for (const node of sn) {
      if (node.fx == null) {
        node.vx = (node.vx ?? 0) * damping;
        node.vy = (node.vy ?? 0) * damping;
        node.x = (node.x ?? 0) + (node.vx ?? 0);
        node.y = (node.y ?? 0) + (node.vy ?? 0);
      }
    }
  }, []);

  // Render canvas
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { scale, tx, ty } = transform.current;
    const sn = simNodes.current;
    const sl = simLinks.current;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background gradient
    const bg = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, 0, canvas.width / 2, canvas.height / 2, canvas.width * 0.7);
    bg.addColorStop(0, '#0f0c29');
    bg.addColorStop(1, '#090514');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(tx, ty);
    ctx.scale(scale, scale);

    // Identify neighbors of active node (hovered or selected)
    const activeNodeId = hovering.current?.id || selectedNodeId;
    const activeNeighbors = new Set<string>();
    if (activeNodeId) {
      activeNeighbors.add(activeNodeId);
      for (const link of sl) {
        if (link.source.id === activeNodeId) activeNeighbors.add(link.target.id);
        if (link.target.id === activeNodeId) activeNeighbors.add(link.source.id);
      }
    }

    const searchStr = searchQuery?.trim().toLowerCase() || '';

    // Draw links
    for (const link of sl) {
      const { source: s, target: t } = link;
      const isCoOffender = link.type === 'co_offender';
      
      const isActive = activeNodeId && (s.id === activeNodeId || t.id === activeNodeId);
      
      let opacity = 0.35; // default base opacity
      if (activeNodeId) {
        opacity = isActive ? 1 : 0.03;
      }
      
      ctx.beginPath();
      // Straight lines with gradient provide a clear and precise look
      ctx.moveTo(s.x ?? 0, s.y ?? 0);
      ctx.lineTo(t.x ?? 0, t.y ?? 0);

      const sColor = getColor(s.group);
      const tColor = getColor(t.group);
      
      if (isCoOffender) {
        ctx.strokeStyle = `rgba(249, 115, 22, ${opacity === 1 ? 0.9 : opacity * 1.5})`;
      } else {
        const grad = ctx.createLinearGradient(s.x ?? 0, s.y ?? 0, t.x ?? 0, t.y ?? 0);
        const getHexAlpha = (a: number) => Math.floor(a * 255).toString(16).padStart(2, '0');
        grad.addColorStop(0, sColor + getHexAlpha(opacity));
        grad.addColorStop(1, tColor + getHexAlpha(opacity));
        ctx.strokeStyle = grad;
      }

      ctx.lineWidth = isActive ? 2.5 : (isCoOffender ? 1.5 : 0.8);
      if (isCoOffender) ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Arrow tip for directed/co-offender links
      if (isCoOffender && opacity > 0.1) {
        const dx = (t.x ?? 0) - (s.x ?? 0);
        const dy = (t.y ?? 0) - (s.y ?? 0);
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const ux = dx / len, uy = dy / len;
        const mx = (s.x ?? 0) + dx * 0.55;
        const my = (s.y ?? 0) + dy * 0.55;
        ctx.beginPath();
        ctx.moveTo(mx, my);
        ctx.lineTo(mx - ux * 6 - uy * 4, my - uy * 6 + ux * 4);
        ctx.lineTo(mx - ux * 6 + uy * 4, my - uy * 6 - ux * 4);
        ctx.closePath();
        ctx.fillStyle = `rgba(249,115,22,${opacity === 1 ? 0.9 : opacity * 1.5})`;
        ctx.fill();
      }
    }

    // Draw nodes
    for (const node of sn) {
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const isFir = node.node_type === 'fir';
      const radius = isFir ? 10 + node.degree * 1.5 : 8 + node.degree * 1.2;
      const isHovered = hovering.current?.id === node.id;
      const isDragged = dragging.current?.id === node.id;
      const color = getColor(node.group);
      const isSearchMatch = searchStr && node.label.toLowerCase().includes(searchStr);
      
      let opacity = 1;
      if (activeNodeId && !activeNeighbors.has(node.id)) opacity = 0.1;
      if (searchStr && !isSearchMatch) opacity = Math.min(opacity, 0.15);

      ctx.globalAlpha = opacity;

      // Glow effect for hovered/high-centrality/search match
      if (isHovered || isSearchMatch || (node.betweenness > 0.05 && opacity > 0.5)) {
        ctx.beginPath();
        ctx.arc(x, y, radius + (isSearchMatch ? 12 : 8), 0, Math.PI * 2);
        const glow = ctx.createRadialGradient(x, y, radius, x, y, radius + (isSearchMatch ? 14 : 10));
        const glowColor = isSearchMatch ? '#34d399' : color;
        glow.addColorStop(0, glowColor + '66');
        glow.addColorStop(1, glowColor + '00');
        ctx.fillStyle = glow;
        ctx.fill();
      }

      // Node circle
      ctx.beginPath();
      ctx.arc(x, y, isDragged ? radius + 3 : radius, 0, Math.PI * 2);
      const grad = ctx.createRadialGradient(x - radius * 0.3, y - radius * 0.3, 0, x, y, radius);
      grad.addColorStop(0, color + 'ff');
      grad.addColorStop(1, color + '99');
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = (isHovered || isSearchMatch) ? '#fff' : color + 'cc';
      ctx.lineWidth = (isHovered || isSearchMatch) ? 2 : 1;
      ctx.stroke();

      // FIR nodes: diamond shape overlay
      if (isFir) {
        ctx.beginPath();
        ctx.moveTo(x, y - radius * 0.6);
        ctx.lineTo(x + radius * 0.4, y);
        ctx.lineTo(x, y + radius * 0.6);
        ctx.lineTo(x - radius * 0.4, y);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fill();
      }

      // Label
      if (isHovered || isSearchMatch || radius > 14 || (node.betweenness > 0.03 && opacity > 0.5)) {
        ctx.font = `${(isHovered || isSearchMatch) ? 'bold' : ''} ${Math.max(9, Math.min(13, radius))}px Inter, sans-serif`;
        ctx.fillStyle = isHovered ? '#ffffff' : (isSearchMatch ? '#34d399' : 'rgba(226,232,240,0.85)');
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(
          node.label.length > 14 && !isSearchMatch && !isHovered ? node.label.slice(0, 13) + '…' : node.label,
          x,
          y - radius - 3
        );
      }
      
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }, []);

  // Animation loop
  useEffect(() => {
    let running = true;
    const loop = () => {
      if (!running) return;
      tick();
      render();
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(animRef.current);
    };
  }, [tick, render]);

  // Resize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.parentElement!.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement!);
    return () => ro.disconnect();
  }, []);

  // Hit-test helper
  const hitNode = (clientX: number, clientY: number): GraphNode | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const { scale, tx, ty } = transform.current;
    const cx = (clientX - rect.left - tx) / scale;
    const cy = (clientY - rect.top - ty) / scale;
    let closest: GraphNode | null = null;
    let closestDist = 20;
    for (const node of simNodes.current) {
      const dx = (node.x ?? 0) - cx;
      const dy = (node.y ?? 0) - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const radius = node.node_type === 'fir' ? 10 + node.degree * 1.5 : 8 + node.degree * 1.2;
      if (dist < radius + 6 && dist < closestDist) {
        closest = node;
        closestDist = dist;
      }
    }
    return closest;
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (dragging.current) {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      const { scale, tx, ty } = transform.current;
      dragging.current.fx = (e.clientX - rect.left - tx) / scale;
      dragging.current.fy = (e.clientY - rect.top - ty) / scale;
      setTooltip(null);
    } else if (isPanning.current) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      transform.current.tx = panStart.current.tx + dx;
      transform.current.ty = panStart.current.ty + dy;
    } else {
      const hit = hitNode(e.clientX, e.clientY);
      hovering.current = hit;
      if (hit) {
        setTooltip({ x: e.clientX, y: e.clientY, node: hit });
      } else {
        setTooltip(null);
      }
    }
  };

  const onMouseDown = (e: React.MouseEvent) => {
    const hit = hitNode(e.clientX, e.clientY);
    if (hit) {
      dragging.current = hit;
    } else {
      isPanning.current = true;
      panStart.current = {
        x: e.clientX, y: e.clientY,
        tx: transform.current.tx, ty: transform.current.ty,
      };
    }
  };

  const onMouseUp = () => {
    if (dragging.current) {
      dragging.current.fx = null;
      dragging.current.fy = null;
      dragging.current = null;
    }
    isPanning.current = false;
  };

  const onClick = (e: React.MouseEvent) => {
    const hit = hitNode(e.clientX, e.clientY);
    if (hit && onNodeClick) onNodeClick(hit);
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.91;
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const { scale, tx, ty } = transform.current;
    const newScale = Math.min(4, Math.max(0.2, scale * factor));
    transform.current = {
      scale: newScale,
      tx: mx - (mx - tx) * (newScale / scale),
      ty: my - (my - ty) * (newScale / scale),
    };
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%', cursor: dragging.current ? 'grabbing' : hovering.current ? 'pointer' : isPanning.current ? 'grabbing' : 'grab' }}
        onMouseMove={onMouseMove}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onClick={onClick}
        onWheel={onWheel}
      />
      {tooltip && (
        <div
          style={{
            position: 'fixed',
            left: tooltip.x + 14,
            top: tooltip.y - 10,
            background: 'rgba(14,8,30,0.95)',
            border: '1px solid rgba(192,132,252,0.4)',
            borderRadius: 10,
            padding: '10px 14px',
            color: '#e2e8f0',
            fontSize: 12,
            pointerEvents: 'none',
            zIndex: 9999,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            minWidth: 160,
          }}
        >
          <div style={{ fontWeight: 700, color: getColor(tooltip.node.group), marginBottom: 4 }}>{tooltip.node.label}</div>
          <div style={{ color: '#94a3b8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{tooltip.node.group} · {tooltip.node.node_type}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 12px' }}>
            <span style={{ color: '#64748b' }}>Degree</span><span style={{ color: '#c084fc' }}>{tooltip.node.degree}</span>
            <span style={{ color: '#64748b' }}>Centrality</span><span style={{ color: '#38bdf8' }}>{(tooltip.node.degree_centrality * 100).toFixed(1)}%</span>
            <span style={{ color: '#64748b' }}>Betweenness</span><span style={{ color: '#fb7185' }}>{(tooltip.node.betweenness * 100).toFixed(1)}%</span>
            {tooltip.node.district && <><span style={{ color: '#64748b' }}>District</span><span>{tooltip.node.district}</span></>}
          </div>
        </div>
      )}
    </div>
  );
}
