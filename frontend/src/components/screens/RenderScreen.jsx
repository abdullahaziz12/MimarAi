"use client";

import React, { useState, useRef, useEffect } from 'react';
import { useMimarStore, sleep } from '../../store/mimarStore';
import { useAuth } from '../../context/AuthContext';

export default function RenderScreen() {
  const { session } = useAuth();
  const {
    currentScreen,
    diagramAccepted,
    currentDiagramView,
    rejectedFeatures,
    manuallyAmended,
    askAiRunning,
    operationRunning,
    switchDiagramView,
    acceptRenderDiagram,
    setManuallyAmended,
    askAiDiagram,
    showToast
  } = useMimarStore();

  const [isAskOpen, setIsAskOpen] = useState(false);
  const [askMessages, setAskMessages] = useState([
    {
      id: 'ask-init',
      role: 'ai',
      html: 'Describe a requested diagram adjustment in plain language. Requests are automatically classified as cosmetic or structural-conflict before applying.'
    }
  ]);
  const [askInput, setAskInput] = useState('');
  const [askRunningLocal, setAskRunningLocal] = useState(false);
  const [askAbortCtrl, setAskAbortCtrl] = useState(null);

  const askMessagesEndRef = useRef(null);
  const askTextareaRef = useRef(null);

  const isActive = currentScreen === 'render';
  const isAuditRejected = !!rejectedFeatures['f3'];

  useEffect(() => {
    if (isAskOpen && askMessagesEndRef.current) {
      askMessagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [askMessages, isAskOpen]);

  // Blueprint SVG generation
  const renderBlueprintSVG = (kind) => {
    if (kind === 'arch') {
      const auditPath = isAuditRejected ? '' : `
        <path d="M 710 300 L 710 350 L 630 350" stroke="var(--accent-orange)" stroke-width="2" stroke-dasharray="4 4" marker-end="url(#arrow-o-A)" />
        <text x="670" y="340" fill="var(--accent-orange)" font-family="var(--font-mono)" font-size="10" text-anchor="middle">Audit write (async)</text>
        <path d="M 850 260 L 850 320 L 790 320" stroke="var(--blueprint-cyan)" stroke-width="2" marker-end="url(#arrow-A)" />
        <text x="850" y="300" fill="var(--ink-muted)" font-family="var(--font-mono)" font-size="9" text-anchor="middle">persists</text>
      `;
      const tablesSummary = isAuditRejected ? 'users · loans' : 'users · loans · audit_logs';

      return `
        <svg class="diagram-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 500">
          <defs>
            <pattern id="gp-A" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(92,138,166,0.14)" stroke-width="1"/>
            </pattern>
            <marker id="arrow-A" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--blueprint-cyan)" />
            </marker>
            <marker id="arrow-o-A" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent-orange)" />
            </marker>
          </defs>
          <rect width="1000" height="500" fill="#0A1422" />
          <rect width="1000" height="500" fill="url(#gp-A)" />
          <rect x="15" y="15" width="970" height="470" fill="none" stroke="rgba(92,138,166,0.35)" stroke-width="1.5" stroke-dasharray="8 4"/>
          <text x="30" y="38" fill="var(--blueprint-cyan)" font-family="var(--font-mono)" font-size="11" font-weight="600">DWG NO. ARCH-2026-MIMAR-01 // SYSTEM ARCHITECTURE BLUEPRINT</text>
          
          <path d="M 210 220 L 290 220" stroke="var(--blueprint-cyan)" stroke-width="2" marker-end="url(#arrow-A)" />
          <text x="250" y="210" fill="var(--ink-muted)" font-family="var(--font-mono)" font-size="10" text-anchor="middle">HTTPS / REST</text>

          <path d="M 450 220 L 550 180" stroke="var(--blueprint-cyan)" stroke-width="2" marker-end="url(#arrow-A)" />
          <text x="490" y="185" fill="var(--ink-muted)" font-family="var(--font-mono)" font-size="10" text-anchor="middle">JWT issue</text>

          <path d="M 550 240 L 630 240" stroke="var(--blueprint-cyan)" stroke-width="2" marker-end="url(#arrow-A)" />
          <text x="590" y="230" fill="var(--ink-muted)" font-family="var(--font-mono)" font-size="10" text-anchor="middle">Token verify</text>

          <path d="M 790 220 L 850 220" stroke="var(--blueprint-cyan)" stroke-width="2" marker-end="url(#arrow-A)" />
          <text x="820" y="210" fill="var(--ink-muted)" font-family="var(--font-mono)" font-size="10" text-anchor="middle">SQL / TLS</text>

          ${auditPath}

          <g transform="translate(50, 170)">
            <rect width="160" height="110" fill="var(--bg-surface)" stroke="var(--border-line-strong)" stroke-width="1.5"/>
            <rect width="160" height="24" fill="var(--bg-surface-elevated)" stroke="var(--border-line)" stroke-width="1"/>
            <text x="10" y="16" fill="var(--ink-primary)" font-family="var(--font-mono)" font-size="11" font-weight="600">CLIENT LAYER</text>
            <text x="10" y="48" fill="var(--ink-primary)" font-family="var(--font-display)" font-size="13" font-weight="600">Next.js SPA</text>
            <text x="10" y="68" fill="var(--ink-secondary)" font-family="var(--font-mono)" font-size="10">Loan desk UI</text>
            <text x="10" y="94" fill="var(--blueprint-cyan)" font-family="var(--font-mono)" font-size="9">[PORT: 3000]</text>
          </g>

          <g transform="translate(290, 170)">
            <rect width="160" height="110" fill="var(--bg-surface)" stroke="var(--border-line-strong)" stroke-width="1.5"/>
            <rect width="160" height="24" fill="var(--bg-surface-elevated)" stroke="var(--border-line)" stroke-width="1"/>
            <text x="10" y="16" fill="var(--ink-primary)" font-family="var(--font-mono)" font-size="11" font-weight="600">API GATEWAY</text>
            <text x="10" y="48" fill="var(--ink-primary)" font-family="var(--font-display)" font-size="13" font-weight="600">Next.js Edge</text>
            <text x="10" y="68" fill="var(--ink-secondary)" font-family="var(--font-mono)" font-size="10">Routing &amp; rate limit</text>
            <text x="10" y="94" fill="var(--blueprint-cyan)" font-family="var(--font-mono)" font-size="9">[PORT: 8080]</text>
          </g>

          <g transform="translate(550, 130)">
            <rect width="160" height="90" fill="var(--bg-surface)" stroke="var(--border-line-strong)" stroke-width="1.5"/>
            <rect width="160" height="20" fill="var(--bg-surface-elevated)" stroke="var(--border-line)" stroke-width="1"/>
            <text x="10" y="14" fill="var(--ink-primary)" font-family="var(--font-mono)" font-size="10" font-weight="600">AUTH SERVICE</text>
            <text x="10" y="42" fill="var(--ink-primary)" font-family="var(--font-display)" font-size="12" font-weight="600">FastAPI · JWT</text>
            <text x="10" y="60" fill="var(--ink-secondary)" font-family="var(--font-mono)" font-size="10">Role-based access</text>
          </g>

          <g transform="translate(550, 240)">
            <rect width="160" height="90" fill="var(--bg-surface)" stroke="var(--accent-orange)" stroke-width="1.5"/>
            <rect width="160" height="20" fill="var(--accent-orange-dim)" stroke="var(--accent-orange-border)" stroke-width="1"/>
            <text x="10" y="14" fill="var(--accent-orange)" font-family="var(--font-mono)" font-size="10" font-weight="700">LOAN SERVICE</text>
            <text x="10" y="42" fill="var(--ink-primary)" font-family="var(--font-display)" font-size="12" font-weight="600">FastAPI · Cron</text>
            <text x="10" y="60" fill="var(--ink-secondary)" font-family="var(--font-mono)" font-size="10">Approval &amp; interest recalc</text>
          </g>

          <g transform="translate(790, 170)">
            <rect width="160" height="110" fill="var(--bg-surface)" stroke="var(--success-green)" stroke-width="1.5"/>
            <rect width="160" height="24" fill="var(--success-green-dim)" stroke="var(--success-green-border)" stroke-width="1"/>
            <text x="10" y="16" fill="var(--success-green)" font-family="var(--font-mono)" font-size="11" font-weight="700">PERSISTENCE</text>
            <text x="10" y="48" fill="var(--ink-primary)" font-family="var(--font-display)" font-size="13" font-weight="600">Supabase Postgres</text>
            <text x="10" y="68" fill="var(--ink-secondary)" font-family="var(--font-mono)" font-size="10">${tablesSummary}</text>
            <text x="10" y="94" fill="var(--success-green)" font-family="var(--font-mono)" font-size="9">[STATUS: REPLICATED]</text>
          </g>

          <g transform="translate(730, 430)">
            <rect width="245" height="45" fill="var(--bg-surface-elevated)" stroke="var(--border-line)" stroke-width="1"/>
            <text x="10" y="16" fill="var(--ink-muted)" font-family="var(--font-mono)" font-size="9">SCALE: 1:1 | PROJ: MIMAR-STUDIO</text>
            <text x="10" y="32" fill="var(--blueprint-cyan)" font-family="var(--font-mono)" font-size="10" font-weight="700">MIMAR AI VALIDATED BLUEPRINT</text>
          </g>
        </svg>
      `;
    }

    // Database ERD
    const auditErd = isAuditRejected ? '' : `
      <path d="M 425 260 L 425 350" stroke="var(--blueprint-cyan)" stroke-width="2" />
      <text x="440" y="310" fill="var(--blueprint-cyan)" font-family="var(--font-mono)" font-size="10">1 : N</text>

      <path d="M 230 260 L 230 380 L 330 380" stroke="var(--blueprint-cyan)" stroke-width="2" stroke-dasharray="5 4" />
      <text x="260" y="372" fill="var(--ink-muted)" font-family="var(--font-mono)" font-size="9">actor_id → users.id</text>

      <g transform="translate(330, 350)">
        <rect width="190" height="110" fill="var(--bg-surface)" stroke="var(--success-green)" stroke-width="1.5"/>
        <rect width="190" height="24" fill="var(--success-green-dim)" stroke="var(--success-green-border)"/>
        <text x="10" y="16" fill="var(--success-green)" font-family="var(--font-mono)" font-size="10" font-weight="700">TABLE: audit_logs</text>
        <text x="10" y="42" fill="var(--accent-orange)" font-family="var(--font-mono)" font-size="10">PK  id : uuid</text>
        <text x="10" y="62" fill="var(--blueprint-cyan)" font-family="var(--font-mono)" font-size="10">FK  actor_id → users.id</text>
        <text x="10" y="82" fill="var(--ink-primary)" font-family="var(--font-mono)" font-size="10">action : text · occurred_at : timestamptz</text>
      </g>
    `;

    return `
      <svg class="diagram-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 500">
        <defs>
          <pattern id="gp-E" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(92,138,166,0.14)" stroke-width="1"/>
          </pattern>
        </defs>
        <rect width="1000" height="500" fill="#0A1422" />
        <rect width="1000" height="500" fill="url(#gp-E)" />
        <rect x="15" y="15" width="970" height="470" fill="none" stroke="rgba(92,138,166,0.35)" stroke-width="1.5" stroke-dasharray="8 4"/>
        <text x="30" y="38" fill="var(--blueprint-cyan)" font-family="var(--font-mono)" font-size="11" font-weight="600">DWG NO. ERD-2026-MIMAR-02 // DATABASE SCHEMA BLUEPRINT</text>

        <path d="M 230 180 L 330 180" stroke="var(--blueprint-cyan)" stroke-width="2" />
        <text x="280" y="170" fill="var(--blueprint-cyan)" font-family="var(--font-mono)" font-size="10" text-anchor="middle">1 : N</text>

        <g transform="translate(40, 90)">
          <rect width="190" height="180" fill="var(--bg-surface)" stroke="var(--border-line-strong)" stroke-width="1.5"/>
          <rect width="190" height="28" fill="var(--bg-surface-elevated)" stroke="var(--border-line)"/>
          <text x="10" y="18" fill="var(--ink-primary)" font-family="var(--font-mono)" font-size="11" font-weight="700">TABLE: users</text>
          <text x="10" y="48" fill="var(--accent-orange)" font-family="var(--font-mono)" font-size="10">PK  id : uuid</text>
          <text x="10" y="70" fill="var(--ink-primary)" font-family="var(--font-mono)" font-size="10">email : text, unique</text>
          <text x="10" y="92" fill="var(--ink-primary)" font-family="var(--font-mono)" font-size="10">role : enum(admin,officer,auditor)</text>
          <text x="10" y="114" fill="var(--ink-muted)" font-family="var(--font-mono)" font-size="10">created_at : timestamptz</text>
        </g>

        <g transform="translate(330, 90)">
          <rect width="190" height="220" fill="var(--bg-surface)" stroke="var(--blueprint-cyan)" stroke-width="1.5"/>
          <rect width="190" height="28" fill="var(--blueprint-cyan-dim)" stroke="var(--border-line)"/>
          <text x="10" y="18" fill="var(--blueprint-cyan)" font-family="var(--font-mono)" font-size="11" font-weight="700">TABLE: loans</text>
          <text x="10" y="48" fill="var(--accent-orange)" font-family="var(--font-mono)" font-size="10">PK  id : uuid</text>
          <text x="10" y="70" fill="var(--blueprint-cyan)" font-family="var(--font-mono)" font-size="10">FK  borrower_id → users.id</text>
          <text x="10" y="92" fill="var(--ink-primary)" font-family="var(--font-mono)" font-size="10">principal : numeric(12,2)</text>
          <text x="10" y="114" fill="var(--ink-primary)" font-family="var(--font-mono)" font-size="10">interest_rate : numeric(5,2)</text>
          <text x="10" y="136" fill="var(--success-green)" font-family="var(--font-mono)" font-size="10">status : enum(pending,approved,closed)</text>
        </g>

        ${auditErd}

        <g transform="translate(730, 430)">
          <rect width="245" height="45" fill="var(--bg-surface-elevated)" stroke="var(--border-line)" stroke-width="1"/>
          <text x="10" y="16" fill="var(--ink-muted)" font-family="var(--font-mono)" font-size="9">SCALE: 1:1 | PROJ: MIMAR-STUDIO</text>
          <text x="10" y="32" fill="var(--blueprint-cyan)" font-family="var(--font-mono)" font-size="10" font-weight="700">MIMAR AI VALIDATED BLUEPRINT</text>
        </g>
      </svg>
    `;
  };

  const [pendingConflictMessage, setPendingConflictMessage] = useState(null);

  const handleAskSend = async () => {
    if (askRunningLocal) {
      if (askAbortCtrl) askAbortCtrl.abort();
      return;
    }

    const text = askInput.trim();
    if (!text || operationRunning) return;

    const controller = new AbortController();
    setAskAbortCtrl(controller);
    setAskRunningLocal(true);

    setAskMessages(prev => [
      ...prev,
      { id: 'user-' + Date.now(), role: 'user', text }
    ]);
    setAskInput('');
    if (askTextareaRef.current) askTextareaRef.current.style.height = 'auto';

    const statusId = 'status-' + Date.now();
    setAskMessages(prev => [
      ...prev,
      { id: statusId, role: 'status', text: 'Classifying & processing edit request (AI)…' }
    ]);

    try {
      const result = await askAiDiagram(text, false, session?.access_token);

      if (result && (result.status === "refused" || result.refused)) {
        setPendingConflictMessage(text);
        const reason = result.explanation || "This request introduces a structural conflict against locked specifications.";
        const featList = (result.conflicting_features || []).map(f => `• Feature '${f.name || f.id}': ${f.reason}`).join('<br/>');
        const structList = (result.conflicting_structure || []).map(s => `• File '${s.path}': ${s.reason}`).join('<br/>');
        const conflictDetails = (featList || structList) ? `<div style="margin-top:8px;font-size:11px;color:#cbd5e1">${featList ? `<b>Conflicting Features:</b><br/>${featList}<br/>` : ''}${structList ? `<b>Conflicting Structure:</b><br/>${structList}` : ''}</div>` : '';

        setAskMessages(prev => prev.filter(m => m.id !== statusId).concat([
          {
            id: 'ai-struct-' + Date.now(),
            role: 'ai',
            isStructuralConflict: true,
            html: `<b>Structural Conflict Refused by Default:</b><br/>${reason}${conflictDetails}<div class="classify-tag structural">Structural conflict</div>`
          }
        ]));
      } else if (result) {
        setPendingConflictMessage(null);
        setAskMessages(prev => prev.filter(m => m.id !== statusId).concat([
          {
            id: 'ai-cosmetic-' + Date.now(),
            role: 'ai',
            html: `${result.explanation || 'Applied cosmetic modification.'}<div class="classify-tag cosmetic">Cosmetic change</div>`
          }
        ]));
      }
    } catch (err) {
      setAskMessages(prev => prev.filter(m => m.id !== statusId).concat([
        {
          id: 'ai-err-' + Date.now(),
          role: 'ai',
          html: `<span style="color:#EF4444">Ask AI error: ${err.message || 'Failed to process request.'}</span>`
        }
      ]));
    } finally {
      setAskRunningLocal(false);
      setAskAbortCtrl(null);
    }
  };

  const handleForceOverride = async () => {
    if (askRunningLocal || !pendingConflictMessage) return;

    const messageToOverride = pendingConflictMessage;
    setAskMessages(prev => [
      ...prev,
      { id: 'user-force-' + Date.now(), role: 'user', text: 'Yes, force override and propagate upstream into Features and Structure.' }
    ]);

    const statusId = 'status-force-' + Date.now();
    setAskMessages(prev => [
      ...prev,
      { id: statusId, role: 'status', text: 'Propagating changes upstream into locked Feature & Structure JSON…' }
    ]);

    const controller = new AbortController();
    setAskAbortCtrl(controller);
    setAskRunningLocal(true);

    try {
      const result = await askAiDiagram(messageToOverride, true, session?.access_token);
      setPendingConflictMessage(null);

      const propList = (result?.propagated_changes || []).map(p => `• [${p.target.toUpperCase()}] ${p.id || ''} (${p.field}): ${p.old_value} → ${p.new_value}`).join('<br/>');
      const propDetails = propList ? `<div style="margin-top:8px;font-size:11px;color:#38BDF8"><b>Propagated Upstream Changes:</b><br/>${propList}</div>` : '';

      setAskMessages(prev => prev.filter(m => m.id !== statusId).concat([
        {
          id: 'ai-force-done-' + Date.now(),
          role: 'ai',
          html: `<b>Forced Override Applied:</b><br/>${result?.explanation || 'Changes propagated into locked specifications.'}${propDetails}<div class="classify-tag structural" style="background:#10B981">Manually Amended</div>`
        }
      ]));
    } catch (err) {
      setAskMessages(prev => prev.filter(m => m.id !== statusId).concat([
        {
          id: 'ai-force-err-' + Date.now(),
          role: 'ai',
          html: `<span style="color:#EF4444">Override error: ${err.message}</span>`
        }
      ]));
    } finally {
      setAskRunningLocal(false);
      setAskAbortCtrl(null);
    }
  };

  const handleCancelConflict = () => {
    setPendingConflictMessage(null);
    setAskMessages(prev => [
      ...prev,
      {
        id: 'ai-cancel-' + Date.now(),
        role: 'ai',
        html: 'No changes were made. Project state remains locked and consistent.'
      }
    ]);
  };

  return (
    <div className={`screen scrollable ${isActive ? 'active' : ''} ${diagramAccepted ? 'readonly-mode' : ''}`} id="screen-render">
      <div className="diagram-screen-inner">
        <div className="diagram-toolbar">
          <div className="diagram-toolbar-left">
            <div className="label">Step 05 · Deterministic Renderer</div>
            <div className="title">Visual Architecture &amp; ERD Blueprints</div>
          </div>

          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <div className="toggle-row">
              <button
                type="button"
                className={`toggle-btn ${currentDiagramView === 'arch' ? 'active' : ''}`}
                id="btnArch"
                onClick={() => switchDiagramView('arch')}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="8" y="14" width="7" height="7" rx="1" />
                  <path d="M6.5 10v3a1 1 0 0 0 1 1H10M17.5 10v3a1 1 0 0 0-1 1h-2.5" />
                </svg>
                System Diagram
              </button>
              <button
                type="button"
                className={`toggle-btn ${currentDiagramView === 'erd' ? 'active' : ''}`}
                id="btnErd"
                onClick={() => switchDiagramView('erd')}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <ellipse cx="12" cy="5" rx="8" ry="3" />
                  <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
                </svg>
                Database ERD
              </button>
            </div>

            {diagramAccepted && (
              <span className="accepted-badge" id="renderAcceptedBadge" style={{ display: 'inline-flex' }}>
                <span className="ab-dot"></span>DIAGRAM ACCEPTED
              </span>
            )}
          </div>
        </div>

        <div className="diagram-canvas-wrap">
          <div className="canvas-label">
            <span className="title" id="canvasTitle">
              {currentDiagramView === 'arch' ? 'System Architecture Blueprint' : 'Database ERD Blueprint'}
            </span>
            <span className="sub" id="canvasSub">
              {currentDiagramView === 'arch'
                ? '3 SERVICES · FASTAPI / NEXT.JS / POSTGRES'
                : '3 TABLES · REFERENTIAL INTEGRITY VALIDATED'}
            </span>
          </div>

          <div className="canvas-box" id="canvasBox">
            <div
              className={`diagram-pane ${currentDiagramView === 'arch' ? 'active' : ''}`}
              id="paneArch"
              dangerouslySetInnerHTML={{ __html: renderBlueprintSVG('arch') }}
            />
            <div
              className={`diagram-pane ${currentDiagramView === 'erd' ? 'active' : ''}`}
              id="paneErd"
              dangerouslySetInnerHTML={{ __html: renderBlueprintSVG('erd') }}
            />
          </div>

          <div className="canvas-footer">
            <span>Rendered by CAD-style SVG engine · strictly deterministic</span>
            {manuallyAmended && (
              <span className="amended-note" id="amendedNote" style={{ display: 'flex' }}>
                <span className="amended-dot"></span>Manually Amended (Propagated Upstream)
              </span>
            )}
          </div>
        </div>

        {/* Ask AI Floating Trigger (Only on this screen) */}
        {!diagramAccepted && (
          <button
            type="button"
            className="ask-ai-btn"
            id="askAiBtn"
            onClick={() => setIsAskOpen(true)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3a5 5 0 0 0-5 5v3.2c0 .5-.16 1-.46 1.4L5 15v1h14v-1l-1.54-2.4a2.3 2.3 0 0 1-.46-1.4V8a5 5 0 0 0-5-5z" />
              <path d="M9.5 19a2.5 2.5 0 0 0 5 0" />
            </svg>
            Ask AI
          </button>
        )}

        <div className="diagram-actions">
          <button
            type="button"
            className={`btn ${diagramAccepted ? 'btn-success' : 'btn-primary'}`}
            id="acceptBtnRender"
            style={{ minWidth: 280, justifyContent: 'center', padding: '12px 20px' }}
            disabled={diagramAccepted || operationRunning || askRunningLocal}
            onClick={acceptRenderDiagram}
          >
            {diagramAccepted ? '✓ Diagram Accepted & Committed' : 'Accept the Diagram →'}
          </button>
        </div>

        {/* Ask AI Drawer Panel */}
        <div
          className={`sheet-backdrop ${isAskOpen ? 'open' : ''}`}
          id="sheetBackdropAsk"
          onClick={() => setIsAskOpen(false)}
        ></div>

        <div className={`ask-sheet ${isAskOpen ? 'open' : ''}`} id="askSheet">
          <div className="ask-head">
            <div>
              <div className="title">Ask AI (Diagram Assistant)</div>
              <div className="sub">
                Editing: <span id="askTarget">{currentDiagramView === 'arch' ? 'System Architecture' : 'Database ERD'}</span>
              </div>
            </div>
            <svg
              className="ask-close"
              id="askClose"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              onClick={() => setIsAskOpen(false)}
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </div>

          <div className="ask-messages" id="askMessages">
            {askMessages.map((m) => {
              if (m.role === 'status') {
                return (
                  <div key={m.id} className="arow ai">
                    <div className="status-row">
                      <div className="status-dot"></div>
                      <div className="status-text">{m.text}</div>
                    </div>
                  </div>
                );
              }
              if (m.role === 'user') {
                return (
                  <div key={m.id} className="arow user">
                    <div className="abubble user">{m.text}</div>
                  </div>
                );
              }
              return (
                <div key={m.id} className="arow ai">
                  <div>
                    <div className="eyebrow">MimarAi</div>
                    <div className="abubble ai" dangerouslySetInnerHTML={{ __html: m.html }} />
                    {m.isStructuralConflict && (
                      <div className="confirm-row">
                        <button
                          type="button"
                          className="force-btn"
                          id="forceBtnLive"
                          disabled={askRunningLocal}
                          onClick={handleForceOverride}
                        >
                          Force override &amp; Propagate Upstream
                        </button>
                        <button
                          type="button"
                          className="cancel-btn"
                          id="cancelForceLive"
                          onClick={handleCancelConflict}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={askMessagesEndRef} />
          </div>

          <div className="ask-inputbar">
            <div className="ask-input-shell">
              <textarea
                ref={askTextareaRef}
                id="askComposer"
                rows={1}
                value={askInput}
                onChange={(e) => {
                  setAskInput(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleAskSend();
                  }
                }}
                disabled={askRunningLocal}
                placeholder="e.g. rename the users table to accounts"
              />
              <button
                type="button"
                className={`ask-send ${askRunningLocal ? 'stop' : askInput.trim() ? 'ready' : ''}`}
                id="askSend"
                aria-label={askRunningLocal ? 'Stop generation' : 'Send message'}
                onClick={handleAskSend}
              >
                {askRunningLocal ? (
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 19V5" />
                    <path d="M5 12l7-7 7 7" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
