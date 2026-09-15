"use client";

import React, { useState } from "react";

export default function PersonaCaptureStage({
  onSubmit,
  isSubmitting = false,
  isCompleted = false,
  initialAnswer = "",
}) {
  const [answer, setAnswer] = useState(initialAnswer || "");

  const isValid = answer.trim().length > 0;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!isValid || isSubmitting || isCompleted) return;
    onSubmit(answer.trim());
  };

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
        <span style={{ fontSize: "18px" }}>👥</span>
        <h4
          style={{
            margin: 0,
            fontSize: "14px",
            fontWeight: 600,
            color: "#F8FAFC",
            letterSpacing: "0.02em",
          }}
        >
          User Roles & Personas (V3.4)
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
          Target Audience
        </span>
      </div>

      <p
        style={{
          fontSize: "13px",
          color: "#94A3B8",
          margin: "0 0 16px 0",
          lineHeight: "1.5",
        }}
      >
        Who will use this — list the different types of people and what each one does.
      </p>

      <form onSubmit={handleSubmit}>
        <div
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
            User Roles & Responsibilities
          </label>
          <textarea
            rows={3}
            disabled={isSubmitting || isCompleted}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="e.g. Doctors review patient charts and prescribe meds, nurses log vitals, admins manage staff accounts…"
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
              disabled={isSubmitting || !isValid}
              title={!isValid ? "Please describe user roles before proceeding" : ""}
              style={{
                background: isValid
                  ? "linear-gradient(135deg, #0284C7, #0369A1)"
                  : "rgba(71, 85, 105, 0.5)",
                color: isValid ? "#FFFFFF" : "#64748B",
                border: "1px solid",
                borderColor: isValid
                  ? "transparent"
                  : "rgba(71, 85, 105, 0.4)",
                borderRadius: "6px",
                padding: "8px 16px",
                fontSize: "13px",
                fontWeight: 600,
                cursor: isSubmitting || !isValid ? "not-allowed" : "pointer",
                boxShadow: isValid ? "0 2px 4px rgba(0,0,0,0.2)" : "none",
                transition: "all 0.2s",
                opacity: isSubmitting ? 0.6 : 1,
              }}
            >
              {isSubmitting
                ? "Saving Personas…"
                : !isValid
                ? "Specify roles to proceed"
                : "Save Personas & Proceed"}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
