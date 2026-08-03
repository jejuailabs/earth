"use client";

// 메인 메뉴 3D 배경 — 회전하는 행성 + 대기 글로우 + 별 필드 (three.js)

import { useEffect, useRef } from "react";
import * as THREE from "three";

export default function MenuBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch {
      return; // WebGL 불가 — CSS 그라데이션 배경만 유지
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    camera.position.set(0, 0, 30);

    scene.add(new THREE.HemisphereLight(0x8fb8ff, 0x0a1020, 0.5));
    const sun = new THREE.DirectionalLight(0xfff0dd, 3);
    sun.position.set(-18, 10, 12);
    scene.add(sun);

    // 행성 (절차적 지구 텍스처)
    const planetTex = new THREE.CanvasTexture(makePlanetTexture(1024));
    planetTex.colorSpace = THREE.SRGBColorSpace;
    const planet = new THREE.Mesh(
      new THREE.SphereGeometry(11, 64, 48),
      new THREE.MeshStandardMaterial({ map: planetTex, roughness: 0.85 }),
    );
    planet.position.set(13, -9, -6);
    scene.add(planet);

    // 대기 글로우 (뒷면 렌더 셸)
    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(11.9, 64, 48),
      new THREE.MeshBasicMaterial({
        color: 0x4d9fff,
        transparent: true,
        opacity: 0.16,
        side: THREE.BackSide,
      }),
    );
    atmosphere.position.copy(planet.position);
    scene.add(atmosphere);

    // 구름 셸
    const cloudTex = new THREE.CanvasTexture(makeCloudTexture(512));
    const clouds = new THREE.Mesh(
      new THREE.SphereGeometry(11.25, 64, 48),
      new THREE.MeshStandardMaterial({
        map: cloudTex,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
      }),
    );
    clouds.position.copy(planet.position);
    scene.add(clouds);

    // 별 필드
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(1500 * 3);
    for (let i = 0; i < 1500; i++) {
      const r = 60 + Math.random() * 90;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPos[i * 3 + 2] = r * Math.cos(phi) - 40;
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    const stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0xdde6ff, size: 0.35, sizeAttenuation: true }),
    );
    scene.add(stars);

    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener("resize", resize);

    // 마우스 패럴럭스
    let mx = 0;
    let my = 0;
    const onMouse = (e: MouseEvent) => {
      mx = (e.clientX / window.innerWidth - 0.5) * 2;
      my = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener("mousemove", onMouse);

    let raf = 0;
    let disposed = false;
    const loop = (now: number) => {
      if (disposed) return;
      planet.rotation.y = now / 22000;
      clouds.rotation.y = now / 15000;
      stars.rotation.y = now / 180000;
      camera.position.x += (mx * 1.6 - camera.position.x) * 0.03;
      camera.position.y += (-my * 1.1 - camera.position.y) * 0.03;
      camera.lookAt(4, -2, 0);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouse);
      planetTex.dispose();
      cloudTex.dispose();
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
          o.geometry.dispose();
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
        }
      });
      renderer.dispose();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 -z-10 h-full w-full"
      aria-hidden
    />
  );
}

// 절차적 행성 텍스처 (바다 + 대륙 + 극지방)
function makePlanetTexture(size: number): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = size;
  cv.height = size / 2;
  const ctx = cv.getContext("2d")!;
  const rand = mulberry32(20260803);

  const sea = ctx.createLinearGradient(0, 0, 0, cv.height);
  sea.addColorStop(0, "#7fb5d8");
  sea.addColorStop(0.25, "#2678ab");
  sea.addColorStop(0.75, "#1d5c8f");
  sea.addColorStop(1, "#8fc0dd");
  ctx.fillStyle = sea;
  ctx.fillRect(0, 0, cv.width, cv.height);

  for (let c = 0; c < 16; c++) {
    const cx = rand() * cv.width;
    const cy = cv.height * (0.18 + rand() * 0.64);
    const r = cv.width * (0.03 + rand() * 0.07);
    ctx.fillStyle = c % 3 === 0 ? "#4f8a45" : c % 3 === 1 ? "#68a054" : "#8aae5e";
    blob(ctx, cx, cy, r, rand);
    ctx.fillStyle = "rgba(180,160,100,0.4)";
    blob(ctx, cx + r * 0.2, cy - r * 0.15, r * 0.4, rand);
  }
  // 극지방
  ctx.fillStyle = "rgba(240,248,255,0.95)";
  ctx.fillRect(0, 0, cv.width, cv.height * 0.05);
  ctx.fillRect(0, cv.height * 0.95, cv.width, cv.height * 0.05);
  return cv;
}

function makeCloudTexture(size: number): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = size;
  cv.height = size / 2;
  const ctx = cv.getContext("2d")!;
  const rand = mulberry32(777);
  ctx.clearRect(0, 0, cv.width, cv.height);
  for (let c = 0; c < 60; c++) {
    ctx.fillStyle = `rgba(255,255,255,${0.15 + rand() * 0.3})`;
    blob(ctx, rand() * cv.width, cv.height * (0.1 + rand() * 0.8), cv.width * (0.01 + rand() * 0.03), rand);
  }
  return cv;
}

function blob(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  rand: () => number,
) {
  ctx.beginPath();
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const rr = r * (0.6 + rand() * 0.8);
    if (i === 0) ctx.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    else ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
