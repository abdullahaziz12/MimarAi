"use client";

import React from 'react';

const STACK_OPTIONS = [
  "Next.js + Tailwind CSS",
  "React + Node.js (Express)",
  "Vue 3 + Python (FastAPI)",
  "Angular + Java (Spring Boot)"
];

const DATABASE_OPTIONS = [
  "Supabase (PostgreSQL with RLS)",
  "PostgreSQL + Prisma",
  "MongoDB + Mongoose",
  "Firebase Firestore"
];

const DEPLOYMENT_OPTIONS = [
  "Vercel + Render ($0 Tier)",
  "AWS ECS + RDS",
  "Docker + DigitalOcean App Platform",
  "Cloudflare Workers + Supabase"
];

const API_OPTIONS = [
  "Supabase Auth + Gmail SMTP",
  "Stripe + Auth0 + Resend",
  "Firebase Auth + Twilio",
  "Custom JWT + SendGrid"
];

export default function FixedInputsCollection({ fixedInputs, onChangeFixedInput }) {
  const current = fixedInputs || {};

  return (
    <div style={{
      background: 'rgba(11, 15, 25, 0.9)',
      border: '1px solid rgba(56, 189, 248, 0.3)',
      borderRadius: '8px',
      padding: '16px',
      marginTop: '14px',
      marginBottom: '14px'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '12px'
      }}>
        <div style={{
          fontSize: '12px',
          fontWeight: '700',
          color: '#38BDF8',
          fontFamily: 'var(--font-mono, monospace)',
          letterSpacing: '0.05em'
        }}>
          STEP 0.5 · FIXED ARCHITECTURE INPUTS
        </div>
        <span style={{ fontSize: '11px', color: '#94A3B8' }}>Structured Selections</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        {/* Tech Stack */}
        <div>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#CBD5E1', marginBottom: '4px' }}>
            Frontend & Framework
          </label>
          <select
            value={current.stack || ''}
            onChange={(e) => onChangeFixedInput('stack', e.target.value)}
            style={{
              width: '100%',
              padding: '8px 10px',
              borderRadius: '6px',
              background: '#1E293B',
              border: '1px solid rgba(148, 163, 184, 0.3)',
              color: '#F8FAFC',
              fontSize: '12px'
            }}
          >
            <option value="">Select Tech Stack…</option>
            {STACK_OPTIONS.map((opt, i) => (
              <option key={i} value={opt}>{opt}</option>
            ))}
          </select>
        </div>

        {/* Database */}
        <div>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#CBD5E1', marginBottom: '4px' }}>
            Database Target
          </label>
          <select
            value={current.database || ''}
            onChange={(e) => onChangeFixedInput('database', e.target.value)}
            style={{
              width: '100%',
              padding: '8px 10px',
              borderRadius: '6px',
              background: '#1E293B',
              border: '1px solid rgba(148, 163, 184, 0.3)',
              color: '#F8FAFC',
              fontSize: '12px'
            }}
          >
            <option value="">Select Database…</option>
            {DATABASE_OPTIONS.map((opt, i) => (
              <option key={i} value={opt}>{opt}</option>
            ))}
          </select>
        </div>

        {/* Deployment Target */}
        <div>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#CBD5E1', marginBottom: '4px' }}>
            Deployment Environment
          </label>
          <select
            value={current.deployment || ''}
            onChange={(e) => onChangeFixedInput('deployment', e.target.value)}
            style={{
              width: '100%',
              padding: '8px 10px',
              borderRadius: '6px',
              background: '#1E293B',
              border: '1px solid rgba(148, 163, 184, 0.3)',
              color: '#F8FAFC',
              fontSize: '12px'
            }}
          >
            <option value="">Select Deployment…</option>
            {DEPLOYMENT_OPTIONS.map((opt, i) => (
              <option key={i} value={opt}>{opt}</option>
            ))}
          </select>
        </div>

        {/* APIs & Services */}
        <div>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#CBD5E1', marginBottom: '4px' }}>
            Auth & Core Services
          </label>
          <select
            value={current.apis || ''}
            onChange={(e) => onChangeFixedInput('apis', e.target.value)}
            style={{
              width: '100%',
              padding: '8px 10px',
              borderRadius: '6px',
              background: '#1E293B',
              border: '1px solid rgba(148, 163, 184, 0.3)',
              color: '#F8FAFC',
              fontSize: '12px'
            }}
          >
            <option value="">Select Auth & Services…</option>
            {API_OPTIONS.map((opt, i) => (
              <option key={i} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
