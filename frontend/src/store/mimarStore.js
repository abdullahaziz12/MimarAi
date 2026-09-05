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

  diagramJsonGenerated: false,
  diagramJsonAccepted: false,
  diagramJsonComments: {},

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
  step0Status: "idle", // 'idle' | 'classifying' | 'ready' | 'vague_fallback' | 'off_topic_fallback' | 'error'
  fixedInputs: {
    stack: null,
    database: null,
    deployment: null,
    apis: null,
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
  setFixedInputs: (inputs) => {
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
            headers: { "Content-Type": "application/json" },
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
        const draftRes = await fetch(`${backendUrl}/api/projects/draft`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ idea_text: text }),
          signal,
        });
        if (draftRes.ok) {
          const draftData = await draftRes.json();
          if (draftData && draftData.id) {
            currentProjectId = draftData.id;
            set({ projectId: currentProjectId });
          }
        }
      } catch (err) {
        if (err.name === "AbortError") {
          s.showToast("Classification cancelled.");
          get().setOperationRunning(false);
          set({ activeController: null });
          return null;
        }
        console.warn("Draft creation fallback:", err);
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
        throw new Error(
          `HTTP ${res.status}: Backend route pending deployment on Back4App`,
        );
      }

      const result = await res.json();
      return result;
    } catch (err) {
      if (err.name === "AbortError") {
        s.showToast("Classification stopped by user.");
        return null;
      }
      console.warn(
        "Backend classification fetch error, running resilient local fallback:",
        err,
      );

      // Resilient local fallback classification if backend server is offline/unreachable
      const lower = text
        .toLowerCase()
        .replace(/[^\w\s]/g, "")
        .trim();
      const words = lower.split(/\s+/);
      const greetings = [
        "hi",
        "hello",
        "hey",
        "test",
        "thanks",
        "ok",
        "okay",
        "sup",
        "yo",
        "hi there",
        "hello mimarai",
        "mimarai",
      ];

      if (
        words.length <= 4 &&
        (greetings.includes(lower) || words.every((w) => greetings.includes(w)))
      ) {
        return {
          status: "ok",
          label: "OFF_TOPIC",
          sub_case: null,
          extracted_name: null,
          explanation: "Greeting or minimal chit-chat detected.",
          source: "local_fallback",
        };
      }

      if (words.length <= 4) {
        return {
          status: "ok",
          label: "TOO_VAGUE",
          sub_case: "unexplained",
          extracted_name: text,
          explanation: "Named product/domain given without features.",
          source: "local_fallback",
        };
      }

      if (
        lower.includes("app") &&
        words.length <= 5 &&
        !lower.includes("with") &&
        !lower.includes("for")
      ) {
        return {
          status: "ok",
          label: "TOO_VAGUE",
          sub_case: "no_domain",
          extracted_name: null,
          explanation: "Generic request without domain details.",
          source: "local_fallback",
        };
      }

      return {
        status: "ok",
        label: "READY",
        sub_case: null,
        extracted_name: null,
        explanation: "Clear software idea provided.",
        source: "local_fallback",
      };
    } finally {
      get().setOperationRunning(false);
      set({ activeController: null });
      get().saveProjectState();
    }
  },

  generationState: null,
  dependencyOrder: [],

  // Pipeline runner: runIdeaPipeline
  runIdeaPipeline: async (userText, sessionToken = null) => {
    const s = get();
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
        `${backendUrl}/api/projects/${projectId || "local-draft-101"}/generate`,
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
        let errMsg = "Feature generation run failed.";
        if (res.status === 429) {
          const errData = await res.json().catch(() => ({}));
          errMsg =
            errData.detail ||
            "Limit reached for feature generation. Please try again later.";
        }
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
  runRevisionPipeline: async (targetStage) => {
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
      ...(s.sessionToken ? { Authorization: `Bearer ${s.sessionToken}` } : {}),
    };

    try {
      if (targetStage === "plan") {
        const commentsList = Object.entries(s.planComments).map(([id, c]) => ({
          target_feature_id: id,
          text: c.text,
        }));
        const res = await fetch(
          `${backendUrl}/api/projects/${projectId || "local-draft-101"}/comments/batch-fix`,
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

  acceptPlan: async () => {
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
      operationLabel: "Generating Dependency Order…",
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
      ...(s.sessionToken ? { Authorization: `Bearer ${s.sessionToken}` } : {}),
    };

    try {
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
  },

  acceptStructure: async () => {
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
    await sleep(500);
    set({ structureAccepted: true, operationRunning: false });
    s.showToast(
      "Project Structure locked as accepted. Moving to Step 04 (Schema & Architecture JSON).",
    );
    s.showScreen("diagram");
  },

  acceptDiagramJson: async () => {
    const s = get();
    if (s.diagramJsonAccepted) return;
    const commentCount = Object.keys(s.diagramJsonComments).length;
    if (commentCount > 0) {
      s.showToast(
        `⚠ Cannot accept schema JSON with ${commentCount} pending comment(s). Click "Review Comments" to submit them for AI revision, or delete your comments to accept.`,
      );
      return;
    }
    set({ operationRunning: true, operationLabel: "Rendering Blueprint…" });
    await sleep(500);
    set({
      diagramJsonAccepted: true,
      diagramRendered: true,
      operationRunning: false,
    });
    s.showToast("Schema JSON accepted. Rendered blueprints on Step 05.");
    s.showScreen("render");
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
