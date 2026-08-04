"use client";

// 방 만들기 — 사진을 올리고 방 크기·조작모드·봇·목표를 골라 바로 플레이한다.
// 로그인하면 방이 저장돼 메뉴에서 다시 열 수 있고, 비로그인은 이번 판만 임시로 플레이한다.

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/components/AuthProvider";
import { authedFetch, downscaleImage } from "@/lib/apiClient";
import { TEMP_ROOM_KEY, type RoomDoc } from "@/lib/rooms";
import { fieldDimensions, type ControlMode, type FieldSize } from "@/game-engine/types";

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
        active
          ? "bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-[0_0_14px_rgba(37,99,235,0.5)]"
          : "bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
      }`}
    >
      {children}
    </button>
  );
}

export default function CreateRoomPage() {
  const { t } = useTranslation("create");
  const router = useRouter();
  const { user, loading } = useAuth();

  const [name, setName] = useState("");
  const [image, setImage] = useState<{ dataUrl: string; width: number; height: number } | null>(
    null,
  );
  const [fieldSize, setFieldSize] = useState<FieldSize>("medium");
  const [controlMode, setControlMode] = useState<ControlMode>("classic");
  const [botTier, setBotTier] = useState<1 | 2 | 3>(1);
  const [botCount, setBotCount] = useState(2);
  const [clearType, setClearType] = useState<"areaPercent" | "surviveTime">("areaPercent");
  const [clearValue, setClearValue] = useState(30);
  const [timeLimitSec, setTimeLimitSec] = useState(180);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 목표 종류를 바꾸면 기본값도 함께 맞춰준다
  const pickClearType = (type: "areaPercent" | "surviveTime") => {
    setClearType(type);
    setClearValue(type === "areaPercent" ? 30 : 120);
  };

  const aspect = image ? image.width / image.height : 1;
  const grid = useMemo(() => fieldDimensions(fieldSize, aspect), [fieldSize, aspect]);

  const pickImage = async (file: File) => {
    setError(null);
    try {
      setImage(await downscaleImage(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const start = async () => {
    if (!image) {
      setError(t("needImage"));
      return;
    }
    setBusy(true);
    setError(null);
    const payload = {
      name: name.trim() || t("defaultName"),
      dataUrl: image.dataUrl,
      imageWidth: image.width,
      imageHeight: image.height,
      fieldSize,
      controlMode,
      botTier,
      botCount,
      clearType,
      clearValue,
      timeLimitSec,
    };
    try {
      if (user) {
        const { room } = await authedFetch<{ room: RoomDoc }>("/api/rooms", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        router.push(`/play?room=${room.roomId}`);
      } else {
        // 비로그인: 저장하지 않고 이번 판만 플레이
        const temp: RoomDoc = {
          ...payload,
          roomId: "temp",
          ownerUid: "",
          imageUrl: image.dataUrl,
        };
        sessionStorage.setItem(TEMP_ROOM_KEY, JSON.stringify(temp));
        router.push("/play?room=temp");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col items-center bg-gradient-to-b from-[#050810] via-[#080d1c] to-[#04060c] px-4 pb-16 text-zinc-100">
      <div className="flex w-full max-w-2xl items-center justify-between py-5">
        <Link href="/" className="text-sm text-zinc-400 hover:text-zinc-200">
          ← {t("back")}
        </Link>
        {!loading && !user && <span className="text-xs text-zinc-500">{t("guestNotice")}</span>}
      </div>

      <h1 className="text-3xl font-black tracking-tight sm:text-4xl">🏗 {t("title")}</h1>
      <p className="mt-2 text-sm text-zinc-400">{t("subtitle")}</p>

      <div className="mt-8 w-full max-w-2xl space-y-6">
        {/* 방 이름 */}
        <section>
          <h2 className="mb-2 text-sm font-semibold text-zinc-300">{t("roomName")}</h2>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            placeholder={t("defaultName")}
            className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 outline-none focus:border-blue-500"
          />
        </section>

        {/* 사진 */}
        <section>
          <h2 className="mb-2 text-sm font-semibold text-zinc-300">{t("photo")}</h2>
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-white/15 bg-black/30 p-4 transition-colors hover:border-blue-500/60">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={image.dataUrl}
                alt=""
                className="max-h-56 w-auto rounded-lg"
                style={{ aspectRatio: `${image.width} / ${image.height}` }}
              />
            ) : (
              <span className="py-10 text-sm text-zinc-400">{t("photoHint")}</span>
            )}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) pickImage(f);
              }}
            />
          </label>
          {image && (
            <p className="mt-2 text-center text-xs text-zinc-500">
              {t("photoInfo", {
                w: image.width,
                h: image.height,
                gw: grid.width,
                gh: grid.height,
              })}
            </p>
          )}
        </section>

        {/* 방 크기 */}
        <section>
          <h2 className="mb-2 text-sm font-semibold text-zinc-300">{t("fieldSize")}</h2>
          <div className="flex gap-2">
            {(["small", "medium", "large"] as FieldSize[]).map((s) => {
              const d = fieldDimensions(s, aspect);
              return (
                <Chip key={s} active={fieldSize === s} onClick={() => setFieldSize(s)}>
                  {t(`size.${s}`)}
                  <span className="ml-1.5 text-[11px] font-normal opacity-70">
                    {d.width}×{d.height}
                  </span>
                </Chip>
              );
            })}
          </div>
        </section>

        {/* 조작 모드 */}
        <section>
          <h2 className="mb-2 text-sm font-semibold text-zinc-300">{t("controlMode")}</h2>
          <div className="flex gap-2">
            {(["classic", "manual"] as ControlMode[]).map((m) => (
              <Chip key={m} active={controlMode === m} onClick={() => setControlMode(m)}>
                {t(`mode.${m}`)}
              </Chip>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-zinc-500">{t(`modeHint.${controlMode}`)}</p>
        </section>

        {/* 봇 */}
        <section>
          <h2 className="mb-2 text-sm font-semibold text-zinc-300">{t("bots")}</h2>
          <div className="flex flex-wrap items-center gap-2">
            {([1, 2, 3] as const).map((tier) => (
              <Chip key={tier} active={botTier === tier} onClick={() => setBotTier(tier)}>
                {t(`botTier.${tier}`)}
              </Chip>
            ))}
            <span className="ml-2 text-sm text-zinc-400">{t("botCount")}</span>
            <input
              type="range"
              min={0}
              max={6}
              value={botCount}
              onChange={(e) => setBotCount(Number(e.target.value))}
              className="w-32 accent-blue-500"
            />
            <span className="w-6 text-center font-mono">{botCount}</span>
          </div>
        </section>

        {/* 목표 */}
        <section>
          <h2 className="mb-2 text-sm font-semibold text-zinc-300">{t("goal")}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Chip
              active={clearType === "areaPercent"}
              onClick={() => pickClearType("areaPercent")}
            >
              {t("goalArea")}
            </Chip>
            <Chip
              active={clearType === "surviveTime"}
              onClick={() => pickClearType("surviveTime")}
            >
              {t("goalSurvive")}
            </Chip>
            <input
              type="number"
              value={clearValue}
              min={clearType === "areaPercent" ? 5 : 30}
              max={clearType === "areaPercent" ? 90 : 600}
              onChange={(e) => setClearValue(Number(e.target.value))}
              className="w-24 rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-center"
            />
            <span className="text-sm text-zinc-400">
              {clearType === "areaPercent" ? "%" : t("seconds")}
            </span>
          </div>
          {clearType === "areaPercent" && (
            <div className="mt-2 flex items-center gap-2 text-sm">
              <span className="text-zinc-400">{t("timeLimit")}</span>
              <input
                type="number"
                min={30}
                max={900}
                value={timeLimitSec}
                onChange={(e) => setTimeLimitSec(Number(e.target.value))}
                className="w-24 rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-center"
              />
              <span className="text-zinc-400">{t("seconds")}</span>
            </div>
          )}
        </section>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          onClick={start}
          disabled={busy || !image}
          className="w-full rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-500 px-6 py-4 text-lg font-bold shadow-lg shadow-blue-900/40 transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
        >
          {busy ? t("creating") : t("createAndPlay")}
        </button>
      </div>
    </div>
  );
}
