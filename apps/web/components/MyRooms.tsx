"use client";

// 내가 만든 커스텀 방 목록 — 로그인 상태에서만 보인다.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/components/AuthProvider";
import { authedFetch } from "@/lib/apiClient";
import { fieldDimensions } from "@/game-engine/types";
import { roomAspect, type RoomDoc } from "@/lib/rooms";

export default function MyRooms() {
  const { t } = useTranslation("create");
  const { user } = useAuth();
  const [rooms, setRooms] = useState<RoomDoc[]>([]);

  // 로그아웃 상태면 아래 렌더 가드가 목록을 감추므로 여기서 비우지 않는다
  // (효과 본문에서 동기 setState를 하지 않기 위함)
  const load = useCallback(() => {
    if (!user) return;
    authedFetch<{ rooms: RoomDoc[] }>("/api/rooms")
      .then((r) => setRooms(r.rooms))
      .catch(() => setRooms([]));
  }, [user]);
  useEffect(load, [load]);

  const remove = async (room: RoomDoc) => {
    if (!confirm(t("confirmDelete", { name: room.name }))) return;
    try {
      await authedFetch(`/api/rooms?id=${encodeURIComponent(room.roomId)}`, { method: "DELETE" });
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  if (!user || rooms.length === 0) return null;

  return (
    <div className="z-10 mt-10 w-full max-w-5xl">
      <h2 className="mb-3 text-sm font-semibold tracking-wide text-zinc-300">{t("myRooms")}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rooms.map((room) => {
          const grid = fieldDimensions(room.fieldSize, roomAspect(room));
          return (
            <div
              key={room.roomId}
              className="group relative overflow-hidden rounded-2xl border border-white/10 bg-black/40 shadow-lg backdrop-blur-md"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={room.imageUrl}
                alt=""
                className="h-28 w-full object-cover opacity-70 transition-opacity group-hover:opacity-100"
              />
              <div className="p-3">
                <p className="truncate font-bold">{room.name}</p>
                <p className="mt-0.5 text-xs text-zinc-400">
                  {t(`size.${room.fieldSize}`)} · {grid.width}×{grid.height} ·{" "}
                  {t(`mode.${room.controlMode}`)} · 🤖 {room.botCount}
                </p>
                <div className="mt-3 flex gap-2">
                  <Link
                    href={`/play?room=${room.roomId}`}
                    className="flex-1 rounded-lg bg-blue-600 py-1.5 text-center text-sm font-semibold hover:bg-blue-500"
                  >
                    ▶ {t("play")}
                  </Link>
                  <button
                    onClick={() => remove(room)}
                    className="rounded-lg bg-white/5 px-3 text-sm text-zinc-400 hover:bg-red-900/50 hover:text-red-200"
                  >
                    {t("delete")}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
