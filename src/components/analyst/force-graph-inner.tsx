'use client';

import { useRef } from 'react';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';
import type { ComponentProps } from 'react';

/** Loaded only in the browser (see network-graph.tsx). Zooms to fit once the layout settles. */
export default function ForceGraphInner(props: ComponentProps<typeof ForceGraph2D>) {
  const ref = useRef<ForceGraphMethods | undefined>(undefined);
  return (
    <ForceGraph2D
      {...props}
      ref={ref}
      onEngineStop={() => ref.current?.zoomToFit(400, 30)}
    />
  );
}
