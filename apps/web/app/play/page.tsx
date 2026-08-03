"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import GameCanvas from "@/components/GameCanvas";
import { localizeStage } from "@/lib/stages";
import { fetchStageDef } from "@/lib/stagesRemote";
import { fetchApprovedImage } from "@/lib/backgroundImages";
import type { ControlMode, StageDef } from "@/game-engine/types";

function PlayInner() {
  const { t, i18n } = useTranslation("game");
  const params = useSearchParams();
  const stageId = params.get("stage");
  const mode: ControlMode = params.get("mode") === "manual" ? "manual" : "classic";
  const [def, setDef] = useState<StageDef | null>(null);
  const [bgUrl, setBgUrl] = useState<string | undefined>(undefined);
  const [run, setRun] = useState(0);

  useEffect(() => {
    (async () => {
      const d = await fetchStageDef(stageId);
      // 승인된 배경이미지가 연결돼 있으면 이미지 + 이미지에 태깅된 가중치존 사용 (docs/04 §5)
      if (d.backgroundImageId) {
        const img = await fetchApprovedImage(d.backgroundImageId);
        if (img) {
          setBgUrl(img.storageUrl);
          if (img.valueZones.length > 0) d.valueZones = img.valueZones;
        }
      }
      setDef(d);
    })();
  }, [stageId]);

  return (
    <div className="fixed inset-0 bg-black">
      {def ? (
        <GameCanvas
          key={`${run}-${i18n.language}`}
          stage={localizeStage(def, i18n.language)}
          mode={mode}
          bgUrl={bgUrl}
          onRestart={() => setRun((r) => r + 1)}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-zinc-500">
          {t("loading", { ns: "common" })}
        </div>
      )}

      {/* 좌하단: 뒤로가기 + 모드 표시 (HUD 위에 떠 있는 컨트롤) */}
      <div className="absolute bottom-3 left-4 z-20 flex items-center gap-3">
        <Link
          href="/"
          className="rounded-full border border-white/10 bg-black/45 px-4 py-1.5 text-sm text-zinc-200 backdrop-blur-md transition-colors hover:bg-black/70 hover:text-white"
        >
          ← {t("stageSelect", { ns: "common" })}
        </Link>
        <span className="rounded-full bg-black/30 px-3 py-1 text-xs text-zinc-400 backdrop-blur-md">
          {mode === "classic" ? t("modeLabelClassic") : t("modeLabelManual")}
        </span>
      </div>
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
