"use client";

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMimarStore, STAGE_FOR_SCREEN, STAGE_ORDER } from '../store/mimarStore';
import HeaderAvatar from './HeaderAvatar';
import DraftsPanel from './DraftsPanel';

export default function AppHeader() {
  const router = useRouter();
  const [isDraftsOpen, setIsDraftsOpen] = React.useState(false);
  const {
    currentScreen,
    interviewMode,
    revisionContext,
    interviewDone,
    planAccepted,
    structureAccepted,
    diagramJsonAccepted,
    diagramAccepted,
    finalAccepted,
    operationRunning,
    activeController,
    askAbortController,
    clearProjectState,
    saveProjectState
  } = useMimarStore();

  const handleStopOrLeave = (e) => {
    e.preventDefault();
    if (activeController) activeController.abort();
    if (askAbortController) askAbortController.abort();
    clearProjectState();
    try {
      sessionStorage.setItem('mimarai_toast', 'Generation stopped by user.');
    } catch (err) {}
    router.push('/');
  };

  const handleLogoClick = (e) => {
    e.preventDefault();
    saveProjectState();
    router.push('/');
  };

  // Compute header title step
  let stepText = 'STEP 01 · <b>IDEA INTERVIEW</b>';
  if (currentScreen === 'interview') {
    if (interviewMode === 'revision') {
      stepText = `REVISING <b>${revisionContext ? revisionContext.noun.toUpperCase() : 'PLAN'}</b>`;
    } else if (interviewDone) {
      stepText = 'STEP 01 · <b>INTERVIEW (HISTORY)</b>';
    } else {
      stepText = 'STEP 01 · <b>IDEA INTERVIEW</b>';
    }
  } else if (currentScreen === 'plan') {
    stepText = planAccepted ? 'STEP 02 · <b>PLAN (ACCEPTED)</b>' : 'STEP 02 · <b>PLAN REVIEW</b>';
  } else if (currentScreen === 'structure') {
    stepText = structureAccepted ? 'STEP 03 · <b>STRUCTURE (ACCEPTED)</b>' : 'STEP 03 · <b>STRUCTURE REVIEW</b>';
  } else if (currentScreen === 'diagram') {
    stepText = diagramJsonAccepted ? 'STEP 04 · <b>SCHEMA JSON (ACCEPTED)</b>' : 'STEP 04 · <b>SCHEMA JSON REVIEW</b>';
  } else if (currentScreen === 'render') {
    stepText = diagramAccepted ? 'STEP 05 · <b>DIAGRAMS (ACCEPTED)</b>' : 'STEP 05 · <b>RENDERED DIAGRAMS</b>';
  } else if (currentScreen === 'final') {
    stepText = finalAccepted ? 'STEP 06 · <b>FINAL PLAN (LOCKED)</b>' : 'STEP 06 · <b>FINAL REVIEW</b>';
  } else if (currentScreen === 'mcp') {
    stepText = 'STEP 07 · <b>MCP AGENT CONNECTION</b>';
  }

  // Compute stage rail active/done status
  const currentStage = STAGE_FOR_SCREEN[currentScreen];
  const currentStageIdx = currentStage ? STAGE_ORDER.indexOf(currentStage) : -1;

  const getStageClass = (stageName) => {
    const idx = STAGE_ORDER.indexOf(stageName);
    if (currentStageIdx === -1) return '';
    if (idx < currentStageIdx) return 'done';
    if (idx === currentStageIdx) return 'active';
    return '';
  };

  return (
    <header className="app-header">
      <div className="header-left">
        <a href="/" onClick={handleLogoClick} className="brand-logo" title="MimarAi — Return to Overview">
          <img src="/assets/mimarai-mark-ultra.png" alt="MimarAi Emblem" className="brand-mark-img" />
        </a>
      </div>

      <div className="header-center">
        <span className="header-badge">MIMAR ARCHITECT</span>
        <span
          className="header-step"
          id="headerTitleStep"
          dangerouslySetInnerHTML={{ __html: stepText }}
        />
      </div>

      <div className="global-stage-rail" id="globalStageRail">
        <span className={`gstage ${getStageClass('features')}`} data-stage="features">
          <span className="gstage-dot"></span>Features
        </span>
        <span className="gstage-sep"></span>
        <span className={`gstage ${getStageClass('structure')}`} data-stage="structure">
          <span className="gstage-dot"></span>Structure
        </span>
        <span className="gstage-sep"></span>
        <span className={`gstage ${getStageClass('diagram')}`} data-stage="diagram">
          <span className="gstage-dot"></span>Diagrams
        </span>
        <span className="gstage-sep"></span>
        <span className={`gstage ${getStageClass('final')}`} data-stage="final">
          <span className="gstage-dot"></span>Final Spec
        </span>
      </div>

      <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <a
          href="/"
          onClick={handleStopOrLeave}
          className={`btn btn-primary ${operationRunning ? 'stop-mode' : ''}`}
          id="headerLandingBtn"
          title="Stop generation and return to landing page"
          aria-label="Stop generation and return to landing page"
        >
          {operationRunning ? '⏹ Stop Generation' : 'Stop Generation'}
        </a>
        <button
          type="button"
          id="draftsMenuBtn"
          onClick={() => setIsDraftsOpen(true)}
          style={{
            background: 'rgba(56, 189, 248, 0.08)',
            border: '1px solid var(--border-line, rgba(56, 189, 248, 0.25))',
            color: 'var(--ink-primary, #F8FAFC)',
            borderRadius: '6px',
            width: '34px',
            height: '34px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            fontSize: '18px',
            fontWeight: 'bold',
            lineHeight: 1,
            transition: 'all 0.15s ease',
          }}
          title="Open saved drafts panel"
          aria-label="Open saved drafts panel"
        >
          ⋮
        </button>
        <HeaderAvatar />
      </div>

      <DraftsPanel
        isOpen={isDraftsOpen}
        onClose={() => setIsDraftsOpen(false)}
      />
    </header>
  );
}
