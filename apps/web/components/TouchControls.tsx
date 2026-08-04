"use client";

// 모바일 터치 조작 — 화면 아무 곳이나 누르면 그 자리에 조이스틱이 생기고,
// 드래그 방향을 4방향으로 스냅해 엔진에 전달한다. 두 손가락은 핀치 줌.

import { useRef, useState } from "react";
import type { ControlMode, Vec } from "@/game-engine/types";

const DEAD_ZONE = 14; // 이 거리 미만의 드래그는 방향 입력으로 보지 않음
const STICK_RADIUS = 46; // 노브가 움직일 수 있는 최대 반경(px)

interface Stick {
  ox: number; // 조이스틱 중심 (터치 시작 지점)
  oy: number;
  kx: number; // 노브 위치
  ky: number;
  dir: Vec | null;
}

export default function TouchControls({
  mode,
  onDir,
  onMoving,
  onPinch,
}: {
  mode: ControlMode;
  onDir: (v: Vec) => void;
  onMoving: (moving: boolean) => void;
  onPinch: (deltaY: number) => void;
}) {
  const [stick, setStick] = useState<Stick | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchDist = useRef<number | null>(null);
  const lastDir = useRef<Vec | null>(null);

  const twoFingerDist = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const endStick = () => {
    setStick(null);
    lastDir.current = null;
    if (mode === "manual") onMoving(false);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") return; // 데스크톱은 키보드/휠 사용
    // 손가락이 오버레이 밖으로 나가도 계속 추적. 캡처 실패는 조작을 막을 이유가 아니다.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* 캡처 불가 — 버블링되는 이벤트만으로 동작 */
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 1) {
      setStick({ ox: e.clientX, oy: e.clientY, kx: e.clientX, ky: e.clientY, dir: null });
      if (mode === "manual") onMoving(true);
    } else if (pointers.current.size === 2) {
      // 핀치 시작 — 조이스틱은 접는다
      pinchDist.current = twoFingerDist();
      setStick(null);
      if (mode === "manual") onMoving(false);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // 두 손가락 → 핀치 줌 (벌리면 확대 = 카메라가 가까워짐)
    if (pointers.current.size >= 2) {
      const d = twoFingerDist();
      if (pinchDist.current !== null) onPinch((pinchDist.current - d) * 1.6);
      pinchDist.current = d;
      return;
    }

    setStick((prev) => {
      if (!prev) return prev;
      const dx = e.clientX - prev.ox;
      const dy = e.clientY - prev.oy;
      const len = Math.hypot(dx, dy);
      let dir = prev.dir;
      if (len >= DEAD_ZONE) {
        // 우세한 축으로 스냅 (그리드 게임이라 4방향만 존재)
        dir = Math.abs(dx) > Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) };
        if (!lastDir.current || lastDir.current.x !== dir.x || lastDir.current.y !== dir.y) {
          lastDir.current = dir;
          onDir(dir);
        }
      }
      const clamp = len > STICK_RADIUS ? STICK_RADIUS / len : 1;
      return { ...prev, kx: prev.ox + dx * clamp, ky: prev.oy + dy * clamp, dir };
    });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchDist.current = null;
    if (pointers.current.size === 0) endStick();
  };

  return (
    <div
      className="absolute inset-0 z-10 touch-none select-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      {stick && (
        <>
          {/* 조이스틱 베이스 */}
          <div
            className="pointer-events-none absolute rounded-full border-2 border-white/25 bg-white/5 backdrop-blur-sm"
            style={{
              left: stick.ox - STICK_RADIUS,
              top: stick.oy - STICK_RADIUS,
              width: STICK_RADIUS * 2,
              height: STICK_RADIUS * 2,
            }}
          />
          {/* 노브 */}
          <div
            className="pointer-events-none absolute rounded-full border border-white/70 bg-white/35 shadow-[0_0_18px_rgba(255,255,255,0.5)]"
            style={{ left: stick.kx - 22, top: stick.ky - 22, width: 44, height: 44 }}
          />
        </>
      )}
    </div>
  );
}
