'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import { rupees } from '@/lib/client/api';

// The force-graph library touches `window`, so it only loads in the browser.
const ForceGraph2D = dynamic(() => import('./force-graph-inner'), { ssr: false });

export type GraphNode = {
  id: string;
  name: string;
  vpa: string;
  ageDays: number;
  role: 'centre' | 'sender' | 'receiver' | 'both';
  receivedPaise: number;
  sentPaise: number;
  hop: number;
};
export type GraphEdge = { source: string; target: string; amountPaise: number; count: number };

const COLORS = {
  centre: '#b91c1c',
  young: '#f59e0b',
  sender: '#64748b',
  receiver: '#0d9488',
};

function colorFor(n: GraphNode) {
  if (n.role === 'centre') return COLORS.centre;
  if (n.ageDays < 21) return COLORS.young;
  if (n.role === 'sender') return COLORS.sender;
  return COLORS.receiver;
}

/**
 * Money-flow network around one account. Arrows show direction, line width
 * shows amount, red is the account under investigation, amber marks young
 * accounts that receive and forward money (likely mules).
 */
export function NetworkGraph({
  nodes,
  edges,
  onSelect,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onSelect?: (n: GraphNode) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.floor(entry.contentRect.width))));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  const maxEdge = Math.max(1, ...edges.map((e) => e.amountPaise));
  const data = useMemo(
    () => ({
      nodes: nodes.map((n) => ({ ...n })),
      links: edges.map((e) => ({ ...e })),
    }),
    [nodes, edges],
  );

  return (
    <div ref={wrap} className="relative w-full overflow-hidden rounded-lg border border-border bg-[#fbfcfd]" data-testid="network-graph">
      <ForceGraph2D
        graphData={data}
        width={width}
        height={460}
        cooldownTicks={120}
        nodeRelSize={4}
        nodeVal={(n) => {
          const node = n as GraphNode;
          return node.role === 'centre' ? 12 : node.ageDays < 21 ? 7 : 1.5;
        }}
        nodeColor={(n) => colorFor(n as GraphNode)}
        nodeLabel={(n) => {
          const node = n as GraphNode;
          return `${node.name} (${node.vpa})\nAccount age: ${node.ageDays} days\nReceived ${rupees(node.receivedPaise)} · Sent ${rupees(node.sentPaise)}`;
        }}
        linkDirectionalArrowLength={4}
        linkDirectionalArrowRelPos={1}
        linkColor={() => 'rgba(15,42,74,0.28)'}
        linkWidth={(l) => 0.6 + 4 * ((l as GraphEdge).amountPaise / maxEdge)}
        linkLabel={(l) => {
          const e = l as GraphEdge;
          return `${rupees(e.amountPaise)} in ${e.count} payment${e.count === 1 ? '' : 's'}`;
        }}
        onNodeClick={(n) => onSelect?.(n as GraphNode)}
        nodeCanvasObjectMode={() => 'after'}
        nodeCanvasObject={(n, ctx, scale) => {
          const node = n as GraphNode & { x?: number; y?: number };
          if (node.role !== 'centre' && node.ageDays >= 21) return;
          const label = node.name;
          ctx.font = `${Math.max(3, 11 / scale)}px Inter, sans-serif`;
          ctx.fillStyle = '#0f1b2d';
          ctx.textAlign = 'center';
          ctx.fillText(label, node.x ?? 0, (node.y ?? 0) + (node.role === 'centre' ? 18 : 13) / Math.min(scale, 2));
        }}
      />
      <div className="pointer-events-none absolute left-2 top-2 flex flex-wrap gap-2 rounded bg-white/90 px-2 py-1 text-[11px]">
        {[
          ['Under investigation', COLORS.centre],
          ['Young account (<21 days)', COLORS.young],
          ['Sender', COLORS.sender],
          ['Other receiver', COLORS.receiver],
        ].map(([label, color]) => (
          <span key={label} className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
