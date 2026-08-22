import { create } from 'zustand';

export const SCREEN_ORDER = ['interview', 'plan', 'structure', 'diagram', 'render', 'final', 'mcp'];
export const STAGE_FOR_SCREEN = {
  interview: null,
  plan: 'features',
  structure: 'structure',
  diagram: 'diagram',
  render: 'final',
  final: 'final',
  mcp: 'final'
};
export const STAGE_ORDER = ['features', 'structure', 'diagram', 'final'];
export const STORAGE_KEY = 'mimarai_saved_state';

export const PIPELINE_STEPS = [
  "Validating inputs…",
  "Generating feature plan (Gemini Flash)…",
  "Cross-checking with second model (Groq)…",
  "Diffing drafts & catching missed features…",
  "Validating technical constraints…",
  "Finalizing your implementation plan…"
];

export const REVISION_META = {
  plan:      { noun: 'Implementation Plan', revising: 'REVISING PLAN', review: 'STEP 02 · REVIEW', redirect: 'plan' },
  structure: { noun: 'Project Structure',   revising: 'REVISING STRUCTURE', review: 'STEP 03 · REVIEW', redirect: 'structure' },
  diagram:   { noun: 'Schema & Architecture JSON', revising: 'REVISING SCHEMA', review: 'STEP 04 · REVIEW', redirect: 'diagram' },
  final:     { noun: 'Final Implementation Plan', revising: 'REVISING FINAL PLAN', review: 'STEP 06 · REVIEW', redirect: 'final' },
};

export const STRUCTURAL_KEYWORDS = [
  'remove table', 'delete table', 'drop table', 'remove service', 'delete service',
  'remove feature', 'change relationship', 'merge table', 'split service', 'drop column role',
  'remove auth', 'delete loan'
];

export function classifyAskRequest(text) {
  const lower = text.toLowerCase();
  return STRUCTURAL_KEYWORDS.some(k => lower.includes(k)) ? 'structural' : 'cosmetic';
}

export function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) {
      return reject(new DOMException('Aborted', 'AbortError'));
    }
    let onAbort;
    const t = setTimeout(() => {
      if (signal && onAbort) signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    if (signal) {
      onAbort = () => {
        clearTimeout(t);
        reject(new DOMException('Aborted', 'AbortError'));
      };
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

const initialMimarState = {
  // Operation lock & concurrency protection
  operationRunning: false,
  operationLabel: 'Processing…',
  activeController: null,
  askAiRunning: false,
  askAbortController: null,

  // Current active screen & interview mode ('fresh' | 'readonly' | 'revision')
  currentScreen: 'interview',
  interviewMode: 'fresh',
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
  currentDiagramView: 'arch', // 'arch' | 'erd'
  renderedCache: { arch: false, erd: false },

  finalPlanGenerated: false,
  finalAccepted: false,
  finalComments: {},

  // MCP Server state
  mcpToken: 'mim_live_9f82d1c07a4b89e3',
  mcpConnected: true,
  mcpRequestsUsed: 4,
  mcpRateLimit: 30,
  driftReportRan: false,

  // Chat message history
  messages: [
    {
      id: 'init-ai-1',
      role: 'ai',
      text: 'Tell me about the software you want to build. What problem does it solve and who is it for? Paste raw requirements, user stories, or a rough concept.'
    }
  ],
  toastMessage: null,
  openReviewSheetStage: null,
  isAskDrawerOpen: false,
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

  setOperationRunning: (isRunning, label = 'Processing…') => {
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
    if (target === 'plan' && !s.planGenerated) return;
    if (target === 'structure' && !s.planAccepted) return;
    if (target === 'diagram' && !s.structureAccepted) return;
    if (target === 'render' && !s.diagramJsonAccepted) return;
    if (target === 'final' && !s.diagramAccepted) return;
    if (target === 'mcp' && !s.finalAccepted) return;

    if (target === 'interview') {
      if (options.isRevision) {
        set({ interviewMode: 'revision', revisionContext: options.revisionContext });
      } else if (s.interviewDone) {
        set({ interviewMode: 'readonly', revisionContext: null });
      } else {
        set({ interviewMode: 'fresh', revisionContext: null });
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
      get().showToast("Feature rejected — marked as cut from Implementation Plan.");
    }
    set({ rejectedFeatures: newRejected, renderedCache: { arch: false, erd: false } });
    get().saveProjectState();
  },

  addComment: (stage, id, text, quote) => {
    const s = get();
    const storeKey = stage === 'plan' ? 'planComments' :
                     stage === 'structure' ? 'structureComments' :
                     stage === 'diagram' ? 'diagramJsonComments' : 'finalComments';
    const updated = { ...s[storeKey], [id]: { text, quote } };
    set({ [storeKey]: updated });
    get().saveProjectState();
  },

  deleteComment: (stage, id) => {
    const s = get();
    const storeKey = stage === 'plan' ? 'planComments' :
                     stage === 'structure' ? 'structureComments' :
                     stage === 'diagram' ? 'diagramJsonComments' : 'finalComments';
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

  // Pipeline runner: runIdeaPipeline
  runIdeaPipeline: async (userText) => {
    const s = get();
    s.setOperationRunning(true, 'GENERATING INITIAL PLAN');
    const controller = new AbortController();
    set({ activeController: controller });
    const signal = controller.signal;

    // Add status row indicator to messages
    const statusMsgId = 'status-' + Date.now();
    set(state => ({
      messages: [
        ...state.messages,
        { id: statusMsgId, role: 'status', text: PIPELINE_STEPS[0] }
      ]
    }));

    try {
      for (let i = 0; i < PIPELINE_STEPS.length; i++) {
        await sleep(850, signal);
        set(state => ({
          messages: state.messages.map(m => m.id === statusMsgId ? { ...m, text: PIPELINE_STEPS[i] } : m)
        }));
      }
      await sleep(400, signal);

      // Remove status message and add completion AI bubble
      set(state => ({
        messages: state.messages.filter(m => m.id !== statusMsgId).concat([
          {
            id: 'ai-' + Date.now(),
            role: 'ai',
            text: 'Plan ready — redirecting you to Step 02 (Implementation Plan Review)…'
          }
        ]),
        interviewDone: true,
        planGenerated: true
      }));

      await sleep(650, signal);
      get().showScreen('plan');
      get().showToast("Implementation Plan generated — review and leave comments on any item.");
    } catch (err) {
      if (err.name === 'AbortError') {
        set(state => ({
          messages: state.messages.filter(m => m.id !== statusMsgId)
        }));
        get().showToast("Generation stopped by user.");
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
    const store = targetStage === 'plan' ? s.planComments :
                  targetStage === 'structure' ? s.structureComments :
                  targetStage === 'diagram' ? s.diagramJsonComments : s.finalComments;
    const count = Object.keys(store).length;

    s.setOperationRunning(true, meta.revising);
    const controller = new AbortController();
    set({ activeController: controller });
    const signal = controller.signal;

    const steps = [];
    for (let i = 1; i <= Math.max(1, count); i++) {
      steps.push(`Processing comment ${i} of ${count} (Gemini fix pass)…`);
    }
    steps.push('Validating revised output with Groq checker…');
    steps.push(`Finalizing updated ${meta.noun}…`);

    const introMsgId = 'rev-intro-' + Date.now();
    const statusMsgId = 'rev-status-' + Date.now();

    set(state => ({
      messages: [
        ...state.messages,
        {
          id: introMsgId,
          role: 'ai',
          text: `Received your ${count} comment${count > 1 ? 's' : ''}. Running targeted dual-model revision pipeline on the ${meta.noun}…`
        },
        { id: statusMsgId, role: 'status', text: steps[0] }
      ]
    }));

    try {
      for (let i = 0; i < steps.length; i++) {
        await sleep(850, signal);
        set(state => ({
          messages: state.messages.map(m => m.id === statusMsgId ? { ...m, text: steps[i] } : m)
        }));
      }
      await sleep(400, signal);

      // Clear comments for target stage
      if (targetStage === 'plan') {
        set({ planComments: {} });
      } else if (targetStage === 'structure') {
        set({ structureComments: {}, structureHasRefreshToken: true });
      } else if (targetStage === 'diagram') {
        set({ diagramJsonComments: {} });
      } else {
        set({ finalComments: {} });
      }

      set(state => ({
        messages: state.messages.filter(m => m.id !== statusMsgId).concat([
          {
            id: 'ai-rev-done-' + Date.now(),
            role: 'ai',
            text: `Revision completed and verified. Redirecting you back to ${meta.noun}…`
          }
        ])
      }));

      await sleep(650, signal);
      get().showScreen(meta.redirect);
      get().showToast(`${meta.noun} updated successfully.`);
    } catch (err) {
      if (err.name === 'AbortError') {
        set(state => ({
          messages: state.messages.filter(m => m.id !== statusMsgId)
        }));
        get().showToast("Generation stopped by user.");
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
      s.showToast(`⚠ Cannot accept plan with ${commentCount} pending comment(s). Click "Review Comments" to submit them for AI revision, or delete your comments to accept.`);
      return;
    }
    set({ operationRunning: true, operationLabel: 'Locking Plan…' });
    await sleep(500);
    set({ planAccepted: true, operationRunning: false });
    s.showToast("Implementation Plan locked as accepted. Moving to Step 03 (Project Structure).");
    s.showScreen('structure');
  },

  acceptStructure: async () => {
    const s = get();
    if (s.structureAccepted) return;
    const commentCount = Object.keys(s.structureComments).length;
    if (commentCount > 0) {
      s.showToast(`⚠ Cannot accept structure with ${commentCount} pending comment(s). Click "Review Comments" to submit them for AI revision, or delete your comments to accept.`);
      return;
    }
    set({ operationRunning: true, operationLabel: 'Locking Structure…' });
    await sleep(500);
    set({ structureAccepted: true, operationRunning: false });
    s.showToast("Project Structure locked as accepted. Moving to Step 04 (Schema & Architecture JSON).");
    s.showScreen('diagram');
  },

  acceptDiagramJson: async () => {
    const s = get();
    if (s.diagramJsonAccepted) return;
    const commentCount = Object.keys(s.diagramJsonComments).length;
    if (commentCount > 0) {
      s.showToast(`⚠ Cannot accept schema JSON with ${commentCount} pending comment(s). Click "Review Comments" to submit them for AI revision, or delete your comments to accept.`);
      return;
    }
    set({ operationRunning: true, operationLabel: 'Rendering Blueprint…' });
    await sleep(500);
    set({ diagramJsonAccepted: true, diagramRendered: true, operationRunning: false });
    s.showToast("Schema JSON accepted. Rendered blueprints on Step 05.");
    s.showScreen('render');
  },

  acceptRenderDiagram: async () => {
    const s = get();
    if (s.diagramAccepted) return;
    if (s.askAiRunning || s.operationRunning) {
      s.showToast("⚠ Cannot accept diagram while Ask AI is actively generating modifications. Please wait for Ask AI to finish, or click the Stop button.");
      return;
    }
    set({ operationRunning: true, operationLabel: 'Committing into Plan…' });
    await sleep(500);
    set({ diagramAccepted: true, operationRunning: false });
    s.showToast("Diagrams accepted and committed into the final Consolidated Plan.");
    s.showScreen('final');
  },

  acceptFinalPlan: async () => {
    const s = get();
    if (s.finalAccepted) return;
    const commentCount = Object.keys(s.finalComments).length;
    if (commentCount > 0) {
      s.showToast(`⚠ Cannot dispatch plan with ${commentCount} pending comment(s). Click "Review Comments" to submit them for AI revision, or delete your comments to dispatch.`);
      return;
    }
    set({ operationRunning: true, operationLabel: 'Dispatching to Agent…' });
    await sleep(650);
    set({ finalAccepted: true, operationRunning: false });
    s.showToast("Plan fully validated and dispatched! Opening MCP Server connection hub.");
    s.showScreen('mcp');
  },

  saveProjectState: () => {
    if (typeof window === 'undefined') return;
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
        mcpToken: s.mcpToken,
        mcpConnected: s.mcpConnected,
        mcpRequestsUsed: s.mcpRequestsUsed,
        mcpRateLimit: s.mcpRateLimit,
        driftReportRan: s.driftReportRan,
        messages: s.messages,
        timestamp: Date.now()
      };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
      console.error('Failed to save project state:', err);
    }
  },

  restoreProjectState: () => {
    if (typeof window === 'undefined') return false;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data) return false;

      set({
        ...data,
        operationRunning: false,
        activeController: null,
        askAiRunning: false,
        askAbortController: null,
        openReviewSheetStage: null,
        isAskDrawerOpen: false
      });
      return true;
    } catch (err) {
      console.error('Failed to restore project state:', err);
      return false;
    }
  },

  clearProjectState: () => {
    if (typeof window === 'undefined') return;
    try {
      sessionStorage.removeItem(STORAGE_KEY);
      set({ ...initialMimarState });
    } catch (err) {}
  }
}));
