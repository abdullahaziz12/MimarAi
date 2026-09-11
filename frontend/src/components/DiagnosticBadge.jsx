"use client";

import React, { useEffect, useState } from "react";
import { getBackendUrlStatus, getBackendApiUrl } from "../lib/backendConfig";

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

  const serviceLabel = (name, state) =>
    `${name}: ${state === "checking" ? "Checking..." : state === "connected" ? "Connected" : state === "offline" ? "Offline" : "Unavailable"}`;

  return (
    <div
      className="service-health"
      role="status"
      aria-live="polite"
      aria-label="Service connectivity status"
    >
      {Object.entries(serviceStatus).map(([name, state]) => (
        <span className={`service-health-item ${state}`} key={name}>
          <span className="service-health-dot" aria-hidden="true"></span>
          <span>
            {serviceLabel(name[0].toUpperCase() + name.slice(1), state)}
          </span>
        </span>
      ))}
    </div>
  );
}
