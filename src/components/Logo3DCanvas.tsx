import { useEffect, useRef } from "react";
import * as THREE from "three";

export interface Logo3DProps {
  /** Height in px — width follows the model's native 420:340 aspect ratio. */
  size?: number;
  /** Drag-to-rotate with momentum. Off by default outside the login/signup hero use. */
  interactive?: boolean;
  /** Shows the "LinguaGuard" wordmark + tagline beneath the shield. */
  showWordmark?: boolean;
  /** Tagline color override — the default (muted-foreground) assumes a light/card background; pass an explicit color on dark hero backgrounds. */
  taglineColor?: string;
  /** Font size (px) for the "LinguaGuard" wordmark — overrides the size-proportional default. Tagline scales to match. */
  wordmarkFontSize?: number;
  className?: string;
}

const ASPECT = 420 / 340;

/**
 * The rotating 3D shield logo, ported from a standalone Three.js snippet into
 * a real component: one scene/renderer per mounted instance, torn down on
 * unmount so navigating between pages (which fully remounts the layout) never
 * leaks WebGL contexts — browsers cap how many can be alive at once.
 */
export function Logo3DCanvas({ size = 160, interactive = false, showWordmark = false, taglineColor, wordmarkFontSize, className }: Logo3DProps) {
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const W = Math.round(size * ASPECT);
    const H = size;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, W / H, 0.1, 1000);
    camera.position.set(0, 0, 340);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    stage.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const key = new THREE.DirectionalLight(0xffffff, 0.95);
    key.position.set(120, 170, 220);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x7fe8ff, 0.5);
    rim.position.set(-160, -70, -120);
    scene.add(rim);
    const fill = new THREE.DirectionalLight(0xffe0d0, 0.3);
    fill.position.set(-80, 100, 60);
    scene.add(fill);

    const group = new THREE.Group();
    scene.add(group);

    const disposables: Array<{ geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[] }> = [];

    const shieldShape = new THREE.Shape();
    shieldShape.moveTo(0, 90);
    shieldShape.quadraticCurveTo(34, 78, 66, 66);
    shieldShape.lineTo(66, -4);
    shieldShape.quadraticCurveTo(66, -54, 0, -92);
    shieldShape.quadraticCurveTo(-66, -54, -66, -4);
    shieldShape.lineTo(-66, 66);
    shieldShape.quadraticCurveTo(-34, 78, 0, 90);
    shieldShape.closePath();
    const shieldGeo = new THREE.ExtrudeGeometry(shieldShape, { depth: 20, bevelEnabled: true, bevelThickness: 5, bevelSize: 5, bevelSegments: 4, curveSegments: 28 });
    shieldGeo.center();
    const shieldMat = new THREE.MeshStandardMaterial({ color: 0x00c2e0, roughness: 0.28, metalness: 0.35 });
    const shield = new THREE.Mesh(shieldGeo, shieldMat);
    group.add(shield);
    disposables.push({ geometry: shieldGeo, material: shieldMat });

    const rimShape = new THREE.Shape();
    rimShape.moveTo(0, 99);
    rimShape.quadraticCurveTo(37, 86, 73, 73);
    rimShape.lineTo(73, -5);
    rimShape.quadraticCurveTo(73, -60, 0, -101);
    rimShape.quadraticCurveTo(-73, -60, -73, -5);
    rimShape.lineTo(-73, 73);
    rimShape.quadraticCurveTo(-37, 86, 0, 99);
    rimShape.closePath();
    const rimGeo = new THREE.ExtrudeGeometry(rimShape, { depth: 12, bevelEnabled: true, bevelThickness: 2, bevelSize: 2, bevelSegments: 3, curveSegments: 28 });
    rimGeo.center();
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x0a63e8, roughness: 0.35, metalness: 0.4 });
    const rimMesh = new THREE.Mesh(rimGeo, rimMat);
    rimMesh.position.z = -7;
    group.add(rimMesh);
    disposables.push({ geometry: rimGeo, material: rimMat });

    const ringGeo = new THREE.TorusGeometry(70, 2.2, 10, 40, Math.PI * 1.98);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.3, metalness: 0.5 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.z = 4;
    ring.rotation.z = Math.PI / 2 + 0.01;
    group.add(ring);
    disposables.push({ geometry: ringGeo, material: ringMat });

    const bubbleShape = new THREE.Shape();
    bubbleShape.moveTo(-30, 26);
    bubbleShape.lineTo(30, 26);
    bubbleShape.quadraticCurveTo(40, 26, 40, 16);
    bubbleShape.lineTo(40, -8);
    bubbleShape.quadraticCurveTo(40, -18, 30, -18);
    bubbleShape.lineTo(-2, -18);
    bubbleShape.lineTo(-16, -32);
    bubbleShape.lineTo(-16, -18);
    bubbleShape.lineTo(-30, -18);
    bubbleShape.quadraticCurveTo(-40, -18, -40, -8);
    bubbleShape.lineTo(-40, 16);
    bubbleShape.quadraticCurveTo(-40, 26, -30, 26);
    bubbleShape.closePath();
    const bubbleGeo = new THREE.ExtrudeGeometry(bubbleShape, { depth: 10, bevelEnabled: true, bevelThickness: 2, bevelSize: 2, bevelSegments: 3, curveSegments: 20 });
    bubbleGeo.center();
    const bubbleMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, metalness: 0.05 });
    const bubble = new THREE.Mesh(bubbleGeo, bubbleMat);
    bubble.position.set(0, 6, 24);
    group.add(bubble);
    disposables.push({ geometry: bubbleGeo, material: bubbleMat });

    const checkPts = [new THREE.Vector3(-14, -2, 0), new THREE.Vector3(-4, -12, 0), new THREE.Vector3(16, 8, 0)];
    const checkCurve = new THREE.CatmullRomCurve3(checkPts);
    const checkGeo = new THREE.TubeGeometry(checkCurve, 20, 3.4, 14, false);
    const checkMat = new THREE.MeshStandardMaterial({ color: 0xff5a3c, roughness: 0.25, metalness: 0.3 });
    const check = new THREE.Mesh(checkGeo, checkMat);
    check.position.set(0, 4, 34);
    group.add(check);
    disposables.push({ geometry: checkGeo, material: checkMat });

    const capGeo = new THREE.SphereGeometry(3.4, 14, 14);
    [checkPts[0], checkPts[2]].forEach((p) => {
      const cap = new THREE.Mesh(capGeo, checkMat);
      cap.position.set(p.x, p.y + 4, 34);
      group.add(cap);
    });
    disposables.push({ geometry: capGeo });

    const dotGeo = new THREE.SphereGeometry(3.2, 16, 16);
    const dotColors = [0xffd23f, 0x3ee08c, 0xffd23f];
    [-14, 0, 14].forEach((x, i) => {
      const dotMat = new THREE.MeshStandardMaterial({ color: dotColors[i], roughness: 0.3, metalness: 0.4 });
      const d = new THREE.Mesh(dotGeo, dotMat);
      d.position.set(x, 22, 32);
      group.add(d);
      disposables.push({ material: dotMat });
    });
    disposables.push({ geometry: dotGeo });

    group.scale.set(1.15, 1.15, 1.15);

    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let velX = 0;
    let targetTiltX = 0.05;
    let rotY = -0.4;

    const onDown = (e: PointerEvent) => {
      dragging = true;
      stage.style.cursor = "grabbing";
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      rotY += dx * 0.01;
      targetTiltX = Math.max(-0.6, Math.min(0.6, targetTiltX + dy * 0.005));
      velX = dx * 0.01;
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onUp = () => {
      dragging = false;
      stage.style.cursor = "grab";
    };

    if (interactive) {
      stage.style.cursor = "grab";
      stage.addEventListener("pointerdown", onDown);
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    }

    let frameId: number;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      if (!dragging) {
        velX *= 0.95;
        rotY += 0.006 + velX;
      }
      group.rotation.y = rotY;
      group.rotation.x += (targetTiltX - group.rotation.x) * 0.08;
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frameId);
      if (interactive) {
        stage.removeEventListener("pointerdown", onDown);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      }
      disposables.forEach(({ geometry, material }) => {
        geometry?.dispose();
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material?.dispose();
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === stage) stage.removeChild(renderer.domElement);
    };
  }, [size, interactive]);

  return (
    <div className={className} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div
        ref={stageRef}
        style={{ width: Math.round(size * ASPECT), height: size, touchAction: "none" }}
        aria-hidden="true"
      />
      {showWordmark && (
        <>
          <div style={{ fontSize: wordmarkFontSize ?? Math.round(size * 0.1), fontWeight: 500, letterSpacing: 1, marginTop: 4 }}>
            <span style={{ color: "#00A8CC" }}>Lingua</span>
            <span style={{ color: "#FF5A3C" }}>Guard</span>
          </div>
          <div style={{ fontSize: Math.round((wordmarkFontSize ?? Math.round(size * 0.1)) * 0.382), letterSpacing: 4, color: taglineColor || "hsl(var(--muted-foreground))", marginTop: 6 }}>
            LANGUAGE, PROTECTED
          </div>
        </>
      )}
    </div>
  );
}
