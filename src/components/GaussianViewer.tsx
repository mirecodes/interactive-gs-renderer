import { useRef, useState, useCallback, useEffect } from 'react';
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
  
  // UI Controls State
  const [meshVisible, setMeshVisible] = useState(false);
  const [globalRotation, setGlobalRotation] = useState(0);
  const [jointValues, setJointValues] = useState<Record<string, number>>({});

  const handleLoadStateChange = useCallback((states: SplatLoadState[]) => {
    setLoadStates(states);
  }, []);

  const { joints } = useGaussianViewer({
    containerRef,
    scene,
    onLoadStateChange: handleLoadStateChange,
    meshVisible,
    globalRotation,
    jointValues,
  });

  // Initialize joint values when joints are discovered
  useEffect(() => {
    if (joints.length > 0) {
      const initial: Record<string, number> = {};
      joints.forEach(j => {
        initial[j.name] = j.value;
      });
      setJointValues(initial);
    }
  }, [joints]);

  const allLoaded = loadStates.length > 0 && loadStates.every((s) => s.status === 'loaded');

  const handleJointChange = (name: string, value: number) => {
    setJointValues(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div className="viewer-wrapper">
      <div ref={containerRef} className="viewer-canvas" />
      <LoadingOverlay loadStates={loadStates} />

      {/* Control Panel */}
      {scene && (
        <div className="viewer-controls-panel">
          <div className="control-group">
            <div className="control-header">
              <h3>Controls</h3>
              <div className="toggle-container">
                <label>Mesh</label>
                <input 
                  type="checkbox" 
                  checked={meshVisible} 
                  onChange={(e) => setMeshVisible(e.target.checked)} 
                />
              </div>
            </div>
            
            <div className="control-item">
              <label>Global Rotation (Z)</label>
              <input 
                type="range" 
                min="-180" 
                max="180" 
                value={globalRotation} 
                onChange={(e) => setGlobalRotation(parseFloat(e.target.value))} 
              />
              <span className="value-label">{globalRotation}°</span>
            </div>
          </div>

          {joints.length > 0 && (
            <div className="control-group">
              <div className="control-header">
                <h3>Joints</h3>
              </div>
              {joints.map(joint => (
                <div key={joint.name} className="control-item">
                  <label>{joint.name}</label>
                  <input 
                    type="range" 
                    min={joint.min} 
                    max={joint.max} 
                    step="0.1"
                    value={jointValues[joint.name] ?? joint.value} 
                    onChange={(e) => handleJointChange(joint.name, parseFloat(e.target.value))} 
                  />
                  <span className="value-label">
                    {(jointValues[joint.name] ?? joint.value).toFixed(1)}
                    {joint.type === 'revolute' ? '°' : 'm'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
