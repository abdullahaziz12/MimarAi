"use client";

import React, { useEffect, useState } from "react";
import { getBackendUrlStatus, getBackendApiUrl } from "../lib/backendConfig";

function BackendIcon() {
  return (
    <svg className="service-health-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16v5H4z" />
      <path d="M4 14h16v5H4z" />
      <path d="M7 10h.01M7 17h.01" />
    </svg>
  );
}

function GeminiIcon() {
  return (
    <svg className="service-health-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3l8 8-8 8-8-8z" />
      <path d="M12 8l4 4-4 4-4-4z" />
      <path d="M12 3v18" />
    </svg>
  );
}

function GroqIcon() {
  return (
    <svg className="service-health-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h7" />
      <path d="M12 5l7 7-7 7" />
      <path d="M4 18h16" />
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

  const serviceLabel = (service, state) => {
    if (state === "connected") {
      return `${service}: Connected`;
    }
    if (state === "checking") {
      return `${service}: Checking...`;
    }
    return `${service}: Not Connected`;
  };

  const serviceIcon = {
    backend: <BackendIcon />,
    gemini: <GeminiIcon />,
    groq: <GroqIcon />,
  };

  const ordered = [
    { key: "backend", label: "Backend" },
    { key: "gemini", label: "Gemini" },
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
        return (
          <span
            className={`service-health-item ${stateClass}`}
            key={service.key}
          >
            <span className="service-health-icon-wrap">
              {serviceIcon[service.key]}
            </span>
            <span className="service-health-dot" aria-hidden="true"></span>
            <span className="service-health-text">
              {serviceLabel(service.label, state)}
            </span>
          </span>
        );
      })}
    </div>
  );
}
