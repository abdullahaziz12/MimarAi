"use client";

import React, { useState } from "react";

export default function ClarifyingQuestionsStage({
  questions = [],
  onSubmit,
  isSubmitting = false,
  isCompleted = false,
}) {
  // §1.3: Lazy initializer seeds answers from questions prop (q.answer)
  const [answers, setAnswers] = useState(() =>
    Object.fromEntries(questions.map((q) => [q.id, q.answer || ""]))
  );

  const handleAnswerChange = (qId, val) => {
    setAnswers((prev) => ({
      ...prev,
      [qId]: val,
    }));
  };

  // All questions must have a non-empty trimmed answer before Save is enabled
  const allAnswered =
    questions.length > 0 &&
    questions.every((q) => (answers[q.id] || "").trim().length > 0);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!allAnswered) return; // Guard: do nothing if any answer is blank
    const formatted = questions.map((q) => ({
      question_id: q.id,
      answer: (answers[q.id] || "").trim(),
    }));
    onSubmit(formatted);
  };

  if (!questions || questions.length === 0) return null;

  return (
    <div
      style={{
        marginTop: "16px",
        marginBottom: "16px",
        padding: "16px 20px",
        borderRadius: "8px",
        background: "rgba(30, 41, 59, 0.7)",
        border: "1px solid rgba(148, 163, 184, 0.2)",
        backdropFilter: "blur(8px)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "12px",
        }}
      >
        <span style={{ fontSize: "18px" }}>💡</span>
        <h4
          style={{
            margin: 0,
            fontSize: "14px",
            fontWeight: 600,
            color: "#F8FAFC",
            letterSpacing: "0.02em",
          }}
        >
          Clarifying Questions (V3.3)
        </h4>
        <span
          style={{
            fontSize: "11px",
            padding: "2px 6px",
            borderRadius: "4px",
            background: "rgba(56, 189, 248, 0.15)",
            color: "#38BDF8",
            border: "1px solid rgba(56, 189, 248, 0.3)",
          }}
        >
          {questions.length} {questions.length === 1 ? "Question" : "Questions"}
        </span>
        {isCompleted && (
          <span
            style={{
              fontSize: "11px",
              padding: "2px 6px",
              borderRadius: "4px",
              background: "rgba(34, 197, 94, 0.15)",
              color: "#4ADE80",
              border: "1px solid rgba(34, 197, 94, 0.3)",
            }}
          >
            ✓ Answered &amp; Locked
          </span>
        )}
      </div>

      <p
        style={{
          fontSize: "13px",
          color: "#94A3B8",
          margin: "0 0 16px 0",
          lineHeight: "1.5",
        }}
      >
        Please clarify the following key details to help shape accurate architecture and feature specifications:
      </p>

      <form onSubmit={handleSubmit}>
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {questions.map((q, idx) => (
            <div
              key={q.id || idx}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "6px",
                background: "rgba(15, 23, 42, 0.6)",
                padding: "12px 14px",
                borderRadius: "6px",
                border: "1px solid rgba(51, 65, 85, 0.6)",
              }}
            >
              <label
                style={{
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "#E2E8F0",
                  lineHeight: "1.4",
                }}
              >
                <span style={{ color: "#38BDF8", marginRight: "6px" }}>
                  Q{idx + 1}.
                </span>
                {q.question}
              </label>
              <textarea
                rows={2}
                disabled={isSubmitting || isCompleted}
                value={answers[q.id] || ""}
                onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                placeholder="Type your clarification or preferences here…"
                style={{
                  width: "100%",
                  background: "rgba(30, 41, 59, 0.8)",
                  border: "1px solid rgba(71, 85, 105, 0.6)",
                  borderRadius: "4px",
                  padding: "8px 10px",
                  fontSize: "12px",
                  color: "#F8FAFC",
                  outline: "none",
                  resize: "vertical",
                  fontFamily: "inherit",
                }}
              />
            </div>
          ))}
        </div>

        {!isCompleted && (
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginTop: "16px",
            }}
          >
            <button
              type="submit"
              disabled={isSubmitting || !allAnswered}
              title={!allAnswered ? "Please answer all questions before proceeding" : ""}
              style={{
                background: allAnswered
                  ? "linear-gradient(135deg, #0284C7, #0369A1)"
                  : "rgba(71, 85, 105, 0.5)",
                color: allAnswered ? "#FFFFFF" : "#64748B",
                border: "1px solid",
                borderColor: allAnswered
                  ? "transparent"
                  : "rgba(71, 85, 105, 0.4)",
                borderRadius: "6px",
                padding: "8px 16px",
                fontSize: "13px",
                fontWeight: 600,
                cursor: isSubmitting || !allAnswered ? "not-allowed" : "pointer",
                boxShadow: allAnswered ? "0 2px 4px rgba(0,0,0,0.2)" : "none",
                transition: "all 0.2s",
                opacity: isSubmitting ? 0.6 : 1,
              }}
            >
              {isSubmitting
                ? "Saving Answers…"
                : !allAnswered
                ? `Answer all ${questions.length} questions to proceed`
                : "Save Answers & Proceed"}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
