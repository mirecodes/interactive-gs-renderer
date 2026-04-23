import { useRef, useState, useCallback } from 'react';
import type { SceneConfig, SplatLoadState } from '../types';
import { useGaussianViewer } from '../hooks/useGaussianViewer';
import { LoadingOverlay } from './LoadingOverlay';
import './GaussianViewer.css';

interface GaussianViewerProps {
  scene: SceneConfig | null;
}

export function GaussianViewer({ scene }: GaussianViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loadStates, setLoadStates] = useState<SplatLoadState[]>([]);

  const handleLoadStateChange = useCallback((states: SplatLoadState[]) => {
    setLoadStates(states);
  }, []);

  useGaussianViewer({
    containerRef,
    scene,
    onLoadStateChange: handleLoadStateChange,
  });

  const allLoaded = loadStates.length > 0 && loadStates.every((s) => s.status === 'loaded');

  return (
    <div className="viewer-wrapper">
      <div ref={containerRef} className="viewer-canvas" />
      <LoadingOverlay loadStates={loadStates} />

      {/* Scene info badge */}
      {scene && allLoaded && (
        <div className="viewer-scene-badge">
          <span className="badge-dot" />
          <span>{scene.name}</span>
          <span className="badge-count">{scene.gaussians.length} gaussians</span>
        </div>
      )}
    </div>
  );
}
