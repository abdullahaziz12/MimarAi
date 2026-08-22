"use client";

import React, { useState, useRef, useEffect } from 'react';
import { useMimarStore } from '../../store/mimarStore';

export default function InterviewScreen() {
  const {
    currentScreen,
    interviewMode,
    revisionContext,
    messages,
    operationRunning,
    activeController,
    runIdeaPipeline,
    runRevisionPipeline
  } = useMimarStore();

  const [inputVal, setInputVal] = useState('');
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  const isActive = currentScreen === 'interview';

  useEffect(() => {
    if (isActive && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isActive]);

  const handleTextareaInput = (e) => {
    setInputVal(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px';
  };

  const handleSend = (e) => {
    e?.preventDefault();
    if (operationRunning) {
      if (activeController) {
        activeController.abort();
      }
      return;
    }

    const text = inputVal.trim();
    if (!text) return;

    // Add user bubble
    useMimarStore.setState(state => ({
      messages: [
        ...state.messages,
        { id: 'user-' + Date.now(), role: 'user', text }
      ]
    }));

    setInputVal('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    if (interviewMode === 'revision' && revisionContext) {
      runRevisionPipeline(revisionContext.targetStage);
    } else {
      runIdeaPipeline(text);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={`screen ${isActive ? 'active' : ''}`} id="screen-interview">
      <div className="interview-screen-inner">

        {/* REVISION CONTEXT BANNER */}
        {interviewMode === 'revision' && revisionContext && (
          <div className="context-banner revision-banner" id="revisionBanner" style={{ display: 'flex' }}>
            <span className="cb-icon">⚡</span>
            <div className="cb-main">
              <div className="cb-label">REVISION WORKSPACE ACTIVE</div>
              <div className="cb-desc">
                Revising <b id="revBannerStage">{revisionContext.noun.toUpperCase()}</b> based on <b id="revBannerCount">{Object.keys(revisionContext.pendingComments || {}).length}</b> pending comment(s). Locked upstream stages remain immutable.
              </div>
            </div>
            <div className="cb-locked">
              <span className="cb-lock-chip">✓ SPEC LOCKED</span>
            </div>
          </div>
        )}

        {/* READ-ONLY BANNER */}
        {interviewMode === 'readonly' && (
          <div className="context-banner readonly-banner" id="readonlyBanner" style={{ display: 'flex' }}>
            <span className="cb-icon">🔒</span>
            <div className="cb-main">
              <div className="cb-label">INTERVIEW ARCHIVE (READ-ONLY)</div>
              <div className="cb-desc">
                This project has progressed to downstream review stages. To request modifications, use the comment system on the respective review screen.
              </div>
            </div>
          </div>
        )}

        <div className="interview-shell">
          {/* CHAT COLUMN */}
          <div className="chat-engine">
            <div className="chat-eng-head">
              <div className="chat-eng-label">
                <div className={`hud-dot-live ${interviewMode === 'readonly' ? 'idle' : ''}`} id="hudDotLive"></div>
                MIMAR ARCHITECT LINTER ENGINE
              </div>
              <span className="chat-session-tag" id="chatSessionTag">
                {interviewMode === 'revision'
                  ? 'SESSION: REVISION ACTIVE'
                  : interviewMode === 'readonly'
                  ? 'SESSION: LOCKED / READ-ONLY'
                  : 'SESSION: ACTIVE'}
              </span>
            </div>

            <div className="messages" id="messages">
              {messages.map((m) => {
                if (m.role === 'status') {
                  return (
                    <div key={m.id} className="row ai">
                      <div className="status-row">
                        <div className="status-dot"></div>
                        <div className="status-text">{m.text}</div>
                      </div>
                    </div>
                  );
                }
                if (m.role === 'user') {
                  return (
                    <div key={m.id} className="row user">
                      <div className="bubble user">{m.text}</div>
                    </div>
                  );
                }
                return (
                  <div key={m.id} className="row ai">
                    <div>
                      <div className="eyebrow">MimarAi</div>
                      <div className="bubble ai">{m.text}</div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* CHAT COMPOSER */}
            {interviewMode !== 'readonly' ? (
              <div className="inputbar" id="interviewInputBar">
                <div className={`input-shell ${operationRunning ? 'locked' : ''}`} id="inputShell">
                  <textarea
                    ref={textareaRef}
                    id="composer"
                    rows={1}
                    value={inputVal}
                    onChange={handleTextareaInput}
                    onKeyDown={handleKeyDown}
                    disabled={operationRunning}
                    placeholder="e.g. A loan management desk for auditors and loan officers with role-based access…"
                  />
                  <button
                    type="button"
                    className={`send-btn ${operationRunning ? 'stop' : inputVal.trim() ? 'ready' : ''}`}
                    id="sendBtn"
                    aria-label={operationRunning ? 'Stop generating' : 'Send'}
                    onClick={handleSend}
                  >
                    {operationRunning ? (
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
                      </svg>
                    ) : (
                      <svg
                        className="icon-arrow"
                        id="btnIcon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M12 19V5" />
                        <path d="M5 12l7-7 7 7" />
                      </svg>
                    )}
                  </button>
                </div>
                <div className="input-hint">
                  MIMAR DRAFTS WITH TWO MODELS (GEMINI + GROQ) IN PARALLEL BEFORE SHOWING YOU ANYTHING
                </div>
              </div>
            ) : (
              <div className="composer-readonly-msg visible" id="composerReadonlyMsg">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>
                  Interview input locked to protect project state integrity. Navigate using the sidebar shortcuts to review or comment.
                </span>
              </div>
            )}
          </div>

          {/* RIGHT SIDE PIPELINE PANEL */}
          <div className="side-panel">
            <div className="panel-label">Validation Pipeline</div>
            <div className="pipe-item">
              <div className="pipe-num">01</div>
              <div>
                <div className="pipe-title">Dual-model draft</div>
                <div className="pipe-desc">Gemini Flash &amp; Groq independently draft a feature plan from your inputs.</div>
              </div>
            </div>
            <div className="pipe-item">
              <div className="pipe-num">02</div>
              <div>
                <div className="pipe-title">Cross-check &amp; diff</div>
                <div className="pipe-desc">Outputs are diffed to catch omissions, contradictions, and missing security requirements.</div>
              </div>
            </div>
            <div className="pipe-item">
              <div className="pipe-num">03</div>
              <div>
                <div className="pipe-title">Structure map</div>
                <div className="pipe-desc">The accepted plan maps into a strict file &amp; folder JSON tree.</div>
              </div>
            </div>
            <div className="pipe-item">
              <div className="pipe-num">04</div>
              <div>
                <div className="pipe-title">Schema &amp; Architecture</div>
                <div className="pipe-desc">Database tables and microservices are formulated as reviewable JSON schemas.</div>
              </div>
            </div>
            <div className="pipe-item">
              <div className="pipe-num">05</div>
              <div>
                <div className="pipe-title">Deterministic render</div>
                <div className="pipe-desc">A CAD-style blueprint renderer draws the final ERD &amp; Architecture diagrams without LLM hallucination.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
