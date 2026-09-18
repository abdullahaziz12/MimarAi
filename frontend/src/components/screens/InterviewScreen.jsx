"use client";

import React, { useState, useRef, useEffect } from "react";
import { useMimarStore } from "../../store/mimarStore";
import { useAuth } from "../../context/AuthContext";
import { getBackendApiUrl, getBackendUrlStatus } from "../../lib/backendConfig";
import ExamplePromptFallback from "../ExamplePromptFallback";
import FixedInputsCollection from "../FixedInputsCollection";
import StartTriggerGate from "../StartTriggerGate";
import ClarifyingQuestionsStage from "../ClarifyingQuestionsStage";
import PersonaCaptureStage from "../PersonaCaptureStage";
import NFRCaptureStage from "../NFRCaptureStage";
import LightweightDraftConfirmStage from "../LightweightDraftConfirmStage";
import InterviewAnswersReviewModal from "../InterviewAnswersReviewModal";

export default function InterviewScreen() {
  const { session } = useAuth();
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
    contradictionState,
    fixedInputs,
    densityFlags,
    clarifyingQuestions,
    clarifyingStatus,
    fetchClarifyingQuestions,
    submitClarifyingAnswers,
    personaStatus,
    nfrStatus,
    submitPersonaAnswer,
    submitNfrData,
    lightweightDraftData,
    lightweightDraftStatus,
    generateLightweightDraft,
    respondLightweightDraft,
    runIdeaPipeline,
    runRevisionPipeline,
    classifyIdeaStep0,
    scanIdeaContradictions,
    setStep0Status,
    setStep0State,
    setFixedInputs,
    setIdeaText,
    showToast,
    retryGenerationText,
  } = useMimarStore();

  const [inputVal, setInputVal] = useState("");
  const [retryPrompt, setRetryPrompt] = useState(null);
  const [retryContradiction, setRetryContradiction] = useState(null);
  const [isSubmittingClarifications, setIsSubmittingClarifications] = useState(false);
  const [isSubmittingPersona, setIsSubmittingPersona] = useState(false);
  const [isSubmittingNfr, setIsSubmittingNfr] = useState(false);
  const [draftAttempt, setDraftAttempt] = useState(1);
  const [draftError, setDraftError] = useState(null);
  const [isRespondingDraft, setIsRespondingDraft] = useState(false);
  const [isEditingReadyIdea, setIsEditingReadyIdea] = useState(false);
  const [readyIdeaInput, setReadyIdeaInput] = useState("");
  const [isSubmittingReadyIdea, setIsSubmittingReadyIdea] = useState(false);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const messagesEndRef = useRef(null);

  const textareaRef = useRef(null);

  const isActive = currentScreen === "interview";

  const isUserNearBottomRef = useRef(true);

  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    isUserNearBottomRef.current = scrollHeight - scrollTop - clientHeight < 120;
  };

  useEffect(() => {
    if (isActive && messagesEndRef.current && isUserNearBottomRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isActive]);

  // Keep only the single latest status message in chat display
  const displayMessages = messages.filter((m, idx, arr) => {
    if (m.role !== "status") return true;
    const lastStatusIdx = arr.map((item) => item.role).lastIndexOf("status");
    return idx === lastStatusIdx;
  });

  const handleTextareaInput = (e) => {
    const val = e.target.value;
    setInputVal(val);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px";

    // Editing after a completed or exhausted attempt starts a clean Step 0 attempt.
    if (
      step0Status === "ready" ||
      step0Status === "vague_fallback" ||
      step0Status === "off_topic_fallback"
    ) {
      setStep0Status("idle");
      setStep0State({
        round_count: 0,
        off_topic_streak: 0,
        last_label: null,
        last_sub_case: null,
        extracted_name: null,
      });
    }
  };

  const runContradictionScan = async (baseIdea, round = 1, resolvedAnswer = null) => {
    setRetryPrompt(null);
    setRetryContradiction(null);
    const scanResult = await scanIdeaContradictions(
      baseIdea,
      round,
      resolvedAnswer,
      session?.access_token || null
    );

    if (!scanResult) return;

    if (scanResult.status === "error") {
      const errText =
        scanResult.detail ||
        "Having trouble verifying requirement consistency — try again.";
      useMimarStore.setState((state) => ({
        messages: [
          ...state.messages,
          { id: "ai-contra-err-" + Date.now(), role: "ai", text: errText },
        ],
      }));
      setRetryContradiction({ baseIdea, round, resolvedAnswer });
      return;
    }

    if (scanResult.contradiction) {
      if (round < 2) {
        setStep0Status("contradiction_resolving");
        const promptMsg =
          scanResult.explanation ||
          "We noticed potential conflicting requirements in your description.";
        useMimarStore.setState((state) => ({
          messages: [
            ...state.messages,
            {
              id: "ai-contra-" + Date.now(),
              role: "ai",
              text: `⚠️ Requirement Conflict Detected:\n${promptMsg}\n\nPlease clarify how you would like these requirements to work together.`,
            },
          ],
        }));
      } else {
        // Round 2 cap reached -> proceed with density check outcome
        await proceedAfterContradiction(baseIdea, scanResult.density_flags);
      }
    } else {
      // Clean
      await proceedAfterContradiction(baseIdea, scanResult.density_flags);
    }
  };

  // Helper: after all interview stages resolve, advance to fixed inputs
  const advanceToReady = () => {
    setStep0Status("ready");
    useMimarStore.setState((state) => ({
      messages: [
        ...state.messages,
        {
          id: "ai-ready-" + Date.now(),
          role: "ai",
          text: "Great! Your project idea looks clear and ready for architecture planning. Please configure your target fixed inputs below to proceed.",
        },
      ],
    }));
  };

  // Helper: advance to NFR stage (or skip to ready)
  const advanceToNfrStage = (density) => {
    if ((density || {}).nfrs === "skip") {
      useMimarStore.setState({ nfrStatus: "skipped" });
      advanceToReady();
    } else {
      setStep0Status("nfr_capture");
      useMimarStore.setState({ nfrStatus: "ready" });
      useMimarStore.setState((state) => ({
        messages: [
          ...state.messages,
          {
            id: "ai-nfr-intro-" + Date.now(),
            role: "ai",
            text: "Next, select your system constraints — expected scale, data sensitivity, and availability requirement:",
          },
        ],
      }));
    }
  };

  // Helper: advance to Persona stage (or skip to NFR)
  const advanceToPersonaStage = (density) => {
    if ((density || {}).personas === "skip") {
      useMimarStore.setState({ personaStatus: "skipped" });
      advanceToNfrStage(density);
    } else {
      setStep0Status("persona_capture");
      useMimarStore.setState({ personaStatus: "ready" });
      useMimarStore.setState((state) => ({
        messages: [
          ...state.messages,
          {
            id: "ai-persona-intro-" + Date.now(),
            role: "ai",
            text: "To tailor features to real user needs, please describe who will use this system:",
          },
        ],
      }));
    }
  };

  const proceedAfterContradiction = async (baseIdea, densityFlagsData) => {
    const density = densityFlagsData || {};
    const cqFlag = density.clarifying_questions || "full";

    if (cqFlag !== "skip") {
      setStep0Status("clarifying");
      const cqRes = await fetchClarifyingQuestions(
        baseIdea,
        density,
        session?.access_token || null
      );
      if (cqRes?.status === "ok" && cqRes.questions && cqRes.questions.length > 0) {
        useMimarStore.setState((state) => ({
          messages: [
            ...state.messages,
            {
              id: "ai-cq-intro-" + Date.now(),
              role: "ai",
              text: `To fine-tune your architecture plan, please clarify the ${cqRes.questions.length} ${cqRes.questions.length === 1 ? "question" : "questions"} below:`,
            },
          ],
        }));
        return;
      }
    }

    // CQ skipped or completed without questions — advance to Persona stage
    advanceToPersonaStage(density);
  };

  const handleClarifyingSubmit = async (answersArray) => {
    setIsSubmittingClarifications(true);
    try {
      const res = await submitClarifyingAnswers(
        answersArray,
        session?.access_token || null
      );
      if (res?.status === "ok") {
        showToast("Clarifying details saved!");
        // Advance to Persona stage instead of jumping to ready
        const density = densityFlags || {};
        advanceToPersonaStage(density);
      } else {
        showToast(res?.detail || "Failed to save answers — please retry.");
      }
    } finally {
      setIsSubmittingClarifications(false);
    }
  };

  // V3.4: Persona Capture submit handler
  const handlePersonaSubmit = async (answerText) => {
    setIsSubmittingPersona(true);
    try {
      const res = await submitPersonaAnswer(
        answerText,
        session?.access_token || null
      );
      if (res?.status === "ok") {
        showToast("Persona details saved!");
        const density = densityFlags || {};
        advanceToNfrStage(density);
      } else {
        showToast(res?.detail || "Failed to save persona details — please retry.");
      }
    } finally {
      setIsSubmittingPersona(false);
    }
  };

  // V3.5: NFR Capture submit handler
  const handleNfrSubmit = async (nfrObj) => {
    setIsSubmittingNfr(true);
    try {
      const res = await submitNfrData(
        nfrObj,
        session?.access_token || null
      );
      if (res?.status === "ok") {
        showToast("Non-functional requirements saved!");
        advanceToReady();
      } else {
        showToast(res?.detail || "Failed to save NFR details — please retry.");
      }
    } finally {
      setIsSubmittingNfr(false);
    }
  };

  const executeClassification = async (text) => {
    setRetryPrompt(null);
    setRetryContradiction(null);
    const result = await classifyIdeaStep0(text, session?.access_token || null);

    if (!result) return;

    if (result.status === "error") {
      let errText =
        result.detail || "Having trouble understanding that — try again.";
      if (result.code === "RATE_LIMIT") {
        errText =
          "You've hit the hourly limit for idea submissions (10 calls/hr). Please try again in a few minutes.";
      }

      useMimarStore.setState((state) => ({
        messages: [
          ...state.messages,
          { id: "ai-err-" + Date.now(), role: "ai", text: errText },
        ],
      }));

      if (result.code !== "RATE_LIMIT") {
        setRetryPrompt(text);
      }
      return;
    }

    const label = result.label;
    const subCase = result.sub_case;
    const extractedName = result.extracted_name;

    if (label === "OFF_TOPIC") {
      const newStreak = (step0State.off_topic_streak || 0) + 1;
      setStep0State({
        round_count: 0,
        off_topic_streak: newStreak,
        last_label: "OFF_TOPIC",
      });

      if (newStreak >= 3) {
        setStep0Status("off_topic_fallback");
        useMimarStore.setState((state) => ({
          messages: [
            ...state.messages,
            {
              id: "ai-offtopic-exhaust-" + Date.now(),
              role: "ai",
              text: "We're having trouble identifying a software project idea. Please select one of the example project templates below to kick off your architecture plan:",
            },
          ],
        }));
      } else {
        useMimarStore.setState((state) => ({
          messages: [
            ...state.messages,
            {
              id: "ai-offtopic-" + Date.now(),
              role: "ai",
              text: "I'm designed to help you plan and build software applications, websites, and technical platforms. Could you tell me about a software idea or system you'd like to design?",
            },
          ],
        }));
      }
    } else if (label === "TOO_VAGUE") {
      const newRounds = (step0State.round_count || 0) + 1;
      setStep0State({
        round_count: newRounds,
        off_topic_streak: 0,
        last_label: "TOO_VAGUE",
      });

      if (newRounds >= 2) {
        setStep0Status("vague_fallback");
        useMimarStore.setState((state) => ({
          messages: [
            ...state.messages,
            {
              id: "ai-vague-exhaust-" + Date.now(),
              role: "ai",
              text: "To help us specify your application scope, please select one of these example starter descriptions or tap one to customize:",
            },
          ],
        }));
      } else {
        let followUp =
          "Tell me about your idea and any key features you have in mind.";
        if (subCase === "unexplained" && extractedName) {
          followUp = `What does ${extractedName} do? Tell me a bit about its main features, target users, or key capabilities.`;
        }
        useMimarStore.setState((state) => ({
          messages: [
            ...state.messages,
            { id: "ai-vague-" + Date.now(), role: "ai", text: followUp },
          ],
        }));
      }
    } else if (label === "READY") {
      setStep0State({
        round_count: 0,
        off_topic_streak: 0,
        last_label: "READY",
        last_sub_case: null,
        extracted_name: null,
      });
      // V3.1 Contradiction Scan Stage (Round 1)
      await runContradictionScan(text, 1, null);
    }
  };

  const shouldShowComposer =
    interviewMode !== "readonly" &&
    ["idle", "vague_fallback", "off_topic_fallback", "contradiction_resolving"].includes(step0Status);

  const handleSend = async (e) => {
    e?.preventDefault();
    if (!shouldShowComposer) return;
    if (operationRunning) {
      if (activeController) {
        activeController.abort();
      }
      return;
    }

    const text = inputVal.trim();
    if (!text) {
      showToast("Please describe your project before sending.");
      return;
    }

    if (text.length > 2000) {
      showToast("Idea description exceeds 2,000 characters limit.");
      return;
    }

    // Add user message bubble
    useMimarStore.setState((state) => ({
      messages: [
        ...state.messages,
        { id: "user-" + Date.now(), role: "user", text },
      ],
    }));

    if (step0Status !== "contradiction_resolving") {
      setIdeaText(text);
    }
    setInputVal("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    if (interviewMode === "revision" && revisionContext) {
      runRevisionPipeline(
        revisionContext.targetStage,
        session?.access_token || null,
      );
    } else if (step0Status === "contradiction_resolving") {
      // User is submitting resolution for round 2 scan
      await runContradictionScan(ideaText || text, 2, text);
    } else {
      await executeClassification(text);
    }
  };

  const handleSelectExamplePrompt = (promptText) => {
    setInputVal(promptText);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.focus();
    }
  };

  const handleFixedInputChange = (field, value) => {
    setFixedInputs({ [field]: value }, session?.access_token || null);
  };

  const handleStartGeneration = async () => {
    // V3.8: Trigger Lightweight Confirm Draft instead of direct jump to full generation
    if (!ideaText) return;
    setDraftError(null);
    setDraftAttempt(1);
    const res = await generateLightweightDraft(1, null, session?.access_token || null);
    if (res?.status === "error") {
      setDraftError(res.detail || "Draft preview generation failed. Please try again.");
    }
  };

  const handleDraftConfirm = async (att) => {
    setIsRespondingDraft(true);
    setDraftError(null);
    try {
      const res = await respondLightweightDraft("confirmed", null, att, session?.access_token || null);
      if (res?.status === "error") {
        setDraftError(res.detail || "Failed to confirm draft.");
        return;
      }

      // Proceed to full generation
      const backendStatus = getBackendUrlStatus();
      if (projectId && backendStatus.configured) {
        try {
          await fetch(getBackendApiUrl(`/api/projects/${projectId}/status`), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
            },
            body: JSON.stringify({
              status: "generating",
              fixed_inputs: fixedInputs,
            }),
          });
        } catch (err) {
          console.warn("Status update warning:", err);
        }
      }
      runIdeaPipeline(ideaText, session?.access_token || null);
    } finally {
      setIsRespondingDraft(false);
    }
  };

  const handleDraftReject = async (correctionText, att) => {
    setIsRespondingDraft(true);
    setDraftError(null);
    try {
      const res = await respondLightweightDraft("rejected", correctionText, att, session?.access_token || null);
      if (res?.status === "error") {
        setDraftError(res.detail || "Failed to submit correction.");
        return;
      }

      if (res?.status === "retry") {
        // Attempt 1 rejected -> fetch Attempt 2 with correction text folded in
        setDraftAttempt(2);
        const draftRes = await generateLightweightDraft(2, correctionText, session?.access_token || null);
        if (draftRes?.status === "error") {
          setDraftError(draftRes.detail || "Failed to generate attempt 2 draft.");
        }
      } else if (res?.status === "proceeded_after_cap" || res?.proceed_to_generation) {
        // Cap reached (Attempt 2 rejected) -> proceed to full generation
        showToast("Maximum draft revisions reached. Proceeding to full dual-model generation with extra validation.");
        const backendStatus = getBackendUrlStatus();
        if (projectId && backendStatus.configured) {
          try {
            await fetch(getBackendApiUrl(`/api/projects/${projectId}/status`), {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
              },
              body: JSON.stringify({
                status: "generating",
                fixed_inputs: fixedInputs,
              }),
            });
          } catch (err) {
            console.warn("Status update warning:", err);
          }
        }
        runIdeaPipeline(ideaText, session?.access_token || null);
      }
    } finally {
      setIsRespondingDraft(false);
    }
  };

  const handleDraftRetry = async () => {
    setDraftError(null);
    const res = await generateLightweightDraft(draftAttempt, null, session?.access_token || null);
    if (res?.status === "error") {
      setDraftError(res.detail || "Draft generation failed.");
    }
  };

  const handleKeyDown = (e) => {
    if (!shouldShowComposer) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleStartEditReadyIdea = () => {
    setReadyIdeaInput(ideaText || "");
    setIsEditingReadyIdea(true);
  };

  const handleCancelEditReadyIdea = () => {
    setIsEditingReadyIdea(false);
    setReadyIdeaInput("");
  };

  const handleSaveReadyIdea = async () => {
    const trimmed = readyIdeaInput.trim();
    if (!trimmed) {
      showToast("Project idea cannot be empty.");
      return;
    }
    if (trimmed.length > 2000) {
      showToast("Idea description exceeds 2,000 characters limit.");
      return;
    }

    setIsSubmittingReadyIdea(true);
    setIdeaText(trimmed);
    setIsEditingReadyIdea(false);

    // Invalidate pending lightweight draft / start gate per Locked Plan Section 1.5.4
    useMimarStore.setState((state) => ({
      lightweightDraftStatus: "idle",
      lightweightDraftData: null,
      messages: [
        ...state.messages,
        { id: "user-edit-idea-" + Date.now(), role: "user", text: trimmed },
        { id: "ai-edit-idea-status-" + Date.now(), role: "status", text: "Idea updated. Re-confirming project scope..." }
      ]
    }));

    await executeClassification(trimmed);
    setIsSubmittingReadyIdea(false);
  };

  const isFixedInputsComplete =
    fixedInputs.stack &&
    fixedInputs.database &&
    fixedInputs.deployment &&
    fixedInputs.apis;

  return (
    <div className={`screen ${isActive ? "active" : ""}`} id="screen-interview">
      <div className="interview-screen-inner">
        {/* REVISION CONTEXT BANNER */}
        {interviewMode === "revision" && revisionContext && (
          <div
            className="context-banner revision-banner"
            id="revisionBanner"
            style={{ display: "flex" }}
          >
            <span className="cb-icon">⚡</span>
            <div className="cb-main">
              <div className="cb-label">REVISION WORKSPACE ACTIVE</div>
              <div className="cb-desc">
                Revising{" "}
                <b id="revBannerStage">{revisionContext.noun.toUpperCase()}</b>{" "}
                based on{" "}
                <b id="revBannerCount">
                  {Object.keys(revisionContext.pendingComments || {}).length}
                </b>{" "}
                pending comment(s). Locked upstream stages remain immutable.
              </div>
            </div>
            <div className="cb-locked">
              <span className="cb-lock-chip">✓ SPEC LOCKED</span>
            </div>
          </div>
        )}

        {/* READ-ONLY BANNER */}
        {interviewMode === "readonly" && (
          <div
            className="context-banner readonly-banner"
            id="readonlyBanner"
            style={{ display: "flex" }}
          >
            <span className="cb-icon">🔒</span>
            <div className="cb-main">
              <div className="cb-label">INTERVIEW ARCHIVE (READ-ONLY)</div>
              <div className="cb-desc">
                This project has progressed to downstream review stages. To
                request modifications, use the comment system on the respective
                review screen.
              </div>
            </div>
          </div>
        )}

        <div className="interview-shell">
          {/* CHAT COLUMN */}
          <div className="chat-engine">
            <div className="chat-eng-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div className="chat-eng-label">
                <div
                  className={`hud-dot-live ${interviewMode === "readonly" ? "idle" : ""}`}
                  id="hudDotLive"
                ></div>
                MIMAR ARCHITECT LINTER ENGINE
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {projectId && interviewMode !== "readonly" && (
                  <button
                    type="button"
                    id="reviewAnswersHeaderBtn"
                    onClick={() => setIsReviewModalOpen(true)}
                    style={{
                      background: "rgba(56, 189, 248, 0.1)",
                      border: "1px solid rgba(56, 189, 248, 0.3)",
                      color: "#38BDF8",
                      borderRadius: "4px",
                      padding: "3px 8px",
                      fontSize: "11px",
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      transition: "all 0.15s ease",
                    }}
                    title="Review and edit your interview answers"
                  >
                    <span>📋</span> Review Answers
                  </button>
                )}
                <span className="chat-session-tag" id="chatSessionTag">
                  {interviewMode === "revision"
                    ? "SESSION: REVISION ACTIVE"
                    : interviewMode === "readonly"
                      ? "SESSION: LOCKED / READ-ONLY"
                      : "SESSION: ACTIVE"}
                </span>
              </div>
            </div>

            <div className="messages" id="messages" onScroll={handleScroll}>
              {displayMessages.map((m) => {
                if (m.role === "status") {
                  return (
                    <div key={m.id} className="row ai">
                      <div className="status-row">
                        <div className="status-dot"></div>
                        <div className="status-text">{m.text}</div>
                      </div>
                    </div>
                  );
                }
                if (m.role === "user") {
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
                      background: "#1E293B",
                      border: "1px solid #38BDF8",
                      color: "#38BDF8",
                      padding: "6px 12px",
                      borderRadius: "4px",
                      fontSize: "12px",
                      cursor: "pointer",
                    }}
                  >
                    🔄 Retry Classification
                  </button>
                </div>
              )}

              {/* Retry button for V3.1 Contradiction Scan failure handling */}
              {retryContradiction && !operationRunning && (
                <div className="row ai" style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    onClick={() =>
                      runContradictionScan(
                        retryContradiction.baseIdea,
                        retryContradiction.round,
                        retryContradiction.resolvedAnswer,
                      )
                    }
                    style={{
                      background: "#1E293B",
                      border: "1px solid #F59E0B",
                      color: "#F59E0B",
                      padding: "6px 12px",
                      borderRadius: "4px",
                      fontSize: "12px",
                      cursor: "pointer",
                    }}
                  >
                    🔄 Retry Contradiction Scan
                  </button>
                </div>
              )}

              {/* Retry button for Phase 8 generation failure handling */}
              {retryGenerationText && !operationRunning && (
                <div className="row ai" style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    onClick={() =>
                      runIdeaPipeline(
                        retryGenerationText,
                        session?.access_token || null,
                      )
                    }
                    style={{
                      background: "#1E293B",
                      border: "1px solid #EF4444",
                      color: "#EF4444",
                      padding: "6px 12px",
                      borderRadius: "4px",
                      fontSize: "12px",
                      cursor: "pointer",
                    }}
                  >
                    🔄 Retry Generation
                  </button>
                </div>
              )}

              {/* Phase 5: Example Prompt Fallback Component */}
              {(step0Status === "vague_fallback" ||
                step0Status === "off_topic_fallback") && (
                <ExamplePromptFallback
                  reason={
                    step0Status === "off_topic_fallback" ? "off_topic" : "vague"
                  }
                  onSelectPrompt={handleSelectExamplePrompt}
                />
              )}

              {/* V3.3: Clarifying Questions Stage */}
              {(step0Status === "clarifying" ||
                (clarifyingQuestions &&
                  clarifyingQuestions.length > 0 &&
                  !["ready", "persona_capture", "nfr_capture"].includes(step0Status))) && (
                <ClarifyingQuestionsStage
                  questions={clarifyingQuestions}
                  onSubmit={handleClarifyingSubmit}
                  isSubmitting={isSubmittingClarifications || operationRunning}
                  isCompleted={["ready", "persona_capture", "nfr_capture"].includes(step0Status)}
                />
              )}

              {/* V3.4: Persona Capture Stage */}
              {step0Status === "persona_capture" && personaStatus === "ready" && (
                <PersonaCaptureStage
                  onSubmit={handlePersonaSubmit}
                  isSubmitting={isSubmittingPersona || operationRunning}
                  isCompleted={personaStatus === "completed"}
                />
              )}

              {/* V3.5: NFR Capture Stage */}
              {step0Status === "nfr_capture" && nfrStatus === "ready" && (
                <NFRCaptureStage
                  onSubmit={handleNfrSubmit}
                  isSubmitting={isSubmittingNfr || operationRunning}
                  isCompleted={nfrStatus === "completed"}
                />
              )}

              {/* Ready State Idea Edit Affordance (Locked Plan 1.5.4) */}
              {step0Status === "ready" && (
                <div
                  style={{
                    background: "rgba(15, 23, 42, 0.6)",
                    border: "1px solid #334155",
                    borderRadius: "8px",
                    padding: "12px 16px",
                    marginTop: "16px",
                    marginBottom: "12px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                        <span style={{ fontSize: "11px", fontWeight: 700, color: "#38BDF8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          Project Idea
                        </span>
                        <span style={{ fontSize: "10px", color: "#10B981", background: "rgba(16, 185, 129, 0.1)", padding: "1px 6px", borderRadius: "3px", border: "1px solid rgba(16, 185, 129, 0.3)" }}>
                          READY
                        </span>
                      </div>
                      {!isEditingReadyIdea && (
                        <p style={{ margin: 0, fontSize: "13px", color: "#E2E8F0", lineHeight: "1.5" }}>
                          {ideaText || "No project description provided."}
                        </p>
                      )}
                    </div>
                    {!isEditingReadyIdea && interviewMode !== "readonly" && (
                      <button
                        type="button"
                        id="editReadyIdeaBtn"
                        onClick={handleStartEditReadyIdea}
                        disabled={operationRunning || isSubmittingReadyIdea}
                        style={{
                          background: "rgba(56, 189, 248, 0.1)",
                          border: "1px solid rgba(56, 189, 248, 0.3)",
                          color: "#38BDF8",
                          borderRadius: "4px",
                          padding: "4px 10px",
                          fontSize: "12px",
                          fontWeight: 600,
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        ✏️ Edit idea
                      </button>
                    )}
                  </div>

                  {isEditingReadyIdea && (
                    <div style={{ marginTop: "10px" }}>
                      <textarea
                        id="readyIdeaTextarea"
                        value={readyIdeaInput}
                        onChange={(e) => setReadyIdeaInput(e.target.value)}
                        disabled={isSubmittingReadyIdea || operationRunning}
                        rows={3}
                        style={{
                          width: "100%",
                          background: "#0B1120",
                          border: "1px solid #38BDF8",
                          borderRadius: "6px",
                          padding: "8px 10px",
                          color: "#F8FAFC",
                          fontSize: "13px",
                          fontFamily: "inherit",
                          resize: "vertical",
                          outline: "none",
                          boxSizing: "border-box",
                        }}
                        placeholder="Update your project idea..."
                      />
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px" }}>
                        <span style={{ fontSize: "11px", color: readyIdeaInput.length > 2000 ? "#EF4444" : "#94A3B8" }}>
                          {readyIdeaInput.length} / 2,000
                        </span>
                        <div style={{ display: "flex", gap: "8px" }}>
                          <button
                            type="button"
                            id="cancelEditReadyIdeaBtn"
                            onClick={handleCancelEditReadyIdea}
                            disabled={isSubmittingReadyIdea}
                            style={{
                              background: "transparent",
                              border: "1px solid #475569",
                              color: "#94A3B8",
                              borderRadius: "4px",
                              padding: "4px 10px",
                              fontSize: "12px",
                              cursor: "pointer",
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            id="saveReadyIdeaBtn"
                            onClick={handleSaveReadyIdea}
                            disabled={isSubmittingReadyIdea || operationRunning || !readyIdeaInput.trim() || readyIdeaInput.length > 2000}
                            style={{
                              background: "#0284C7",
                              border: "none",
                              color: "#FFFFFF",
                              borderRadius: "4px",
                              padding: "4px 12px",
                              fontSize: "12px",
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            {isSubmittingReadyIdea ? "Re-confirming..." : "Save & Re-confirm"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* V3.11: Review & Edit Interview Answers Card */}
              {step0Status === "ready" && (
                <div
                  style={{
                    background: "rgba(30, 41, 59, 0.6)",
                    border: "1px solid #334155",
                    borderRadius: "8px",
                    padding: "12px 16px",
                    marginTop: "16px",
                    marginBottom: "8px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "12px",
                  }}
                >
                  <div>
                    <div style={{ color: "#F8FAFC", fontSize: "13px", fontWeight: 600 }}>
                      Interview Answers Recorded
                    </div>
                    <div style={{ color: "#94A3B8", fontSize: "12px" }}>
                      You can review or update clarification answers, persona, or NFRs before proceeding.
                    </div>
                  </div>
                  <button
                    type="button"
                    id="reviewAnswersStageBtn"
                    onClick={() => setIsReviewModalOpen(true)}
                    style={{
                      background: "#0EA5E9",
                      color: "#FFFFFF",
                      border: "none",
                      borderRadius: "6px",
                      padding: "6px 14px",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    📋 Review &amp; Edit
                  </button>
                </div>
              )}

              {/* Phase 7: Fixed Inputs Collection UI (shown when READY) */}
              {step0Status === "ready" && (
                <FixedInputsCollection
                  fixedInputs={fixedInputs}
                  onChangeFixedInput={handleFixedInputChange}
                />
              )}

              {/* Phase 8: Explicit Start Trigger Gate */}
              {step0Status === "ready" && isFixedInputsComplete && lightweightDraftStatus === "idle" && (
                <StartTriggerGate
                  onStartGeneration={handleStartGeneration}
                  isGenerating={operationRunning}
                />
              )}

              {/* V3.8: Lightweight Confirm Draft Stage */}
              {step0Status === "ready" && isFixedInputsComplete && lightweightDraftStatus !== "idle" && (
                <LightweightDraftConfirmStage
                  draftFeatures={lightweightDraftData?.draft_features || []}
                  attempt={draftAttempt}
                  isLoading={lightweightDraftStatus === "generating"}
                  isResponding={isRespondingDraft || lightweightDraftStatus === "submitting"}
                  errorMessage={draftError}
                  onConfirm={handleDraftConfirm}
                  onReject={handleDraftReject}
                  onRetry={handleDraftRetry}
                />
              )}


              <div ref={messagesEndRef} />
            </div>

            {/* CHAT COMPOSER */}
            {interviewMode === "readonly" ? (
              <div
                className="composer-readonly-msg visible"
                id="composerReadonlyMsg"
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>
                  Interview input locked to protect project state integrity.
                  Navigate using the sidebar shortcuts to review or comment.
                </span>
              </div>
            ) : shouldShowComposer ? (
              <div className="inputbar" id="interviewInputBar">
                <div
                  className={`input-shell ${operationRunning ? "locked" : ""}`}
                  id="inputShell"
                >
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
                    className={`send-btn ${operationRunning ? "stop" : inputVal.trim() && inputVal.length <= 2000 ? "ready" : ""}`}
                    id="sendBtn"
                    aria-label={operationRunning ? "Stop generating" : "Send"}
                    disabled={inputVal.length > 2000}
                    onClick={handleSend}
                  >
                    {operationRunning ? (
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <rect
                          x="6"
                          y="6"
                          width="12"
                          height="12"
                          rx="2"
                          fill="currentColor"
                        />
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
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginTop: 4,
                    fontSize: 10,
                    color: inputVal.length > 2000 ? "#EF4444" : "#64748B",
                    fontFamily: "var(--font-mono, monospace)",
                  }}
                >
                  <span>
                    MIMAR DRAFTS WITH TWO MODELS (GEMINI + GROQ) IN PARALLEL
                    BEFORE SHOWING YOU ANYTHING
                  </span>
                  <span>{inputVal.length} / 2,000</span>
                </div>
              </div>
            ) : null}
          </div>

          {/* RIGHT SIDE PIPELINE PANEL */}
          <div className="side-panel">
            <div className="panel-label">Validation Pipeline</div>
            <div className="pipe-item">
              <div className="pipe-num">00</div>
              <div>
                <div className="pipe-title">Step 0 Classification</div>
                <div className="pipe-desc">
                  Groq classifier verifies idea readiness (OFF_TOPIC / TOO_VAGUE
                  / READY).
                </div>
              </div>
            </div>
            <div className="pipe-item">
              <div className="pipe-num">01</div>
              <div>
                <div className="pipe-title">Dual-model draft</div>
                <div className="pipe-desc">
                  Gemini Flash &amp; Groq independently draft a feature plan
                  from your inputs.
                </div>
              </div>
            </div>
            <div className="pipe-item">
              <div className="pipe-num">02</div>
              <div>
                <div className="pipe-title">Cross-check &amp; diff</div>
                <div className="pipe-desc">
                  Outputs are diffed to catch omissions, contradictions, and
                  missing security requirements.
                </div>
              </div>
            </div>
            <div className="pipe-item">
              <div className="pipe-num">03</div>
              <div>
                <div className="pipe-title">Structure map</div>
                <div className="pipe-desc">
                  The accepted plan maps into a strict file &amp; folder JSON
                  tree.
                </div>
              </div>
            </div>
            <div className="pipe-item">
              <div className="pipe-num">04</div>
              <div>
                <div className="pipe-title">Schema &amp; Architecture</div>
                <div className="pipe-desc">
                  Database tables and microservices are formulated as reviewable
                  JSON schemas.
                </div>
              </div>
            </div>
            <div className="pipe-item">
              <div className="pipe-num">05</div>
              <div>
                <div className="pipe-title">Deterministic render</div>
                <div className="pipe-desc">
                  A CAD-style blueprint renderer draws the final ERD &amp;
                  Architecture diagrams without LLM hallucination.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <InterviewAnswersReviewModal
        isOpen={isReviewModalOpen}
        onClose={() => setIsReviewModalOpen(false)}
      />
    </div>
  );
}
