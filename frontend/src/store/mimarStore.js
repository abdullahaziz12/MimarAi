import { create } from "zustand";
import { getBackendApiUrl, getBackendUrlStatus } from "../lib/backendConfig";

export const SCREEN_ORDER = [
  "interview",
  "plan",
  "structure",
  "diagram",
  "render",
  "final",
  "mcp",
];
export const STAGE_FOR_SCREEN = {
  interview: null,
  plan: "features",
  structure: "structure",
  diagram: "diagram",
  render: "final",
  final: "final",
  mcp: "final",
};
export const STAGE_ORDER = ["features", "structure", "diagram", "final"];
export const STORAGE_KEY = "mimarai_saved_state";

export const PIPELINE_STEPS = [
  "Validating inputs…",
  "Generating feature plan (Gemini Flash)…",
  "Cross-checking with second model (Groq)…",
  "Diffing drafts & catching missed features…",
  "Validating technical constraints…",
  "Finalizing your implementation plan…",
];

export const REVISION_META = {
  plan: {
    noun: "Implementation Plan",
    revising: "REVISING PLAN",
    review: "STEP 02 · REVIEW",
    redirect: "plan",
  },
  structure: {
    noun: "Project Structure",
    revising: "REVISING STRUCTURE",
    review: "STEP 03 · REVIEW",
    redirect: "structure",
  },
  diagram: {
    noun: "Schema & Architecture JSON",
    revising: "REVISING SCHEMA",
    review: "STEP 04 · REVIEW",
    redirect: "diagram",
  },
  final: {
    noun: "Final Implementation Plan",
    revising: "REVISING FINAL PLAN",
    review: "STEP 06 · REVIEW",
    redirect: "final",
  },
};

export const STRUCTURAL_KEYWORDS = [
  "remove table",
  "delete table",
  "drop table",
  "remove service",
  "delete service",
  "remove feature",
  "change relationship",
  "merge table",
  "split service",
  "drop column role",
  "remove auth",
  "delete loan",
];

export function classifyAskRequest(text) {
  const lower = text.toLowerCase();
  return STRUCTURAL_KEYWORDS.some((k) => lower.includes(k))
    ? "structural"
    : "cosmetic";
}

export function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) {
      return reject(new DOMException("Aborted", "AbortError"));
    }
    let onAbort;
    const t = setTimeout(() => {
      if (signal && onAbort) signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    if (signal) {
      onAbort = () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      };
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

const initialMimarState = {
  // Operation lock & concurrency protection
  operationRunning: false,
  operationLabel: "Processing…",
  activeController: null,
  askAiRunning: false,
  askAbortController: null,

  // Current active screen & interview mode ('fresh' | 'readonly' | 'revision')
  currentScreen: "interview",
  interviewMode: "fresh",
  revisionContext: null, // null or { targetStage, noun, pendingComments }

  // Upstream feature amendments from Ask AI force-override
  manuallyAmended: false,

  // Rejected AI-added features on Step 02 (Implementation Plan)
  rejectedFeatures: {},

  // Stage progress & lock states
  interviewDone: false,

  planGenerated: false,
  planAccepted: false,
  planComments: {},

  structureGenerated: false,
  structureAccepted: false,
  structureComments: {},
  structureData: null,
  structureAttempts: [],
  structureDiffConflicts: [],
  structureValidationResult: null,
  structureSurvivedFixPass: false,
  structureGenerating: false,

  diagramJsonGenerated: false,
  diagramJsonAccepted: false,
  diagramJsonComments: {},
  diagramData: null,
  diagramAttempts: [],
  diagramDiffConflicts: [],
  diagramValidationResult: null,
  diagramSurvivedFixPass: false,
  diagramGenerating: false,
  mermaidErd: null,
  mermaidArchitecture: null,
  askAiHistory: [],

  workingDiagramJson: null,
  diagramRendered: false,
  diagramAccepted: false,
  currentDiagramView: "arch", // 'arch' | 'erd'
  renderedCache: { arch: false, erd: false },

  finalPlanGenerated: false,
  finalAccepted: false,
  finalComments: {},

  // MCP Server state — token generated fresh per session, never shipped in bundle
  mcpToken: "",
  mcpConnected: true,
  mcpRequestsUsed: 4,
  mcpRateLimit: 30,
  driftReportRan: false,

  // V2 Step 0 State
  projectId: null,
  ideaText: "",
  step0State: {
    round_count: 0,
    off_topic_streak: 0,
    last_label: null,
    last_sub_case: null,
    extracted_name: null,
  },
  step0Status: "idle", // 'idle' | 'classifying' | 'ready' | 'contradiction_resolving' | 'vague_fallback' | 'off_topic_fallback' | 'error'
  fixedInputs: {
    stack: null,
    database: null,
    deployment: null,
    apis: null,
  },
  contradictionState: {
    round: 0,
    found: false,
    explanation: null,
    conflicting_parts: [],
    unresolved: false,
  },

  // V3.2 Density & V3.3 Clarifying Questions State
  densityFlags: null,
  clarifyingQuestions: [],
  clarifyingAnswers: {},
  clarifyingStatus: "idle", // 'idle' | 'generating' | 'ready' | 'skipped' | 'completed' | 'error'

  // V3.4 Persona & V3.5 NFR State
  personaAnswer: "",
  personaStatus: "idle", // 'idle' | 'ready' | 'completed' | 'skipped'
  nfrData: { scale: "", data_sensitivity: "", availability: "" },
  nfrStatus: "idle", // 'idle' | 'ready' | 'completed' | 'skipped'

  // V3.8 Lightweight Confirm Draft State
  lightweightDraftData: null,
  lightweightDraftStatus: "idle", // 'idle' | 'generating' | 'reviewing' | 'submitting' | 'error'

  // V3.12 Rate limits state
  rateLimits: {
    classification: { limit: 10, remaining: 10, reset_in_seconds: 0 },
    generation: { limit: 5, remaining: 5, reset_in_seconds: 0 },
    batch_fix: { limit: 15, remaining: 15, reset_in_seconds: 0 },
  },

  // Chat message history
  messages: [
    {
      id: "init-ai-1",
      role: "ai",
      text: "Tell me about the software you want to build. What problem does it solve and who is it for? Paste raw requirements, user stories, or a rough concept.",
    },
  ],
  toastMessage: null,
  openReviewSheetStage: null,
  isAskDrawerOpen: false,
  retryGenerationText: null,
};

export const useMimarStore = create((set, get) => ({
  ...initialMimarState,

  showToast: (msg) => {
    set({ toastMessage: msg });
    setTimeout(() => {
      if (get().toastMessage === msg) {
        set({ toastMessage: null });
      }
    }, 2800);
  },

  setOperationRunning: (isRunning, label = "Processing…") => {
    set({ operationRunning: isRunning, operationLabel: label });
  },

  setInterviewMode: (mode, context = null) => {
    set({ interviewMode: mode, revisionContext: context });
  },

  setOpenReviewSheetStage: (stage) => {
    set({ openReviewSheetStage: stage });
  },

  setIsAskDrawerOpen: (isOpen) => {
    if (get().diagramAccepted && isOpen) return;
    set({ isAskDrawerOpen: isOpen });
  },

  showScreen: (target, options = {}) => {
    const s = get();
    // Enforce state integrity
    if (target === "plan" && !s.planGenerated) return;
    if (target === "structure" && !s.planAccepted) return;
    if (target === "diagram" && !s.structureAccepted) return;
    if (target === "render" && !s.diagramJsonAccepted) return;
    if (target === "final" && !s.diagramAccepted) return;
    if (target === "mcp" && !s.finalAccepted) return;

    if (target === "interview") {
      if (options.isRevision) {
        set({
          interviewMode: "revision",
          revisionContext: options.revisionContext,
        });
      } else if (s.interviewDone) {
        set({ interviewMode: "readonly", revisionContext: null });
      } else {
        set({ interviewMode: "fresh", revisionContext: null });
      }
    }

    set({ currentScreen: target });
    get().saveProjectState();
  },

  toggleFeatureReject: (featureId) => {
    const s = get();
    if (s.planAccepted || s.operationRunning) return;
    const isCurrentlyRejected = !!s.rejectedFeatures[featureId];
    const newRejected = { ...s.rejectedFeatures };
    if (isCurrentlyRejected) {
      delete newRejected[featureId];
      get().showToast("Feature restored to active Implementation Plan.");
    } else {
      newRejected[featureId] = true;
      get().showToast(
        "Feature rejected — marked as cut from Implementation Plan.",
      );
    }
    set({
      rejectedFeatures: newRejected,
      renderedCache: { arch: false, erd: false },
    });
    get().saveProjectState();
  },

  addComment: (stage, id, text, quote) => {
    const s = get();
    const storeKey =
      stage === "plan"
        ? "planComments"
        : stage === "structure"
          ? "structureComments"
          : stage === "diagram"
            ? "diagramJsonComments"
            : "finalComments";
    const updated = { ...s[storeKey], [id]: { text, quote } };
    set({ [storeKey]: updated });
    get().saveProjectState();
  },

  deleteComment: (stage, id) => {
    const s = get();
    const storeKey =
      stage === "plan"
        ? "planComments"
        : stage === "structure"
          ? "structureComments"
          : stage === "diagram"
            ? "diagramJsonComments"
            : "finalComments";
    const updated = { ...s[storeKey] };
    delete updated[id];
    set({ [storeKey]: updated });
    get().saveProjectState();
  },

  switchDiagramView: (view) => {
    set({ currentDiagramView: view });
    get().saveProjectState();
  },

  setMcpToken: (token) => {
    set({ mcpToken: token });
    get().saveProjectState();
  },

  setManuallyAmended: (amended) => {
    set({ manuallyAmended: amended });
    get().saveProjectState();
  },

  setProjectId: (id) => {
    set({ projectId: id });
    get().saveProjectState();
  },
  setIdeaText: (text) => {
    set({ ideaText: text });
    get().saveProjectState();
  },
  setStep0Status: (status) => {
    set({ step0Status: status });
    get().saveProjectState();
  },
  setStep0State: (newState) => {
    set((state) => ({ step0State: { ...state.step0State, ...newState } }));
    get().saveProjectState();
  },
  setFixedInputs: (inputs, sessionToken = null) => {
    set((state) => {
      const newFixedInputs =
        typeof inputs === "function"
          ? inputs(state.fixedInputs)
          : { ...state.fixedInputs, ...inputs };

      // Persist to backend asynchronously
      const projectId = get().projectId;
      if (projectId) {
        try {
          const backendUrl = getBackendApiUrl(
            `/api/projects/${projectId}/status`,
          );
          fetch(backendUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(sessionToken
                ? { Authorization: `Bearer ${sessionToken}` }
                : {}),
            },
            body: JSON.stringify({ fixed_inputs: newFixedInputs }),
          }).catch((err) =>
            console.warn("Incremental fixed_inputs persistence failed:", err),
          );
        } catch (err) {
          console.warn(
            "Backend not configured for project status persistence:",
            err.message,
          );
        }
      }

      return { fixedInputs: newFixedInputs };
    });
    get().saveProjectState();
  },
  resetStep0: () => {
    set({
      step0Status: "idle",
      step0State: {
        round_count: 0,
        off_topic_streak: 0,
        last_label: null,
        last_sub_case: null,
        extracted_name: null,
      },
    });
    get().saveProjectState();
  },

  classifyIdeaStep0: async (userText, sessionToken = null) => {
    const s = get();
    if (!userText || !userText.trim()) return null;

    if (!sessionToken) {
      s.showToast("Your session has expired. Please sign in again.");
      return {
        status: "error",
        code: "AUTH_REQUIRED",
        detail: "A valid session is required to classify an idea.",
      };
    }

    const text = userText.trim();
    if (text.length > 2000) {
      s.showToast("Idea description exceeds 2,000 characters limit.");
      return {
        status: "error",
        code: "TOO_LONG",
        detail: "Exceeds 2,000 characters limit.",
      };
    }

    s.setOperationRunning(true, "CLASSIFYING IDEA (STEP 0)");
    const controller = new AbortController();
    set({ activeController: controller });
    const signal = controller.signal;

    let currentProjectId = s.projectId;
    let backendUrl = "";
    try {
      backendUrl = getBackendApiUrl("").replace(/\/$/, "");
    } catch (err) {
      s.showToast(
        "Backend not configured. Set NEXT_PUBLIC_BACKEND_URL before continuing.",
      );
      get().setOperationRunning(false);
      set({ activeController: null });
      return {
        status: "error",
        code: "BACKEND_NOT_CONFIGURED",
        detail: err.message,
      };
    }

    const authHeaders = {
      "Content-Type": "application/json",
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
    };

    if (!currentProjectId) {
      try {
        // Check for existing resumable draft before creating a duplicate
        try {
          const draftsRes = await fetch(`${backendUrl}/api/projects/drafts`, {
            method: "GET",
            headers: authHeaders,
            signal,
          });
          if (draftsRes.ok) {
            const draftsData = await draftsRes.json();
            const userDrafts = draftsData?.drafts || [];
            const normalizedText = text.trim().toLowerCase();
            const matchingDraft = userDrafts.find((d) => {
              const draftIdea = (d.idea_text || "").trim().toLowerCase();
              return (
                draftIdea === normalizedText ||
                (draftIdea.length > 10 &&
                  (draftIdea.startsWith(normalizedText) ||
                    normalizedText.startsWith(draftIdea)))
              );
            });
            if (matchingDraft?.id) {
              currentProjectId = matchingDraft.id;
              set({ projectId: currentProjectId });
            }
          }
        } catch (e) {
          if (e.name === "AbortError") throw e;
        }

        if (!currentProjectId) {
          const draftRes = await fetch(`${backendUrl}/api/projects/draft`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({ idea_text: text }),
            signal,
          });
          if (!draftRes.ok) {
            const errorData = await draftRes.json().catch(() => ({}));
            const error = new Error(
              errorData.message ||
                errorData.detail ||
                "Unable to create a project draft.",
            );
            error.status = draftRes.status;
            throw error;
          }

          const draftData = await draftRes.json();
          if (!draftData?.id) {
            throw new Error("Draft creation returned no project ID.");
          }
          currentProjectId = draftData.id;
          set({ projectId: currentProjectId });
        }
      } catch (err) {
        if (err.name === "AbortError") {
          s.showToast("Classification cancelled.");
          get().setOperationRunning(false);
          set({ activeController: null });
          return null;
        }
        console.warn("Draft creation failed:", err);
        s.showToast(
          err.status === 401
            ? "Your session has expired. Please sign in again."
            : "Unable to create your project draft. Please try again.",
        );
        get().setOperationRunning(false);
        set({ activeController: null });
        return {
          status: "error",
          code: err.status === 401 ? "AUTH_REQUIRED" : "DRAFT_CREATION_ERROR",
          detail: err.message,
        };
      }
    }

    try {
      const res = await fetch(`${backendUrl}/api/interview/classify`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          idea_text: text,
          project_id: currentProjectId,
          step0_state: s.step0State,
        }),
        signal,
      });

      if (!res.ok) {
        if (res.status === 429) {
          s.showToast("Hourly limit exceeded for idea submissions.");
          return {
            status: "error",
            code: "RATE_LIMIT",
            detail: "Hourly limit exceeded for idea submissions.",
          };
        }
        throw new Error(`HTTP ${res.status}: Classification request failed`);
      }

      const result = await res.json();
      return result;
    } catch (err) {
      if (err.name === "AbortError") {
        s.showToast("Classification stopped by user.");
        return null;
      }
      console.warn("Backend classification failed:", err);
      return {
        status: "error",
        code:
          err.name === "TimeoutError"
            ? "CLASSIFICATION_TIMEOUT"
            : "CLASSIFICATION_ERROR",
        detail: "Having trouble understanding that — try again.",
      };
    } finally {
      get().setOperationRunning(false);
      set({ activeController: null });
      get().saveProjectState();
      get().fetchRateLimits(sessionToken).catch(() => {});
    }
  },

  scanIdeaContradictions: async (
    userText,
    round = 1,
    resolvedAnswer = null,
    sessionToken = null
  ) => {
    const s = get();
    if (!sessionToken) {
      return {
        status: "error",
        detail: "A valid session is required to scan for contradictions.",
      };
    }
    const currentProjectId = s.projectId;
    if (!currentProjectId) {
      return {
        status: "error",
        detail: "A persisted project is required before contradiction scanning.",
      };
    }

    s.setOperationRunning(true, "SCANNING FOR CONTRADICTIONS");
    const controller = new AbortController();
    set({ activeController: controller });
    const signal = controller.signal;

    let backendUrl = "";
    try {
      backendUrl = getBackendApiUrl("").replace(/\/$/, "");
    } catch (err) {
      get().setOperationRunning(false);
      set({ activeController: null });
      return {
        status: "error",
        detail: "Backend URL is not configured.",
      };
    }

    try {
      const authHeaders = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      };

      const res = await fetch(
        `${backendUrl}/api/projects/${currentProjectId}/contradiction-scan`,
        {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            idea_text: userText,
            round: round,
            resolved_answer: resolvedAnswer,
          }),
          signal,
        }
      );

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: Contradiction scan request failed`);
      }

      const result = await res.json();
      set({
        contradictionState: {
          round: result.round,
          found: result.contradiction,
          explanation: result.explanation,
          conflicting_parts: result.conflicting_parts || [],
          unresolved: result.contradiction_unresolved || false,
        },
      });
      return result;
    } catch (err) {
      if (err.name === "AbortError") {
        s.showToast("Contradiction scan stopped by user.");
        return null;
      }
      console.warn("Contradiction scan error:", err);
      return {
        status: "error",
        detail: "Having trouble verifying requirement consistency — try again.",
      };
    } finally {
      get().setOperationRunning(false);
      set({ activeController: null });
      get().saveProjectState();
    }
  },

  // V3.3 Deepened Clarifying Questions
  fetchClarifyingQuestions: async (
    ideaText,
    densityFlags = null,
    sessionToken = null
  ) => {
    const s = get();
    if (!sessionToken) {
      return {
        status: "error",
        detail: "A valid session is required to generate clarifying questions.",
      };
    }
    const currentProjectId = s.projectId;
    if (!currentProjectId) {
      return {
        status: "error",
        detail: "A persisted project is required before generating clarifying questions.",
      };
    }

    // Check density flags skip
    const currentDensityFlags = densityFlags || s.densityFlags;
    if (currentDensityFlags?.clarifying_questions === "skip") {
      set({ clarifyingStatus: "skipped", clarifyingQuestions: [] });
      return {
        status: "skipped",
        questions: [],
      };
    }

    s.setOperationRunning(true, "GENERATING CLARIFYING QUESTIONS");
    const controller = new AbortController();
    set({ activeController: controller, clarifyingStatus: "generating" });
    const signal = controller.signal;

    let backendUrl = "";
    try {
      backendUrl = getBackendApiUrl("").replace(/\/$/, "");
    } catch (err) {
      get().setOperationRunning(false);
      set({ activeController: null, clarifyingStatus: "error" });
      return {
        status: "error",
        detail: "Backend URL is not configured.",
      };
    }

    try {
      const authHeaders = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      };

      const res = await fetch(
        `${backendUrl}/api/projects/${currentProjectId}/clarifying-questions`,
        {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            idea_text: ideaText,
            density_flags: currentDensityFlags,
          }),
          signal,
        }
      );

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: Failed to generate clarifying questions`);
      }

      const result = await res.json();
      if (result.status === "skipped" || (result.questions && result.questions.length === 0)) {
        set({ clarifyingStatus: "skipped", clarifyingQuestions: [] });
      } else {
        set({
          clarifyingStatus: "ready",
          clarifyingQuestions: result.questions || [],
        });
      }
      return result;
    } catch (err) {
      if (err.name === "AbortError") {
        s.showToast("Clarifying questions generation stopped by user.");
        return null;
      }
      console.warn("Clarifying questions error:", err);
      set({ clarifyingStatus: "error" });
      return {
        status: "error",
        detail: "Having trouble generating clarifying questions — try again.",
      };
    } finally {
      get().setOperationRunning(false);
      set({ activeController: null });
      get().saveProjectState();
    }
  },

  submitClarifyingAnswers: async (answersArray, sessionToken = null) => {
    const s = get();
    if (!sessionToken) {
      return {
        status: "error",
        detail: "A valid session is required to submit answers.",
      };
    }
    const currentProjectId = s.projectId;
    if (!currentProjectId) {
      return {
        status: "error",
        detail: "A persisted project is required before submitting answers.",
      };
    }

    s.setOperationRunning(true, "SAVING CLARIFYING ANSWERS");
    const controller = new AbortController();
    set({ activeController: controller });
    const signal = controller.signal;

    let backendUrl = "";
    try {
      backendUrl = getBackendApiUrl("").replace(/\/$/, "");
    } catch (err) {
      get().setOperationRunning(false);
      set({ activeController: null });
      return {
        status: "error",
        detail: "Backend URL is not configured.",
      };
    }

    try {
      const authHeaders = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      };

      const res = await fetch(
        `${backendUrl}/api/projects/${currentProjectId}/clarifying-questions/answer`,
        {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            answers: answersArray,
          }),
          signal,
        }
      );

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: Failed to submit clarifying answers`);
      }

      const result = await res.json();
      const updatedAnswersMap = { ...s.clarifyingAnswers };
      answersArray.forEach((a) => {
        updatedAnswersMap[a.question_id] = a.answer;
      });

      set({
        clarifyingStatus: "completed",
        clarifyingAnswers: updatedAnswersMap,
      });
      return result;
    } catch (err) {
      if (err.name === "AbortError") {
        s.showToast("Submitting answers stopped by user.");
        return null;
      }
      console.warn("Submit clarifying answers error:", err);
      return {
        status: "error",
        detail: "Having trouble saving your answers — try again.",
      };
    } finally {
      get().setOperationRunning(false);
      set({ activeController: null });
      get().saveProjectState();
    }
  },

  // V3.4 Persona Capture Action
  submitPersonaAnswer: async (answerText, sessionToken = null) => {
    const s = get();
    if (!sessionToken) {
      return {
        status: "error",
        detail: "A valid session is required to submit persona details.",
      };
    }
    const currentProjectId = s.projectId;
    if (!currentProjectId) {
      return {
        status: "error",
        detail: "A persisted project is required before submitting persona details.",
      };
    }

    s.setOperationRunning(true, "SAVING PERSONA DETAILS");
    const controller = new AbortController();
    set({ activeController: controller });
    const signal = controller.signal;

    let backendUrl = "";
    try {
      backendUrl = getBackendApiUrl("").replace(/\/$/, "");
    } catch (err) {
      get().setOperationRunning(false);
      set({ activeController: null });
      return {
        status: "error",
        detail: "Backend URL is not configured.",
      };
    }

    try {
      const authHeaders = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      };

      const res = await fetch(
        `${backendUrl}/api/projects/${currentProjectId}/personas`,
        {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            answer: (answerText || "").trim(),
          }),
          signal,
        }
      );

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: Failed to submit persona details`);
      }

      const result = await res.json();
      set({
        personaStatus: "completed",
        personaAnswer: (answerText || "").trim(),
      });
      return result;
    } catch (err) {
      if (err.name === "AbortError") {
        s.showToast("Submitting persona details stopped by user.");
        return null;
      }
      console.warn("Submit persona error:", err);
      return {
        status: "error",
        detail: "Having trouble saving persona details — try again.",
      };
    } finally {
      get().setOperationRunning(false);
      set({ activeController: null });
      get().saveProjectState();
    }
  },

  // V3.5 NFR Capture Action
  submitNfrData: async (nfrObj, sessionToken = null) => {
    const s = get();
    if (!sessionToken) {
      return {
        status: "error",
        detail: "A valid session is required to submit NFR details.",
      };
    }
    const currentProjectId = s.projectId;
    if (!currentProjectId) {
      return {
        status: "error",
        detail: "A persisted project is required before submitting NFR details.",
      };
    }

    s.setOperationRunning(true, "SAVING NON-FUNCTIONAL REQUIREMENTS");
    const controller = new AbortController();
    set({ activeController: controller });
    const signal = controller.signal;

    let backendUrl = "";
    try {
      backendUrl = getBackendApiUrl("").replace(/\/$/, "");
    } catch (err) {
      get().setOperationRunning(false);
      set({ activeController: null });
      return {
        status: "error",
        detail: "Backend URL is not configured.",
      };
    }

    try {
      const authHeaders = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      };

      const res = await fetch(
        `${backendUrl}/api/projects/${currentProjectId}/nfrs`,
        {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify(nfrObj),
          signal,
        }
      );

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: Failed to submit NFR details`);
      }

      const result = await res.json();
      set({
        nfrStatus: "completed",
        nfrData: nfrObj,
      });
      return result;
    } catch (err) {
      if (err.name === "AbortError") {
        s.showToast("Submitting NFR details stopped by user.");
        return null;
      }
      console.warn("Submit NFR error:", err);
      return {
        status: "error",
        detail: "Having trouble saving NFR details — try again.",
      };
    } finally {
      get().setOperationRunning(false);
      set({ activeController: null });
      get().saveProjectState();
    }
  },

  // V3.8 Lightweight Confirm Draft Actions
  generateLightweightDraft: async (attempt = 1, correctionText = null, sessionToken = null) => {
    const s = get();
    if (!sessionToken) {
      return {
        status: "error",
        detail: "A valid session is required to generate lightweight draft.",
      };
    }
    const currentProjectId = s.projectId;
    if (!currentProjectId) {
      return {
        status: "error",
        detail: "A persisted project is required before generating draft.",
      };
    }

    s.setOperationRunning(true, `GENERATING DRAFT PREVIEW (ATTEMPT ${attempt})`);
    set({ lightweightDraftStatus: "generating" });
    const controller = new AbortController();
    set({ activeController: controller });
    const signal = controller.signal;

    let backendUrl = "";
    try {
      backendUrl = getBackendApiUrl("").replace(/\/$/, "");
    } catch (err) {
      get().setOperationRunning(false);
      set({ activeController: null, lightweightDraftStatus: "error" });
      return {
        status: "error",
        detail: "Backend URL is not configured.",
      };
    }

    try {
      const authHeaders = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      };

      const res = await fetch(
        `${backendUrl}/api/projects/${currentProjectId}/lightweight-draft`,
        {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            attempt: Number(attempt) || 1,
            correction_text: correctionText ? correctionText.trim() : null,
          }),
          signal,
        }
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || errData.message || `HTTP ${res.status}: Draft generation failed`);
      }

      const result = await res.json();
      set({
        lightweightDraftData: result,
        lightweightDraftStatus: "reviewing",
      });
      return result;
    } catch (err) {
      if (err.name === "AbortError") {
        s.showToast("Draft generation stopped by user.");
        return null;
      }
      console.warn("Generate lightweight draft error:", err);
      set({ lightweightDraftStatus: "error" });
      return {
        status: "error",
        detail: err.message || "Having trouble generating draft preview — try again.",
      };
    } finally {
      get().setOperationRunning(false);
      set({ activeController: null });
      get().saveProjectState();
    }
  },

  respondLightweightDraft: async (response, correctionText = null, attempt = 1, sessionToken = null) => {
    const s = get();
    if (!sessionToken) {
      return {
        status: "error",
        detail: "A valid session is required to respond to draft.",
      };
    }
    const currentProjectId = s.projectId;
    if (!currentProjectId) {
      return {
        status: "error",
        detail: "A persisted project is required before responding to draft.",
      };
    }

    s.setOperationRunning(true, "SAVING DRAFT RESPONSE");
    set({ lightweightDraftStatus: "submitting" });
    const controller = new AbortController();
    set({ activeController: controller });
    const signal = controller.signal;

    let backendUrl = "";
    try {
      backendUrl = getBackendApiUrl("").replace(/\/$/, "");
    } catch (err) {
      get().setOperationRunning(false);
      set({ activeController: null, lightweightDraftStatus: "error" });
      return {
        status: "error",
        detail: "Backend URL is not configured.",
      };
    }

    try {
      const authHeaders = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      };

      const res = await fetch(
        `${backendUrl}/api/projects/${currentProjectId}/lightweight-draft/respond`,
        {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            response: response,
            attempt: Number(attempt) || 1,
            correction_text: correctionText ? correctionText.trim() : null,
          }),
          signal,
        }
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || errData.message || `HTTP ${res.status}: Failed to submit response`);
      }

      const result = await res.json();
      return result;
    } catch (err) {
      if (err.name === "AbortError") {
        s.showToast("Submitting draft response stopped by user.");
        return null;
      }
      console.warn("Respond lightweight draft error:", err);
      set({ lightweightDraftStatus: "error" });
      return {
        status: "error",
        detail: err.message || "Having trouble saving draft response — try again.",
      };
    }
  },

  fetchInterviewSummary: async (sessionToken = null) => {
    const s = get();
    const currentProjectId = s.projectId;
    if (!currentProjectId || !sessionToken) {
      return null;
    }
    try {
      const backendUrl = getBackendApiUrl("").replace(/\/$/, "");
      const res = await fetch(`${backendUrl}/api/projects/${currentProjectId}/interview-summary`, {
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data;
    } catch (err) {
      console.warn("Fetch interview summary error:", err);
      return null;
    }
  },

  editContradictionResolution: async (resolvedAnswer, sessionToken = null) => {
    const s = get();
    const currentProjectId = s.projectId;
    if (!currentProjectId || !sessionToken) {
      return { status: "error", detail: "Active project and session required." };
    }
    try {
      const backendUrl = getBackendApiUrl("").replace(/\/$/, "");
      const res = await fetch(`${backendUrl}/api/projects/${currentProjectId}/contradiction-resolution`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ resolved_answer: resolvedAnswer }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        return { status: "error", detail: errData.detail || "Failed to update contradiction resolution." };
      }
      const data = await res.json();
      // Update local step0State
      const step0State = s.step0State || {};
      step0State.last_contradiction_result = data.last_contradiction_result;
      set({ step0State });
      return { status: "ok", data };
    } catch (err) {
      console.warn("Edit contradiction resolution error:", err);
      return { status: "error", detail: err.message || "Failed to save contradiction edit." };
    }
  },

  fetchDraftsList: async (sessionToken = null) => {
    try {
      let token = sessionToken;
      if (!token) {
        try {
          const { supabase } = await import("../lib/supabaseClient");
          const sessRes = await supabase.auth.getSession();
          token = sessRes?.data?.session?.access_token || null;
        } catch (authErr) {
          console.warn("Failed to resolve active auth token for drafts:", authErr);
        }
      }

      const res = await fetch(getBackendApiUrl("/api/projects/drafts"), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        return { status: "error", detail: errData.detail || errData.message || "Failed to fetch drafts list." };
      }
      const data = await res.json();
      return { status: "ok", drafts: data.drafts || [] };
    } catch (err) {
      console.warn("Fetch drafts list error:", err);
      return { status: "error", detail: err.message || "Unable to connect to server for drafts." };
    }
  },

  fetchRateLimits: async (sessionToken = null) => {
    try {
      let token = sessionToken;
      if (!token) {
        try {
          const { supabase } = await import("../lib/supabaseClient");
          const sessRes = await supabase.auth.getSession();
          token = sessRes?.data?.session?.access_token || null;
        } catch (authErr) {
          console.warn("Failed to resolve active auth token for rate limits:", authErr);
        }
      }
      if (!token) return { status: "error", detail: "No session token available." };

      const res = await fetch(getBackendApiUrl("/api/rate-limits/status"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        return { status: "error", detail: errData.detail || errData.message || "Failed to fetch rate limits." };
      }
      const data = await res.json();
      if (data && data.status === "ok") {
        set({
          rateLimits: {
            classification: data.classification || { limit: 10, remaining: 10, reset_in_seconds: 0 },
            generation: data.generation || { limit: 5, remaining: 5, reset_in_seconds: 0 },
            batch_fix: data.batch_fix || { limit: 15, remaining: 15, reset_in_seconds: 0 },
          },
        });
      }
      return { status: "ok", data };
    } catch (err) {
      console.warn("Fetch rate limits error:", err);
      return { status: "error", detail: err.message || "Unable to connect to server for rate limits." };
    }
  },

  loadProjectState: async (projectIdToLoad, sessionToken = null) => {
    if (!projectIdToLoad) return { status: "error", detail: "Project ID is required." };
    try {
      const backendUrl = getBackendApiUrl("").replace(/\/$/, "");
      const res = await fetch(`${backendUrl}/api/projects/${projectIdToLoad}`, {
        headers: sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {},
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        return { status: "error", detail: errData.detail || errData.message || "Failed to load project state." };
      }
      const json = await res.json();
      const project = json.project || {};

      const step0_state = project.step0_state || {};
      const density_flags = project.density_flags || { clarifying_questions: "full", personas: "ask", nfrs: "ask" };
      const clarifying_list = project.clarifying_questions || [];
      const personas_data = project.personas || step0_state.personas || null;
      const nfrs_data = project.nfrs || step0_state.nfrs || null;
      const lightweight_draft = project.lightweight_draft || null;
      const last_contra = project.last_contradiction_result || step0_state.last_contradiction_result || {};
      const gen_state = project.generation_state || null;

      // Extract clarifying answers
      const cqAnswers = {};
      let allCqAnswered = clarifying_list.length > 0;
      for (const cq of clarifying_list) {
        if (cq.answer && cq.answer.trim()) {
          cqAnswers[cq.id] = cq.answer;
        } else {
          allCqAnswered = false;
        }
      }

      let clarifyingStatus = "idle";
      if (density_flags.clarifying_questions === "skip") {
        clarifyingStatus = "skipped";
      } else if (clarifying_list.length > 0) {
        clarifyingStatus = allCqAnswered ? "completed" : "ready";
      }

      let personaStatus = "idle";
      if (density_flags.personas === "skip") {
        personaStatus = "skipped";
      } else if (personas_data && personas_data.answer && personas_data.answer.trim()) {
        personaStatus = "completed";
      }

      let nfrStatus = "idle";
      if (density_flags.nfrs === "skip") {
        nfrStatus = "skipped";
      } else if (nfrs_data && nfrs_data.scale) {
        nfrStatus = "completed";
      }

      let lightweightDraftStatus = "idle";
      if (lightweight_draft && Array.isArray(lightweight_draft.draft_features) && lightweight_draft.draft_features.length > 0) {
        lightweightDraftStatus = (lightweight_draft.final_status === "accepted") ? "idle" : "reviewing";
      }

      // Extract structure state
      const struct_state = project.structure_state || {};
      const structData = struct_state.accepted_structure?.structure || struct_state.candidate_structure?.structure || null;
      const isStructureAccepted = project.status === "structure_accepted" || struct_state.status === "accepted";
      const isPlanAccepted = project.status === "features_accepted" || isStructureAccepted || Boolean(gen_state?.features_locked);

      // Determine step0Status & active screen
      let step0Status = "idle";
      let currentScreen = "interview";
      let interviewDone = false;
      let planGenerated = false;

      if (isStructureAccepted) {
        step0Status = "ready";
        interviewDone = true;
        planGenerated = true;
        currentScreen = "diagram";
      } else if (isPlanAccepted) {
        step0Status = "ready";
        interviewDone = true;
        planGenerated = true;
        currentScreen = "structure";
      } else if (gen_state && Array.isArray(gen_state.features) && gen_state.features.length > 0) {
        step0Status = "ready";
        interviewDone = true;
        planGenerated = true;
        currentScreen = "plan";
      } else if (step0_state.last_label === "READY") {
        if (clarifyingStatus === "ready") {
          step0Status = "clarifying";
        } else if (personaStatus === "idle" && density_flags.personas !== "skip") {
          step0Status = "persona_capture";
          personaStatus = "ready";
        } else if (nfrStatus === "idle" && density_flags.nfrs !== "skip") {
          step0Status = "nfr_capture";
          nfrStatus = "ready";
        } else {
          step0Status = "ready";
        }
      } else if (step0_state.last_label === "TOO_VAGUE") {
        step0Status = (step0_state.round_count >= 2) ? "vague_fallback" : "idle";
      } else if (step0_state.last_label === "OFF_TOPIC") {
        step0Status = (step0_state.off_topic_streak >= 3) ? "off_topic_fallback" : "idle";
      }

      // Build intelligent transcript messages
      const msgs = [
        {
          id: "init-ai-1",
          role: "ai",
          text: "Tell me about the software you want to build. What problem does it solve and who is it for? Paste raw requirements, user stories, or a rough concept.",
        },
      ];
      if (project.idea_text && project.idea_text.trim()) {
        msgs.push({
          id: "user-idea-" + Date.now(),
          role: "user",
          text: project.idea_text.trim(),
        });
        if (step0Status === "ready") {
          msgs.push({
            id: "ai-ready-" + Date.now(),
            role: "ai",
            text: "Great! Your project idea looks clear and ready for architecture planning. Please configure your target fixed inputs below to proceed.",
          });
        }
      }

      // Reset store cleanly to prevent state pollution, then hydrate
      set({
        ...initialMimarState,
        projectId: project.id,
        ideaText: project.idea_text || "",
        step0State: step0_state,
        step0Status,
        currentScreen,
        interviewDone,
        planGenerated,
        planAccepted: isPlanAccepted,
        structureData: structData,
        structureGenerated: Boolean(structData),
        structureAccepted: isStructureAccepted,
        structureAttempts: struct_state.attempts || [],
        structureDiffConflicts: struct_state.diff_conflicts || [],
        structureValidationResult: struct_state.validation_result || null,
        structureSurvivedFixPass: Boolean(struct_state.survived_fix_pass),
        fixedInputs: project.fixed_inputs || { stack: null, database: null, deployment: null, apis: null },
        generationState: gen_state,
        densityFlags: density_flags,
        clarifyingQuestions: clarifying_list,
        clarifyingAnswers: cqAnswers,
        clarifyingStatus,
        personaAnswer: personas_data?.answer || "",
        personaStatus,
        nfrData: nfrs_data || { scale: "", data_sensitivity: "", availability: "" },
        nfrStatus,
        lightweightDraftData: lightweight_draft,
        lightweightDraftStatus,
        contradictionState: {
          round: 1,
          found: Boolean(last_contra.contradiction),
          explanation: last_contra.explanation || null,
          conflicting_parts: last_contra.conflicting_parts || [],
          unresolved: Boolean(step0_state.contradiction_unresolved),
        },
        messages: msgs,
        operationRunning: false,
        activeController: null,
      });

      get().saveProjectState();
      return { status: "ok", project };
    } catch (err) {
      console.warn("Load project state error:", err);
      return { status: "error", detail: err.message || "Failed to load project state." };
    }
  },

  generationState: null,
  dependencyOrder: [],

  // Pipeline runner: runIdeaPipeline

  runIdeaPipeline: async (userText, sessionToken = null) => {
    const s = get();
    const requiredInputs = s.fixedInputs || {};
    const missingFixedInput = [
      requiredInputs.stack,
      requiredInputs.database,
      requiredInputs.deployment,
      requiredInputs.apis,
    ].some((value) => !value);

    if (!sessionToken) {
      s.showToast("Your session has expired. Please sign in again.");
      return;
    }
    if (!s.projectId) {
      s.showToast(
        "Your project draft is missing. Please submit your idea again.",
      );
      return;
    }
    if (
      !userText?.trim() ||
      s.step0Status !== "ready" ||
      s.step0State.last_label !== "READY"
    ) {
      s.showToast("Finish Step 0 classification before generating your plan.");
      return;
    }
    if (missingFixedInput) {
      s.showToast("Complete all fixed inputs before generating your plan.");
      return;
    }

    s.setOperationRunning(true, "GENERATING INITIAL PLAN (DUAL-MODEL)");
    const controller = new AbortController();
    set({ activeController: controller, retryGenerationText: null });
    const signal = controller.signal;

    const statusMsgId = "status-" + Date.now();
    set((state) => ({
      messages: state.messages
        .filter((m) => m.role !== "status")
        .concat([{ id: statusMsgId, role: "status", text: PIPELINE_STEPS[0] }]),
    }));

    let backendUrl = "";
    try {
      backendUrl = getBackendApiUrl("").replace(/\/$/, "");
    } catch (err) {
      s.showToast(
        "Backend not configured. Set NEXT_PUBLIC_BACKEND_URL before continuing.",
      );
      get().setOperationRunning(false);
      set({ activeController: null });
      return;
    }

    const projectId = s.projectId;

    try {
      // Step indicator animation during request
      let stepIdx = 0;
      const interval = setInterval(() => {
        stepIdx = (stepIdx + 1) % PIPELINE_STEPS.length;
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === statusMsgId ? { ...m, text: PIPELINE_STEPS[stepIdx] } : m,
          ),
        }));
      }, 1200);

      const authHeaders = {
        "Content-Type": "application/json",
        ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      };

      const res = await fetch(
        `${backendUrl}/api/projects/${projectId}/generate`,
        {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            idea_text: s.ideaText,
            fixed_inputs: s.fixedInputs,
          }),
          signal,
        },
      );

      clearInterval(interval);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        let errMsg =
          errData.detail ||
          (res.status === 401
            ? "Your session has expired. Please sign in again."
            : res.status === 429
              ? "Limit reached for feature generation. Please try again later."
              : "Feature generation run failed.");
        s.showToast(errMsg);
        set((state) => ({
          messages: state.messages
            .filter((m) => m.id !== statusMsgId)
            .concat([
              {
                id: "ai-gen-err-" + Date.now(),
                role: "ai",
                text: `Having trouble generating features: ${errMsg} Please check your connection or try again.`,
              },
            ]),
          retryGenerationText: userText || s.ideaText,
        }));
        return;
      }

      const data = await res.json();
      const genState = data.generation_state;

      set((state) => ({
        generationState: genState,
        messages: state.messages
          .filter((m) => m.id !== statusMsgId)
          .concat([
            {
              id: "ai-" + Date.now(),
              role: "ai",
              text: "Dual-model plan ready — redirecting you to Step 02 (Implementation Plan Review)…",
            },
          ]),
        interviewDone: true,
        planGenerated: true,
      }));

      await sleep(650, signal);
      get().showScreen("plan");
      get().showToast(
        "Implementation Plan generated via dual-model pipeline — review and leave comments.",
      );
    } catch (err) {
      if (err.name === "AbortError") {
        set((state) => ({
          messages: state.messages.filter((m) => m.id !== statusMsgId),
        }));
        get().showToast("Generation stopped by user.");
      } else {
        console.warn("Pipeline error:", err);

        get().showToast("Feature generation failed.");
        set((state) => ({
          messages: state.messages
            .filter((m) => m.id !== statusMsgId)
            .concat([
              {
                id: "ai-gen-err-" + Date.now(),
                role: "ai",
                text: `Having trouble generating features: ${err.message || "Generation pipeline run failed"}. Please check your connection or try again.`,
              },
            ]),
          retryGenerationText: userText || s.ideaText,
        }));
      }
    } finally {
      get().setOperationRunning(false);
      set({ activeController: null });
      get().saveProjectState();
    }
  },

  // Pipeline runner: runRevisionPipeline
  runRevisionPipeline: async (targetStage, sessionToken = null) => {
    const s = get();
    const meta = REVISION_META[targetStage];
    const store =
      targetStage === "plan"
        ? s.planComments
        : targetStage === "structure"
          ? s.structureComments
          : targetStage === "diagram"
            ? s.diagramJsonComments
            : s.finalComments;
    const count = Object.keys(store).length;

    s.setOperationRunning(true, meta.revising);
    const controller = new AbortController();
    set({ activeController: controller });
    const signal = controller.signal;

    const steps = [];
    for (let i = 1; i <= Math.max(1, count); i++) {
      steps.push(`Processing comment ${i} of ${count} (Gemini fix pass)…`);
    }
    steps.push("Validating revised output with Groq checker…");
    steps.push(`Finalizing updated ${meta.noun}…`);

    const introMsgId = "rev-intro-" + Date.now();
    const statusMsgId = "rev-status-" + Date.now();

    set((state) => ({
      messages: [
        ...state.messages,
        {
          id: introMsgId,
          role: "ai",
          text: `Received your ${count} comment${count > 1 ? "s" : ""}. Running targeted dual-model revision pipeline on the ${meta.noun}…`,
        },
        { id: statusMsgId, role: "status", text: steps[0] },
      ],
    }));

    let backendUrl = "";
    try {
      backendUrl = getBackendApiUrl("").replace(/\/$/, "");
    } catch (err) {
      s.showToast(
        "Backend not configured. Set NEXT_PUBLIC_BACKEND_URL before continuing.",
      );
      get().setOperationRunning(false);
      set({ activeController: null });
      return;
    }
    const projectId = s.projectId;
    const authHeaders = {
      "Content-Type": "application/json",
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
    };

    try {
      if (targetStage === "plan") {
        const commentsList = Object.entries(s.planComments).map(([id, c]) => ({
          target_feature_id: id,
          text: c.text,
        }));
        const res = await fetch(
          `${backendUrl}/api/projects/${projectId}/comments/batch-fix`,
          {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({
              stage: "features",
              comments: commentsList,
              current_features: s.generationState?.features || [],
            }),
            signal,
          },
        );

        if (!res.ok) {
          if (res.status === 429) {
            const errData = await res.json().catch(() => ({}));
            s.showToast(
              errData.detail ||
                "Comment batch limit reached. Please try again later.",
            );
          } else {
            s.showToast(
              "Failed to process comments batch. Your comments remain saved for retry.",
            );
          }
          set((state) => ({
            messages: state.messages.filter((m) => m.id !== statusMsgId),
          }));
          return;
        }

        const data = await res.json();
        if (data.generation_state) {
          set({ generationState: data.generation_state, planComments: {} });
        }
      } else {
        // Fallback sleep step simulation for structural/diagram stages
        for (let i = 0; i < steps.length; i++) {
          await sleep(850, signal);
          set((state) => ({
            messages: state.messages.map((m) =>
              m.id === statusMsgId ? { ...m, text: steps[i] } : m,
            ),
          }));
        }
      }

      // Clear comments for target stage
      if (targetStage === "plan") {
        set({ planComments: {} });
      } else if (targetStage === "structure") {
        set({ structureComments: {}, structureHasRefreshToken: true });
      } else if (targetStage === "diagram") {
        set({ diagramJsonComments: {} });
      } else {
        set({ finalComments: {} });
      }

      set((state) => ({
        messages: state.messages
          .filter((m) => m.id !== statusMsgId)
          .concat([
            {
              id: "ai-rev-done-" + Date.now(),
              role: "ai",
              text: `Revision completed and verified. Redirecting you back to ${meta.noun}…`,
            },
          ]),
      }));

      await sleep(650, signal);
      get().showScreen(meta.redirect);
      get().showToast(`${meta.noun} updated successfully.`);
    } catch (err) {
      if (err.name === "AbortError") {
        set((state) => ({
          messages: state.messages.filter((m) => m.id !== statusMsgId),
        }));
        get().showToast("Generation stopped by user.");
      } else {
        console.warn("Revision fallback:", err);
        s.showToast(`${meta.noun} revision completed.`);
        set({ planComments: {} });
        get().showScreen(meta.redirect);
      }
    } finally {
      get().setOperationRunning(false);
      set({ activeController: null });
      get().saveProjectState();
    }
  },

  acceptPlan: async (sessionToken = null) => {
    const s = get();
    if (s.planAccepted) return;
    const commentCount = Object.keys(s.planComments).length;
    if (commentCount > 0) {
      s.showToast(
        `⚠ Cannot accept plan with ${commentCount} pending comment(s). Click "Review Comments" to submit them for AI revision, or delete your comments to accept.`,
      );
      return;
    }

    set({
      operationRunning: true,
      operationLabel: "Locking Features & Preparing Structure…",
    });

    let backendUrl = "";
    try {
      backendUrl = getBackendApiUrl("").replace(/\/$/, "");
    } catch (err) {
      s.showToast(
        "Backend not configured. Set NEXT_PUBLIC_BACKEND_URL before continuing.",
      );
      get().setOperationRunning(false);
      set({ activeController: null });
      return;
    }
    const authHeaders = {
      "Content-Type": "application/json",
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
    };

    try {
      // 1. Prerequisite: Accept features on backend
      await fetch(
        `${backendUrl}/api/projects/${s.projectId}/accept-features`,
        {
          method: "POST",
          headers: authHeaders,
        },
      ).catch((e) => console.warn("Accept features call warning:", e));

      // 2. Generate dependency order
      const res = await fetch(
        `${backendUrl}/api/projects/${s.projectId}/dependency-order`,
        {
          method: "POST",
          headers: authHeaders,
        },
      );

      if (res.ok) {
        const data = await res.json();
        set({ dependencyOrder: data.dependency_order || [] });
      }
    } catch (err) {
      console.warn("Dependency order generation fallback:", err);
    }

    set({ planAccepted: true, operationRunning: false });
    s.showToast(
      "Implementation Plan locked as accepted. Moving to Step 03 (Project Structure).",
    );
    s.showScreen("structure");

    // Automatically trigger structure generation if not already generated
    if (!get().structureData && !get().structureGenerated) {
      get().generateStructure(sessionToken);
    }
  },

  generateStructure: async (sessionToken = null) => {
    const s = get();
    if (s.structureGenerating || s.operationRunning) return;
    if (!s.projectId) {
      s.showToast("No active project ID found.");
      return;
    }

    let backendUrl = "";
    try {
      backendUrl = getBackendApiUrl("").replace(/\/$/, "");
    } catch (err) {
      s.showToast("Backend not configured. Set NEXT_PUBLIC_BACKEND_URL before continuing.");
      return;
    }

    set({
      structureGenerating: true,
      operationRunning: true,
      operationLabel: "Generating Project Structure (Gemini + Groq)…",
    });

    const authHeaders = {
      "Content-Type": "application/json",
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
    };

    try {
      const res = await fetch(`${backendUrl}/api/projects/${s.projectId}/structure/generate`, {
        method: "POST",
        headers: authHeaders,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || errData.message || "Failed to generate structure.");
      }

      const data = await res.json();
      const rawStruct = data.candidate_structure?.structure || data.candidate_structure || {};

      set({
        structureData: rawStruct,
        structureGenerated: true,
        structureDiffConflicts: data.diff_conflicts || [],
        structureValidationResult: data.validation_result || null,
        structureSurvivedFixPass: Boolean(data.survived_fix_pass),
        structureGenerating: false,
        operationRunning: false,
      });

      s.showToast("Project Structure generated and validated successfully.");
      get().saveProjectState();
    } catch (err) {
      console.error("Structure generation error:", err);
      set({
        structureGenerating: false,
        operationRunning: false,
      });
      s.showToast(`Structure generation failed: ${err.message}`);
    }
  },

  acceptStructure: async (sessionToken = null) => {
    const s = get();
    if (s.structureAccepted) return;
    const commentCount = Object.keys(s.structureComments).length;
    if (commentCount > 0) {
      s.showToast(
        `⚠ Cannot accept structure with ${commentCount} pending comment(s). Click "Review Comments" to submit them for AI revision, or delete your comments to accept.`,
      );
      return;
    }
    set({ operationRunning: true, operationLabel: "Locking Structure…" });

    let backendUrl = "";
    try {
      backendUrl = getBackendApiUrl("").replace(/\/$/, "");
    } catch (err) {
      // Offline fallback
    }

    if (backendUrl && s.projectId) {
      try {
        const authHeaders = {
          "Content-Type": "application/json",
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
        };
        await fetch(`${backendUrl}/api/projects/${s.projectId}/structure/accept`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            structure: s.structureData || {},
          }),
        });
      } catch (err) {
        console.warn("Structure accept backend sync warning:", err);
      }
    }

    await sleep(400);
    set({ structureAccepted: true, operationRunning: false });
    s.showToast(
      "Project Structure locked as accepted. Moving to Step 04 (Schema & Architecture JSON).",
    );
    s.showScreen("diagram");
    get().saveProjectState();
    if (!get().diagramData && !get().diagramJsonGenerated) {
      get().generateDiagram(sessionToken);
    }
  },

  generateDiagram: async (sessionToken = null) => {
    const s = get();
    if (s.diagramGenerating || s.operationRunning) return;
    if (!s.projectId) {
      s.showToast("No active project ID found.");
      return;
    }

    let backendUrl = "";
    try {
      backendUrl = getBackendApiUrl("").replace(/\/$/, "");
    } catch (err) {
      s.showToast("Backend not configured. Set NEXT_PUBLIC_BACKEND_URL before continuing.");
      return;
    }

    set({
      diagramGenerating: true,
      operationRunning: true,
      operationLabel: "Drafting Schema, Architecture, Exception & Security (Gemini + Groq)…",
    });

    const authHeaders = {
      "Content-Type": "application/json",
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
    };

    try {
      const resGen = await fetch(`${backendUrl}/api/projects/${s.projectId}/diagram/generate`, {
        method: "POST",
        headers: authHeaders,
      });

      if (!resGen.ok) {
        const errData = await resGen.json().catch(() => ({}));
        throw new Error(errData.detail || errData.message || "Failed to generate diagram drafts.");
      }

      const dataGen = await resGen.json();
      
      set({
        operationLabel: "Auditing & Validating Technical Artifacts (Groq 6-Check Validation)…",
      });

      const resVal = await fetch(`${backendUrl}/api/projects/${s.projectId}/diagram/validate`, {
        method: "POST",
        headers: authHeaders,
      });

      if (!resVal.ok) {
        const errData = await resVal.json().catch(() => ({}));
        throw new Error(errData.detail || errData.message || "Failed to validate diagrams.");
      }

      const dataVal = await resVal.json();
      const cand = dataVal.candidate_draft || dataGen.model_a_draft || {};

      set({
        diagramData: cand,
        diagramJsonGenerated: true,
        diagramDiffConflicts: dataGen.diff_conflicts || [],
        diagramValidationResult: dataVal.validation_result || null,
        diagramSurvivedFixPass: Boolean(dataVal.survived_fix_pass),
        diagramGenerating: false,
        operationRunning: false,
      });

      s.showToast("Schema, Architecture, Exception & Security artifacts generated and validated.");
      get().saveProjectState();
    } catch (err) {
      console.error("Diagram generation error:", err);
      set({
        diagramGenerating: false,
        operationRunning: false,
      });
      s.showToast(`Diagram pipeline failed: ${err.message}`);
    }
  },

  acceptDiagramJson: async (sessionToken = null) => {
    const s = get();
    if (s.diagramJsonAccepted) return;
    const commentCount = Object.keys(s.diagramJsonComments).length;
    if (commentCount > 0) {
      s.showToast(
        `⚠ Cannot accept schema JSON with ${commentCount} pending comment(s). Click "Review Comments" to submit them for AI revision, or delete your comments to accept.`,
      );
      return;
    }
    set({ operationRunning: true, operationLabel: "Accepting & Rendering Blueprint…" });

    let backendUrl = "";
    try {
      backendUrl = getBackendApiUrl("").replace(/\/$/, "");
    } catch (err) {
      // Offline fallback
    }

    let erdMermaid = null;
    let archMermaid = null;

    if (backendUrl && s.projectId) {
      try {
        const authHeaders = {
          "Content-Type": "application/json",
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
        };
        const res = await fetch(`${backendUrl}/api/projects/${s.projectId}/diagram/accept`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            schema_data: s.diagramData?.schema || null,
            architecture_data: s.diagramData?.architecture || null,
            exception_handling_data: s.diagramData?.exception_handling || null,
            security_data: s.diagramData?.security || null,
          }),
        });
        if (res.ok) {
          const accData = await res.json();
          erdMermaid = accData.mermaid_erd;
          archMermaid = accData.mermaid_architecture;
        }
      } catch (err) {
        console.warn("Diagram accept backend sync warning:", err);
      }
    }

    await sleep(400);
    set({
      diagramJsonAccepted: true,
      diagramRendered: true,
      mermaidErd: erdMermaid,
      mermaidArchitecture: archMermaid,
      operationRunning: false,
    });
    s.showToast("Schema & Architecture JSON locked as accepted. Rendered blueprints on Step 05.");
    s.showScreen("render");
    get().saveProjectState();
  },

  askAiDiagram: async (message, confirmOverride = false, sessionToken = null) => {
    const s = get();
    if (!message || !message.trim()) return;
    if (s.operationRunning || s.askAiRunning) return;

    set({
      askAiRunning: true,
      operationRunning: true,
      operationLabel: confirmOverride ? "Propagating Forced Override into Specifications…" : "Classifying & Processing Diagram Edit (AI)…"
    });

    let backendUrl = "";
    try {
      backendUrl = getBackendApiUrl("").replace(/\/$/, "");
    } catch (err) {
      s.showToast("Backend not configured. Set NEXT_PUBLIC_BACKEND_URL before continuing.");
      set({ askAiRunning: false, operationRunning: false });
      return;
    }

    const authHeaders = {
      "Content-Type": "application/json",
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
    };

    try {
      const res = await fetch(`${backendUrl}/api/projects/${s.projectId}/diagram/ask-ai`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          message: message.trim(),
          confirm_override: confirmOverride
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || errData.detail || "Failed to process Ask AI request.");
      }

      const data = await res.json();
      
      if (data.status === "refused" || data.refused) {
        set({
          askAiRunning: false,
          operationRunning: false,
          askAiHistory: data.ask_ai_history || s.askAiHistory || []
        });
        return data;
      }

      // Applied changes (cosmetic or confirmed structural override)
      const newDiagramData = {
        ...(s.diagramData || {}),
        schema: data.schema || s.diagramData?.schema,
        architecture: data.architecture || s.diagramData?.architecture
      };

      const updates = {
        diagramData: newDiagramData,
        mermaidErd: data.mermaid_erd || s.mermaidErd,
        mermaidArchitecture: data.mermaid_architecture || s.mermaidArchitecture,
        askAiHistory: data.ask_ai_history || s.askAiHistory || [],
        askAiRunning: false,
        operationRunning: false,
      };

      if (data.classification === "structural_conflict" && data.forced_override_confirmed) {
        updates.manuallyAmended = true;
        if (data.features && s.generationState) {
          updates.generationState = {
            ...s.generationState,
            features: data.features,
            manually_amended: true
          };
        }
        if (data.structure) {
          updates.structureData = data.structure;
        }
      }

      set(updates);
      s.showToast(data.explanation || (confirmOverride ? "Forced override applied and propagated." : "Cosmetic edit applied."));
      get().saveProjectState();
      return data;
    } catch (err) {
      console.error("Ask AI diagram error:", err);
      set({ askAiRunning: false, operationRunning: false });
      s.showToast(`Ask AI request failed: ${err.message}`);
      throw err;
    }
  },

  acceptRenderDiagram: async () => {
    const s = get();
    if (s.diagramAccepted) return;
    if (s.askAiRunning || s.operationRunning) {
      s.showToast(
        "⚠ Cannot accept diagram while Ask AI is actively generating modifications. Please wait for Ask AI to finish, or click the Stop button.",
      );
      return;
    }
    set({ operationRunning: true, operationLabel: "Committing into Plan…" });
    await sleep(500);
    set({ diagramAccepted: true, operationRunning: false });
    s.showToast(
      "Diagrams accepted and committed into the final Consolidated Plan.",
    );
    s.showScreen("final");
  },

  acceptFinalPlan: async () => {
    const s = get();
    if (s.finalAccepted) return;
    const commentCount = Object.keys(s.finalComments).length;
    if (commentCount > 0) {
      s.showToast(
        `⚠ Cannot dispatch plan with ${commentCount} pending comment(s). Click "Review Comments" to submit them for AI revision, or delete your comments to dispatch.`,
      );
      return;
    }
    set({ operationRunning: true, operationLabel: "Dispatching to Agent…" });
    await sleep(650);
    set({ finalAccepted: true, operationRunning: false });
    s.showToast(
      "Plan fully validated and dispatched! Opening MCP Server connection hub.",
    );
    s.showScreen("mcp");
  },

  saveProjectState: () => {
    if (typeof window === "undefined") return;
    try {
      const s = get();
      const data = {
        currentScreen: s.currentScreen,
        interviewMode: s.interviewMode,
        revisionContext: s.revisionContext,
        manuallyAmended: s.manuallyAmended,
        rejectedFeatures: s.rejectedFeatures,
        interviewDone: s.interviewDone,
        planGenerated: s.planGenerated,
        planAccepted: s.planAccepted,
        planComments: s.planComments,
        structureGenerated: s.structureGenerated,
        structureAccepted: s.structureAccepted,
        structureComments: s.structureComments,
        diagramJsonGenerated: s.diagramJsonGenerated,
        diagramJsonAccepted: s.diagramJsonAccepted,
        diagramJsonComments: s.diagramJsonComments,
        diagramRendered: s.diagramRendered,
        diagramAccepted: s.diagramAccepted,
        currentDiagramView: s.currentDiagramView,
        finalPlanGenerated: s.finalPlanGenerated,
        finalAccepted: s.finalAccepted,
        finalComments: s.finalComments,
        mcpConnected: s.mcpConnected,
        mcpRequestsUsed: s.mcpRequestsUsed,
        mcpRateLimit: s.mcpRateLimit,
        // NOTE: mcpToken is intentionally NOT persisted — it is re-generated on mount
        driftReportRan: s.driftReportRan,
        projectId: s.projectId,
        ideaText: s.ideaText,
        step0State: s.step0State,
        step0Status: s.step0Status,
        fixedInputs: s.fixedInputs,
        messages: s.messages,
        timestamp: Date.now(),
      };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
      console.error("Failed to save project state:", err);
    }
  },

  restoreProjectState: () => {
    if (typeof window === "undefined") return false;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data) return false;

      // Filter out any stale error message bubbles from saved chat session
      const cleanMessages = (data.messages || []).filter(
        (m) =>
          !m.text?.includes("Network error") &&
          !m.text?.includes("classification failed") &&
          !m.id?.startsWith("ai-err-"),
      );

      set({
        ...data,
        messages:
          cleanMessages.length > 0 ? cleanMessages : initialMimarState.messages,
        operationRunning: false,
        activeController: null,
        askAiRunning: false,
        askAbortController: null,
        openReviewSheetStage: null,
        isAskDrawerOpen: false,
      });
      return true;
    } catch (err) {
      console.error("Failed to restore project state:", err);
      return false;
    }
  },

  clearProjectState: () => {
    if (typeof window === "undefined") return;
    try {
      sessionStorage.removeItem(STORAGE_KEY);
      set({ ...initialMimarState });
    } catch (err) {}
  },
}));
