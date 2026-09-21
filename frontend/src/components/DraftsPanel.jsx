"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useMimarStore } from "../store/mimarStore";
import { useAuth } from "../context/AuthContext";

export default function DraftsPanel({ isOpen, onClose }) {
  const { session } = useAuth();
  const { loadProjectState, fetchDraftsList, projectId: currentProjectId, showToast } = useMimarStore();
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [resumingId, setResumingId] = useState(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Separate effect for Escape key listener to avoid re-triggering data fetch
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  // Data fetch effect: runs strictly when panel opens or session token becomes available
  const sessionToken = session?.access_token || null;
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setLoading(true);
    setError(null);

    fetchDraftsList(sessionToken)
      .then((res) => {
        if (!isMounted) return;
        if (res.status === "ok") {
          setDrafts(res.drafts || []);
        } else {
          setError(res.detail || "Unable to load drafts.");
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err.message || "Failed to connect to drafts service.");
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, sessionToken, fetchDraftsList]);

  if (!isOpen || !mounted) return null;

  const handleSelectDraft = async (draft) => {
    if (draft.id === currentProjectId) {
      showToast("This project is already loaded in your active workspace.");
      onClose();
      return;
    }

    setResumingId(draft.id);
    try {
      const res = await loadProjectState(draft.id, session?.access_token || null);
      if (res.status === "ok") {
        showToast(`Loaded draft: ${draft.name || draft.idea_text || "Project"}`);
        onClose();
      } else {
        showToast(res.detail || "Failed to load draft.");
      }
    } finally {
      setResumingId(null);
    }
  };

  const formatDate = (isoStr) => {
    if (!isoStr) return "";
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoStr;
    }
  };

  return createPortal(
    <div
      className="drafts-drawer-backdrop"
      onClick={onClose}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: "100vw",
        height: "100vh",
        backgroundColor: "rgba(5, 8, 16, 0.75)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        zIndex: 99999,
        display: "flex",
        justifyContent: "flex-end",
        animation: "fadeIn 0.18s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      <div
        className="drafts-drawer-panel"
        onClick={(e) => e.stopPropagation()}
        id="draftsDrawerPanel"
        style={{
          width: "420px",
          maxWidth: "92vw",
          height: "100%",
          backgroundColor: "var(--bg-surface, #0C1322)",
          borderLeft: "1px solid var(--border-line, rgba(56, 189, 248, 0.2))",
          boxShadow: "-8px 0 32px rgba(0, 0, 0, 0.6)",
          display: "flex",
          flexDirection: "column",
          fontFamily: "var(--font-body, inherit)",
          animation: "slideInRight 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* Drawer Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border-line, rgba(56, 189, 248, 0.16))",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: "var(--bg-surface-elevated, #111B2E)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "16px" }}>📁</span>
            <div>
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: 700,
                  color: "var(--blueprint-cyan, #38BDF8)",
                  fontFamily: "var(--font-mono, monospace)",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                Saved Draft Projects
              </div>
              <div
                style={{
                  fontSize: "11px",
                  color: "var(--ink-secondary, #94A3B8)",
                  marginTop: "2px",
                }}
              >
                {loading
                  ? "Loading drafts…"
                  : `${drafts.length} ${drafts.length === 1 ? "draft" : "drafts"} available`}
              </div>
            </div>
          </div>

          <button
            type="button"
            id="closeDraftsDrawerBtn"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "1px solid var(--border-line, rgba(56, 189, 248, 0.2))",
              color: "var(--ink-secondary, #94A3B8)",
              borderRadius: "4px",
              width: "28px",
              height: "28px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              fontSize: "14px",
              transition: "all 0.15s ease",
            }}
            title="Close panel (Esc)"
          >
            ✕
          </button>
        </div>

        {/* Drawer Content */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px 20px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          {loading && (
            <div
              style={{
                padding: "36px 0",
                textAlign: "center",
                color: "var(--blueprint-cyan, #38BDF8)",
                fontFamily: "var(--font-mono, monospace)",
                fontSize: "12px",
              }}
            >
              <div style={{ marginBottom: "8px", fontSize: "18px" }}>⚙️</div>
              Loading your saved drafts…
            </div>
          )}

          {!loading && error && (
            <div
              style={{
                padding: "14px",
                borderRadius: "6px",
                background: "rgba(239, 68, 68, 0.12)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                color: "#FCA5A5",
                fontSize: "12px",
              }}
            >
              ⚠️ {error}
            </div>
          )}

          {!loading && !error && drafts.length === 0 && (
            <div
              style={{
                padding: "48px 16px",
                textAlign: "center",
                color: "var(--ink-muted, #64748B)",
                fontSize: "13px",
              }}
            >
              <div style={{ fontSize: "28px", marginBottom: "12px" }}>📋</div>
              <div style={{ fontWeight: 600, color: "var(--ink-secondary, #94A3B8)" }}>
                No Drafts Found
              </div>
              <div style={{ fontSize: "11px", marginTop: "6px", lineHeight: "1.5" }}>
                Projects started in the interview stage will automatically appear here.
              </div>
            </div>
          )}

          {!loading &&
            !error &&
            drafts.map((draft) => {
              const isCurrent = draft.id === currentProjectId;
              const isResuming = resumingId === draft.id;
              const labelText =
                draft.idea_text || draft.name || draft.title || "Untitled Project";

              return (
                <div
                  key={draft.id}
                  id={`draft-item-${draft.id}`}
                  style={{
                    backgroundColor: isCurrent
                      ? "rgba(56, 189, 248, 0.08)"
                      : "var(--bg-surface-elevated, #111B2E)",
                    border: isCurrent
                      ? "1px solid var(--blueprint-cyan, #38BDF8)"
                      : "1px solid var(--border-line, rgba(56, 189, 248, 0.16))",
                    borderRadius: "8px",
                    padding: "14px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: "10px",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: "13px",
                          fontWeight: 600,
                          color: "var(--ink-primary, #F8FAFC)",
                          lineHeight: "1.4",
                          wordBreak: "break-word",
                          display: "-webkit-box",
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {labelText}
                      </div>

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          marginTop: "8px",
                          fontSize: "11px",
                          color: "var(--ink-muted, #64748B)",
                          fontFamily: "var(--font-mono, monospace)",
                        }}
                      >
                        <span>{formatDate(draft.created_at)}</span>
                        {isCurrent && (
                          <span
                            style={{
                              color: "var(--blueprint-cyan, #38BDF8)",
                              background: "rgba(56, 189, 248, 0.15)",
                              padding: "1px 6px",
                              borderRadius: "3px",
                              fontSize: "10px",
                              fontWeight: 700,
                            }}
                          >
                            ACTIVE WORKSPACE
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      paddingTop: "6px",
                      borderTop: "1px solid var(--border-hairline, rgba(255, 255, 255, 0.06))",
                    }}
                  >
                    <button
                      type="button"
                      id={`openDraftBtn-${draft.id}`}
                      onClick={() => handleSelectDraft(draft)}
                      disabled={isCurrent || isResuming}
                      style={{
                        background: isCurrent
                          ? "transparent"
                          : "var(--accent-orange, #F97316)",
                        color: isCurrent
                          ? "var(--ink-muted, #64748B)"
                          : "#FFFFFF",
                        border: isCurrent
                          ? "1px solid var(--ink-faint, #334155)"
                          : "none",
                        borderRadius: "5px",
                        padding: "6px 14px",
                        fontSize: "12px",
                        fontWeight: 600,
                        fontFamily: "var(--font-body, inherit)",
                        cursor: isCurrent || isResuming ? "default" : "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        transition: "all 0.15s ease",
                      }}
                    >
                      {isResuming ? (
                        "Loading State…"
                      ) : isCurrent ? (
                        "Current Active"
                      ) : (
                        <>Open Draft →</>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>,
    document.body
  );
}
