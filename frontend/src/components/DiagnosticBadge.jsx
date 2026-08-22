"use client";

import React, { useEffect, useState } from 'react';

export default function DiagnosticBadge() {
  const [dbStatus, setDbStatus] = useState({ state: 'checking', label: 'Checking backend/db…' });

  useEffect(() => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://mimaraibackend-euj86d7p.b4a.run';
    fetch(`${backendUrl}/health/db`)
      .then(res => res.json())
      .then(data => {
        if (data.status === 'ok' && data.db === 'connected') {
          setDbStatus({
            state: 'connected',
            label: `Backend & Supabase Connected (${data.projects_count ?? 0} projects)`
          });
        } else if (data.db === 'unconfigured') {
          setDbStatus({
            state: 'unconfigured',
            label: 'Backend Connected (Supabase credentials pending setup)'
          });
        } else {
          setDbStatus({
            state: 'warning',
            label: `Backend Connected (${data.db || 'DB issue'})`
          });
        }
      })
      .catch(err => {
        setDbStatus({
          state: 'offline',
          label: 'Backend offline (local dev or deploying)'
        });
      });
  }, []);

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 10,
        fontFamily: 'var(--font-mono, monospace)',
        color: dbStatus.state === 'connected' ? '#10B981' : dbStatus.state === 'unconfigured' ? '#38BDF8' : '#94A3B8',
        padding: '2px 8px',
        borderRadius: 4,
        background: 'rgba(14, 23, 43, 0.6)',
        border: '1px solid rgba(56, 189, 248, 0.15)',
        marginLeft: 12
      }}
      title={`MimarAi V0 Proof-of-Life: ${dbStatus.label}`}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          backgroundColor: dbStatus.state === 'connected' ? '#10B981' : dbStatus.state === 'unconfigured' ? '#38BDF8' : '#64748B',
          display: 'inline-block'
        }}
      ></span>
      <span>{dbStatus.label}</span>
    </div>
  );
}
