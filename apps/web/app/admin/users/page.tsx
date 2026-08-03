"use client";

// 회원 관리 (docs/06 §2-1) — 목록/검색, 정지·해제, role 변경

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { adminFetch } from "@/lib/adminApi";

interface AdminUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  role: "user" | "admin";
  status: "active" | "suspended";
  level: number;
  points: number;
  rankTier: string;
  createdAt: string | null;
  lastLoginAt: string | null;
}

export default function AdminUsers() {
  const { t } = useTranslation("admin");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    adminFetch<{ users: AdminUser[] }>("/api/admin/users")
      .then((r) => setUsers(r.users))
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const patch = async (u: AdminUser, updates: { status?: string; role?: string }) => {
    setBusy(u.uid);
    setError(null);
    try {
      await adminFetch("/api/admin/users", {
        method: "PATCH",
        body: JSON.stringify({ uid: u.uid, ...updates }),
      });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const filtered = users.filter(
    (u) =>
      !q ||
      u.email.toLowerCase().includes(q.toLowerCase()) ||
      u.displayName.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="max-w-5xl">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("users.search")}
        className="mb-4 w-72 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-blue-600"
      />
      {error && <p className="mb-3 text-sm text-red-400">{t("error", { message: error })}</p>}
      {filtered.length === 0 ? (
        <p className="text-zinc-500">{t("users.empty")}</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-700 text-zinc-400">
            <tr>
              <th className="py-2 pr-3">User</th>
              <th className="py-2 pr-3">Email</th>
              <th className="py-2 pr-3">Lv</th>
              <th className="py-2 pr-3">P</th>
              <th className="py-2 pr-3">Role</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.uid} className="border-b border-zinc-800/60">
                <td className="py-2 pr-3">
                  <div className="flex items-center gap-2">
                    {u.photoURL && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={u.photoURL} alt="" className="h-6 w-6 rounded-full" />
                    )}
                    {u.displayName}
                  </div>
                </td>
                <td className="py-2 pr-3 text-zinc-400">{u.email}</td>
                <td className="py-2 pr-3">{u.level}</td>
                <td className="py-2 pr-3">{u.points}</td>
                <td className="py-2 pr-3">
                  <span
                    className={
                      u.role === "admin"
                        ? "rounded bg-purple-800 px-1.5 py-0.5 text-xs"
                        : "text-zinc-400"
                    }
                  >
                    {u.role}
                  </span>
                </td>
                <td className="py-2 pr-3">
                  <span className={u.status === "suspended" ? "text-red-400" : "text-emerald-400"}>
                    {u.status}
                  </span>
                </td>
                <td className="py-2">
                  <div className="flex gap-2 text-xs">
                    <button
                      disabled={busy === u.uid}
                      onClick={() => {
                        const suspending = u.status === "active";
                        if (
                          confirm(
                            t("users.confirmSuspend", {
                              name: u.displayName || u.email,
                              action: suspending ? t("users.suspend") : t("users.unsuspend"),
                            }),
                          )
                        ) {
                          patch(u, { status: suspending ? "suspended" : "active" });
                        }
                      }}
                      className="rounded bg-zinc-800 px-2 py-1 hover:bg-zinc-700 disabled:opacity-50"
                    >
                      {u.status === "active" ? t("users.suspend") : t("users.unsuspend")}
                    </button>
                    <button
                      disabled={busy === u.uid}
                      onClick={() => {
                        const newRole = u.role === "admin" ? "user" : "admin";
                        if (
                          confirm(
                            t("users.confirmRole", {
                              name: u.displayName || u.email,
                              role: newRole,
                            }),
                          )
                        ) {
                          patch(u, { role: newRole });
                        }
                      }}
                      className="rounded bg-zinc-800 px-2 py-1 hover:bg-zinc-700 disabled:opacity-50"
                    >
                      {u.role === "admin" ? t("users.removeAdmin") : t("users.makeAdmin")}
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
