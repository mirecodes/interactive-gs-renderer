import { useState, useEffect, useCallback } from 'react';
import type { SceneConfig, ScenesManifest } from './types';
import { GaussianViewer } from './components/GaussianViewer';
import { SceneSidebar } from './components/SceneSidebar';
import { DATA_ROOT } from './constants';
import './App.css';

export default function App() {
  const [scenes, setScenes] = useState<SceneConfig[]>([]);
  const [activeScene, setActiveScene] = useState<SceneConfig | null>(null);
  const [manifestError, setManifestError] = useState<string | null>(null);

  // Load scene manifest on mount
  useEffect(() => {
    fetch(`${DATA_ROOT}data/scenes.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        return res.json() as Promise<ScenesManifest>;
      })
      .then((manifest) => {
        setScenes(manifest.scenes);
        if (manifest.scenes.length > 0) {
          setActiveScene(manifest.scenes[0]);
        }
      })
      .catch((err) => {
        console.error('Failed to load scenes manifest:', err);
        setManifestError(String(err));
      });
  }, []);

  const handleSelectScene = useCallback((scene: SceneConfig) => {
    setActiveScene(scene);
  }, []);

  return (
    <div className="app">
      <SceneSidebar
        scenes={scenes}
        activeSceneId={activeScene?.id ?? null}
        onSelectScene={handleSelectScene}
      />

      <main className="app-main">
        {manifestError ? (
          <div className="app-error">
            <div className="app-error-icon">⚠️</div>
            <h2>Failed to load scene manifest</h2>
            <p>{manifestError}</p>
            <p className="app-error-hint">
              Make sure <code>public/data/scenes.json</code> exists and the dev server is running.
            </p>
          </div>
        ) : activeScene ? (
          <GaussianViewer scene={activeScene} />
        ) : (
          <div className="app-placeholder">
            <div className="placeholder-icon">◎</div>
            <p>Loading scenes…</p>
          </div>
        )}
      </main>
    </div>
  );
}
