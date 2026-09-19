"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { getConfiguredBackendUrl } from "../lib/backendConfig";

const API_BASE = getConfiguredBackendUrl() || "https://mimaraibackend-p65ccvlk.b4a.run";

export default function SessionHeartbeat() {
  const { session } = useAuth();
  const sessionIdRef = useRef(null);

  useEffect(() => {
    if (!session?.access_token) return;

    const sendHeartbeat = async () => {
      // Only heartbeat if tab is active / visible
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }

      try {
        const payload = sessionIdRef.current ? { session_id: sessionIdRef.current } : {};
        const res = await fetch(`${API_BASE}/api/session/heartbeat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.session_id) {
            sessionIdRef.current = data.session_id;
          }
        }
      } catch (err) {
        // Silently catch heartbeat errors
      }
    };

    // Initial heartbeat
    sendHeartbeat();

    // 60-second interval
    const interval = setInterval(sendHeartbeat, 60000);

    return () => clearInterval(interval);
  }, [session]);

  return null;
}
