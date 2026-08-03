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
    <div className="flex flex-1 flex-col items-center gap-4 bg-zinc-950 px-4 py-6">
      <div className="flex w-full max-w-[1024px] items-center justify-between">
        <Link href="/" className="text-sm text-zinc-400 hover:text-zinc-200">
          ← {t("stageSelect", { ns: "common" })}
        </Link>
        <span className="text-xs text-zinc-500">
          {mode === "classic" ? t("modeLabelClassic") : t("modeLabelManual")}
        </span>
      </div>
      {def ? (
        <GameCanvas
          key={`${run}-${i18n.language}`}
          stage={localizeStage(def, i18n.language)}
          mode={mode}
          bgUrl={bgUrl}
          onRestart={() => setRun((r) => r + 1)}
        />
      ) : (
        <p className="mt-20 text-zinc-500">{t("loading", { ns: "common" })}</p>
      )}
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
