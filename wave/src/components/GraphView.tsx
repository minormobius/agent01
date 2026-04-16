import { useRef, useEffect, useCallback } from 'react';
import type { NoteStub } from '../lib/wiki';

interface Props {
  stubs: NoteStub[];
  activeRkey: string | null;
  onSelect: (rkey: string) => void;
}

interface GraphNode {
  rkey: string;
  title: string;
  x: number; y: number;
  vx: number; vy: number;
  linkCount: number;
}

interface GraphEdge { source: string; target: string; }

export function GraphView({ stubs, activeRkey, onSelect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);
  const animRef = useRef<number>(0);
  const dragRef = useRef<{ node: GraphNode; offsetX: number; offsetY: number } | null>(null);
  const panRef = useRef({ x: 0, y: 0 });
  const scaleRef = useRef(1);
  const isPanningRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const rkeySet = new Set(stubs.map(s => s.rkey));
    const edges: GraphEdge[] = [];
    for (const s of stubs) {
      for (const target of s.outgoingLinks) {
        if (rkeySet.has(target)) edges.push({ source: s.rkey, target });
      }
    }
    edgesRef.current = edges;

    const linkCount = new Map<string, number>();
    for (const e of edges) {
      linkCount.set(e.source, (linkCount.get(e.source) || 0) + 1);
      linkCount.set(e.target, (linkCount.get(e.target) || 0) + 1);
    }

    const existing = new Map(nodesRef.current.map(n => [n.rkey, n]));
    const cx = (canvasRef.current?.width || 800) / 2;
    const cy = (canvasRef.current?.height || 600) / 2;

    nodesRef.current = stubs.map(s => {
      const prev = existing.get(s.rkey);
      return {
        rkey: s.rkey,
        title: s.title || 'Untitled',
        x: prev?.x ?? cx + (Math.random() - 0.5) * 300,
        y: prev?.y ?? cy + (Math.random() - 0.5) * 300,
        vx: 0, vy: 0,
        linkCount: linkCount.get(s.rkey) || 0,
      };
    });
  }, [stubs]);

  const tick = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const nodes = nodesRef.current;
    const edges = edgesRef.current;
    const nodeMap = new Map(nodes.map(n => [n.rkey, n]));
    const cx = canvas.width / 2, cy = canvas.height / 2;

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = 2000 / (dist * dist);
        dx = (dx / dist) * force; dy = (dy / dist) * force;
        a.vx -= dx; a.vy -= dy; b.vx += dx; b.vy += dy;
      }
    }

    for (const e of edges) {
      const a = nodeMap.get(e.source), b = nodeMap.get(e.target);
      if (!a || !b) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = (dist - 120) * 0.005;
      const fx = (dx / dist) * force, fy = (dy / dist) * force;
      a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
    }

    for (const n of nodes) {
      if (dragRef.current?.node === n) continue;
      n.vx += (cx - n.x) * 0.001; n.vy += (cy - n.y) * 0.001;
      n.vx *= 0.85; n.vy *= 0.85;
      n.x += n.vx; n.y += n.vy;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(panRef.current.x, panRef.current.y);
    ctx.scale(scaleRef.current, scaleRef.current);

    ctx.strokeStyle = 'rgba(120, 120, 140, 0.3)';
    ctx.lineWidth = 1;
    for (const e of edges) {
      const a = nodeMap.get(e.source), b = nodeMap.get(e.target);
      if (!a || !b) continue;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }

    for (const n of nodes) {
      const r = 5 + n.linkCount * 2;
      const isActive = n.rkey === activeRkey;
      ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fillStyle = isActive ? '#6366f1' : n.linkCount > 0 ? '#64748b' : '#94a3b8';
      ctx.fill();
      if (isActive) { ctx.strokeStyle = '#818cf8'; ctx.lineWidth = 2; ctx.stroke(); }
      ctx.fillStyle = '#e2e8f0';
      ctx.font = `${isActive ? 'bold ' : ''}11px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(n.title.slice(0, 24), n.x, n.y + r + 14);
    }

    ctx.restore();
    animRef.current = requestAnimationFrame(tick);
  }, [activeRkey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      canvas.width = canvas.parentElement?.clientWidth || 800;
      canvas.height = canvas.parentElement?.clientHeight || 600;
    };
    resize();
    window.addEventListener('resize', resize);
    animRef.current = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(animRef.current); window.removeEventListener('resize', resize); };
  }, [tick]);

  const screenToWorld = (sx: number, sy: number) => ({
    x: (sx - panRef.current.x) / scaleRef.current,
    y: (sy - panRef.current.y) / scaleRef.current,
  });

  const findNode = (wx: number, wy: number): GraphNode | null => {
    for (const n of nodesRef.current) {
      const r = 5 + n.linkCount * 2 + 4;
      const dx = n.x - wx, dy = n.y - wy;
      if (dx * dx + dy * dy < r * r) return n;
    }
    return null;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const w = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    const node = findNode(w.x, w.y);
    if (node) {
      dragRef.current = { node, offsetX: w.x - node.x, offsetY: w.y - node.y };
    } else {
      isPanningRef.current = true;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragRef.current) {
      const rect = canvasRef.current!.getBoundingClientRect();
      const w = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      dragRef.current.node.x = w.x - dragRef.current.offsetX;
      dragRef.current.node.y = w.y - dragRef.current.offsetY;
      dragRef.current.node.vx = 0; dragRef.current.node.vy = 0;
    } else if (isPanningRef.current) {
      panRef.current.x += e.clientX - lastMouseRef.current.x;
      panRef.current.y += e.clientY - lastMouseRef.current.y;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (dragRef.current && !isPanningRef.current) {
      const rect = canvasRef.current!.getBoundingClientRect();
      const w = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      const node = findNode(w.x, w.y);
      if (node) onSelect(node.rkey);
    }
    dragRef.current = null;
    isPanningRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    panRef.current.x = mx - (mx - panRef.current.x) * delta;
    panRef.current.y = my - (my - panRef.current.y) * delta;
    scaleRef.current *= delta;
  };

  return (
    <div className="wave-graph">
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      />
    </div>
  );
}
