"use client";

import React from 'react';

export default function StartTriggerGate({ onStartGeneration, isGenerating = false }) {
  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(56, 189, 248, 0.15))',
      border: '1px solid rgba(16, 185, 129, 0.4)',
      borderRadius: '8px',
      padding: '16px',
      marginTop: '14px',
      marginBottom: '14px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '16px'
    }}>
      <div>
        <div style={{
          fontSize: '12px',
          fontWeight: '700',
          color: '#10B981',
          fontFamily: 'var(--font-mono, monospace)',
          letterSpacing: '0.05em',
          marginBottom: '4px'
        }}>
          ✓ STEP 0 &amp; FIXED INPUTS VERIFIED — READY TO GENERATE
        </div>
        <div style={{ fontSize: '13px', color: '#E2E8F0', lineHeight: '1.4' }}>
          Ready to generate your implementation plan — tap to start the dual-model verification pipeline.
        </div>
      </div>

      <button
        type="button"
        disabled={isGenerating}
        onClick={onStartGeneration}
        style={{
          background: isGenerating ? '#64748B' : 'linear-gradient(135deg, #10B981, #0EA5E9)',
          color: '#FFFFFF',
          border: 'none',
          borderRadius: '6px',
          padding: '12px 20px',
          fontSize: '13px',
          fontWeight: '600',
          cursor: isGenerating ? 'not-allowed' : 'pointer',
          whiteSpace: 'nowrap',
          boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
          transition: 'all 0.15s ease'
        }}
      >
        {isGenerating ? 'Generating…' : '🚀 Generate Implementation Plan →'}
      </button>
    </div>
  );
}
