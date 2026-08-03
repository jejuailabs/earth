"use client";

// 스테이지 관리 (docs/06 §2-2) — CRUD + 시드 + 활성화 토글
// 가중치 존은 골격 단계에선 JSON 직접 편집. 이미지 위 클릭 지정 UI는 이미지 파이프라인(9단계)과 함께.

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { adminFetch } from "@/lib/adminApi";
import { pickText } from "@/lib/stages";
import type { StageDef } from "@/game-engine/types";

const EMPTY: StageDef = {
  stageId: "",
  order: 1,
  name: { ko: "", en: "" },
  description: { ko: "", en: "" },
  botTier: 1,
  botCount: 2,
  mapSize: 100,
  clearCondition: { type: "areaPercent", value: 30 },
  timeLimitSec: 180,
  theme: "earth",
  valueZones: [],
  isActive: true,
};

export default function AdminStages() {
  const { t, i18n } = useTranslation("admin");
  const [stages, setStages] = useState<StageDef[]>([]);
  const [editing, setEditing] = useState<StageDef | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [zonesJson, setZonesJson] = useState("[]");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [approvedImages, setApprovedImages] = useState<{ imageId: string; theme: string }[]>([]);

  const load = useCallback(() => {
    adminFetch<{ stages: StageDef[] }>("/api/admin/stages")
      .then((r) => setStages(r.stages))
      .catch((e) => setError(e.message));
    adminFetch<{ images: { imageId: string; theme: string }[] }>(
      "/api/admin/images?status=approved",
    )
      .then((r) => setApprovedImages(r.images))
      .catch(() => setApprovedImages([]));
  }, []);
  useEffect(load, [load]);

  const openEdit = (s: StageDef | null) => {
    setError(null);
    setNotice(null);
    setIsNew(!s);
    const target = s ?? EMPTY;
    setEditing(structuredClone(target));
    setZonesJson(JSON.stringify(target.valueZones, null, 2));
  };

  const save = async () => {
    if (!editing) return;
    setError(null);
    let zones;
    try {
      zones = JSON.parse(zonesJson);
    } catch {
      setError("valueZones JSON 파싱 실패");
      return;
    }
    try {
      await adminFetch("/api/admin/stages", {
        method: isNew ? "POST" : "PATCH",
        body: JSON.stringify({ ...editing, valueZones: zones }),
      });
      setEditing(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const remove = async (s: StageDef) => {
    if (!confirm(t("stages.confirmDelete", { id: s.stageId }))) return;
    try {
      await adminFetch(`/api/admin/stages?id=${encodeURIComponent(s.stageId)}`, {
        method: "DELETE",
      });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const seed = async () => {
    try {
      const r = await adminFetch<{ seeded: number }>("/api/admin/stages/seed", { method: "POST" });
      setNotice(t("stages.seedDone", { count: r.seeded }));
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const toggleActive = async (s: StageDef) => {
    try {
      await adminFetch("/api/admin/stages", {
        method: "PATCH",
        body: JSON.stringify({ ...s, isActive: !s.isActive }),
      });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const f = t("stages.fields", { returnObjects: true }) as Record<string, string>;

  return (
    <div className="max-w-4xl">
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={() => openEdit(null)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-500"
        >
          {t("stages.create")}
        </button>
        <button
          onClick={seed}
          className="rounded-lg bg-zinc-800 px-4 py-2 text-sm hover:bg-zinc-700"
        >
          {t("stages.seed")}
        </button>
        {notice && <span className="text-sm text-emerald-400">{notice}</span>}
      </div>
      {error && <p className="mb-3 text-sm text-red-400">{t("error", { message: error })}</p>}

      {/* 편집 폼 */}
      {editing && (
        <div className="mb-6 grid gap-3 rounded-xl border border-zinc-700 bg-zinc-900 p-5 sm:grid-cols-2">
          <label className="text-sm">
            <span className="text-zinc-400">{f.stageId}</span>
            <input
              disabled={!isNew}
              value={editing.stageId}
              onChange={(e) => setEditing({ ...editing, stageId: e.target.value })}
              className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 disabled:opacity-50"
            />
          </label>
          <label className="text-sm">
            <span className="text-zinc-400">{f.order}</span>
            <input
              type="number"
              value={editing.order}
              onChange={(e) => setEditing({ ...editing, order: Number(e.target.value) })}
              className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5"
            />
          </label>
          <label className="text-sm">
            <span className="text-zinc-400">{f.nameKo}</span>
            <input
              value={editing.name.ko}
              onChange={(e) => setEditing({ ...editing, name: { ...editing.name, ko: e.target.value } })}
              className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5"
            />
          </label>
          <label className="text-sm">
            <span className="text-zinc-400">{f.nameEn}</span>
            <input
              value={editing.name.en ?? ""}
              onChange={(e) => setEditing({ ...editing, name: { ...editing.name, en: e.target.value } })}
              className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5"
            />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="text-zinc-400">{f.descKo}</span>
            <input
              value={editing.description.ko}
              onChange={(e) =>
                setEditing({ ...editing, description: { ...editing.description, ko: e.target.value } })
              }
              className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5"
            />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="text-zinc-400">{f.descEn}</span>
            <input
              value={editing.description.en ?? ""}
              onChange={(e) =>
                setEditing({ ...editing, description: { ...editing.description, en: e.target.value } })
              }
              className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5"
            />
          </label>
          <label className="text-sm">
            <span className="text-zinc-400">{f.botTier}</span>
            <select
              value={editing.botTier}
              onChange={(e) => setEditing({ ...editing, botTier: Number(e.target.value) as 1 | 2 | 3 })}
              className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5"
            >
              {[1, 2, 3].map((v) => (
                <option key={v} value={v}>
                  Lv.{v}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-zinc-400">{f.botCount}</span>
            <input
              type="number"
              min={1}
              max={6}
              value={editing.botCount}
              onChange={(e) => setEditing({ ...editing, botCount: Number(e.target.value) })}
              className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5"
            />
          </label>
          <label className="text-sm">
            <span className="text-zinc-400">{f.mapSize}</span>
            <input
              type="number"
              min={40}
              max={200}
              value={editing.mapSize}
              onChange={(e) => setEditing({ ...editing, mapSize: Number(e.target.value) })}
              className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5"
            />
          </label>
          <label className="text-sm">
            <span className="text-zinc-400">{f.theme}</span>
            <select
              value={editing.theme}
              onChange={(e) => setEditing({ ...editing, theme: e.target.value as "earth" | "space" })}
              className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5"
            >
              <option value="earth">earth</option>
              <option value="space">space</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="text-zinc-400">{f.clearType}</span>
            <select
              value={editing.clearCondition.type}
              onChange={(e) =>
                setEditing({
                  ...editing,
                  clearCondition: {
                    ...editing.clearCondition,
                    type: e.target.value as "areaPercent" | "surviveTime",
                  },
                })
              }
              className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5"
            >
              <option value="areaPercent">areaPercent</option>
              <option value="surviveTime">surviveTime</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="text-zinc-400">{f.clearValue}</span>
            <input
              type="number"
              value={editing.clearCondition.value}
              onChange={(e) =>
                setEditing({
                  ...editing,
                  clearCondition: { ...editing.clearCondition, value: Number(e.target.value) },
                })
              }
              className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5"
            />
          </label>
          <label className="text-sm">
            <span className="text-zinc-400">{f.timeLimitSec}</span>
            <input
              type="number"
              value={editing.timeLimitSec}
              onChange={(e) => setEditing({ ...editing, timeLimitSec: Number(e.target.value) })}
              className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5"
            />
          </label>
          <label className="text-sm">
            <span className="text-zinc-400">{f.backgroundImage}</span>
            <select
              value={editing.backgroundImageId ?? ""}
              onChange={(e) =>
                setEditing({ ...editing, backgroundImageId: e.target.value || undefined })
              }
              className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5"
            >
              <option value="">{f.noImage}</option>
              {approvedImages.map((im) => (
                <option key={im.imageId} value={im.imageId}>
                  [{im.theme}] {im.imageId.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={editing.isActive}
              onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })}
            />
            <span className="text-zinc-400">{f.isActive}</span>
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="text-zinc-400">{f.valueZones}</span>
            <textarea
              rows={6}
              value={zonesJson}
              onChange={(e) => setZonesJson(e.target.value)}
              className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 font-mono text-xs"
            />
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <button
              onClick={save}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-500"
            >
              {t("stages.save")}
            </button>
            <button
              onClick={() => setEditing(null)}
              className="rounded-lg bg-zinc-800 px-4 py-2 text-sm hover:bg-zinc-700"
            >
              {t("stages.cancel")}
            </button>
          </div>
        </div>
      )}

      {/* 목록 */}
      {stages.length === 0 ? (
        <p className="text-sm text-zinc-500">{t("stages.empty")}</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-700 text-zinc-400">
            <tr>
              <th className="py-2 pr-3">#</th>
              <th className="py-2 pr-3">ID</th>
              <th className="py-2 pr-3">{f.nameKo}</th>
              <th className="py-2 pr-3">Bot</th>
              <th className="py-2 pr-3">Clear</th>
              <th className="py-2 pr-3">{f.isActive}</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {stages.map((s) => (
              <tr key={s.stageId} className="border-b border-zinc-800/60">
                <td className="py-2 pr-3">{s.order}</td>
                <td className="py-2 pr-3 font-mono text-xs text-zinc-400">{s.stageId}</td>
                <td className="py-2 pr-3">{pickText(s.name, i18n.language)}</td>
                <td className="py-2 pr-3">
                  Lv.{s.botTier} ×{s.botCount}
                </td>
                <td className="py-2 pr-3 text-zinc-400">
                  {s.clearCondition.type === "areaPercent"
                    ? `${s.clearCondition.value}%`
                    : `${s.clearCondition.value}s`}
                </td>
                <td className="py-2 pr-3">
                  <button
                    onClick={() => toggleActive(s)}
                    className={s.isActive ? "text-emerald-400" : "text-zinc-500"}
                  >
                    {s.isActive ? t("stages.active") : t("stages.inactive")}
                  </button>
                </td>
                <td className="py-2">
                  <div className="flex gap-2 text-xs">
                    <button
                      onClick={() => openEdit(s)}
                      className="rounded bg-zinc-800 px-2 py-1 hover:bg-zinc-700"
                    >
                      {t("stages.edit")}
                    </button>
                    <button
                      onClick={() => remove(s)}
                      className="rounded bg-red-900/60 px-2 py-1 hover:bg-red-800"
                    >
                      {t("stages.delete")}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
