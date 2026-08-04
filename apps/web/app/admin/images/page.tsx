"use client";

// 이미지 검수 (docs/06 §2-3, docs/08) — AI 생성, 승인/반려, 가중치존 클릭 태깅

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { adminFetch } from "@/lib/adminApi";
import type { ValueZone } from "@/game-engine/types";

interface AdminImage {
  imageId: string;
  storageUrl: string;
  theme: string;
  prompt: string;
  width: number;
  height: number;
  status: "pending" | "approved" | "rejected";
  valueZones: ValueZone[];
  generatedBy: string;
  uploadedAt: string | null;
}

const THEMES = ["world-map", "space", "underwater", "city"];
const GRID = 100; // 존 좌표 기준 그리드 (스테이지 mapSize 기본값과 동일)

export default function AdminImages() {
  const { t } = useTranslation("admin");
  const [images, setImages] = useState<AdminImage[]>([]);
  const [theme, setTheme] = useState(THEMES[0]);
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // imageId → 편집 중인 존 목록 (저장 전 로컬 상태)
  const [zoneEdits, setZoneEdits] = useState<Record<string, ValueZone[]>>({});

  const load = useCallback(() => {
    adminFetch<{ images: AdminImage[] }>("/api/admin/images")
      .then((r) => {
        setImages(r.images);
        setZoneEdits((prev) => {
          const next = { ...prev };
          for (const img of r.images) {
            if (!(img.imageId in next)) next[img.imageId] = img.valueZones;
          }
          return next;
        });
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const generate = async () => {
    setGenerating(true);
    setError(null);
    try {
      await adminFetch("/api/admin/images/generate", {
        method: "POST",
        body: JSON.stringify({ theme, prompt: prompt || undefined }),
      });
      setPrompt("");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  };

  // 업로드: 브라우저에서 해상도를 읽어 base64와 함께 전송 (게임장 비율 산출용)
  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = () => reject(new Error("파일 읽기 실패"));
        fr.readAsDataURL(file);
      });
      const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
        const im = new window.Image();
        im.onload = () => resolve({ w: im.naturalWidth, h: im.naturalHeight });
        im.onerror = () => reject(new Error("이미지 해석 실패"));
        im.src = dataUrl;
      });
      await adminFetch("/api/admin/images/upload", {
        method: "POST",
        body: JSON.stringify({ dataUrl, theme, width: dims.w, height: dims.h }),
      });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };

  const setStatus = async (img: AdminImage, status: AdminImage["status"]) => {
    setError(null);
    try {
      await adminFetch("/api/admin/images", {
        method: "PATCH",
        body: JSON.stringify({ imageId: img.imageId, status }),
      });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const saveZones = async (img: AdminImage) => {
    setError(null);
    try {
      await adminFetch("/api/admin/images", {
        method: "PATCH",
        body: JSON.stringify({ imageId: img.imageId, valueZones: zoneEdits[img.imageId] ?? [] }),
      });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="max-w-5xl">
      {/* 생성 폼 */}
      <div className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <label className="text-sm">
          <span className="text-zinc-400">{t("images.theme")}</span>
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            className="mt-1 block rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5"
          >
            {THEMES.map((th) => (
              <option key={th} value={th}>
                {th}
              </option>
            ))}
          </select>
        </label>
        <label className="flex-1 text-sm">
          <span className="text-zinc-400">{t("images.customPrompt")}</span>
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="mt-1 block w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5"
          />
        </label>
        <button
          onClick={generate}
          disabled={generating}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-500 disabled:opacity-50"
        >
          {generating ? t("images.generating") : t("images.generate")}
        </button>
        <label
          className={`cursor-pointer rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold hover:bg-zinc-700 ${
            uploading ? "pointer-events-none opacity-50" : ""
          }`}
        >
          {uploading ? t("images.uploading") : t("images.upload")}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = ""; // 같은 파일 재선택 허용
              if (file) upload(file);
            }}
          />
        </label>
      </div>
      {error && <p className="mb-3 text-sm text-red-400">{t("error", { message: error })}</p>}

      {images.length === 0 ? (
        <p className="text-sm text-zinc-500">{t("images.empty")}</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {images.map((img) => (
            <ImageCard
              key={img.imageId}
              img={img}
              zones={zoneEdits[img.imageId] ?? []}
              onZonesChange={(zs) => setZoneEdits((p) => ({ ...p, [img.imageId]: zs }))}
              onStatus={(s) => setStatus(img, s)}
              onSaveZones={() => saveZones(img)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ImageCard({
  img,
  zones,
  onZonesChange,
  onStatus,
  onSaveZones,
}: {
  img: AdminImage;
  zones: ValueZone[];
  onZonesChange: (z: ValueZone[]) => void;
  onStatus: (s: AdminImage["status"]) => void;
  onSaveZones: () => void;
}) {
  const { t } = useTranslation("admin");
  const boxRef = useRef<HTMLDivElement>(null);

  const addZone = (e: React.MouseEvent) => {
    const box = boxRef.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * GRID);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * GRID);
    onZonesChange([...zones, { x, y, radius: 6, type: "landmark", multiplier: 2 }]);
  };

  const statusColor =
    img.status === "approved"
      ? "bg-emerald-800 text-emerald-200"
      : img.status === "rejected"
        ? "bg-red-900 text-red-200"
        : "bg-yellow-800 text-yellow-200";

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-mono text-xs text-zinc-500">
          {img.theme}
          {img.width > 0 && ` · ${img.width}×${img.height}`}
        </span>
        <span className={`rounded px-2 py-0.5 text-xs ${statusColor}`}>
          {t(`images.status${img.status[0].toUpperCase()}${img.status.slice(1)}`)}
        </span>
      </div>

      {/* 이미지 + 존 오버레이 (클릭으로 존 추가) */}
      <div
        ref={boxRef}
        onClick={addZone}
        className="relative w-full cursor-crosshair overflow-hidden rounded-lg"
        title={t("images.zonesHint")}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={img.storageUrl} alt={img.theme} className="block w-full" />
        {zones.map((z, i) => (
          <div
            key={i}
            className="pointer-events-none absolute flex items-center justify-center rounded-full border-2 border-dashed border-yellow-400/90 text-[10px] font-bold text-yellow-300"
            style={{
              left: `${((z.x - z.radius) / GRID) * 100}%`,
              top: `${((z.y - z.radius) / GRID) * 100}%`,
              width: `${((z.radius * 2) / GRID) * 100}%`,
              height: `${((z.radius * 2) / GRID) * 100}%`,
              textShadow: "0 0 4px #000",
            }}
          >
            x{z.multiplier}
          </div>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-zinc-500">{t("images.zonesHint")}</p>

      {/* 존 목록 편집 */}
      {zones.length > 0 && (
        <div className="mt-2 space-y-1">
          {zones.map((z, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-zinc-300">
              <span className="font-mono">
                ({z.x},{z.y})
              </span>
              <select
                value={z.type}
                onChange={(e) => {
                  const next = [...zones];
                  next[i] = { ...z, type: e.target.value as ValueZone["type"] };
                  onZonesChange(next);
                }}
                className="rounded border border-zinc-700 bg-zinc-950 px-1 py-0.5"
              >
                <option value="landmark">landmark</option>
                <option value="gem">gem</option>
                <option value="event">event</option>
              </select>
              <label>
                r=
                <input
                  type="number"
                  min={2}
                  max={20}
                  value={z.radius}
                  onChange={(e) => {
                    const next = [...zones];
                    next[i] = { ...z, radius: Number(e.target.value) };
                    onZonesChange(next);
                  }}
                  className="ml-1 w-14 rounded border border-zinc-700 bg-zinc-950 px-1 py-0.5"
                />
              </label>
              <label>
                x
                <input
                  type="number"
                  min={1}
                  max={5}
                  step={0.5}
                  value={z.multiplier}
                  onChange={(e) => {
                    const next = [...zones];
                    next[i] = { ...z, multiplier: Number(e.target.value) };
                    onZonesChange(next);
                  }}
                  className="ml-1 w-14 rounded border border-zinc-700 bg-zinc-950 px-1 py-0.5"
                />
              </label>
              <button
                onClick={() => onZonesChange(zones.filter((_, j) => j !== i))}
                className="text-red-400 hover:text-red-300"
              >
                {t("images.zoneRemove")}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 액션 */}
      <div className="mt-3 flex gap-2 text-xs">
        {img.status !== "approved" && (
          <button
            onClick={() => onStatus("approved")}
            className="rounded bg-emerald-700 px-3 py-1.5 font-semibold hover:bg-emerald-600"
          >
            {t("images.approve")}
          </button>
        )}
        {img.status !== "rejected" && (
          <button
            onClick={() => onStatus("rejected")}
            className="rounded bg-red-900 px-3 py-1.5 hover:bg-red-800"
          >
            {t("images.reject")}
          </button>
        )}
        {img.status !== "pending" && (
          <button
            onClick={() => onStatus("pending")}
            className="rounded bg-zinc-800 px-3 py-1.5 hover:bg-zinc-700"
          >
            {t("images.repending")}
          </button>
        )}
        <button
          onClick={onSaveZones}
          className="ml-auto rounded bg-blue-700 px-3 py-1.5 font-semibold hover:bg-blue-600"
        >
          {t("images.saveZones")}
        </button>
      </div>
    </div>
  );
}
