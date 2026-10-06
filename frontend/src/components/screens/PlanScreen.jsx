"use client";

import React, { useState } from "react";
import { useMimarStore } from "../../store/mimarStore";
import { useAuth } from "../../context/AuthContext";
import ReviewCommentSheet from "../ReviewCommentSheet";

export default function PlanScreen() {
  const { session } = useAuth();
  const {
    currentScreen,
    planAccepted,
    planComments,
    rejectedFeatures,
    operationRunning,
    ideaText,
    fixedInputs,
    generationState,
    toggleFeatureReject,
    addComment,
    deleteComment,
    acceptPlan,
    setOpenReviewSheetStage,
    showToast,
  } = useMimarStore();

  const [activeCommentId, setActiveCommentId] = useState(null);
  const [commentText, setCommentText] = useState("");

  const isActive = currentScreen === "plan";
  const commentCount = Object.keys(planComments).length;

  const defaultFeatures = [
    {
      id: "feat-1",
      name: `${ideaText || "Core Application"} Workflow Engine`,
      description: `Primary operational pipeline and business logic for ${ideaText || "the application"}.`,
      source: "user_originated",
    },
    {
      id: "feat-2",
      name: "User Authentication & Security",
      description:
        "Secure user login, JWT permissions, and role-based authorization.",
      source: "user_originated",
    },
    {
      id: "feat-3",
      name: "Data Persistence & API Layer",
      description:
        "Database schema, API endpoints, and transactional data processing.",
      source: "user_originated",
    },
    {
      id: "feat-4",
      name: "Audit Trail & Event Logging",
      description:
        "Asynchronous event logging, error tracking, and system metrics.",
      source: "ai_added",
    },
  ];

  const currentGenState = generationState || {
    idea_objective: ideaText
      ? `A precision-engineered solution for ${ideaText}.`
      : "A precision-engineered web application architected for scale.",
    fixed_inputs: fixedInputs || {},
    features: defaultFeatures,
  };

  const featuresList = currentGenState.features || [];
  const activeFeatures = featuresList.filter((f) => !rejectedFeatures[f.id]);
  const activeCount = activeFeatures.length;

  const handleToggleReject = (featureId) => {
    if (planAccepted) return;
    if (!rejectedFeatures[featureId] && activeCount <= 1) {
      showToast(
        "Cannot reject feature: plan requires at least 1 active feature remaining.",
      );
      return;
    }
    toggleFeatureReject(featureId);
  };

  const handleOpenComposer = (id, quote) => {
    if (planAccepted) return;
    setActiveCommentId(id);
    setCommentText(planComments[id]?.text || "");
  };

  const handleSaveComment = (id, quote) => {
    const trimmed = commentText.trim();
    if (!trimmed) {
      setActiveCommentId(null);
      return;
    }
    addComment("plan", id, trimmed, quote);
    setActiveCommentId(null);
  };

  const handleDeleteComment = (id) => {
    deleteComment("plan", id);
    setActiveCommentId(null);
  };

  const currentInputs = currentGenState.fixed_inputs || fixedInputs || {};

  return (
    <div
      className={`screen scrollable ${isActive ? "active" : ""} ${planAccepted ? "readonly-mode" : ""}`}
      id="screen-plan"
    >
      <div className="doc-screen-inner">
        <div className="toolbar">
          <div className="toolbar-left">
            <div className="label">Step 02 · Feature Review</div>
            <h2>Implementation Plan</h2>
            <div className="sub">
              <span>GENERATED VIA DUAL-MODEL PIPELINE</span>
              {currentGenState.adjusted_flag && (
                <span
                  className="adjusted-badge"
                  id="planAdjustedBadge"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    color: "#F59E0B",
                    background: "rgba(245, 158, 11, 0.15)",
                    border: "1px solid #F59E0B",
                    padding: "2px 8px",
                    borderRadius: "12px",
                    fontSize: "11px",
                    fontWeight: "600",
                    marginLeft: "8px",
                  }}
                >
                  ⚠ Adjusted — Please Review
                </span>
              )}
              {planAccepted && (
                <span
                  className="accepted-badge"
                  id="planAcceptedBadge"
                  style={{ display: "inline-flex" }}
                >
                  <span className="ab-dot"></span>ACCEPTED &amp; LOCKED
                </span>
              )}
            </div>
          </div>
          <div className="toolbar-actions">
            {!planAccepted && (
              <button
                type="button"
                className="btn btn-secondary"
                id="reviewBtnPlan"
                onClick={() => setOpenReviewSheetStage("plan")}
              >
                <span>Review Comments</span>
                {commentCount > 0 && (
                  <span
                    className="badge-ct"
                    id="reviewBadgePlan"
                    style={{ display: "inline-block" }}
                  >
                    {commentCount}
                  </span>
                )}
              </button>
            )}
            <button
              type="button"
              className={`btn ${planAccepted ? "btn-success" : "btn-primary"} ${commentCount > 0 && !planAccepted ? "disabled-by-comments" : ""}`}
              id="acceptBtnPlan"
              disabled={planAccepted || operationRunning || activeCount === 0}
              onClick={() => acceptPlan(session?.access_token || null)}
              title={
                activeCount === 0
                  ? "Plan requires at least 1 active feature remaining."
                  : commentCount > 0 && !planAccepted
                    ? `Cannot accept with ${commentCount} pending review comment(s). Submit comments for AI revision, or delete comments to accept.`
                    : ""
              }
            >
              {planAccepted ? "✓ Plan Accepted" : "Accept Plan →"}
            </button>
          </div>
        </div>

        <div className="doc-scroll-area">
          <div className="screen-body" id="docContentPlan">
            <div className="doc-title">MimarAi — Architecture Plan</div>
            <div className="doc-sub">
              Dual-model cross-checked feature plan. Click any section to
              comment, or click Accept Plan to lock and progress.
            </div>

            {currentGenState.fix_pass_failed && (
              <div
                className="fix-pass-failed-notice"
                id="fixPassFailedNotice"
                style={{
                  padding: "12px 16px",
                  borderRadius: "6px",
                  background: "rgba(245, 158, 11, 0.12)",
                  border: "1px solid #F59E0B",
                  color: "#FBBF24",
                  fontSize: "13px",
                  marginBottom: "16px",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#F59E0B"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ flexShrink: 0 }}
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>
                  We couldn&apos;t apply an automatic adjustment to this plan — please review the features closely.
                </span>
              </div>
            )}

            {/* 1. IDEA & OBJECTIVE */}
            <div className="section-label">Idea &amp; Objective</div>
            <div
              className={`block ${planComments["idea"] ? "commented" : ""}`}
              data-id="idea"
            >
              {currentGenState.idea_objective}
              <div
                className="comment-trigger"
                data-icon
                onClick={() => handleOpenComposer("idea", "Idea & Objective")}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
              </div>
            </div>
            {activeCommentId === "idea" && (
              <div className="composer" id="liveComposer_plan">
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Leave a comment on this item…"
                  autoFocus
                />
                <div className="composer-actions">
                  {planComments["idea"] && (
                    <button
                      className="danger-btn"
                      onClick={() => handleDeleteComment("idea")}
                    >
                      Delete
                    </button>
                  )}
                  <span style={{ flex: 1 }}></span>
                  <button
                    className="ghost-btn"
                    onClick={() => setActiveCommentId(null)}
                  >
                    Cancel
                  </button>
                  <button
                    className="solid-btn"
                    onClick={() =>
                      handleSaveComment("idea", "Idea & Objective")
                    }
                  >
                    {planComments["idea"] ? "Update Comment" : "Add Comment"}
                  </button>
                </div>
              </div>
            )}

            {/* 2. FIXED INPUTS */}
            <div className="section-label">Fixed Inputs</div>
            <div
              className={`block ${planComments["stack"] ? "commented" : ""}`}
              data-id="stack"
            >
              <span className="kv">
                Tech Stack —{" "}
                <b>{currentInputs.stack || "Next.js + Tailwind CSS"}</b>
              </span>
              <div
                className="comment-trigger"
                data-icon
                onClick={() => handleOpenComposer("stack", "Tech Stack")}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
              </div>
            </div>
            {activeCommentId === "stack" && (
              <div className="composer" id="liveComposer_plan">
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Leave a comment on this item…"
                  autoFocus
                />
                <div className="composer-actions">
                  {planComments["stack"] && (
                    <button
                      className="danger-btn"
                      onClick={() => handleDeleteComment("stack")}
                    >
                      Delete
                    </button>
                  )}
                  <span style={{ flex: 1 }}></span>
                  <button
                    className="ghost-btn"
                    onClick={() => setActiveCommentId(null)}
                  >
                    Cancel
                  </button>
                  <button
                    className="solid-btn"
                    onClick={() => handleSaveComment("stack", "Tech Stack")}
                  >
                    {planComments["stack"] ? "Update Comment" : "Add Comment"}
                  </button>
                </div>
              </div>
            )}

            <div
              className={`block ${planComments["db"] ? "commented" : ""}`}
              data-id="db"
            >
              <span className="kv">
                Database —{" "}
                <b>{currentInputs.database || "Supabase (PostgreSQL)"}</b>
              </span>
              <div
                className="comment-trigger"
                data-icon
                onClick={() => handleOpenComposer("db", "Database")}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
              </div>
            </div>
            {activeCommentId === "db" && (
              <div className="composer" id="liveComposer_plan">
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Leave a comment on this item…"
                  autoFocus
                />
                <div className="composer-actions">
                  {planComments["db"] && (
                    <button
                      className="danger-btn"
                      onClick={() => handleDeleteComment("db")}
                    >
                      Delete
                    </button>
                  )}
                  <span style={{ flex: 1 }}></span>
                  <button
                    className="ghost-btn"
                    onClick={() => setActiveCommentId(null)}
                  >
                    Cancel
                  </button>
                  <button
                    className="solid-btn"
                    onClick={() => handleSaveComment("db", "Database")}
                  >
                    {planComments["db"] ? "Update Comment" : "Add Comment"}
                  </button>
                </div>
              </div>
            )}

            <div
              className={`block ${planComments["deploy"] ? "commented" : ""}`}
              data-id="deploy"
            >
              <span className="kv">
                Deployment —{" "}
                <b>{currentInputs.deployment || "Vercel + Back4App"}</b>
              </span>
              <div
                className="comment-trigger"
                data-icon
                onClick={() => handleOpenComposer("deploy", "Deployment")}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
              </div>
            </div>
            {activeCommentId === "deploy" && (
              <div className="composer" id="liveComposer_plan">
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Leave a comment on this item…"
                  autoFocus
                />
                <div className="composer-actions">
                  {planComments["deploy"] && (
                    <button
                      className="danger-btn"
                      onClick={() => handleDeleteComment("deploy")}
                    >
                      Delete
                    </button>
                  )}
                  <span style={{ flex: 1 }}></span>
                  <button
                    className="ghost-btn"
                    onClick={() => setActiveCommentId(null)}
                  >
                    Cancel
                  </button>
                  <button
                    className="solid-btn"
                    onClick={() => handleSaveComment("deploy", "Deployment")}
                  >
                    {planComments["deploy"] ? "Update Comment" : "Add Comment"}
                  </button>
                </div>
              </div>
            )}

            {/* 3. FEATURES LIST */}
            <div className="section-label">Features</div>

            {activeCount === 0 && (
              <div
                style={{
                  padding: "12px",
                  borderRadius: "6px",
                  background: "rgba(239, 68, 68, 0.1)",
                  border: "1px solid #EF4444",
                  color: "#EF4444",
                  fontSize: "12px",
                  marginBottom: "14px",
                }}
              >
                ⚠ Plan requires at least 1 active feature remaining. Undo a
                feature rejection before accepting the plan.
              </div>
            )}

            {featuresList.map((feat) => {
              const isRejected = !!rejectedFeatures[feat.id];
              const isAiAdded =
                feat.source === "ai_added" ||
                feat.source === "ai_inferred" ||
                feat.provenance === "ai_inferred";
              const isCommented = !!planComments[feat.id];

              const rawFailed = feat.quality_flags?.failed_checks || [];
              const failedChecks = rawFailed.map((item) => {
                if (!item) return null;
                if (typeof item === "string") {
                  return {
                    check: item,
                    reason: `Failed '${item}' quality standard check.`,
                    fields_involved: [],
                    survived_fix_pass: false,
                  };
                }
                return {
                  check: item.check || "Quality Check",
                  reason: item.reason || `Failed '${item.check || "quality"}' check.`,
                  fields_involved: Array.isArray(item.fields_involved) ? item.fields_involved : [],
                  survived_fix_pass: !!item.survived_fix_pass,
                };
              }).filter(Boolean);
              const hasSurvived = failedChecks.some((fc) => fc.survived_fix_pass);

              return (
                <React.Fragment key={feat.id}>
                  <div
                    className={`block ${isRejected ? "rejected" : ""} ${isCommented ? "commented" : ""}`}
                    data-id={feat.id}
                  >
                    <div className="feature-row">
                      <span className="feature-name">{feat.name}</span>
                      {isAiAdded && <span className="ai-tag">AI-added</span>}
                      {feat.manually_amended && (
                        <span
                          className="quality-flag-chip"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            fontSize: "11px",
                            fontWeight: "600",
                            padding: "2px 8px",
                            borderRadius: "12px",
                            backgroundColor: "rgba(16, 185, 129, 0.15)",
                            color: "#10B981",
                            border: "1px solid #10B981",
                            marginLeft: "8px",
                          }}
                        >
                          ✓ Manually Amended
                        </span>
                      )}
                      {failedChecks.length > 0 && (
                        <span
                          className="quality-flag-chip"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            fontSize: "11px",
                            fontWeight: "600",
                            padding: "2px 8px",
                            borderRadius: "12px",
                            backgroundColor: hasSurvived ? "rgba(239, 68, 68, 0.15)" : "rgba(245, 158, 11, 0.15)",
                            color: hasSurvived ? "#EF4444" : "#F59E0B",
                            border: `1px solid ${hasSurvived ? "#EF4444" : "#F59E0B"}`,
                            marginLeft: "8px",
                          }}
                        >
                          {hasSurvived ? "⚠ Persistent Flag" : "⚠ Quality Flag"}
                        </span>
                      )}
                      {isRejected && (
                        <span className="rejected-chip">REJECTED</span>
                      )}
                      {isAiAdded && (
                        <div className="feature-actions">
                          <button
                            type="button"
                            className={`feature-action-btn ${isRejected ? "undo-btn" : "reject-btn"}`}
                            disabled={planAccepted}
                            onClick={() => handleToggleReject(feat.id)}
                            title={
                              isRejected
                                ? "Undo rejection and restore this feature"
                                : "Reject this AI-added feature"
                            }
                          >
                            {isRejected ? "Undo" : "Reject"}
                          </button>
                        </div>
                      )}
                    </div>
                    <span className="kv">{feat.description}</span>
                    {failedChecks.length > 0 && (
                      <div
                        className="quality-issues-container"
                        style={{
                          marginTop: "8px",
                          padding: "8px 12px",
                          borderRadius: "6px",
                          backgroundColor: hasSurvived ? "rgba(239, 68, 68, 0.08)" : "rgba(245, 158, 11, 0.08)",
                          border: `1px solid ${hasSurvived ? "rgba(239, 68, 68, 0.3)" : "rgba(245, 158, 11, 0.3)"}`,
                          fontSize: "12px",
                        }}
                      >
                        <div style={{ fontWeight: "600", color: hasSurvived ? "#EF4444" : "#F59E0B", marginBottom: "4px", display: "flex", alignItems: "center", gap: "6px" }}>
                          <span>{hasSurvived ? "⚠ Unresolved Quality Check (Survived Fix Pass)" : "⚠ Quality Standard Notice"}</span>
                        </div>
                        {failedChecks.map((fc, idx) => (
                          <div key={idx} style={{ marginTop: idx > 0 ? "6px" : "2px", color: "#cbd5e1" }}>
                            <span style={{ fontWeight: "600", color: "#f8fafc", textTransform: "capitalize" }}>
                              {fc.check}:
                            </span>{" "}
                            <span>{fc.reason}</span>
                            {fc.fields_involved.length > 0 && (
                              <span style={{ display: "inline-flex", gap: "4px", marginLeft: "6px" }}>
                                {fc.fields_involved.map((fld, fIdx) => (
                                  <span
                                    key={fIdx}
                                    style={{
                                      fontSize: "10px",
                                      padding: "1px 6px",
                                      borderRadius: "4px",
                                      background: "rgba(255, 255, 255, 0.1)",
                                      color: "#94a3b8",
                                    }}
                                  >
                                    {fld}
                                  </span>
                                ))}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    <div
                      className="rejected-msg"
                      style={{ display: isRejected ? "flex" : "none" }}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="13"
                        height="13"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <line x1="15" y1="9" x2="9" y2="15" />
                        <line x1="9" y1="9" x2="15" y2="15" />
                      </svg>
                      <span>
                        This feature was rejected and will be excluded from the
                        accepted plan.
                      </span>
                    </div>
                    <div
                      className="comment-trigger"
                      data-icon
                      onClick={() => handleOpenComposer(feat.id, feat.name)}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                      </svg>
                    </div>
                  </div>
                  {activeCommentId === feat.id && (
                    <div className="composer" id="liveComposer_plan">
                      <textarea
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        placeholder="Leave a comment on this item…"
                        autoFocus
                      />
                      <div className="composer-actions">
                        {planComments[feat.id] && (
                          <button
                            className="danger-btn"
                            onClick={() => handleDeleteComment(feat.id)}
                          >
                            Delete
                          </button>
                        )}
                        <span style={{ flex: 1 }}></span>
                        <button
                          className="ghost-btn"
                          onClick={() => setActiveCommentId(null)}
                        >
                          Cancel
                        </button>
                        <button
                          className="solid-btn"
                          onClick={() => handleSaveComment(feat.id, feat.name)}
                        >
                          {planComments[feat.id]
                            ? "Update Comment"
                            : "Add Comment"}
                        </button>
                      </div>
                    </div>
                  )}
                </React.Fragment>
              );
            })}

            <div className="callout">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v5M12 16h.01" />
              </svg>
              <p>
                Accepting this plan locks the feature scope. Next, MimarAi will
                generate the deterministic file &amp; folder layout conforming
                to FastAPI standard conventions.
              </p>
            </div>
          </div>
        </div>

        {/* REVIEW SHEET */}
        <ReviewCommentSheet stage="plan" />
      </div>
    </div>
  );
}
