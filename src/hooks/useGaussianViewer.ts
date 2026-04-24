import { useEffect, useCallback, useRef, useState } from 'react';
import * as THREE from 'three';
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark';
import URDFLoader from 'urdf-loader';
// @ts-ignore
import { OrbitControls } from 'three/addons/controls/OrbitControls';
import type { SceneConfig, SplatLoadState } from '../types';
import yaml from 'js-yaml';
import { DATA_ROOT } from '../constants';

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
  showJoints: boolean;
  showGrid: boolean;
}



export function useGaussianViewer({
  containerRef,
  scene,
  onLoadStateChange,
  meshVisible,
  globalRotation,
  jointValues,
  showJoints,
  showGrid,
}: UseGaussianViewerOptions) {
  const robotRef = useRef<any>(null);
  const jointHelpersRef = useRef<THREE.Group | null>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);
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

  // Update joint helpers visibility
  useEffect(() => {
    if (jointHelpersRef.current) {
      jointHelpersRef.current.visible = showJoints;
    }
  }, [showJoints]);

  // Update grid visibility
  useEffect(() => {
    if (gridRef.current) {
      gridRef.current.visible = showGrid;
    }
  }, [showGrid]);

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
    camera.up.set(0, 0, 1); // Set Z-up before OrbitControls
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    const spark = new SparkRenderer({ renderer });
    scene3D.add(spark);

    // 1.5. Setup View Gizmo (Corner Cube)
    const gizmoSize = 120;
    const gizmoScene = new THREE.Scene();
    const gizmoCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 10);
    gizmoCamera.up.set(0, 0, 1);
    gizmoCamera.position.set(0, 0, 3);

    // Create a cube with semi-transparent gray faces and axis labels
    const createFaceTexture = (text: string, color: string) => {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = 'rgba(40, 44, 52, 0.7)';
      ctx.fillRect(0, 0, 128, 128);
      ctx.strokeStyle = color;
      ctx.lineWidth = 16;
      ctx.strokeRect(0, 0, 128, 128);
      ctx.fillStyle = 'white';
      ctx.font = 'bold 54px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 64, 64);
      return new THREE.CanvasTexture(canvas);
    };

    const cubeGeom = new THREE.BoxGeometry(1, 1, 1);
    const materials = [
      new THREE.MeshBasicMaterial({ map: createFaceTexture('X+', '#ff3b30'), transparent: true }), // iOS-style Red
      new THREE.MeshBasicMaterial({ map: createFaceTexture('X-', '#ff3b30'), transparent: true }),
      new THREE.MeshBasicMaterial({ map: createFaceTexture('Y+', '#34c759'), transparent: true }), // iOS-style Green
      new THREE.MeshBasicMaterial({ map: createFaceTexture('Y-', '#34c759'), transparent: true }),
      new THREE.MeshBasicMaterial({ map: createFaceTexture('Z+', '#007aff'), transparent: true }), // iOS-style Blue
      new THREE.MeshBasicMaterial({ map: createFaceTexture('Z-', '#007aff'), transparent: true }),
    ];
    const gizmoCube = new THREE.Mesh(cubeGeom, materials);
    gizmoScene.add(gizmoCube);

    // Subtle axis lines
    const axesHelper = new THREE.AxesHelper(1.0);
    gizmoScene.add(axesHelper);

    const grid = new THREE.GridHelper(20, 20, 0x444444, 0x222222);
    grid.rotation.x = Math.PI / 2;
    grid.visible = showGrid;
    gridRef.current = grid;
    scene3D.add(grid);

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
        const res = await fetch(`${DATA_ROOT}cfgs/configs.yml`);
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
      const urdfPath = `${DATA_ROOT}data/${scene.path}/urdf/object.urdf`;
      
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

        const basePath = `${DATA_ROOT}data/${scene.path}/gaussian`;

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

        // 3. Create Joint Helpers
        const jointHelpers = new THREE.Group();
        jointHelpers.visible = showJoints;
        jointHelpersRef.current = jointHelpers;
        scene3D.add(jointHelpers);

        // Calculate bounding box to scale joint helpers
        robot.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(robot);
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        // Use a reasonable heuristic: scale proportional to max dimension, but clamped
        const helperScale = maxDim > 0 ? maxDim : 1.0;

        Object.keys(robot.joints).forEach(name => {
          const joint = robot.joints[name];
          if (joint.jointType === 'fixed') return;

          // Create a helper for the joint
          // We'll use a cylinder to represent the joint axis
          const isRevolute = joint.jointType === 'revolute' || joint.jointType === 'continuous';
          const color = isRevolute ? 0xffea00 : 0x3b82f6; // Yellow or Blue
          
          const radius = 0.0075 * helperScale;
          const length = 0.4 * helperScale;
          const geometry = new THREE.CylinderGeometry(radius, radius, length, 8);
          const material = new THREE.MeshBasicMaterial({ 
            color, 
            depthTest: false, // Make it visible through parts
            transparent: true,
            opacity: 0.6
          });
          const cylinder = new THREE.Mesh(geometry, material);
          cylinder.renderOrder = 999; // Render on top

          // Align cylinder (default up is Y) with joint axis
          const axis = joint.axis || new THREE.Vector3(1, 0, 0);
          const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.clone().normalize());
          cylinder.quaternion.copy(quaternion);

          // Create a wrapper that we'll add to the joint helpers group
          // but we want it to follow the joint's world position
          const helperWrapper = new THREE.Group();
          helperWrapper.add(cylinder);
          jointHelpers.add(helperWrapper);

          // Store reference to update position
          (joint as any).helper = helperWrapper;
        });

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
        camera.lookAt(0, 0, 0);
        controls.update();

      } catch (err) {
        console.error('Failed to load URDF or Splats:', err);
        if (!aborted) onLoadStateChange(loadStates.map(s => ({ ...s, status: 'error', errorMsg: String(err) })));
      }

      renderer.setAnimationLoop(() => {
        if (!aborted) {
          // One more visibility sync just in case of lazy loading of meshes
          if (robotRef.current) {
            syncMeshVisibility(meshVisible);
            
            // Update joint helper positions
            Object.values(robotRef.current.joints).forEach((joint: any) => {
              if (joint.helper) {
                const worldPos = new THREE.Vector3();
                const worldQuat = new THREE.Quaternion();
                joint.getWorldPosition(worldPos);
                joint.getWorldQuaternion(worldQuat);
                joint.helper.position.copy(worldPos);
                joint.helper.quaternion.copy(worldQuat);
              }
            });
          }
          controls.update();

          // Render Main Scene
          const size = new THREE.Vector2();
          renderer.getSize(size);
          const currentWidth = size.width;
          const currentHeight = size.height;

          renderer.setViewport(0, 0, currentWidth, currentHeight);
          renderer.setScissorTest(false);
          renderer.render(scene3D, camera);

          // Render Gizmo Scene in Corner
          const padding = 20;
          renderer.setScissorTest(true);
          renderer.setScissor(currentWidth - gizmoSize - padding, padding, gizmoSize, gizmoSize);
          renderer.setViewport(currentWidth - gizmoSize - padding, padding, gizmoSize, gizmoSize);
          
          // Sync gizmo camera orientation
          gizmoCamera.position.copy(camera.position).sub(controls.target).normalize().multiplyScalar(3);
          gizmoCamera.lookAt(0, 0, 0);
          
          renderer.render(gizmoScene, gizmoCamera);
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
  }, [scene, containerRef, onLoadStateChange]); // Only re-init when scene or core refs change

  return { joints };
}
