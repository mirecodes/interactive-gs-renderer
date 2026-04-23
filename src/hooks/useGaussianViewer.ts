import { useEffect, useCallback, useRef, useState } from 'react';
import * as THREE from 'three';
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark';
import URDFLoader from 'urdf-loader';
import type { SceneConfig, SplatLoadState } from '../types';
import yaml from 'js-yaml';

interface JointInfo {
  name: string;
  type: string;
  min: number;
  max: number;
  value: number;
}

interface UseGaussianViewerOptions {
  containerRef: React.RefObject<HTMLDivElement | null>;
  scene: SceneConfig | null;
  onLoadStateChange: (states: SplatLoadState[]) => void;
  meshVisible: boolean;
  globalRotation: number;
  jointValues: Record<string, number>;
}

export function useGaussianViewer({
  containerRef,
  scene,
  onLoadStateChange,
  meshVisible,
  globalRotation,
  jointValues,
}: UseGaussianViewerOptions) {
  const robotRef = useRef<any>(null);
  const [joints, setJoints] = useState<JointInfo[]>([]);

  // Function to sync visibility across all meshes
  const syncMeshVisibility = useCallback((visible: boolean) => {
    if (robotRef.current) {
      robotRef.current.traverse((obj: any) => {
        // Spark.js SplatMesh usually isn't a standard THREE.Mesh, 
        // but we check isSplatMesh to be safe.
        if (obj.isMesh && !obj.isSplatMesh) {
          obj.visible = visible;
        }
      });
    }
  }, []);

  // Update visibility when toggle changes
  useEffect(() => {
    syncMeshVisibility(meshVisible);
  }, [meshVisible, syncMeshVisibility]);

  // Handle global rotation (Z-axis)
  useEffect(() => {
    if (robotRef.current) {
      robotRef.current.rotation.z = globalRotation * (Math.PI / 180);
    }
  }, [globalRotation]);

  // Handle joint updates
  useEffect(() => {
    if (robotRef.current) {
      Object.entries(jointValues).forEach(([name, val]) => {
        if (robotRef.current.joints[name]) {
          const joint = robotRef.current.joints[name];
          const radians = (joint.jointType === 'revolute' || joint.jointType === 'continuous') 
            ? val * (Math.PI / 180) 
            : val;
          robotRef.current.setJointValue(name, radians);
        }
      });
      robotRef.current.updateMatrixWorld(true);
    }
  }, [jointValues]);

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

    const spark = new SparkRenderer({ renderer });
    scene3D.add(spark);

    const loadStates: SplatLoadState[] = scene.gaussians.map((g) => ({
      gaussianId: g.id,
      label: g.label,
      status: 'loading',
      progress: 0,
    }));
    onLoadStateChange([...loadStates]);

    const initScene = async () => {
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

      const loader = new URDFLoader();
      const urdfPath = `/data/${scene.path}/urdf/object.urdf`;
      
      try {
        const robot = await new Promise<any>((resolve, reject) => {
          loader.load(urdfPath, (robot) => resolve(robot), undefined, (err) => reject(err));
        });

        if (aborted) return;
        robotRef.current = robot;
        scene3D.add(robot);

        const discoveredJoints: JointInfo[] = [];
        Object.keys(robot.joints).forEach(name => {
          const joint = robot.joints[name];
          if (joint.jointType !== 'fixed') {
            discoveredJoints.push({
              name,
              type: joint.jointType,
              min: joint.limit ? (joint.jointType === 'revolute' ? joint.limit.lower * (180 / Math.PI) : joint.limit.lower) : -180,
              max: joint.limit ? (joint.jointType === 'revolute' ? joint.limit.upper * (180 / Math.PI) : joint.limit.upper) : 180,
              value: initialJoints[name] ?? 0,
            });
          }
        });
        setJoints(discoveredJoints);

        robot.updateMatrixWorld(true);

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
            (splatMesh as any).isSplatMesh = true;

            const inverseWorldMatrix = new THREE.Matrix4().copy(link.matrixWorld).invert();
            splatMesh.applyMatrix4(inverseWorldMatrix);
            link.add(splatMesh);

            loadStates[gaussianIndex] = { ...loadStates[gaussianIndex], status: 'loaded', progress: 100 };
            onLoadStateChange([...loadStates]);
          }
        });

        // Ensure meshes are hidden/shown correctly after initial load
        syncMeshVisibility(meshVisible);

        Object.entries(initialJoints).forEach(([name, val]) => {
          if (robot.joints[name]) {
            const joint = robot.joints[name];
            const radians = (joint.jointType === 'revolute' || joint.jointType === 'continuous') 
              ? val * (Math.PI / 180) 
              : val;
            robot.setJointValue(name, radians);
          }
        });
        robot.updateMatrixWorld(true);

        camera.position.copy(cameraPos);
        camera.up.set(0, 1, 0);
        camera.lookAt(0, 0, 0);

      } catch (err) {
        console.error('Failed to load URDF or Splats:', err);
        if (!aborted) onLoadStateChange(loadStates.map(s => ({ ...s, status: 'error', errorMsg: String(err) })));
      }

      renderer.setAnimationLoop(() => {
        if (!aborted) {
          // One more visibility sync just in case of lazy loading of meshes
          if (robotRef.current) syncMeshVisibility(meshVisible);
          renderer.render(scene3D, camera);
        }
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
  }, [scene, containerRef, onLoadStateChange, meshVisible, syncMeshVisibility]);

  return { joints };
}
