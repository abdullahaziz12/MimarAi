"use client";

import React, { useEffect, useState } from "react";
import { getBackendUrlStatus, getBackendApiUrl } from "../lib/backendConfig";

export default function DiagnosticBadge() {
  const [dbStatus, setDbStatus] = useState({
    state: "checking",
    label: "Checking backend/db…",
  });

  useEffect(() => {
    const backendConfig = getBackendUrlStatus();

    if (!backendConfig.configured) {
      setDbStatus({
        state: "not-configured",
        label: "Backend not configured (set NEXT_PUBLIC_BACKEND_URL)",
      });
      return;
    }

    fetch(getBackendApiUrl("/health/db"))
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));

        if (res.ok && data.status === "ok" && data.db === "connected") {
          setDbStatus({
            state: "connected",
            label: `Backend & Supabase Connected (${data.projects_count ?? 0} projects)`,
          });
          return;
        }

        if (data.db === "unconfigured") {
          setDbStatus({
            state: "unconfigured",
            label: "Backend Connected (Supabase credentials pending setup)",
          });
          return;
        }

        setDbStatus({
          state: "warning",
          label: `Backend responded but DB status is ${data.db || "unknown"}`,
        });
      })
      .catch(() => {
        setDbStatus({
          state: "offline",
          label: "Backend URL configured but backend is offline or unreachable",
        });
      });
  }, []);

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 10,
        fontFamily: "var(--font-mono, monospace)",
        color:
          dbStatus.state === "connected"
            ? "#10B981"
            : dbStatus.state === "unconfigured"
              ? "#38BDF8"
              : "#94A3B8",
        padding: "2px 8px",
        borderRadius: 4,
        background: "rgba(14, 23, 43, 0.6)",
        border: "1px solid rgba(56, 189, 248, 0.15)",
        marginLeft: 12,
      }}
      title={`MimarAi V0 Proof-of-Life: ${dbStatus.label}`}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          backgroundColor:
            dbStatus.state === "connected"
              ? "#10B981"
              : dbStatus.state === "unconfigured"
                ? "#38BDF8"
                : "#64748B",
          display: "inline-block",
        }}
      ></span>
      <span>{dbStatus.label}</span>
    </div>
  );
}
