"use client";

import React, { useEffect, useState } from "react";
import { getBackendUrlStatus, getBackendApiUrl } from "../lib/backendConfig";

function BackendIcon() {
  return (
    <svg className="service-health-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="2.75" width="12" height="4.5" rx="1.25" />
      <rect x="2" y="8.75" width="12" height="4.5" rx="1.25" />
      <circle cx="11.5" cy="5" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="11.5" cy="11" r="0.6" fill="currentColor" stroke="none" />
      <line x1="4.5" y1="5" x2="7.5" y2="5" />
      <line x1="4.5" y1="11" x2="7.5" y2="11" />
    </svg>
  );
}

function GeminiIcon() {
  return (
    <svg className="service-health-icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 1C8 4.86599 11.134 8 15 8C11.134 8 8 11.134 8 15C8 11.134 4.86599 8 1 8C4.86599 8 8 4.86599 8 1Z" />
    </svg>
  );
}

function GroqIcon() {
  return (
    <svg className="service-health-icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8.7 1.5L3.5 8.75H7.75L7 14.5L12.5 7.25H8.25L8.7 1.5Z" />
    </svg>
  );
}

export default function DiagnosticBadge() {
  const [serviceStatus, setServiceStatus] = useState({
    backend: "checking",
    gemini: "checking",
    groq: "checking",
  });

  useEffect(() => {
    let mounted = true;
    const checkServices = async () => {
      if (!getBackendUrlStatus().configured) {
        if (mounted) {
          setServiceStatus({
            backend: "offline",
            gemini: "unavailable",
            groq: "unavailable",
          });
        }
        return;
      }

      try {
        const response = await fetch(getBackendApiUrl("/health/services"), {
          cache: "no-store",
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.backend?.status !== "connected") {
          throw new Error("Health endpoint unavailable");
        }
        if (mounted) {
          setServiceStatus({
            backend: "connected",
            gemini:
              data.gemini?.status === "connected" ? "connected" : "unavailable",
            groq:
              data.groq?.status === "connected" ? "connected" : "unavailable",
          });
        }
      } catch {
        if (mounted) {
          setServiceStatus({
            backend: "offline",
            gemini: "unavailable",
            groq: "unavailable",
          });
        }
      }
    };

    checkServices();
    const intervalId = window.setInterval(checkServices, 30000);
    return () => {
      mounted = false;
      window.clearInterval(intervalId);
    };
  }, []);

  const serviceIcon = {
    backend: <BackendIcon />,
    gemini: <GeminiIcon />,
    groq: <GroqIcon />,
  };

  const ordered = [
    { key: "backend", label: "Backend" },
    { key: "gemini", label: "Llama-Versatile" },
    { key: "groq", label: "Groq" },
  ];

  return (
    <div
      className="service-health"
      role="status"
      aria-live="polite"
      aria-label="Service connectivity status"
    >
      {ordered.map((service) => {
        const state = serviceStatus[service.key];
        const stateClass =
          state === "connected"
            ? "connected"
            : state === "checking"
              ? "checking"
              : "disconnected";
        const stateText =
          state === "connected"
            ? "Connected"
            : state === "checking"
              ? "Checking..."
              : "Not Connected";

        return (
          <div
            className={`service-health-item ${stateClass}`}
            key={service.key}
            title={`${service.label}: ${stateText}`}
          >
            <span className="service-health-icon-wrap">
              {serviceIcon[service.key]}
            </span>
            <span className="service-health-name">{service.label}</span>
            <span className="service-health-dot" aria-hidden="true" />
            <span className="service-health-status">{stateText}</span>
          </div>
        );
      })}
    </div>
  );
}
