"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import GameCanvas from "@/components/GameCanvas";
import { localizeStage } from "@/lib/stages";
import { fetchStageDef } from "@/lib/stagesRemote";
import { fetchApprovedImage } from "@/lib/backgroundImages";
import { fetchRoom } from "@/lib/roomsClient";
import { roomAspect, roomToStageDef } from "@/lib/rooms";
import type { ControlMode, StageDef } from "@/game-engine/types";

function PlayInner() {
  const { t, i18n } = useTranslation("game");
  const params = useSearchParams();
  const stageId = params.get("stage");
  const roomId = params.get("room");
  const [def, setDef] = useState<StageDef | null>(null);
  const [bgUrl, setBgUrl] = useState<string | undefined>(undefined);
  const [aspect, setAspect] = useState(1);
  const [roomMode, setRoomMode] = useState<ControlMode | null>(null);
  const [run, setRun] = useState(0);
  // 커스텀 방은 방에 저장된 조작모드를, 스테이지는 메뉴에서 고른 모드를 쓴다
  const mode: ControlMode =
    roomMode ?? (params.get("mode") === "manual" ? "manual" : "classic");

  useEffect(() => {
    if (!roomId) return;
    (async () => {
      const room = await fetchRoom(roomId);
      if (!room) return;
      setDef(roomToStageDef(room));
      setBgUrl(room.imageUrl);
      setAspect(roomAspect(room));
      setRoomMode(room.controlMode);
    })();
  }, [roomId]);

  useEffect(() => {
    if (roomId) return; // 커스텀 방은 위에서 처리
    (async () => {
      const d = await fetchStageDef(stageId);
      // 기본: 번들된 샘플 이미지(정사각형). 승인된 배경이미지가 연결돼 있으면 그것으로 교체하고
      // 게임장 격자도 그 이미지 비율을 따른다 (이미지에 태깅된 존이 있으면 스테이지 존 대체)
      let url = `/samples/${d.theme}.png`;
      let ratio = 1;
      if (d.backgroundImageId) {
        const img = await fetchApprovedImage(d.backgroundImageId);
        if (img) {
          url = img.storageUrl;
          ratio = img.aspect;
          if (img.valueZones.length > 0) d.valueZones = img.valueZones;
        }
      }
      setBgUrl(url);
      setAspect(ratio);
      setDef(d);
    })();
  }, [stageId, roomId]);

  return (
    <div className="game-view fixed inset-0 bg-black">
      {def ? (
        <GameCanvas
          key={`${run}-${i18n.language}`}
          stage={localizeStage(def, i18n.language, aspect)}
          mode={mode}
          bgUrl={bgUrl}
          roomId={roomId ?? undefined}
          onRestart={() => setRun((r) => r + 1)}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-zinc-500">
          {t("loading", { ns: "common" })}
        </div>
      )}

      {/* 뒤로가기 + 모드 표시 — 모바일은 좌상단 아이콘, 데스크톱은 좌하단 텍스트 버튼 */}
      <div
        className="absolute left-2 top-2 z-30 flex items-center gap-3 sm:bottom-3 sm:left-4 sm:top-auto"
        style={{
          marginTop: "env(safe-area-inset-top)",
          marginLeft: "env(safe-area-inset-left)",
        }}
      >
        <Link
          href="/"
          aria-label={t("stageSelect", { ns: "common" })}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/45 text-lg text-zinc-200 backdrop-blur-md transition-colors hover:bg-black/70 hover:text-white sm:h-auto sm:w-auto sm:px-4 sm:py-1.5 sm:text-sm"
        >
          <span className="sm:hidden">←</span>
          <span className="hidden sm:inline">← {t("stageSelect", { ns: "common" })}</span>
        </Link>
        <span className="hidden rounded-full bg-black/30 px-3 py-1 text-xs text-zinc-400 backdrop-blur-md sm:inline">
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
