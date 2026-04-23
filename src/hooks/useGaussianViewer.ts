import { useEffect, useCallback, useRef } from 'react';
import * as THREE from 'three';
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark';
import URDFLoader from 'urdf-loader';
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
  const robotRef = useRef<any>(null);

  const setJointValue = useCallback((jointName: string, value: number) => {
    if (robotRef.current && robotRef.current.joints[jointName]) {
      const joint = robotRef.current.joints[jointName];
      // Convert degrees to radians for revolute joints
      const radians = (joint.jointType === 'revolute' || joint.jointType === 'continuous') 
        ? value * (Math.PI / 180) 
        : value;
      robotRef.current.setJointValue(jointName, radians);
      robotRef.current.updateMatrixWorld(true);
    }
  }, []);

  useEffect(() => {
    if (!containerRef.current || !scene) return;
    const container = containerRef.current;

    let aborted = false;

    // 1. Setup Three.js
    const width = container.clientWidth;
    const height = container.clientHeight;
    const scene3D = new THREE.Scene();
    scene3D.background = new THREE.Color(0x0a0a0a);

    const camera = new THREE.PerspectiveCamera(60, width / height, 0.01, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    // 2. Setup Spark Renderer
    const spark = new SparkRenderer({ renderer });
    scene3D.add(spark);

    // Initial Load States
    const loadStates: SplatLoadState[] = scene.gaussians.map((g) => ({
      gaussianId: g.id,
      label: g.label,
      status: 'loading',
      progress: 0,
    }));
    onLoadStateChange([...loadStates]);

    const initScene = async () => {
      // 3. Fetch configs.yml
      let cameraPos = new THREE.Vector3(-3, 3, 3);
      let initialJoints: Record<string, number> = {};
      
      try {
        const res = await fetch('/cfgs/configs.yml');
        if (res.ok) {
          const text = await res.text();
          const config = yaml.load(text) as any;
          if (config && config[scene.id] && config[scene.id].ours) {
            const ours = config[scene.id].ours;
            if (ours.camera_pos) cameraPos.set(ours.camera_pos[0], ours.camera_pos[1], ours.camera_pos[2]);
            if (ours.joint_values) initialJoints = ours.joint_values;
          }
        }
      } catch (e) {
        console.warn('Failed to load configs.yml', e);
      }

      if (aborted) return;

      // 4. Load URDF
      const loader = new URDFLoader();
      const urdfPath = `/data/${scene.path}/urdf/object.urdf`;
      
      try {
        const robot = await new Promise<any>((resolve, reject) => {
          loader.load(urdfPath, (robot) => resolve(robot), undefined, (err) => reject(err));
        });

        if (aborted) return;
        robotRef.current = robot;
        scene3D.add(robot);

        // [IMPORTANT] First, set robot to zero pose to calculate the reconstruction offset
        Object.keys(robot.joints).forEach(j => robot.setJointValue(j, 0));
        robot.updateMatrixWorld(true);

        // 5. Attach SplatMesh to URDF Links
        const basePath = `/data/${scene.path}/gaussian`;

        Object.keys(robot.links).forEach((linkName) => {
          const link = robot.links[linkName];
          let gaussianIndex = -1;
          
          const match = linkName.match(/link_(\d+)/);
          if (match) {
            const id = parseInt(match[1]);
            gaussianIndex = scene.gaussians.findIndex(g => g.id === id || g.file.includes(`gaussian_${id}`));
          } else if (linkName === 'base' || linkName === 'base_link') {
            gaussianIndex = scene.gaussians.findIndex(g => g.id === 0 || g.file.includes('gaussian_0'));
          }

          if (gaussianIndex !== -1) {
            const g = scene.gaussians[gaussianIndex];
            const splatURL = `${basePath}/${g.file.replace('.ply', '.splat')}`;
            const splatMesh = new SplatMesh({ url: splatURL });
            
            // Hide original meshes
            link.traverse((c: any) => { if (c.isMesh) c.visible = false; });

            // [FIX] Coordinate Alignment
            // The Gaussian splats are assumed to be in the "World" reconstruction space.
            // To make them move with the URDF links, we must calculate their local position 
            // relative to the link at the current (zero) pose.
            const inverseWorldMatrix = new THREE.Matrix4().copy(link.matrixWorld).invert();
            splatMesh.applyMatrix4(inverseWorldMatrix);
            
            link.add(splatMesh);

            loadStates[gaussianIndex] = { ...loadStates[gaussianIndex], status: 'loaded', progress: 100 };
            onLoadStateChange([...loadStates]);
          }
        });

        // 6. Apply target joint values after attachment
        Object.entries(initialJoints).forEach(([name, val]) => {
          setJointValue(name, val);
        });
        robot.updateMatrixWorld(true);

        // Set camera
        camera.position.copy(cameraPos);
        camera.up.set(0, 1, 0);
        camera.lookAt(0, 0, 0);

      } catch (err) {
        console.error('Failed to load URDF or Splats:', err);
        if (!aborted) onLoadStateChange(loadStates.map(s => ({ ...s, status: 'error', errorMsg: String(err) })));
      }

      // 7. Animation loop
      renderer.setAnimationLoop(() => {
        if (!aborted) renderer.render(scene3D, camera);
      });
    };

    initScene();

    const handleResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      aborted = true;
      window.removeEventListener('resize', handleResize);
      renderer.setAnimationLoop(null);
      renderer.dispose();
      while (container.firstChild) container.removeChild(container.firstChild);
    };
  }, [scene, containerRef, onLoadStateChange, setJointValue]);

  return { setJointValue };
}
