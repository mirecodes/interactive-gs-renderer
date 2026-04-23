import { useEffect } from 'react';
import * as THREE from 'three';
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark';
import type { SceneConfig, SplatLoadState } from '../types';
import yaml from 'js-yaml';

interface UseGaussianViewerOptions {
  containerRef: React.RefObject<HTMLDivElement | null>;
  scene: SceneConfig | null;
  onLoadStateChange: (states: SplatLoadState[]) => void;
}

export function useGaussianViewer({
  containerRef,
  scene,
  onLoadStateChange,
}: UseGaussianViewerOptions) {
  useEffect(() => {
    if (!containerRef.current || !scene) return;
    const container = containerRef.current;

    let aborted = false;

    // 1. Setup Three.js
    const width = container.clientWidth;
    const height = container.clientHeight;
    const scene3D = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.01, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    // 2. Setup Spark Renderer (Crucial for SplatMesh to work)
    const spark = new SparkRenderer({ renderer });
    scene3D.add(spark);

    // 3. Initial Load States
    const loadStates: SplatLoadState[] = scene.gaussians.map((g) => ({
      gaussianId: g.id,
      label: g.label,
      status: 'loading',
      progress: 0,
    }));
    onLoadStateChange([...loadStates]);

    const initScene = async () => {
      // 4. Fetch camera position from configs.yml
      let cameraPos = new THREE.Vector3(-3, 3, 3);
      try {
        const res = await fetch('/cfgs/configs.yml');
        if (res.ok) {
          const text = await res.text();
          const config = yaml.load(text) as any;
          if (config && config[scene.id] && config[scene.id].ours && config[scene.id].ours.camera_pos) {
            const pos = config[scene.id].ours.camera_pos;
            cameraPos.set(pos[0], pos[1], pos[2]);
          }
        }
      } catch (e) {
        console.warn('Failed to load configs.yml', e);
      }

      if (aborted) return;

      // Set camera
      camera.position.copy(cameraPos);
      camera.up.set(0, 1, 0); // Standard Y-up
      camera.lookAt(0, 0, 0); // Always look at origin

      // 5. Load ALL Gaussians for the scene
      const basePath = `/data/${scene.path}/gaussian`;

      try {
        await Promise.all(
          scene.gaussians.map(async (g, index) => {
            // Using .splat files for performance
            const url = `${basePath}/${g.file.replace('.ply', '.splat')}`;
            
            const splatMesh = new SplatMesh({ url });
            // Spark.js handles the loading in the background.
            // All splats should be centered at origin to form the full object.
            splatMesh.position.set(0, 0, 0);
            scene3D.add(splatMesh);

            if (aborted) return;
            
            loadStates[index] = {
              ...loadStates[index],
              status: 'loaded',
              progress: 100,
            };
            onLoadStateChange([...loadStates]);
          })
        );
      } catch (err) {
        console.error('Failed to load multiple spark.js splats:', err);
        if (!aborted) {
          const errorStates = loadStates.map((s) => ({
            ...s,
            status: s.status === 'loaded' ? 'loaded' : 'error' as const,
            errorMsg: err instanceof Error ? err.message : String(err),
          }));
          onLoadStateChange(errorStates);
        }
      }

      // 6. Animation loop
      renderer.setAnimationLoop(() => {
        if (!aborted) {
          renderer.render(scene3D, camera);
        }
      });
    };

    initScene();

    // Handle Resize
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // 7. Cleanup
    return () => {
      aborted = true;
      window.removeEventListener('resize', handleResize);
      renderer.setAnimationLoop(null);
      renderer.dispose();
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
    };
  }, [scene, containerRef, onLoadStateChange]);

  return { viewerRef: { current: null } };
}
