import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, ArrowRight, ShieldAlert, FileCode, RefreshCw, GitCommit, CornerDownRight } from 'lucide-react';

export default function ConflictScreen({ setActiveScreen, conflicts, project }) {
  const [selectedFixId, setSelectedFixId] = useState('fix-flyio');
  const [isResolved, setIsResolved] = useState(false);

  const conflict = conflicts[0];

  const handleApplyFix = (fixId) => {
    setSelectedFixId(fixId);
    setIsResolved(true);
  };

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '24px 20px 60px' }}>
      
      {/* CAD Header Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--border-light)', paddingBottom: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="coord-tag orange">[PROOFREADER MARKUP]</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--line-cyan)' }}>
              RULE_CHECKER_ID: {conflict.ruleRef}
            </span>
          </div>
          <h1 className="font-head" style={{ fontSize: '24px', marginTop: '4px' }}>
            Requirement Contradiction Analysis
          </h1>
        </div>

        {/* Action button */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            onClick={() => setActiveScreen('spec')} 
            className="btn-cad btn-cad-primary"
          >
            <span>VIEW UPDATED SPEC</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>

      {/* Main Grid: Conflict Details & Proofreader Red Pen Callout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '24px', alignItems: 'start' }}>
        
        {/* Left Main Column: Proofreader Red Pen Markup Card */}
        <div className="cad-box cad-box-ticks" style={{ padding: '24px', background: 'var(--bg-surface-elevated)' }}>
          
          {/* Status Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldAlert size={18} color="var(--accent-orange)" />
              <span className="font-mono" style={{ fontSize: '14px', fontWeight: 700, color: 'var(--accent-orange)' }}>
                [{conflict.id}]: {conflict.severity}
              </span>
            </div>
            <span className="coord-tag orange">FLAGGED BY LINTER</span>
          </div>

          <h2 className="font-head" style={{ fontSize: '20px', marginBottom: '16px' }}>
            {conflict.title}
          </h2>

          {/* Proofreader Red-Pen Side-by-Side Contradiction Comparison */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
            
            {/* Requirement A */}
            <div style={{ border: '1px solid var(--border-strong)', background: 'var(--bg-surface-subtle)', padding: '14px', borderRadius: '2px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span className="coord-tag">{conflict.requirementA.reqId}</span>
                <span className="font-mono" style={{ fontSize: '10px', color: 'var(--line-cyan)' }}>REQUIREMENT A</span>
              </div>
              <div className="font-head" style={{ fontSize: '14px', fontWeight: 700, marginBottom: '4px' }}>
                {conflict.requirementA.name}
              </div>
              <p style={{ fontSize: '12px', color: 'var(--ink-secondary)' }}>
                {conflict.requirementA.details}
              </p>
            </div>

            {/* Requirement B (Conflicting) */}
            <div style={{ border: '1px solid var(--accent-orange-border)', background: 'var(--accent-orange-bg)', padding: '14px', borderRadius: '2px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span className="coord-tag orange">{conflict.requirementB.reqId}</span>
                <span className="font-mono" style={{ fontSize: '10px', color: 'var(--accent-orange)' }}>REQUIREMENT B (CONFLICT)</span>
              </div>
              <div className="font-head proofreader-strike" style={{ fontSize: '14px', fontWeight: 700, marginBottom: '4px' }}>
                {conflict.requirementB.name}
              </div>
              <p style={{ fontSize: '12px', color: 'var(--ink-primary)' }}>
                {conflict.requirementB.details}
              </p>
              <div className="proofreader-annotation">
                ▲ RED PEN MARKUP: 10s Lambdas kill persistent TCP sockets!
              </div>
            </div>

          </div>

          {/* Root Cause Technical Analysis */}
          <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '16px', marginBottom: '24px' }}>
            <h3 className="font-mono" style={{ fontSize: '12px', color: 'var(--accent-orange)', marginBottom: '8px', textTransform: 'uppercase' }}>
              // ARCHITECTURAL ROOT CAUSE:
            </h3>
            <p style={{ fontSize: '13px', lineHeight: 1.6, color: 'var(--ink-primary)' }}>
              {conflict.rootCauseAnalysis}
            </p>
          </div>

          {/* Downstream Impact Bullets */}
          <div style={{ marginBottom: '24px', background: 'var(--bg-surface-subtle)', padding: '14px', borderRadius: '2px', border: '1px solid var(--border-light)' }}>
            <div className="font-mono" style={{ fontSize: '11px', color: 'var(--line-cyan)', marginBottom: '8px' }}>
              DOWNSTREAM IMPLICATIONS IF UNRESOLVED:
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {conflict.architecturalImpact.map((item, idx) => (
                <li key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '12px', color: 'var(--ink-secondary)' }}>
                  <CornerDownRight size={13} color="var(--accent-orange)" style={{ marginTop: '2px', flexShrink: 0 }} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Suggested Resolution Options */}
          <div>
            <h3 className="font-mono" style={{ fontSize: '12px', color: 'var(--slate-green)', marginBottom: '12px', textTransform: 'uppercase' }}>
              // RECOMMENDED STRUCTURAL FIXES:
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {conflict.suggestedFixes.map(fix => {
                const isSelected = selectedFixId === fix.id;
                return (
                  <div
                    key={fix.id}
                    onClick={() => handleApplyFix(fix.id)}
                    style={{
                      border: isSelected ? '1px solid var(--slate-green)' : '1px solid var(--border-strong)',
                      background: isSelected ? 'var(--slate-green-bg)' : 'var(--bg-surface-subtle)',
                      padding: '16px',
                      borderRadius: '2px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '14px', color: 'var(--ink-primary)' }}>
                        {fix.name}
                      </div>
                      {isSelected && (
                        <span className="coord-tag green">
                          <CheckCircle2 size={11} /> SELECTED FIX
                        </span>
                      )}
                    </div>

                    <p style={{ fontSize: '12px', color: 'var(--ink-secondary)', marginBottom: '10px' }}>
                      {fix.description}
                    </p>

                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--line-cyan)', display: 'flex', gap: '12px' }}>
                      {fix.changes.map((c, i) => (
                        <span key={i}>+ {c}</span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* Right Sidebar: Resolution Status & Blueprint Apply Action */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          <div className="cad-box cad-box-ticks" style={{ padding: '20px', background: 'var(--bg-surface-elevated)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border-light)', paddingBottom: '8px', marginBottom: '14px' }}>
              <GitCommit size={14} color="var(--line-cyan)" />
              <span className="font-mono" style={{ fontSize: '12px', fontWeight: 700 }}>
                REVISION STATUS
              </span>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--ink-muted)', marginBottom: '4px' }}>
                CURRENT BLUEPRINT REVISION:
              </div>
              <div className="font-mono" style={{ fontSize: '16px', fontWeight: 700, color: isResolved ? 'var(--slate-green)' : 'var(--accent-orange)' }}>
                {isResolved ? 'REV-1.0.4 [VERIFIED]' : 'REV-1.0.3 [FLAGGED]'}
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '12px', marginBottom: '16px' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--ink-muted)', marginBottom: '6px' }}>
                SELECTED ARCHITECTURAL FIX:
              </div>
              <div style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--line-cyan)' }}>
                {selectedFixId === 'fix-flyio' ? 'Migrate to Fly.io Node.js WebSockets' : 'Switch to Pusher Managed Gateway'}
              </div>
            </div>

            <button
              onClick={() => setActiveScreen('spec')}
              className="btn-cad btn-cad-primary"
              style={{ width: '100%', padding: '12px', fontSize: '12px', marginBottom: '8px' }}
            >
              <span>APPLY FIX & REGENERATE SPEC</span>
              <ArrowRight size={14} />
            </button>

            <button
              onClick={() => setActiveScreen('diagram')}
              className="btn-cad"
              style={{ width: '100%', padding: '8px', fontSize: '11px' }}
            >
              <span>VIEW UPDATED ARCHITECTURE DIAGRAM</span>
            </button>
          </div>

          {/* Verification Rules Invariants */}
          <div className="cad-box" style={{ padding: '16px', background: 'var(--bg-surface-subtle)' }}>
            <div className="font-mono" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink-secondary)', marginBottom: '8px' }}>
              LINTER RULE INVARIANTS:
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--ink-muted)', lineHeight: 1.6 }}>
              <div>[✓] RULE-01: Relational Postgres ACID</div>
              <div>[✓] RULE-02: Auth JWT HMAC Token Exp</div>
              <div style={{ color: 'var(--accent-orange)' }}>[!] RULE-09: Stateful vs Serverless host</div>
              <div>[✓] RULE-14: CORS TLS 1.3 Strict Payload</div>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
