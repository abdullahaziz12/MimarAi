"use client";

import React, { useState, useEffect } from "react";
import { useMimarStore } from "../store/mimarStore";
import { useAuth } from "../context/AuthContext";

const SCALE_OPTIONS = [
  { value: "just_me", label: "Just me / Solo user" },
  { value: "small_team", label: "Small team (internal)" },
  { value: "hundreds_of_users", label: "Hundreds of active users" },
  { value: "thousands_plus", label: "Thousands+ concurrent / High volume" },
];

const DATA_SENSITIVITY_OPTIONS = [
  { value: "none_public", label: "None / Public data only" },
  { value: "personal", label: "Personal (names, emails, credentials)" },
  { value: "sensitive", label: "Sensitive (health, financial, location, children)" },
];

const AVAILABILITY_OPTIONS = [
  { value: "best_effort", label: "Best effort / Standard uptime" },
  { value: "needs_to_be_reliable", label: "Needs to be reliable (business hours)" },
  { value: "mission_critical", label: "Mission critical (24/7 zero downtime)" },
];

export default function InterviewAnswersReviewModal({ isOpen, onClose }) {
  const { session } = useAuth();
  const {
    projectId,
    ideaText,
    fetchInterviewSummary,
    submitClarifyingAnswers,
    submitPersonaAnswer,
    submitNfrData,
    editContradictionResolution,
    showToast,
  } = useMimarStore();

  const [summaryData, setSummaryData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Edit states for sections
  const [editSection, setEditSection] = useState(null); // 'contradiction' | 'cq-{id}' | 'persona' | 'nfr'
  const [contradictionInput, setContradictionInput] = useState("");
  const [cqInputs, setCqInputs] = useState({});
  const [personaInput, setPersonaInput] = useState("");
  const [nfrInputs, setNfrInputs] = useState({ scale: "", data_sensitivity: "", availability: "" });
  const [saving, setSaving] = useState(false);

  const loadSummary = async () => {
    if (!isOpen || !projectId) return;
    setLoading(true);
    const data = await fetchInterviewSummary(session?.access_token || null);
    if (data) {
      setSummaryData(data);
      setContradictionInput(data.contradiction_resolution?.resolved_answer || "");
      const cqs = {};
      (data.clarifying_questions || []).forEach((q) => {
        cqs[q.id] = q.answer || "";
      });
      setCqInputs(cqs);
      setPersonaInput(data.personas?.answer || "");
      setNfrInputs({
        scale: data.nfrs?.scale || "",
        data_sensitivity: data.nfrs?.data_sensitivity || "",
        availability: data.nfrs?.availability || "",
      });
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen) {
      loadSummary();
    } else {
      setEditSection(null);
    }
  }, [isOpen, projectId]);

  if (!isOpen) return null;

  const handleSaveContradiction = async () => {
    if (!contradictionInput.trim()) {
      showToast("Contradiction resolution answer cannot be empty.");
      return;
    }
    setSaving(true);
    const res = await editContradictionResolution(contradictionInput.trim(), session?.access_token || null);
    setSaving(false);
    if (res?.status === "ok") {
      showToast("Contradiction resolution updated!");
      setEditSection(null);
      await loadSummary();
    } else {
      showToast(res?.detail || "Failed to update contradiction resolution.");
    }
  };

  const handleSaveCQ = async (qId) => {
    const ans = (cqInputs[qId] || "").trim();
    if (!ans) {
      showToast("Answer cannot be empty.");
      return;
    }
    setSaving(true);
    const res = await submitClarifyingAnswers(
      [{ question_id: qId, answer: ans }],
      session?.access_token || null
    );
    setSaving(false);
    if (res?.status === "ok") {
      showToast("Clarifying answer updated!");
      setEditSection(null);
      await loadSummary();
    } else {
      showToast(res?.detail || "Failed to update answer.");
    }
  };

  const handleSavePersona = async () => {
    if (!personaInput.trim()) {
      showToast("Persona description cannot be empty.");
      return;
    }
    setSaving(true);
    const res = await submitPersonaAnswer(personaInput.trim(), session?.access_token || null);
    setSaving(false);
    if (res?.status === "ok") {
      showToast("User roles updated!");
      setEditSection(null);
      await loadSummary();
    } else {
      showToast(res?.detail || "Failed to update roles.");
    }
  };

  const handleSaveNfr = async () => {
    if (!nfrInputs.scale || !nfrInputs.data_sensitivity || !nfrInputs.availability) {
      showToast("Please select all three non-functional requirements.");
      return;
    }
    setSaving(true);
    const res = await submitNfrData(nfrInputs, session?.access_token || null);
    setSaving(false);
    if (res?.status === "ok") {
      showToast("Requirements updated!");
      setEditSection(null);
      await loadSummary();
    } else {
      showToast(res?.detail || "Failed to update requirements.");
    }
  };

  const hasDraftConfirmed = summaryData?.lightweight_draft?.final_status === "confirmed";

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(6px)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#0F172A",
          border: "1px solid rgba(148, 163, 184, 0.25)",
          borderRadius: "12px",
          width: "100%",
          maxWidth: "760px",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.6)",
          color: "#F8FAFC",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: "18px 24px",
            borderBottom: "1px solid rgba(51, 65, 85, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "rgba(30, 41, 59, 0.5)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "20px" }}>📋</span>
            <div>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600, color: "#F8FAFC" }}>
                Review & Edit Interview Answers (V3.11)
              </h3>
              <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#94A3B8" }}>
                Review and update any pre-generation answers before proceeding.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#94A3B8",
              fontSize: "20px",
              cursor: "pointer",
              padding: "4px 8px",
              borderRadius: "4px",
            }}
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: "16px" }}>
          {hasDraftConfirmed && (
            <div
              style={{
                background: "rgba(245, 158, 11, 0.12)",
                border: "1px solid rgba(245, 158, 11, 0.35)",
                borderRadius: "6px",
                padding: "10px 14px",
                fontSize: "12px",
                color: "#FDE68A",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <span>ℹ️</span>
              <span>
                Note: Saving any edit will refresh the lightweight draft preview to incorporate your updated context before final generation.
              </span>
            </div>
          )}

          {loading ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#94A3B8" }}>
              Loading interview summary…
            </div>
          ) : (
            <>
              {/* 1. Core Idea Text (Read-Only) */}
              <div
                style={{
                  background: "rgba(15, 23, 42, 0.6)",
                  border: "1px solid rgba(51, 65, 85, 0.6)",
                  borderRadius: "8px",
                  padding: "14px 16px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <span style={{ fontSize: "12px", fontWeight: 600, color: "#38BDF8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Core Project Idea (Read-Only)
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: "13px", color: "#E2E8F0", lineHeight: "1.5" }}>
                  {summaryData?.idea_text || ideaText || "No project idea text."}
                </p>
              </div>

              {/* 2. Contradiction Resolution */}
              {summaryData?.contradiction_resolution?.found && (
                <div
                  style={{
                    background: "rgba(15, 23, 42, 0.6)",
                    border: "1px solid rgba(51, 65, 85, 0.6)",
                    borderRadius: "8px",
                    padding: "14px 16px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <span style={{ fontSize: "12px", fontWeight: 600, color: "#F59E0B", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Contradiction Resolution
                    </span>
                    {editSection !== "contradiction" && (
                      <button
                        type="button"
                        onClick={() => setEditSection("contradiction")}
                        style={{ background: "transparent", border: "1px solid rgba(56, 189, 248, 0.4)", color: "#38BDF8", borderRadius: "4px", padding: "2px 8px", fontSize: "11px", cursor: "pointer" }}
                      >
                        Edit
                      </button>
                    )}
                  </div>
                  {summaryData.contradiction_resolution.explanation && (
                    <p style={{ margin: "0 0 8px", fontSize: "12px", color: "#94A3B8" }}>
                      <strong>Conflict:</strong> {summaryData.contradiction_resolution.explanation}
                    </p>
                  )}
                  {editSection === "contradiction" ? (
                    <div>
                      <textarea
                        rows={2}
                        value={contradictionInput}
                        onChange={(e) => setContradictionInput(e.target.value)}
                        style={{ width: "100%", background: "#1E293B", border: "1px solid #475569", borderRadius: "4px", color: "#FFF", padding: "8px", fontSize: "12px", boxSizing: "border-box" }}
                      />
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "8px" }}>
                        <button type="button" onClick={() => setEditSection(null)} disabled={saving} style={{ background: "transparent", color: "#94A3B8", border: "1px solid #475569", borderRadius: "4px", padding: "4px 10px", fontSize: "11px", cursor: "pointer" }}>Cancel</button>
                        <button type="button" onClick={handleSaveContradiction} disabled={saving} style={{ background: "#0284C7", color: "#FFF", border: "none", borderRadius: "4px", padding: "4px 12px", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}>{saving ? "Saving…" : "Save"}</button>
                      </div>
                    </div>
                  ) : (
                    <p style={{ margin: 0, fontSize: "13px", color: "#E2E8F0" }}>
                      {summaryData.contradiction_resolution.resolved_answer || "No resolution recorded."}
                    </p>
                  )}
                </div>
              )}

              {/* 3. Clarifying Questions */}
              {summaryData?.clarifying_questions && summaryData.clarifying_questions.length > 0 && (
                <div
                  style={{
                    background: "rgba(15, 23, 42, 0.6)",
                    border: "1px solid rgba(51, 65, 85, 0.6)",
                    borderRadius: "8px",
                    padding: "14px 16px",
                  }}
                >
                  <span style={{ fontSize: "12px", fontWeight: 600, color: "#38BDF8", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "12px" }}>
                    Clarifying Questions (V3.3)
                  </span>
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {summaryData.clarifying_questions.map((q, idx) => (
                      <div key={q.id || idx} style={{ borderBottom: idx < summaryData.clarifying_questions.length - 1 ? "1px solid rgba(51, 65, 85, 0.4)" : "none", paddingBottom: "10px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                          <span style={{ fontSize: "12px", fontWeight: 600, color: "#CBD5E1" }}>
                            Q{idx + 1}: {q.question}
                          </span>
                          {editSection !== `cq-${q.id}` && (
                            <button
                              type="button"
                              onClick={() => setEditSection(`cq-${q.id}`)}
                              style={{ background: "transparent", border: "1px solid rgba(56, 189, 248, 0.4)", color: "#38BDF8", borderRadius: "4px", padding: "2px 8px", fontSize: "11px", cursor: "pointer" }}
                            >
                              Edit
                            </button>
                          )}
                        </div>
                        {editSection === `cq-${q.id}` ? (
                          <div>
                            <textarea
                              rows={2}
                              value={cqInputs[q.id] || ""}
                              onChange={(e) => setCqInputs({ ...cqInputs, [q.id]: e.target.value })}
                              style={{ width: "100%", background: "#1E293B", border: "1px solid #475569", borderRadius: "4px", color: "#FFF", padding: "8px", fontSize: "12px", boxSizing: "border-box" }}
                            />
                            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "8px" }}>
                              <button type="button" onClick={() => setEditSection(null)} disabled={saving} style={{ background: "transparent", color: "#94A3B8", border: "1px solid #475569", borderRadius: "4px", padding: "4px 10px", fontSize: "11px", cursor: "pointer" }}>Cancel</button>
                              <button type="button" onClick={() => handleSaveCQ(q.id)} disabled={saving} style={{ background: "#0284C7", color: "#FFF", border: "none", borderRadius: "4px", padding: "4px 12px", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}>{saving ? "Saving…" : "Save"}</button>
                            </div>
                          </div>
                        ) : (
                          <p style={{ margin: 0, fontSize: "12px", color: "#94A3B8" }}>
                            {q.answer || "Unanswered"}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 4. Personas */}
              {summaryData?.personas && (
                <div
                  style={{
                    background: "rgba(15, 23, 42, 0.6)",
                    border: "1px solid rgba(51, 65, 85, 0.6)",
                    borderRadius: "8px",
                    padding: "14px 16px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <span style={{ fontSize: "12px", fontWeight: 600, color: "#38BDF8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      User Roles & Personas (V3.4)
                    </span>
                    {editSection !== "persona" && (
                      <button
                        type="button"
                        onClick={() => setEditSection("persona")}
                        style={{ background: "transparent", border: "1px solid rgba(56, 189, 248, 0.4)", color: "#38BDF8", borderRadius: "4px", padding: "2px 8px", fontSize: "11px", cursor: "pointer" }}
                      >
                        Edit
                      </button>
                    )}
                  </div>
                  {editSection === "persona" ? (
                    <div>
                      <textarea
                        rows={3}
                        value={personaInput}
                        onChange={(e) => setPersonaInput(e.target.value)}
                        style={{ width: "100%", background: "#1E293B", border: "1px solid #475569", borderRadius: "4px", color: "#FFF", padding: "8px", fontSize: "12px", boxSizing: "border-box" }}
                      />
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "8px" }}>
                        <button type="button" onClick={() => setEditSection(null)} disabled={saving} style={{ background: "transparent", color: "#94A3B8", border: "1px solid #475569", borderRadius: "4px", padding: "4px 10px", fontSize: "11px", cursor: "pointer" }}>Cancel</button>
                        <button type="button" onClick={handleSavePersona} disabled={saving} style={{ background: "#0284C7", color: "#FFF", border: "none", borderRadius: "4px", padding: "4px 12px", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}>{saving ? "Saving…" : "Save"}</button>
                      </div>
                    </div>
                  ) : (
                    <p style={{ margin: 0, fontSize: "13px", color: "#E2E8F0" }}>
                      {summaryData.personas.answer || "No roles specified."}
                    </p>
                  )}
                </div>
              )}

              {/* 5. NFRs */}
              {summaryData?.nfrs && (
                <div
                  style={{
                    background: "rgba(15, 23, 42, 0.6)",
                    border: "1px solid rgba(51, 65, 85, 0.6)",
                    borderRadius: "8px",
                    padding: "14px 16px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <span style={{ fontSize: "12px", fontWeight: 600, color: "#38BDF8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Non-Functional Requirements (V3.5)
                    </span>
                    {editSection !== "nfr" && (
                      <button
                        type="button"
                        onClick={() => setEditSection("nfr")}
                        style={{ background: "transparent", border: "1px solid rgba(56, 189, 248, 0.4)", color: "#38BDF8", borderRadius: "4px", padding: "2px 8px", fontSize: "11px", cursor: "pointer" }}
                      >
                        Edit
                      </button>
                    )}
                  </div>
                  {editSection === "nfr" ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "11px", color: "#94A3B8", marginBottom: "4px" }}>Expected Scale</label>
                        <select
                          value={nfrInputs.scale}
                          onChange={(e) => setNfrInputs({ ...nfrInputs, scale: e.target.value })}
                          style={{ width: "100%", background: "#1E293B", border: "1px solid #475569", borderRadius: "4px", color: "#FFF", padding: "6px 8px", fontSize: "12px" }}
                        >
                          <option value="">Select scale…</option>
                          {SCALE_OPTIONS.map((opt) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
                        </select>
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: "11px", color: "#94A3B8", marginBottom: "4px" }}>Data Sensitivity</label>
                        <select
                          value={nfrInputs.data_sensitivity}
                          onChange={(e) => setNfrInputs({ ...nfrInputs, data_sensitivity: e.target.value })}
                          style={{ width: "100%", background: "#1E293B", border: "1px solid #475569", borderRadius: "4px", color: "#FFF", padding: "6px 8px", fontSize: "12px" }}
                        >
                          <option value="">Select data sensitivity…</option>
                          {DATA_SENSITIVITY_OPTIONS.map((opt) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
                        </select>
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: "11px", color: "#94A3B8", marginBottom: "4px" }}>Availability Requirement</label>
                        <select
                          value={nfrInputs.availability}
                          onChange={(e) => setNfrInputs({ ...nfrInputs, availability: e.target.value })}
                          style={{ width: "100%", background: "#1E293B", border: "1px solid #475569", borderRadius: "4px", color: "#FFF", padding: "6px 8px", fontSize: "12px" }}
                        >
                          <option value="">Select availability…</option>
                          {AVAILABILITY_OPTIONS.map((opt) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
                        </select>
                      </div>
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "8px" }}>
                        <button type="button" onClick={() => setEditSection(null)} disabled={saving} style={{ background: "transparent", color: "#94A3B8", border: "1px solid #475569", borderRadius: "4px", padding: "4px 10px", fontSize: "11px", cursor: "pointer" }}>Cancel</button>
                        <button type="button" onClick={handleSaveNfr} disabled={saving} style={{ background: "#0284C7", color: "#FFF", border: "none", borderRadius: "4px", padding: "4px 12px", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}>{saving ? "Saving…" : "Save"}</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", fontSize: "12px" }}>
                      <div>
                        <span style={{ color: "#94A3B8", display: "block", fontSize: "11px" }}>Scale</span>
                        <span style={{ color: "#F8FAFC", fontWeight: 500 }}>{summaryData.nfrs.scale || "Not set"}</span>
                      </div>
                      <div>
                        <span style={{ color: "#94A3B8", display: "block", fontSize: "11px" }}>Sensitivity</span>
                        <span style={{ color: "#F8FAFC", fontWeight: 500 }}>{summaryData.nfrs.data_sensitivity || "Not set"}</span>
                      </div>
                      <div>
                        <span style={{ color: "#94A3B8", display: "block", fontSize: "11px" }}>Availability</span>
                        <span style={{ color: "#F8FAFC", fontWeight: 500 }}>{summaryData.nfrs.availability || "Not set"}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: "14px 24px",
            borderTop: "1px solid rgba(51, 65, 85, 0.6)",
            display: "flex",
            justifyContent: "flex-end",
            background: "rgba(30, 41, 59, 0.5)",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "#334155",
              color: "#F8FAFC",
              border: "none",
              borderRadius: "6px",
              padding: "8px 18px",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Done Reviewing
          </button>
        </div>
      </div>
    </div>
  );
}
