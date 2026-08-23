"use client";

import React, { useState, useRef, useEffect } from 'react';
import { useMimarStore } from '../../store/mimarStore';
import ExamplePromptFallback from '../ExamplePromptFallback';
import FixedInputsCollection from '../FixedInputsCollection';
import StartTriggerGate from '../StartTriggerGate';

export default function InterviewScreen() {
  const {
    currentScreen,
    interviewMode,
    revisionContext,
    messages,
    operationRunning,
    activeController,
    projectId,
    ideaText,
    step0State,
    step0Status,
    fixedInputs,
    runIdeaPipeline,
    runRevisionPipeline,
    classifyIdeaStep0,
    setStep0Status,
    setStep0State,
    setFixedInputs,
    setIdeaText,
    showToast
  } = useMimarStore();

  const [inputVal, setInputVal] = useState('');
  const [retryPrompt, setRetryPrompt] = useState(null);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  const isActive = currentScreen === 'interview';

  useEffect(() => {
    if (isActive && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isActive]);

  const handleTextareaInput = (e) => {
    const val = e.target.value;
    setInputVal(val);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px';

    // Edit Invalidation (Phase 8): Editing idea text after READY invalidates READY state
    if (step0Status === 'ready') {
      setStep0Status('idle');
    }
  };

  const executeClassification = async (text) => {
    setRetryPrompt(null);
    const result = await classifyIdeaStep0(text);

    if (!result) return;

    if (result.status === 'error') {
      let errText = result.detail || "Having trouble understanding that — try again.";
      if (result.code === 'RATE_LIMIT') {
        errText = "You've hit the hourly limit for idea submissions (10 calls/hr). Please try again in a few minutes.";
      }
      
      useMimarStore.setState(state => ({
        messages: [
          ...state.messages,
          { id: 'ai-err-' + Date.now(), role: 'ai', text: errText }
        ]
      }));

      if (result.code !== 'RATE_LIMIT') {
        setRetryPrompt(text);
      }
      return;
    }

    const label = result.label;
    const subCase = result.sub_case;
    const extractedName = result.extracted_name;

    if (label === 'OFF_TOPIC') {
      const newStreak = (step0State.off_topic_streak || 0) + 1;
      setStep0State({ off_topic_streak: newStreak, last_label: 'OFF_TOPIC' });

      if (newStreak >= 3) {
        setStep0Status('off_topic_fallback');
        useMimarStore.setState(state => ({
          messages: [
            ...state.messages,
            {
              id: 'ai-offtopic-exhaust-' + Date.now(),
              role: 'ai',
              text: "We're having trouble identifying a software project idea. Please select one of the example project templates below to kick off your architecture plan:"
            }
          ]
        }));
      } else {
        useMimarStore.setState(state => ({
          messages: [
            ...state.messages,
            {
              id: 'ai-offtopic-' + Date.now(),
              role: 'ai',
              text: "I'm designed to help you plan and build software applications, websites, and technical platforms. Could you tell me about a software idea or system you'd like to design?"
            }
          ]
        }));
      }
    } else if (label === 'TOO_VAGUE') {
      const newRounds = (step0State.round_count || 0) + 1;
      setStep0State({ round_count: newRounds, off_topic_streak: 0, last_label: 'TOO_VAGUE' });

      if (newRounds >= 2) {
        setStep0Status('vague_fallback');
        useMimarStore.setState(state => ({
          messages: [
            ...state.messages,
            {
              id: 'ai-vague-exhaust-' + Date.now(),
              role: 'ai',
              text: "To help us specify your application scope, please select one of these example starter descriptions or tap one to customize:"
            }
          ]
        }));
      } else {
        let followUp = "Tell me about your idea and any key features you have in mind.";
        if (subCase === 'unexplained' && extractedName) {
          followUp = `What does ${extractedName} do? Tell me a bit about its main features, target users, or key capabilities.`;
        }
        useMimarStore.setState(state => ({
          messages: [
            ...state.messages,
            { id: 'ai-vague-' + Date.now(), role: 'ai', text: followUp }
          ]
        }));
      }
    } else if (label === 'READY') {
      setStep0State({ off_topic_streak: 0, last_label: 'READY' });
      setStep0Status('ready');
      useMimarStore.setState(state => ({
        messages: [
          ...state.messages,
          {
            id: 'ai-ready-' + Date.now(),
            role: 'ai',
            text: "Great! Your project idea looks clear and ready for architecture planning. Please configure your target fixed inputs below to proceed."
          }
        ]
      }));
    }
  };

  const handleSend = async (e) => {
    e?.preventDefault();
    if (operationRunning) {
      if (activeController) {
        activeController.abort();
      }
      return;
    }

    const text = inputVal.trim();
    if (!text) {
      showToast('Please describe your project before sending.');
      return;
    }

    if (text.length > 2000) {
      showToast('Idea description exceeds 2,000 characters limit.');
      return;
    }

    // Add user message bubble
    useMimarStore.setState(state => ({
      messages: [
        ...state.messages,
        { id: 'user-' + Date.now(), role: 'user', text }
      ]
    }));

    setIdeaText(text);
    setInputVal('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    if (interviewMode === 'revision' && revisionContext) {
      runRevisionPipeline(revisionContext.targetStage);
    } else {
      await executeClassification(text);
    }
  };

  const handleSelectExamplePrompt = (promptText) => {
    setInputVal(promptText);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.focus();
    }
  };

  const handleFixedInputChange = (field, value) => {
    setFixedInputs({ [field]: value });
  };

  const handleStartGeneration = async () => {
    // Phase 8: Explicit start trigger tap
    if (!ideaText) return;
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://mimaraibackend-euj86d7p.b4a.run';
    if (projectId) {
      fetch(`${backendUrl}/api/projects/${projectId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'generating', fixed_inputs: fixedInputs })
      }).catch(err => console.warn("Status update warning:", err));
    }
    runIdeaPipeline(ideaText);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isFixedInputsComplete = fixedInputs.stack && fixedInputs.database && fixedInputs.deployment && fixedInputs.apis;

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

              {/* Retry button for Phase 6 failure handling */}
              {retryPrompt && !operationRunning && (
                <div className="row ai" style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    onClick={() => executeClassification(retryPrompt)}
                    style={{
                      background: '#1E293B',
                      border: '1px solid #38BDF8',
                      color: '#38BDF8',
                      padding: '6px 12px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    🔄 Retry Classification
                  </button>
                </div>
              )}

              {/* Phase 5: Example Prompt Fallback Component */}
              {(step0Status === 'vague_fallback' || step0Status === 'off_topic_fallback') && (
                <ExamplePromptFallback
                  reason={step0Status === 'off_topic_fallback' ? 'off_topic' : 'vague'}
                  onSelectPrompt={handleSelectExamplePrompt}
                />
              )}

              {/* Phase 7: Fixed Inputs Collection UI (shown when READY) */}
              {(step0Status === 'ready') && (
                <FixedInputsCollection
                  fixedInputs={fixedInputs}
                  onChangeFixedInput={handleFixedInputChange}
                />
              )}

              {/* Phase 8: Explicit Start Trigger Gate */}
              {(step0Status === 'ready' && isFixedInputsComplete) && (
                <StartTriggerGate
                  onStartGeneration={handleStartGeneration}
                  isGenerating={operationRunning}
                />
              )}

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
                    className={`send-btn ${operationRunning ? 'stop' : inputVal.trim() && inputVal.length <= 2000 ? 'ready' : ''}`}
                    id="sendBtn"
                    aria-label={operationRunning ? 'Stop generating' : 'Send'}
                    disabled={inputVal.length > 2000}
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
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: 4,
                  fontSize: 10,
                  color: inputVal.length > 2000 ? '#EF4444' : '#64748B',
                  fontFamily: 'var(--font-mono, monospace)'
                }}>
                  <span>MIMAR DRAFTS WITH TWO MODELS (GEMINI + GROQ) IN PARALLEL BEFORE SHOWING YOU ANYTHING</span>
                  <span>{inputVal.length} / 2,000</span>
                </div>
              </div>
            ) : (
              <div className="composer-readonly-msg visible" id="composerReadonlyMsg">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" />
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
              <div className="pipe-num">00</div>
              <div>
                <div className="pipe-title">Step 0 Classification</div>
                <div className="pipe-desc">Groq classifier verifies idea readiness (OFF_TOPIC / TOO_VAGUE / READY).</div>
              </div>
            </div>
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
