"use client";

// 액션 로그 (docs/06 §2-5)

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { adminFetch } from "@/lib/adminApi";

interface LogEntry {
  logId: string;
  adminUid: string;
  action: string;
  targetId: string;
  timestamp: string | null;
}

export default function AdminLogs() {
  const { t } = useTranslation("admin");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminFetch<{ logs: LogEntry[] }>("/api/admin/logs")
      .then((r) => setLogs(r.logs))
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-red-400">{t("error", { message: error })}</p>;
  if (logs.length === 0) return <p className="text-zinc-500">{t("logs.empty")}</p>;

  return (
    <table className="w-full max-w-4xl text-left text-sm">
      <thead className="border-b border-zinc-700 text-zinc-400">
        <tr>
          <th className="py-2 pr-3">{t("logs.time")}</th>
          <th className="py-2 pr-3">{t("logs.action")}</th>
          <th className="py-2 pr-3">{t("logs.target")}</th>
          <th className="py-2">{t("logs.admin")}</th>
        </tr>
      </thead>
      <tbody>
        {logs.map((l) => (
          <tr key={l.logId} className="border-b border-zinc-800/60">
            <td className="py-2 pr-3 text-zinc-400">
              {l.timestamp ? new Date(l.timestamp).toLocaleString() : "-"}
            </td>
            <td className="py-2 pr-3 font-mono text-xs">{l.action}</td>
            <td className="py-2 pr-3 font-mono text-xs text-zinc-400">{l.targetId}</td>
            <td className="py-2 font-mono text-xs text-zinc-500">{l.adminUid}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
