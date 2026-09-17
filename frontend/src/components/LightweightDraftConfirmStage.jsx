"use client";

import React, { useState } from "react";

export default function LightweightDraftConfirmStage({
  draftFeatures = [],
  attempt = 1,
  isLoading = false,
  isResponding = false,
  errorMessage = null,
  onConfirm,
  onReject,
  onRetry,
}) {
  const [isRejecting, setIsRejecting] = useState(false);
  const [correctionText, setCorrectionText] = useState("");

  const handleRejectClick = () => {
    setIsRejecting(true);
  };

  const handleCancelReject = () => {
    setIsRejecting(false);
    setCorrectionText("");
  };

  const handleSubmitCorrection = (e) => {
    e.preventDefault();
    if (!correctionText.trim() || isResponding) return;
    onReject(correctionText.trim(), attempt);
  };

  return (
    <div
      style={{
        marginTop: "16px",
        marginBottom: "16px",
        padding: "20px 24px",
        borderRadius: "10px",
        background: "rgba(15, 23, 42, 0.85)",
        border: "1px solid rgba(56, 189, 248, 0.35)",
        backdropFilter: "blur(12px)",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "14px",
          borderBottom: "1px solid rgba(51, 65, 85, 0.5)",
          paddingBottom: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "20px" }}>🎯</span>
          <div>
            <h3
              style={{
                margin: 0,
                fontSize: "15px",
                fontWeight: 600,
                color: "#F8FAFC",
                letterSpacing: "0.02em",
              }}
            >
              Draft Feature Sanity Check (V3.8)
            </h3>
            <span style={{ fontSize: "12px", color: "#94A3B8" }}>
              Quick sanity check before starting the deep dual-model verification pipeline.
            </span>
          </div>
        </div>
        <span
          style={{
            fontSize: "11px",
            padding: "3px 8px",
            borderRadius: "9999px",
            background: attempt === 1 ? "rgba(56, 189, 248, 0.15)" : "rgba(245, 158, 11, 0.15)",
            color: attempt === 1 ? "#38BDF8" : "#F59E0B",
            border: `1px solid ${attempt === 1 ? "rgba(56, 189, 248, 0.3)" : "rgba(245, 158, 11, 0.3)"}`,
            fontWeight: 600,
            letterSpacing: "0.05em",
          }}
        >
          ATTEMPT {attempt} OF 2
        </span>
      </div>

      {/* Error state */}
      {errorMessage ? (
        <div
          style={{
            background: "rgba(239, 68, 68, 0.12)",
            border: "1px solid rgba(239, 68, 68, 0.35)",
            borderRadius: "6px",
            padding: "14px",
            marginBottom: "16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#FCA5A5", fontSize: "13px" }}>
            <span>⚠️</span>
            <span>{errorMessage}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "12px" }}>
            <button
              type="button"
              onClick={onRetry}
              style={{
                background: "linear-gradient(135deg, #EF4444, #DC2626)",
                color: "#FFFFFF",
                border: "none",
                borderRadius: "5px",
                padding: "6px 14px",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              🔄 Retry Draft Generation
            </button>
          </div>
        </div>
      ) : isLoading ? (
        /* Loading skeleton */
        <div style={{ padding: "20px 0", textAlign: "center" }}>
          <div
            style={{
              display: "inline-block",
              width: "24px",
              height: "24px",
              border: "2px solid rgba(56, 189, 248, 0.2)",
              borderTopColor: "#38BDF8",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
            }}
          />
          <p style={{ marginTop: "10px", fontSize: "13px", color: "#94A3B8" }}>
            Analyzing project context and synthesizing draft features…
          </p>
        </div>
      ) : (
        /* Draft Feature Bullets */
        <>
          <p
            style={{
              fontSize: "13px",
              color: "#CBD5E1",
              margin: "0 0 12px 0",
              fontWeight: 500,
            }}
          >
            Here is what the model understood from your project requirements:
          </p>

          <ul
            style={{
              margin: "0 0 18px 0",
              paddingLeft: "20px",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            {draftFeatures.map((feat, idx) => (
              <li
                key={idx}
                style={{
                  fontSize: "13px",
                  color: "#F1F5F9",
                  lineHeight: "1.5",
                }}
              >
                {feat}
              </li>
            ))}
          </ul>

          {/* Correction input form (when user taps "Something's off") */}
          {isRejecting ? (
            <form
              onSubmit={handleSubmitCorrection}
              style={{
                background: "rgba(30, 41, 59, 0.7)",
                border: "1px solid rgba(148, 163, 184, 0.25)",
                borderRadius: "8px",
                padding: "14px",
                marginTop: "12px",
              }}
            >
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "#E2E8F0",
                  marginBottom: "6px",
                }}
              >
                Tell us what to adjust or what's missing:
              </label>
              <textarea
                rows={3}
                value={correctionText}
                onChange={(e) => setCorrectionText(e.target.value)}
                disabled={isResponding}
                placeholder="e.g. Include user authentication with role-based access, and remove the offline sync requirement…"
                style={{
                  width: "100%",
                  background: "rgba(15, 23, 42, 0.8)",
                  border: "1px solid rgba(71, 85, 105, 0.6)",
                  borderRadius: "6px",
                  padding: "8px 12px",
                  fontSize: "13px",
                  color: "#F8FAFC",
                  outline: "none",
                  resize: "vertical",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                }}
              />
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "10px",
                  marginTop: "12px",
                }}
              >
                <button
                  type="button"
                  onClick={handleCancelReject}
                  disabled={isResponding}
                  style={{
                    background: "transparent",
                    color: "#94A3B8",
                    border: "1px solid rgba(148, 163, 184, 0.3)",
                    borderRadius: "6px",
                    padding: "8px 14px",
                    fontSize: "12px",
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!correctionText.trim() || isResponding}
                  style={{
                    background: correctionText.trim()
                      ? "linear-gradient(135deg, #F59E0B, #D97706)"
                      : "rgba(71, 85, 105, 0.4)",
                    color: correctionText.trim() ? "#FFFFFF" : "#64748B",
                    border: "none",
                    borderRadius: "6px",
                    padding: "8px 16px",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: correctionText.trim() && !isResponding ? "pointer" : "not-allowed",
                  }}
                >
                  {isResponding
                    ? "Submitting Correction…"
                    : attempt >= 2
                    ? "Submit & Proceed to Full Generation →"
                    : "Submit Correction & Re-draft (Attempt 2) →"}
                </button>
              </div>
            </form>
          ) : (
            /* Action Buttons: Confirm vs Reject */
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: "12px",
                marginTop: "16px",
                borderTop: "1px solid rgba(51, 65, 85, 0.5)",
                paddingTop: "14px",
              }}
            >
              <button
                type="button"
                disabled={isResponding}
                onClick={handleRejectClick}
                style={{
                  background: "rgba(30, 41, 59, 0.8)",
                  color: "#F87171",
                  border: "1px solid rgba(248, 113, 113, 0.35)",
                  borderRadius: "6px",
                  padding: "9px 16px",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: isResponding ? "not-allowed" : "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                ✏️ Something's off → Tell me what
              </button>

              <button
                type="button"
                disabled={isResponding}
                onClick={() => onConfirm(attempt)}
                style={{
                  background: "linear-gradient(135deg, #10B981, #0EA5E9)",
                  color: "#FFFFFF",
                  border: "none",
                  borderRadius: "6px",
                  padding: "9px 20px",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: isResponding ? "not-allowed" : "pointer",
                  boxShadow: "0 4px 12px rgba(16, 185, 129, 0.3)",
                  transition: "all 0.15s ease",
                }}
              >
                {isResponding ? "Confirming…" : "✓ Looks right → Generate full plan"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
