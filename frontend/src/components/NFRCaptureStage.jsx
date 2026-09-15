"use client";

import React, { useState } from "react";

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

export default function NFRCaptureStage({
  onSubmit,
  isSubmitting = false,
  isCompleted = false,
  initialData = {},
}) {
  const [scale, setScale] = useState(initialData?.scale || "");
  const [dataSensitivity, setDataSensitivity] = useState(initialData?.data_sensitivity || "");
  const [availability, setAvailability] = useState(initialData?.availability || "");

  const isAllSelected = Boolean(scale && dataSensitivity && availability);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!isAllSelected || isSubmitting || isCompleted) return;
    onSubmit({
      scale,
      data_sensitivity: dataSensitivity,
      availability,
    });
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
        <span style={{ fontSize: "18px" }}>⚙️</span>
        <h4
          style={{
            margin: 0,
            fontSize: "14px",
            fontWeight: 600,
            color: "#F8FAFC",
            letterSpacing: "0.02em",
          }}
        >
          Non-Functional Requirements (V3.5)
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
          Scale & Constraints
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
        Select your system constraints to tailor performance, security, and infrastructure specs:
      </p>

      <form onSubmit={handleSubmit}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr",
            gap: "12px",
            background: "rgba(15, 23, 42, 0.6)",
            padding: "14px",
            borderRadius: "6px",
            border: "1px solid rgba(51, 65, 85, 0.6)",
          }}
        >
          {/* Expected Scale */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: "12px",
                fontWeight: 600,
                color: "#CBD5E1",
                marginBottom: "4px",
              }}
            >
              1. Expected Scale
            </label>
            <select
              value={scale}
              disabled={isSubmitting || isCompleted}
              onChange={(e) => setScale(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: "4px",
                background: "rgba(30, 41, 59, 0.8)",
                border: "1px solid rgba(71, 85, 105, 0.6)",
                color: "#F8FAFC",
                fontSize: "12px",
                outline: "none",
              }}
            >
              <option value="">Select expected scale…</option>
              {SCALE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Data Sensitivity */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: "12px",
                fontWeight: 600,
                color: "#CBD5E1",
                marginBottom: "4px",
              }}
            >
              2. Data Sensitivity
            </label>
            <select
              value={dataSensitivity}
              disabled={isSubmitting || isCompleted}
              onChange={(e) => setDataSensitivity(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: "4px",
                background: "rgba(30, 41, 59, 0.8)",
                border: "1px solid rgba(71, 85, 105, 0.6)",
                color: "#F8FAFC",
                fontSize: "12px",
                outline: "none",
              }}
            >
              <option value="">Select data sensitivity…</option>
              {DATA_SENSITIVITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Availability Requirement */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: "12px",
                fontWeight: 600,
                color: "#CBD5E1",
                marginBottom: "4px",
              }}
            >
              3. Availability Requirement
            </label>
            <select
              value={availability}
              disabled={isSubmitting || isCompleted}
              onChange={(e) => setAvailability(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: "4px",
                background: "rgba(30, 41, 59, 0.8)",
                border: "1px solid rgba(71, 85, 105, 0.6)",
                color: "#F8FAFC",
                fontSize: "12px",
                outline: "none",
              }}
            >
              <option value="">Select availability requirement…</option>
              {AVAILABILITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
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
              disabled={isSubmitting || !isAllSelected}
              title={!isAllSelected ? "Please select all 3 requirements before proceeding" : ""}
              style={{
                background: isAllSelected
                  ? "linear-gradient(135deg, #0284C7, #0369A1)"
                  : "rgba(71, 85, 105, 0.5)",
                color: isAllSelected ? "#FFFFFF" : "#64748B",
                border: "1px solid",
                borderColor: isAllSelected
                  ? "transparent"
                  : "rgba(71, 85, 105, 0.4)",
                borderRadius: "6px",
                padding: "8px 16px",
                fontSize: "13px",
                fontWeight: 600,
                cursor: isSubmitting || !isAllSelected ? "not-allowed" : "pointer",
                boxShadow: isAllSelected ? "0 2px 4px rgba(0,0,0,0.2)" : "none",
                transition: "all 0.2s",
                opacity: isSubmitting ? 0.6 : 1,
              }}
            >
              {isSubmitting
                ? "Saving Requirements…"
                : !isAllSelected
                ? "Select all 3 dropdowns to proceed"
                : "Save Requirements & Proceed"}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
