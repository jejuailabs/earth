"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import GameCanvas from "@/components/GameCanvas";
import { getStage } from "@/lib/stages";
import type { ControlMode } from "@/game-engine/types";

function PlayInner() {
  const params = useSearchParams();
  const stage = getStage(params.get("stage"));
  const mode: ControlMode = params.get("mode") === "manual" ? "manual" : "classic";
  const [run, setRun] = useState(0);

  return (
    <div className="flex flex-1 flex-col items-center gap-4 bg-zinc-950 px-4 py-6">
      <div className="flex w-full max-w-[640px] items-center justify-between">
        <Link href="/" className="text-sm text-zinc-400 hover:text-zinc-200">
          ← 스테이지 선택
        </Link>
        <span className="text-xs text-zinc-500">
          {mode === "classic" ? "자동전진" : "수동조작"} 모드
        </span>
      </div>
      <GameCanvas key={run} stage={stage} mode={mode} onRestart={() => setRun((r) => r + 1)} />
    </div>
  );
}

export default function PlayPage() {
  return (
    <Suspense>
      <PlayInner />
    </Suspense>
  );
}
