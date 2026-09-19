"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../context/AuthContext";
import Link from "next/link";
import { useRouter } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://mimaraibackend-bxs0vr37.b4a.run";

export default function AdminPortalPage() {
  const { user, session, loading: authLoading } = useAuth();
  const router = useRouter();

  const [isAdmin, setIsAdmin] = useState(null); // null = checking, true = ok, false = 403
  const [adminEmail, setAdminEmail] = useState("");
  const [windowFilter, setWindowFilter] = useState("7d");
  const [loadingData, setLoadingData] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // Metric states
  const [usersData, setUsersData] = useState(null);
  const [successRateData, setSuccessRateData] = useState(null);
  const [sessionsData, setSessionsData] = useState(null);
  const [aiUsageData, setAiUsageData] = useState(null);

  // 1. Verify Admin Access on Mount
  const verifyAdmin = useCallback(async (token) => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setIsAdmin(true);
        setAdminEmail(data.email || "");
        return true;
      } else {
        setIsAdmin(false);
        return false;
      }
    } catch (err) {
      setIsAdmin(false);
      return false;
    }
  }, []);

  // 2. Fetch all Admin Dashboard Data
  const fetchDashboardData = useCallback(async (token, win) => {
    setLoadingData(true);
    setErrorMsg(null);
    try {
      const headers = { Authorization: `Bearer ${token}` };

      const [usersRes, srRes, sessRes, aiRes] = await Promise.all([
        fetch(`${API_BASE}/api/admin/users`, { headers }),
        fetch(`${API_BASE}/api/admin/success-rate?window=${win}`, { headers }),
        fetch(`${API_BASE}/api/admin/sessions?window=${win}`, { headers }),
        fetch(`${API_BASE}/api/admin/ai-usage?window=${win}`, { headers }),
      ]);

      if (usersRes.ok) setUsersData(await usersRes.json());
      if (srRes.ok) setSuccessRateData(await srRes.json());
      if (sessRes.ok) setSessionsData(await sessRes.json());
      if (aiRes.ok) setAiUsageData(await aiRes.json());

      setLastRefreshed(new Date());
    } catch (err) {
      setErrorMsg("Failed to synchronize admin metrics. Check connection.");
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!session?.access_token) {
      setIsAdmin(false);
      return;
    }

    verifyAdmin(session.access_token).then((authorized) => {
      if (authorized) {
        fetchDashboardData(session.access_token, windowFilter);
      }
    });
  }, [authLoading, session, verifyAdmin, fetchDashboardData, windowFilter]);

  const handleRefresh = () => {
    if (session?.access_token && isAdmin) {
      fetchDashboardData(session.access_token, windowFilter);
    }
  };

  // --- Auth Checking Screen ---
  if (authLoading || isAdmin === null) {
    return (
      <div style={styles.authContainer}>
        <div style={styles.terminalCard}>
          <div style={styles.terminalHeader}>
            <span style={styles.terminalDot("#EF4444")}></span>
            <span style={styles.terminalDot("#F59E0B")}></span>
            <span style={styles.terminalDot("#10B981")}></span>
            <span style={styles.terminalTitle}>MIMARAI SECURITY GATEWAY</span>
          </div>
          <div style={styles.terminalBody}>
            <div style={styles.monoText}>&gt; Verifying security credentials...</div>
            <div style={styles.monoDim}>[AUTH PROTOCOL]: Checking admin_allowlist registry</div>
            <div style={styles.spinner}></div>
          </div>
        </div>
      </div>
    );
  }

  // --- 403 Forbidden Screen ---
  if (isAdmin === false) {
    return (
      <div style={styles.authContainer}>
        <div style={styles.terminalCard}>
          <div style={styles.terminalHeader}>
            <span style={styles.terminalDot("#EF4444")}></span>
            <span style={styles.terminalTitle}>403 ACCESS DENIED // CLEARANCE REQUIRED</span>
          </div>
          <div style={styles.terminalBody}>
            <div style={{ color: "#EF4444", fontFamily: "var(--font-mono, monospace)", fontSize: "14px", fontWeight: "600", marginBottom: "8px" }}>
              [SECURITY VIOLATION]: UNAUTHORIZED ACCESS ATTEMPT
            </div>
            <div style={styles.monoDim}>
              The authenticated account ({user?.email || "unknown"}) is not registered in the administrative allowlist.
            </div>
            <div style={{ marginTop: "20px" }}>
              <Link href="/" style={styles.actionBtn}>
                &larr; Return to MimarAI
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- Calculations & Formatting Helpers ---
  const totalCalls = aiUsageData?.total_calls || 0;
  const groqCalls = aiUsageData?.provider_breakdown?.groq || 0;
  const geminiCalls = aiUsageData?.provider_breakdown?.gemini || 0;
  const groqPct = totalCalls > 0 ? Math.round((groqCalls / totalCalls) * 100) : 50;
  const geminiPct = totalCalls > 0 ? 100 - groqPct : 50;

  return (
    <div style={styles.pageWrapper}>
      {/* Background blueprint grid overlay */}
      <div style={styles.gridOverlay}></div>

      <div style={styles.container}>
        {/* Top Header */}
        <header style={styles.header}>
          <div>
            <div style={styles.badgeRow}>
              <span style={styles.liveBadge}>
                <span style={styles.pulseDot}></span> LIVE TELEMETRY
              </span>
              <span style={styles.adminTag}>CLEARANCE: LEVEL-1 ADMIN</span>
            </div>
            <h1 style={styles.mainHeading}>MimarAI Command Center</h1>
            <p style={styles.subHeading}>
              Precision Architecture &amp; System Intelligence Operations
            </p>
          </div>

          <div style={styles.headerControls}>
            <div style={styles.windowSwitcher}>
              {["24h", "7d", "30d", "all"].map((w) => (
                <button
                  key={w}
                  onClick={() => setWindowFilter(w)}
                  style={styles.switchBtn(windowFilter === w)}
                >
                  {w.toUpperCase()}
                </button>
              ))}
            </div>

            <button
              onClick={handleRefresh}
              disabled={loadingData}
              style={styles.refreshBtn}
              title="Refresh Telemetry Data"
            >
              {loadingData ? "SYNCING..." : "⟳ REFRESH"}
            </button>

            <Link href="/app" style={styles.backLink}>
              EXIT TO APP &rarr;
            </Link>
          </div>
        </header>

        {errorMsg && (
          <div style={styles.errorBanner}>
            <span>⚠️ {errorMsg}</span>
          </div>
        )}

        {/* Top Quick Stats Grid */}
        <div style={styles.statsGrid}>
          {/* Card 1: Total Users */}
          <div style={styles.metricCard}>
            <div style={styles.cardHeader}>
              <span style={styles.cardLabel}>TOTAL PLATFORM USERS</span>
              <span style={styles.maturityBadge("mature")}>AUTH.USERS</span>
            </div>
            <div style={styles.metricValue}>
              {usersData ? usersData.total_users.toLocaleString() : "..."}
            </div>
            <div style={styles.cardFooter}>
              <span style={styles.trendGreen}>+{usersData?.new_users_7d || 0}</span> in past 7 days &bull;{" "}
              <span style={styles.trendDim}>+{usersData?.new_users_30d || 0} (30d)</span>
            </div>
          </div>

          {/* Card 2: Generation Success Rate */}
          <div style={styles.metricCard}>
            <div style={styles.cardHeader}>
              <span style={styles.cardLabel}>GENERATION SUCCESS RATE</span>
              <span style={styles.maturityBadge("audit")}>EVENT LOGS</span>
            </div>
            <div style={{ ...styles.metricValue, color: "#10B981" }}>
              {successRateData ? `${successRateData.success_rate_pct}%` : "..."}
            </div>
            <div style={styles.cardFooter}>
              <span>{successRateData?.successful_runs || 0} successful</span> &bull;{" "}
              <span style={{ color: successRateData?.failed_runs ? "#EF4444" : "inherit" }}>
                {successRateData?.failed_runs || 0} failed
              </span>{" "}
              ({successRateData?.total_attempts || 0} runs)
            </div>
          </div>

          {/* Card 3: Active Sessions */}
          <div style={styles.metricCard}>
            <div style={styles.cardHeader}>
              <span style={styles.cardLabel}>TIME SPENT ON PLATFORM</span>
              <span style={styles.maturityBadge("estimate")}>ESTIMATED</span>
            </div>
            <div style={styles.metricValue}>
              {sessionsData ? `${sessionsData.total_time_spent_minutes}m` : "..."}
            </div>
            <div style={styles.cardFooter}>
              <span style={styles.trendCyan}>{sessionsData?.active_sessions_now || 0} active now</span> &bull;{" "}
              <span>Avg {sessionsData?.avg_session_duration_minutes || 0}m/session</span>
            </div>
          </div>

          {/* Card 4: AI Call Usage */}
          <div style={styles.metricCard}>
            <div style={styles.cardHeader}>
              <span style={styles.cardLabel}>TOTAL AI CALLS ({windowFilter.toUpperCase()})</span>
              <span style={styles.maturityBadge("counts")}>CALL COUNTS</span>
            </div>
            <div style={{ ...styles.metricValue, color: "#F97316" }}>
              {aiUsageData ? aiUsageData.total_calls.toLocaleString() : "..."}
            </div>
            <div style={styles.cardFooter}>
              <span>Avg Latency: {aiUsageData?.avg_latency_ms || 0}ms</span> &bull;{" "}
              <span>Dual-Provider</span>
            </div>
          </div>
        </div>

        {/* Detailed Sections: Two Column Layout */}
        <div style={styles.twoColumnGrid}>
          {/* Column A: Generation Reliability & Failure Audit */}
          <div style={styles.panelContainer}>
            <div style={styles.panelTitleRow}>
              <div>
                <h3 style={styles.panelTitle}>⚡ Generation Pipeline Reliability</h3>
                <p style={styles.panelSub}>Audit trail across dual-model drafting, fix passes, and quality gates</p>
              </div>
            </div>

            {/* Failure Reasons Breakdown */}
            <div style={styles.breakdownBox}>
              <div style={styles.breakdownTitle}>Top Failure Categories ({windowFilter})</div>
              {successRateData && Object.keys(successRateData.failure_reasons || {}).length > 0 ? (
                <div style={styles.tagList}>
                  {Object.entries(successRateData.failure_reasons).map(([reason, count]) => (
                    <div key={reason} style={styles.failureTag}>
                      <span style={{ color: "#EF4444" }}>● {reason}</span>
                      <span style={styles.tagCount}>{count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={styles.emptyNotice}>Zero pipeline failures recorded in this time window. 100% operational.</div>
              )}
            </div>

            {/* Recent Events Table */}
            <div style={{ marginTop: "16px" }}>
              <div style={styles.breakdownTitle}>Recent Pipeline Runs</div>
              <div style={styles.tableWrapper}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>TIME (UTC)</th>
                      <th style={styles.th}>STATUS</th>
                      <th style={styles.th}>PROJECT</th>
                      <th style={styles.th}>DIAGNOSIS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {successRateData?.recent_events?.length > 0 ? (
                      successRateData.recent_events.map((ev) => (
                        <tr key={ev.id} style={styles.tr}>
                          <td style={styles.tdMono}>
                            {new Date(ev.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                          </td>
                          <td style={styles.td}>
                            <span style={styles.statusPill(ev.status)}>
                              {ev.status.toUpperCase()}
                            </span>
                          </td>
                          <td style={styles.tdMono}>
                            {ev.project_id ? `${ev.project_id.substring(0, 8)}...` : "—"}
                          </td>
                          <td style={styles.tdDim}>
                            {ev.failure_reason || "Clean execution"}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} style={styles.emptyTd}>
                          No generation events logged yet. (Events populate on new `/generate` runs).
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Column B: AI Provider & Pipeline Stage Distribution */}
          <div style={styles.panelContainer}>
            <div style={styles.panelTitleRow}>
              <div>
                <h3 style={styles.panelTitle}>🤖 AI Provider Telemetry</h3>
                <p style={styles.panelSub}>Distribution of LLM calls across Groq and Gemini</p>
              </div>
            </div>

            {/* Provider Split Bar */}
            <div style={styles.providerBarBox}>
              <div style={styles.providerLabelRow}>
                <span style={{ color: "#F97316", fontWeight: "600", fontFamily: "var(--font-mono)" }}>
                  GROQ: {groqCalls} ({groqPct}%)
                </span>
                <span style={{ color: "#38BDF8", fontWeight: "600", fontFamily: "var(--font-mono)" }}>
                  GEMINI: {geminiCalls} ({geminiPct}%)
                </span>
              </div>
              <div style={styles.progressTrack}>
                <div style={{ ...styles.progressFillOrange, width: `${groqPct}%` }}></div>
                <div style={{ ...styles.progressFillCyan, width: `${geminiPct}%` }}></div>
              </div>
            </div>

            {/* Pipeline Stage Breakdown */}
            <div style={{ marginTop: "20px" }}>
              <div style={styles.breakdownTitle}>Calls by Pipeline Stage</div>
              <div style={styles.stageGrid}>
                {aiUsageData && Object.keys(aiUsageData.stage_breakdown || {}).length > 0 ? (
                  Object.entries(aiUsageData.stage_breakdown).map(([stg, count]) => (
                    <div key={stg} style={styles.stageCard}>
                      <span style={styles.stageName}>{stg}</span>
                      <span style={styles.stageCount}>{count} calls</span>
                    </div>
                  ))
                ) : (
                  <div style={styles.emptyNotice}>
                    No stage-level calls logged yet. Instrumentation active on live requests.
                  </div>
                )}
              </div>
            </div>

            {/* Session Activity Disclaimer Box */}
            <div style={styles.disclaimerBox}>
              <div style={styles.disclaimerTitle}>ℹ️ DATA MATURITY &amp; INSTRUMENTATION NOTES</div>
              <ul style={styles.disclaimerList}>
                <li><strong>User Statistics:</strong> Derived from authoritative Supabase <code>auth.users</code> database records.</li>
                <li><strong>Pipeline Success Rate:</strong> Recorded at the completion boundary of every <code>/generate</code> execution.</li>
                <li><strong>Active Sessions:</strong> Approximated via periodic (60s) client visibility heartbeats.</li>
                <li><strong>AI Usage:</strong> Real-time call count instrumentation. Dollar costs require provider pricing configuration.</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer style={styles.footer}>
          <span>MimarAI Command Center &bull; Connected to {API_BASE}</span>
          <span>Logged in as: {adminEmail || user?.email}</span>
          {lastRefreshed && (
            <span>Last Sync: {lastRefreshed.toLocaleTimeString()}</span>
          )}
        </footer>
      </div>
    </div>
  );
}

// --- Styles (Design Tokens matching MimarAi Blueprint Theme) ---
const styles = {
  pageWrapper: {
    minHeight: "100vh",
    backgroundColor: "#060B13",
    color: "#F1F5F9",
    fontFamily: "var(--font-body, 'Inter', -apple-system, sans-serif)",
    position: "relative",
    overflowX: "hidden",
  },
  gridOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundImage: `
      linear-gradient(to right, rgba(56, 189, 248, 0.03) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(56, 189, 248, 0.03) 1px, transparent 1px)
    `,
    backgroundSize: "32px 32px",
    pointerEvents: "none",
  },
  container: {
    maxWidth: "1400px",
    margin: "0 auto",
    padding: "32px 24px 64px",
    position: "relative",
    zIndex: 1,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottom: "1px solid rgba(56, 189, 248, 0.15)",
    paddingBottom: "24px",
    marginBottom: "32px",
    flexWrap: "wrap",
    gap: "16px",
  },
  badgeRow: {
    display: "flex",
    gap: "8px",
    marginBottom: "8px",
    alignItems: "center",
  },
  liveBadge: {
    fontSize: "11px",
    fontWeight: "700",
    letterSpacing: "0.08em",
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    color: "#10B981",
    border: "1px solid rgba(16, 185, 129, 0.3)",
    padding: "3px 8px",
    borderRadius: "4px",
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    fontFamily: "var(--font-mono, monospace)",
  },
  pulseDot: {
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    backgroundColor: "#10B981",
  },
  adminTag: {
    fontSize: "11px",
    fontWeight: "700",
    letterSpacing: "0.08em",
    backgroundColor: "rgba(249, 115, 22, 0.12)",
    color: "#F97316",
    border: "1px solid rgba(249, 115, 22, 0.3)",
    padding: "3px 8px",
    borderRadius: "4px",
    fontFamily: "var(--font-mono, monospace)",
  },
  mainHeading: {
    fontSize: "28px",
    fontWeight: "700",
    color: "#F8FAFC",
    margin: "0 0 4px 0",
    letterSpacing: "-0.02em",
  },
  subHeading: {
    fontSize: "14px",
    color: "#94A3B8",
    margin: 0,
  },
  headerControls: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    flexWrap: "wrap",
  },
  windowSwitcher: {
    display: "flex",
    backgroundColor: "#0C1322",
    border: "1px solid rgba(56, 189, 248, 0.2)",
    borderRadius: "6px",
    padding: "2px",
  },
  switchBtn: (active) => ({
    padding: "6px 12px",
    fontSize: "12px",
    fontWeight: "600",
    fontFamily: "var(--font-mono, monospace)",
    borderRadius: "4px",
    border: "none",
    cursor: "pointer",
    backgroundColor: active ? "#38BDF8" : "transparent",
    color: active ? "#060B13" : "#94A3B8",
    transition: "all 0.15s ease",
  }),
  refreshBtn: {
    padding: "7px 14px",
    fontSize: "12px",
    fontWeight: "600",
    fontFamily: "var(--font-mono, monospace)",
    backgroundColor: "#111B2E",
    border: "1px solid rgba(56, 189, 248, 0.25)",
    color: "#38BDF8",
    borderRadius: "6px",
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  backLink: {
    padding: "7px 14px",
    fontSize: "12px",
    fontWeight: "600",
    fontFamily: "var(--font-mono, monospace)",
    backgroundColor: "rgba(249, 115, 22, 0.1)",
    border: "1px solid rgba(249, 115, 22, 0.3)",
    color: "#F97316",
    borderRadius: "6px",
    textDecoration: "none",
  },
  errorBanner: {
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    border: "1px solid rgba(239, 68, 68, 0.3)",
    color: "#FCA5A5",
    padding: "12px 16px",
    borderRadius: "6px",
    marginBottom: "24px",
    fontFamily: "var(--font-mono, monospace)",
    fontSize: "13px",
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: "16px",
    marginBottom: "32px",
  },
  metricCard: {
    backgroundColor: "#0C1322",
    border: "1px solid rgba(56, 189, 248, 0.16)",
    borderRadius: "8px",
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "12px",
  },
  cardLabel: {
    fontSize: "11px",
    fontWeight: "700",
    letterSpacing: "0.06em",
    color: "#94A3B8",
    fontFamily: "var(--font-mono, monospace)",
  },
  maturityBadge: (type) => ({
    fontSize: "9px",
    fontWeight: "700",
    letterSpacing: "0.04em",
    padding: "2px 6px",
    borderRadius: "3px",
    fontFamily: "var(--font-mono, monospace)",
    backgroundColor:
      type === "mature" ? "rgba(16, 185, 129, 0.1)" :
      type === "audit" ? "rgba(56, 189, 248, 0.1)" :
      type === "estimate" ? "rgba(245, 158, 11, 0.1)" : "rgba(148, 163, 184, 0.1)",
    color:
      type === "mature" ? "#10B981" :
      type === "audit" ? "#38BDF8" :
      type === "estimate" ? "#F59E0B" : "#94A3B8",
    border: `1px solid ${
      type === "mature" ? "rgba(16, 185, 129, 0.25)" :
      type === "audit" ? "rgba(56, 189, 248, 0.25)" :
      type === "estimate" ? "rgba(245, 158, 11, 0.25)" : "rgba(148, 163, 184, 0.25)"
    }`,
  }),
  metricValue: {
    fontSize: "32px",
    fontWeight: "800",
    fontFamily: "var(--font-mono, monospace)",
    color: "#F8FAFC",
    marginBottom: "8px",
    letterSpacing: "-0.02em",
  },
  cardFooter: {
    fontSize: "12px",
    color: "#64748B",
  },
  trendGreen: {
    color: "#10B981",
    fontWeight: "600",
  },
  trendCyan: {
    color: "#38BDF8",
    fontWeight: "600",
  },
  trendDim: {
    color: "#94A3B8",
  },
  twoColumnGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(500px, 1fr))",
    gap: "24px",
    marginBottom: "48px",
  },
  panelContainer: {
    backgroundColor: "#0C1322",
    border: "1px solid rgba(56, 189, 248, 0.16)",
    borderRadius: "8px",
    padding: "24px",
  },
  panelTitleRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: "20px",
  },
  panelTitle: {
    fontSize: "16px",
    fontWeight: "700",
    color: "#F8FAFC",
    margin: "0 0 4px 0",
  },
  panelSub: {
    fontSize: "12px",
    color: "#64748B",
    margin: 0,
  },
  breakdownBox: {
    backgroundColor: "#111B2E",
    border: "1px solid rgba(56, 189, 248, 0.1)",
    borderRadius: "6px",
    padding: "16px",
  },
  breakdownTitle: {
    fontSize: "12px",
    fontWeight: "700",
    color: "#94A3B8",
    fontFamily: "var(--font-mono, monospace)",
    marginBottom: "12px",
  },
  tagList: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
  },
  failureTag: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    border: "1px solid rgba(239, 68, 68, 0.2)",
    padding: "4px 10px",
    borderRadius: "4px",
    fontSize: "12px",
    fontFamily: "var(--font-mono, monospace)",
  },
  tagCount: {
    backgroundColor: "rgba(239, 68, 68, 0.2)",
    color: "#FCA5A5",
    padding: "1px 5px",
    borderRadius: "3px",
    fontWeight: "700",
    fontSize: "10px",
  },
  emptyNotice: {
    fontSize: "12px",
    color: "#64748B",
    fontStyle: "italic",
    padding: "8px 0",
  },
  tableWrapper: {
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "12px",
  },
  th: {
    textAlign: "left",
    padding: "10px 12px",
    color: "#64748B",
    fontFamily: "var(--font-mono, monospace)",
    fontSize: "11px",
    fontWeight: "600",
    borderBottom: "1px solid rgba(56, 189, 248, 0.15)",
  },
  tr: {
    borderBottom: "1px solid rgba(56, 189, 248, 0.06)",
  },
  td: {
    padding: "10px 12px",
    color: "#E2E8F0",
  },
  tdMono: {
    padding: "10px 12px",
    color: "#94A3B8",
    fontFamily: "var(--font-mono, monospace)",
  },
  tdDim: {
    padding: "10px 12px",
    color: "#64748B",
    fontSize: "11px",
    maxWidth: "180px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  emptyTd: {
    padding: "24px 12px",
    textAlign: "center",
    color: "#64748B",
    fontStyle: "italic",
  },
  statusPill: (status) => ({
    display: "inline-block",
    padding: "2px 6px",
    borderRadius: "3px",
    fontSize: "10px",
    fontWeight: "700",
    fontFamily: "var(--font-mono, monospace)",
    backgroundColor: status === "success" ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
    color: status === "success" ? "#10B981" : "#EF4444",
    border: `1px solid ${status === "success" ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
  }),
  providerBarBox: {
    backgroundColor: "#111B2E",
    border: "1px solid rgba(56, 189, 248, 0.1)",
    borderRadius: "6px",
    padding: "16px",
  },
  providerLabelRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "12px",
    marginBottom: "8px",
  },
  progressTrack: {
    height: "10px",
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    borderRadius: "5px",
    overflow: "hidden",
    display: "flex",
  },
  progressFillOrange: {
    height: "100%",
    backgroundColor: "#F97316",
    transition: "width 0.3s ease",
  },
  progressFillCyan: {
    height: "100%",
    backgroundColor: "#38BDF8",
    transition: "width 0.3s ease",
  },
  stageGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
    gap: "10px",
  },
  stageCard: {
    backgroundColor: "#111B2E",
    border: "1px solid rgba(56, 189, 248, 0.1)",
    borderRadius: "6px",
    padding: "12px",
    display: "flex",
    flexDirection: "column",
  },
  stageName: {
    fontSize: "11px",
    color: "#94A3B8",
    fontFamily: "var(--font-mono, monospace)",
    marginBottom: "4px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  stageCount: {
    fontSize: "16px",
    fontWeight: "700",
    color: "#F8FAFC",
    fontFamily: "var(--font-mono, monospace)",
  },
  disclaimerBox: {
    marginTop: "24px",
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    border: "1px dashed rgba(56, 189, 248, 0.2)",
    borderRadius: "6px",
    padding: "16px",
  },
  disclaimerTitle: {
    fontSize: "11px",
    fontWeight: "700",
    letterSpacing: "0.06em",
    color: "#38BDF8",
    fontFamily: "var(--font-mono, monospace)",
    marginBottom: "8px",
  },
  disclaimerList: {
    margin: 0,
    paddingLeft: "16px",
    fontSize: "11px",
    color: "#94A3B8",
    lineHeight: "1.6",
  },
  footer: {
    borderTop: "1px solid rgba(56, 189, 248, 0.15)",
    paddingTop: "24px",
    display: "flex",
    justifyContent: "space-between",
    fontSize: "12px",
    color: "#64748B",
    flexWrap: "wrap",
    gap: "12px",
  },
  authContainer: {
    minHeight: "100vh",
    backgroundColor: "#060B13",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px",
  },
  terminalCard: {
    maxWidth: "500px",
    width: "100%",
    backgroundColor: "#0C1322",
    border: "1px solid rgba(56, 189, 248, 0.25)",
    borderRadius: "8px",
    overflow: "hidden",
    boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)",
  },
  terminalHeader: {
    backgroundColor: "#111B2E",
    padding: "12px 16px",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    borderBottom: "1px solid rgba(56, 189, 248, 0.15)",
  },
  terminalDot: (color) => ({
    width: "10px",
    height: "10px",
    borderRadius: "50%",
    backgroundColor: color,
  }),
  terminalTitle: {
    fontSize: "11px",
    fontWeight: "700",
    color: "#94A3B8",
    fontFamily: "var(--font-mono, monospace)",
    letterSpacing: "0.08em",
  },
  terminalBody: {
    padding: "24px",
  },
  monoText: {
    fontFamily: "var(--font-mono, monospace)",
    fontSize: "14px",
    color: "#38BDF8",
    marginBottom: "8px",
  },
  monoDim: {
    fontFamily: "var(--font-mono, monospace)",
    fontSize: "12px",
    color: "#64748B",
    lineHeight: "1.5",
  },
  spinner: {
    width: "20px",
    height: "20px",
    border: "2px solid rgba(56, 189, 248, 0.2)",
    borderTopColor: "#38BDF8",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
    marginTop: "16px",
  },
  actionBtn: {
    display: "inline-block",
    padding: "8px 16px",
    fontSize: "13px",
    fontWeight: "600",
    backgroundColor: "#38BDF8",
    color: "#060B13",
    borderRadius: "6px",
    textDecoration: "none",
  },
};
