"use client";

// 방 랭킹 — 같은 방에 참여한 사람들의 최고 기록

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/components/AuthProvider";
import { authedFetch } from "@/lib/apiClient";
import type { RoomScore } from "@/lib/rooms";

export default function RoomLeaderboard({ roomId }: { roomId: string }) {
  const { t } = useTranslation("create");
  const { user } = useAuth();
  const [scores, setScores] = useState<RoomScore[] | null>(null);

  useEffect(() => {
    if (!user || roomId === "temp") return;
    authedFetch<{ scores: RoomScore[] }>(`/api/rooms/scores?roomId=${encodeURIComponent(roomId)}`)
      .then((r) => setScores(r.scores))
      .catch(() => setScores([]));
  }, [roomId, user]);

  if (!user) return <p className="text-sm text-zinc-500">{t("loginToRank")}</p>;
  if (roomId === "temp" || scores === null) return null;

  return (
    <div className="mt-5 w-full text-left">
      <h3 className="mb-2 text-sm font-semibold text-zinc-300">🏆 {t("ranking")}</h3>
      {scores.length === 0 ? (
        <p className="text-sm text-zinc-500">{t("rankingEmpty")}</p>
      ) : (
        <ol className="max-h-52 space-y-1 overflow-y-auto pr-1">
          {scores.map((s, i) => (
            <li
              key={s.uid}
              className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm ${
                s.uid === user.uid ? "bg-blue-600/25 ring-1 ring-blue-400/40" : "bg-white/5"
              }`}
            >
              <span
                className={`w-5 text-center font-bold ${
                  i === 0 ? "text-yellow-400" : i === 1 ? "text-zinc-300" : i === 2 ? "text-amber-600" : "text-zinc-500"
                }`}
              >
                {i + 1}
              </span>
              {s.photoURL ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.photoURL} alt="" className="h-6 w-6 rounded-full" />
              ) : (
                <span className="h-6 w-6 rounded-full bg-zinc-700" />
              )}
              <span className="flex-1 truncate">{s.displayName}</span>
              {s.cleared && <span className="text-xs text-emerald-400">clear</span>}
              <span className="font-mono tabular-nums text-yellow-300">
                {t("rankScore", { score: s.score })}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
