"use client";

import React from 'react';

const EXAMPLE_PROMPTS = [
  {
    title: "Banking App",
    desc: "A banking application with role-based access control, audit logging, multi-currency accounts, and transaction history."
  },
  {
    title: "Food Delivery Platform",
    desc: "A food delivery platform featuring live order tracking, restaurant catalog management, driver assignment, and reviews."
  },
  {
    title: "Auditor Loan Management",
    desc: "A loan management desk for auditors and loan officers with role-based access, document uploads, and automated risk scoring."
  }
];

export default function ExamplePromptFallback({ onSelectPrompt, reason = "vague" }) {
  return (
    <div style={{
      background: 'rgba(15, 23, 42, 0.8)',
      border: '1px solid rgba(56, 189, 248, 0.25)',
      borderRadius: '8px',
      padding: '16px',
      marginTop: '12px',
      marginBottom: '12px'
    }}>
      <div style={{
        fontSize: '12px',
        fontWeight: '600',
        color: '#38BDF8',
        fontFamily: 'var(--font-mono, monospace)',
        textTransform: 'uppercase',
        marginBottom: '6px'
      }}>
        {reason === 'off_topic' ? '⚡ OFF-TOPIC LIMIT REACHED' : '⚡ EXHAUSTED RE-CLASSIFICATION ROUNDS'}
      </div>
      <p style={{ fontSize: '13px', color: '#E2E8F0', margin: '0 0 12px 0', lineHeight: '1.5' }}>
        {reason === 'off_topic'
          ? "We're having trouble getting a software-focused idea. Tap one of the starter templates below to kick off your architectural design:"
          : "To help us get started, select one of these example project descriptions or use them as a starting template:"}
      </p>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {EXAMPLE_PROMPTS.map((item, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => onSelectPrompt(item.desc)}
            style={{
              textAlign: 'left',
              padding: '10px 14px',
              borderRadius: '6px',
              background: 'rgba(30, 41, 59, 0.7)',
              border: '1px solid rgba(148, 163, 184, 0.2)',
              color: '#F8FAFC',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#38BDF8';
              e.currentTarget.style.background = 'rgba(56, 189, 248, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.2)';
              e.currentTarget.style.background = 'rgba(30, 41, 59, 0.7)';
            }}
          >
            <span style={{ fontSize: '12px', fontWeight: '600', color: '#38BDF8' }}>
              {item.title}
            </span>
            <span style={{ fontSize: '12px', color: '#94A3B8' }}>
              "{item.desc}"
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
