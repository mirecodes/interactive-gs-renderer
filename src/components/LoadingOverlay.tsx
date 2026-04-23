import type { SplatLoadState } from '../types';
import './LoadingOverlay.css';

interface LoadingOverlayProps {
  loadStates: SplatLoadState[];
}

export function LoadingOverlay({ loadStates }: LoadingOverlayProps) {
  const allLoaded = loadStates.length > 0 && loadStates.every((s) => s.status === 'loaded');
  const hasError = loadStates.some((s) => s.status === 'error');

  if (allLoaded) return null;

  return (
    <div className="loading-overlay">
      <div className="loading-panel">
        <div className="loading-logo">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="22" stroke="url(#grad)" strokeWidth="2" />
            <circle cx="24" cy="24" r="12" fill="url(#grad)" opacity="0.3" />
            <circle cx="24" cy="24" r="6" fill="url(#grad)" opacity="0.8" />
            <defs>
              <linearGradient id="grad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
                <stop stopColor="#0ea5e9" />
                <stop offset="1" stopColor="#38bdf8" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        <h3 className="loading-title">Loading Gaussian Splats</h3>

        {hasError && (
          <p className="loading-error-hint">
            Some files failed to load. Check browser console and ensure PLY files are in{' '}
            <code>public/data/&lt;scene&gt;/gaussian/</code>.
          </p>
        )}

        <div className="loading-items">
          {loadStates.map((state) => (
            <div key={state.gaussianId} className="loading-item">
              <div className="loading-item-header">
                <span className="loading-item-label">{state.label}</span>
                <span className={`loading-item-status status-${state.status}`}>
                  {state.status === 'loading' && `${state.progress}%`}
                  {state.status === 'loaded' && '✓'}
                  {state.status === 'error' && '✗'}
                  {state.status === 'idle' && '—'}
                </span>
              </div>
              <div className="loading-bar-track">
                <div
                  className={`loading-bar-fill fill-${state.status}`}
                  style={{ width: `${state.progress}%` }}
                />
              </div>
              {state.errorMsg && (
                <p className="loading-error-msg">{state.errorMsg}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
