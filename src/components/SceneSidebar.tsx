import type { SceneConfig } from '../types';
import './SceneSidebar.css';

interface SceneSidebarProps {
  scenes: SceneConfig[];
  activeSceneId: string | null;
  onSelectScene: (scene: SceneConfig) => void;
}

export function SceneSidebar({ scenes, activeSceneId, onSelectScene }: SceneSidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="url(#sg)" strokeWidth="1.5" />
            <circle cx="12" cy="12" r="5" fill="url(#sg)" opacity="0.5" />
            <circle cx="12" cy="12" r="2.5" fill="url(#sg)" />
            <defs>
              <linearGradient id="sg" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
                <stop stopColor="#0ea5e9" />
                <stop offset="1" stopColor="#38bdf8" />
              </linearGradient>
            </defs>
          </svg>
        </div>
        <div>
          <h1 className="sidebar-title">GS Viewer</h1>
          <p className="sidebar-subtitle">Gaussian Splatting 3D</p>
        </div>
      </div>

      <div className="sidebar-section-label">Scenes</div>
      <nav className="sidebar-nav">
        {scenes.length === 0 && (
          <div className="sidebar-empty">No scenes found</div>
        )}
        {scenes.map((scene) => (
          <button
            key={scene.id}
            className={`scene-item ${activeSceneId === scene.id ? 'active' : ''}`}
            onClick={() => onSelectScene(scene)}
          >
            <div className="scene-item-icon">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" />
                <circle cx="8" cy="8" r="3" fill="currentColor" opacity="0.4" />
                <circle cx="8" cy="8" r="1.5" fill="currentColor" />
              </svg>
            </div>
            <div className="scene-item-content">
              <span className="scene-item-name">{scene.name}</span>
              <span className="scene-item-meta">
                {scene.gaussians.length} gaussian{scene.gaussians.length !== 1 ? 's' : ''}
              </span>
            </div>
            {activeSceneId === scene.id && (
              <span className="scene-item-active-dot" />
            )}
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <p className="sidebar-footer-text">
          Files: <code>public/data/&lt;scene&gt;/gaussian/*.ply</code>
        </p>
      </div>
    </aside>
  );
}
