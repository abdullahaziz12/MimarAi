/* ============================================================
   MIMAR AI — BLUEPRINT WIZARD — APPLICATION ENGINE & STATE
   ============================================================ */

/* ---- STATE MACHINE ---- */
const STATE = {
  // Operation lock & concurrency protection
  operationRunning: false,
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

  workingDiagramJson: null, // updated by Ask AI, merged only on "Accept Diagram"
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
  driftReportRan: false
};

const SCREEN_ORDER = ['interview', 'plan', 'structure', 'diagram', 'render', 'final', 'mcp'];
const STAGE_FOR_SCREEN = {
  interview: null,
  plan: 'features',
  structure: 'structure',
  diagram: 'diagram',
  render: 'final',
  final: 'final',
  mcp: 'final'
};
const STAGE_ORDER = ['features', 'structure', 'diagram', 'final'];

/* ============================================================
   SHARED UTILITIES & STATE PERSISTENCE
   ============================================================ */
const STORAGE_KEY = 'mimarai_saved_state';

function saveProjectState() {
  try {
    const messagesEl = document.getElementById('messages');
    const data = {
      currentScreen: STATE.currentScreen,
      interviewMode: STATE.interviewMode,
      revisionContext: STATE.revisionContext,
      manuallyAmended: STATE.manuallyAmended,
      rejectedFeatures: STATE.rejectedFeatures,
      interviewDone: STATE.interviewDone,
      planGenerated: STATE.planGenerated,
      planAccepted: STATE.planAccepted,
      planComments: STATE.planComments,
      structureGenerated: STATE.structureGenerated,
      structureAccepted: STATE.structureAccepted,
      structureComments: STATE.structureComments,
      diagramJsonGenerated: STATE.diagramJsonGenerated,
      diagramJsonAccepted: STATE.diagramJsonAccepted,
      diagramJsonComments: STATE.diagramJsonComments,
      diagramRendered: STATE.diagramRendered,
      diagramAccepted: STATE.diagramAccepted,
      currentDiagramView: STATE.currentDiagramView,
      finalPlanGenerated: STATE.finalPlanGenerated,
      finalAccepted: STATE.finalAccepted,
      finalComments: STATE.finalComments,
      mcpToken: STATE.mcpToken,
      mcpConnected: STATE.mcpConnected,
      mcpRequestsUsed: STATE.mcpRequestsUsed,
      mcpRateLimit: STATE.mcpRateLimit,
      driftReportRan: STATE.driftReportRan,
      wasGenerating: STATE.operationRunning,
      messagesHtml: messagesEl ? messagesEl.innerHTML : '',
      timestamp: Date.now()
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.error('Failed to save project state:', err);
  }
}

function clearProjectState() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch (err) {}
}

function restoreProjectState() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data) return false;

    // Merge saved state into STATE
    Object.keys(data).forEach(k => {
      if (k !== 'messagesHtml' && k !== 'wasGenerating' && k !== 'timestamp' && k in STATE) {
        STATE[k] = data[k];
      }
    });

    // If generation was active when leaving, mark as completed
    if (data.wasGenerating) {
      if (!STATE.planGenerated) {
        STATE.interviewDone = true;
        STATE.planGenerated = true;
        if (STATE.currentScreen === 'interview') {
          STATE.currentScreen = 'plan';
        }
      }
    }

    // Restore chat messages
    const messagesEl = document.getElementById('messages');
    if (messagesEl && data.messagesHtml) {
      messagesEl.innerHTML = data.messagesHtml;
      if (data.wasGenerating) {
        const lastBubble = messagesEl.querySelector('.row.ai:last-child .bubble.ai');
        if (!lastBubble || !lastBubble.textContent.includes('Plan ready')) {
          const row = document.createElement('div');
          row.className = 'row ai';
          row.innerHTML = `<div><div class="eyebrow">MimarAi</div><div class="bubble ai">Dual-model drafting completed in background. Plan is ready for review!</div></div>`;
          messagesEl.appendChild(row);
        }
      }
    }

    // Re-apply rejected features in UI
    if (STATE.rejectedFeatures) {
      Object.keys(STATE.rejectedFeatures).forEach(fId => {
        const block = document.querySelector(`.block[data-id="${fId}"]`);
        if (block) {
          block.classList.add('rejected');
          const btn = block.querySelector('.feature-action-btn');
          if (btn) {
            btn.className = 'feature-action-btn undo-btn';
            btn.textContent = 'Undo';
          }
          const msg = block.querySelector('.rejected-msg');
          if (msg) msg.style.display = 'flex';
          const featureRow = block.querySelector('.feature-row');
          if (featureRow && !featureRow.querySelector('.rejected-chip')) {
            const chip = document.createElement('span');
            chip.className = 'rejected-chip';
            chip.textContent = 'REJECTED';
            featureRow.appendChild(chip);
          }
        }
      });
      applyAcceptedPlanToDownstream();
    }

    // Restore badges
    refreshBadge('plan');
    refreshBadge('structure');
    refreshBadge('diagram');
    refreshBadge('final');

    // Restore diagram view if needed
    if (STATE.diagramJsonAccepted || STATE.diagramRendered) {
      renderDiagram(STATE.currentDiagramView || 'arch');
    }

    // Show saved screen instantly without intermediate animation or flash of Screen 01
    showScreen(STATE.currentScreen || 'interview', { instant: true });
    syncReadOnlyStates();

    // Clean up pre-render attribute after DOM is settled
    requestAnimationFrame(() => {
      document.documentElement.removeAttribute('data-initial-screen');
    });

    showToast("Resumed your Blueprint Wizard session right where you left off.");
    return true;
  } catch (err) {
    console.error('Failed to restore project state:', err);
    document.documentElement.removeAttribute('data-initial-screen');
    return false;
  }
}

let uiLocked = false;
function withLock(fn) {
  return async function(...args) {
    if (uiLocked || STATE.operationRunning) return;
    uiLocked = true;
    try {
      await fn.apply(this, args);
    } finally {
      setTimeout(() => { uiLocked = false; }, 200);
    }
  };
}

function sleep(ms, signal) {
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

function escapeHtml(s) {
  if (!s) return '';
  return s.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}

/* ============================================================
   STATE INTEGRITY & LOCKING SYSTEM
   ============================================================ */
function setOperationRunning(isRunning, label = 'Processing…') {
  STATE.operationRunning = isRunning;
  const opLockBar = document.getElementById('opLockBar');
  const opLockText = document.getElementById('opLockText');
  const hudDot = document.getElementById('hudDot');
  const hudStatus = document.getElementById('hudStatus');

  const headerLandingBtn = document.getElementById('headerLandingBtn');

  if (opLockBar) opLockBar.classList.toggle('visible', isRunning);
  if (opLockText) opLockText.textContent = label;
  if (hudDot) hudDot.classList.toggle('processing', isRunning);

  if (isRunning) {
    if (hudStatus) hudStatus.textContent = 'STATUS: PIPELINE EXECUTING (' + label + ')';
    if (headerLandingBtn) {
      headerLandingBtn.classList.add('stop-mode');
      headerLandingBtn.innerHTML = '⏹ Stop Generation';
      headerLandingBtn.setAttribute('title', 'Stop generation and return to landing page');
      headerLandingBtn.setAttribute('aria-label', 'Stop generation and return to landing page');
    }
    disableActionButtons(true);
  } else {
    if (hudStatus) {
      hudStatus.textContent = STATE.finalAccepted 
        ? 'STATUS: SPEC VALIDATED & AGENT READY' 
        : 'STATUS: DRAFTING IN PROGRESS';
    }
    if (headerLandingBtn) {
      headerLandingBtn.classList.remove('stop-mode');
      headerLandingBtn.innerHTML = 'Stop Generation';
      headerLandingBtn.setAttribute('title', 'Stop generation and return to landing page');
      headerLandingBtn.setAttribute('aria-label', 'Stop generation and return to landing page');
    }
    disableActionButtons(false);
  }
}

function disableActionButtons(disabled) {
  const btns = [
    'acceptBtnPlan', 'acceptBtnStruct', 'acceptBtnDiagram', 'acceptBtnRender', 'acceptBtnFinal',
    'sheetSubmitPlan', 'sheetSubmitStruct', 'sheetSubmitDiagram', 'sheetSubmitFinal'
  ];
  btns.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      // Don't enable if it's supposed to be locked permanently
      if (!disabled && isStageAccepted(id)) return;
      el.disabled = disabled;
    }
  });
}

function isStageAccepted(id) {
  if (!id) return false;
  const s = String(id).toLowerCase();
  if (s.includes('struct')) return STATE.structureAccepted;
  if (s.includes('diagram') || s.includes('json')) return STATE.diagramJsonAccepted;
  if (s.includes('render')) return STATE.diagramAccepted;
  if (s.includes('final')) return STATE.finalAccepted;
  if (s.includes('plan')) return STATE.planAccepted;
  return false;
}

/* ============================================================
   NAVBAR SHORTCUTS & ROUTING (State-Aware)
   ============================================================ */
function updateNavShortcuts() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    const target = item.dataset.screen;
    item.classList.remove('locked', 'available', 'current', 'accepted');

    let isUnlocked = false;
    let isAccepted = false;

    if (target === 'interview') {
      isUnlocked = true;
      if (STATE.interviewDone) isAccepted = true;
    } else if (target === 'plan') {
      isUnlocked = STATE.planGenerated;
      isAccepted = STATE.planAccepted;
    } else if (target === 'structure') {
      isUnlocked = STATE.planAccepted;
      isAccepted = STATE.structureAccepted;
    } else if (target === 'diagram') {
      isUnlocked = STATE.structureAccepted;
      isAccepted = STATE.diagramJsonAccepted;
    } else if (target === 'render') {
      isUnlocked = STATE.diagramJsonAccepted;
      isAccepted = STATE.diagramAccepted;
    } else if (target === 'final') {
      isUnlocked = STATE.diagramAccepted;
      isAccepted = STATE.finalAccepted;
    } else if (target === 'mcp') {
      isUnlocked = STATE.finalAccepted;
      isAccepted = STATE.finalAccepted;
    }

    if (isAccepted) item.classList.add('accepted');
    if (isUnlocked) item.classList.add('available');
    else item.classList.add('locked');

    if (STATE.currentScreen === target) {
      item.classList.add('current');
    }
  });
}

function setGlobalStage(screenName) {
  const target = STAGE_FOR_SCREEN[screenName];
  const targetIdx = target ? STAGE_ORDER.indexOf(target) : -1;
  document.querySelectorAll('.gstage').forEach(el => {
    const idx = STAGE_ORDER.indexOf(el.dataset.stage);
    el.classList.remove('done', 'active');
    if (targetIdx === -1) return;
    if (idx < targetIdx) el.classList.add('done');
    else if (idx === targetIdx) el.classList.add('active');
  });
}

function showScreen(target, options = {}) {
  // Enforce state integrity: Don't allow navigating into locked future stages directly
  if (target === 'plan' && !STATE.planGenerated) return;
  if (target === 'structure' && !STATE.planAccepted) return;
  if (target === 'diagram' && !STATE.structureAccepted) return;
  if (target === 'render' && !STATE.diagramJsonAccepted) return;
  if (target === 'final' && !STATE.diagramAccepted) return;
  if (target === 'mcp' && !STATE.finalAccepted) return;

  STATE.currentScreen = target;

  const appShell = document.getElementById('appShell');
  if (options.instant && appShell) {
    appShell.classList.add('no-transition');
  }

  // Handle Interview mode when entering interview screen
  if (target === 'interview') {
    if (options.isRevision) {
      setInterviewMode('revision', options.revisionContext);
    } else if (STATE.interviewDone) {
      setInterviewMode('readonly');
    } else {
      setInterviewMode('fresh');
    }
  }

  const idx = SCREEN_ORDER.indexOf(target);
  SCREEN_ORDER.forEach((name, i) => {
    const el = document.getElementById('screen-' + name);
    if (!el) return;
    el.classList.remove('active', 'prev');
    if (i === idx) {
      el.classList.add('active');
    } else if (i < idx) {
      el.classList.add('prev');
    }
  });

  // Update header step text
  const headerTitleStep = document.getElementById('headerTitleStep');
  if (headerTitleStep) {
    if (target === 'interview') {
      headerTitleStep.innerHTML = STATE.interviewMode === 'revision'
        ? `REVISING <b>${STATE.revisionContext ? STATE.revisionContext.noun.toUpperCase() : 'PLAN'}</b>`
        : STATE.interviewDone ? 'STEP 01 · <b>INTERVIEW (HISTORY)</b>' : 'STEP 01 · <b>IDEA INTERVIEW</b>';
    } else if (target === 'plan') {
      headerTitleStep.innerHTML = STATE.planAccepted ? 'STEP 02 · <b>PLAN (ACCEPTED)</b>' : 'STEP 02 · <b>PLAN REVIEW</b>';
    } else if (target === 'structure') {
      headerTitleStep.innerHTML = STATE.structureAccepted ? 'STEP 03 · <b>STRUCTURE (ACCEPTED)</b>' : 'STEP 03 · <b>STRUCTURE REVIEW</b>';
    } else if (target === 'diagram') {
      headerTitleStep.innerHTML = STATE.diagramJsonAccepted ? 'STEP 04 · <b>SCHEMA JSON (ACCEPTED)</b>' : 'STEP 04 · <b>SCHEMA JSON REVIEW</b>';
    } else if (target === 'render') {
      headerTitleStep.innerHTML = STATE.diagramAccepted ? 'STEP 05 · <b>DIAGRAMS (ACCEPTED)</b>' : 'STEP 05 · <b>RENDERED DIAGRAMS</b>';
    } else if (target === 'final') {
      headerTitleStep.innerHTML = STATE.finalAccepted ? 'STEP 06 · <b>FINAL PLAN (LOCKED)</b>' : 'STEP 06 · <b>FINAL REVIEW</b>';
    } else if (target === 'mcp') {
      headerTitleStep.innerHTML = 'STEP 07 · <b>MCP AGENT CONNECTION</b>';
    }
  }

  setGlobalStage(target);
  updateNavShortcuts();
  syncReadOnlyStates();
  saveProjectState();

  if (options.instant && appShell) {
    requestAnimationFrame(() => {
      appShell.classList.remove('no-transition');
    });
  }
}

/* ============================================================
   READ-ONLY STATES SYNC
   ============================================================ */
function syncReadOnlyStates() {
  // Plan screen
  const screenPlan = document.getElementById('screen-plan');
  if (screenPlan) {
    if (STATE.planAccepted) {
      screenPlan.classList.add('readonly-mode');
      const acceptBtn = document.getElementById('acceptBtnPlan');
      if (acceptBtn) {
        acceptBtn.className = 'btn btn-success';
        acceptBtn.innerHTML = '✓ Plan Accepted';
        acceptBtn.disabled = true;
      }
      const revBtn = document.getElementById('reviewBtnPlan');
      if (revBtn) revBtn.style.display = 'none';
      const badge = document.getElementById('planAcceptedBadge');
      if (badge) badge.style.display = 'inline-flex';
      screenPlan.querySelectorAll('.feature-action-btn').forEach(b => { b.disabled = true; });
    }
  }

  // Structure screen
  const screenStruct = document.getElementById('screen-structure');
  if (screenStruct) {
    if (STATE.structureAccepted) {
      screenStruct.classList.add('readonly-mode');
      const acceptBtn = document.getElementById('acceptBtnStruct');
      if (acceptBtn) {
        acceptBtn.className = 'btn btn-success';
        acceptBtn.innerHTML = '✓ Structure Accepted';
        acceptBtn.disabled = true;
      }
      const revBtn = document.getElementById('reviewBtnStruct');
      if (revBtn) revBtn.style.display = 'none';
      const badge = document.getElementById('structAcceptedBadge');
      if (badge) badge.style.display = 'inline-flex';
    }
  }

  // Diagram JSON screen
  const screenDiagram = document.getElementById('screen-diagram');
  if (screenDiagram) {
    if (STATE.diagramJsonAccepted) {
      screenDiagram.classList.add('readonly-mode');
      const acceptBtn = document.getElementById('acceptBtnDiagram');
      if (acceptBtn) {
        acceptBtn.className = 'btn btn-success';
        acceptBtn.innerHTML = '✓ JSON Accepted';
        acceptBtn.disabled = true;
      }
      const revBtn = document.getElementById('reviewBtnDiagram');
      if (revBtn) revBtn.style.display = 'none';
      const badge = document.getElementById('diagramJsonAcceptedBadge');
      if (badge) badge.style.display = 'inline-flex';
    }
  }

  // Rendered Diagram screen
  const screenRender = document.getElementById('screen-render');
  if (screenRender) {
    if (STATE.diagramAccepted) {
      screenRender.classList.add('readonly-mode');
      const acceptBtn = document.getElementById('acceptBtnRender');
      if (acceptBtn) {
        acceptBtn.className = 'btn btn-success';
        acceptBtn.innerHTML = '✓ Diagram Accepted &amp; Committed';
        acceptBtn.disabled = true;
      }
      const askAiBtn = document.getElementById('askAiBtn');
      if (askAiBtn) askAiBtn.style.display = 'none';
      const badge = document.getElementById('renderAcceptedBadge');
      if (badge) badge.style.display = 'inline-flex';
    }
  }

  // Final Plan screen
  const screenFinal = document.getElementById('screen-final');
  if (screenFinal) {
    if (STATE.finalAccepted) {
      screenFinal.classList.add('readonly-mode');
      const acceptBtn = document.getElementById('acceptBtnFinal');
      if (acceptBtn) {
        acceptBtn.className = 'btn btn-success';
        acceptBtn.innerHTML = '✓ Dispatched to Agent';
        acceptBtn.disabled = true;
      }
      const revBtn = document.getElementById('reviewBtnFinal');
      if (revBtn) revBtn.style.display = 'none';
      const badge = document.getElementById('finalAcceptedBadge');
      if (badge) badge.style.display = 'inline-flex';
    }
  }
}

/* ============================================================
   INTERVIEW MODES & CONTROLLER
   ============================================================ */
function setInterviewMode(mode, context = null) {
  STATE.interviewMode = mode;
  STATE.revisionContext = context;

  const revBanner = document.getElementById('revisionBanner');
  const readBanner = document.getElementById('readonlyBanner');
  const inputBar = document.getElementById('interviewInputBar');
  const readonlyMsg = document.getElementById('composerReadonlyMsg');
  const sessionTag = document.getElementById('chatSessionTag');
  const hudDotLive = document.getElementById('hudDotLive');

  if (mode === 'revision' && context) {
    if (revBanner) {
      revBanner.style.display = 'flex';
      document.getElementById('revBannerStage').textContent = context.noun.toUpperCase();
      document.getElementById('revBannerCount').textContent = Object.keys(context.pendingComments).length;
    }
    if (readBanner) readBanner.style.display = 'none';
    if (inputBar) inputBar.style.display = 'block';
    if (readonlyMsg) readonlyMsg.classList.remove('visible');
    if (sessionTag) sessionTag.textContent = 'SESSION: REVISION ACTIVE';
    if (hudDotLive) hudDotLive.classList.remove('idle');
  } else if (mode === 'readonly') {
    if (revBanner) revBanner.style.display = 'none';
    if (readBanner) readBanner.style.display = 'flex';
    if (inputBar) inputBar.style.display = 'none';
    if (readonlyMsg) readonlyMsg.classList.add('visible');
    if (sessionTag) sessionTag.textContent = 'SESSION: LOCKED / READ-ONLY';
    if (hudDotLive) hudDotLive.classList.add('idle');
  } else {
    // Fresh interview mode
    if (revBanner) revBanner.style.display = 'none';
    if (readBanner) readBanner.style.display = 'none';
    if (inputBar) inputBar.style.display = 'block';
    if (readonlyMsg) readonlyMsg.classList.remove('visible');
    if (sessionTag) sessionTag.textContent = 'SESSION: ACTIVE';
    if (hudDotLive) hudDotLive.classList.remove('idle');
  }
}

/* ============================================================
   INTERVIEW PIPELINE EXECUTION (Gemini + Groq dual-model)
   ============================================================ */
const PIPELINE_STEPS = [
  "Validating inputs…",
  "Generating feature plan (Gemini Flash)…",
  "Cross-checking with second model (Groq)…",
  "Diffing drafts & catching missed features…",
  "Validating technical constraints…",
  "Finalizing your implementation plan…"
];

const messagesEl   = document.getElementById('messages');
const composerEl   = document.getElementById('composer');
const sendBtnEl    = document.getElementById('sendBtn');
const btnIconEl    = document.getElementById('btnIcon');
const inputShellEl = document.getElementById('inputShell');

const ARROW_ICON = `<path d="M12 19V5"/><path d="M5 12l7-7 7 7"/>`;
const STOP_ICON  = `<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>`;

function autoGrow() {
  if (!composerEl) return;
  composerEl.style.height = 'auto';
  composerEl.style.height = Math.min(composerEl.scrollHeight, 140) + 'px';
}

function setSendButtonState(state) {
  if (!sendBtnEl || !btnIconEl) return;
  sendBtnEl.classList.remove('ready', 'stop');
  if (state === 'ready') {
    sendBtnEl.classList.add('ready');
    btnIconEl.innerHTML = ARROW_ICON;
    sendBtnEl.setAttribute('aria-label', 'Send');
  } else if (state === 'stop') {
    sendBtnEl.classList.add('stop');
    btnIconEl.innerHTML = STOP_ICON;
    sendBtnEl.setAttribute('aria-label', 'Stop generating');
  } else {
    btnIconEl.innerHTML = ARROW_ICON;
    sendBtnEl.setAttribute('aria-label', 'Send');
  }
}

function addUserBubble(text) {
  const row = document.createElement('div');
  row.className = 'row user';
  row.innerHTML = `<div class="bubble user"></div>`;
  row.querySelector('.bubble').textContent = text;
  messagesEl.appendChild(row);
  scrollInterviewDown();
}

function addAiBubble(text) {
  const row = document.createElement('div');
  row.className = 'row ai';
  row.innerHTML = `<div><div class="eyebrow">MimarAi</div><div class="bubble ai"></div></div>`;
  row.querySelector('.bubble').textContent = text;
  messagesEl.appendChild(row);
  scrollInterviewDown();
  return row;
}

function scrollInterviewDown() {
  if (!messagesEl) return;
  requestAnimationFrame(() => { messagesEl.scrollTop = messagesEl.scrollHeight; });
}

/* Run initial idea pipeline */
async function runIdeaPipeline(userText) {
  setOperationRunning(true, 'GENERATING INITIAL PLAN');
  STATE.activeController = new AbortController();
  const signal = STATE.activeController.signal;

  setSendButtonState('stop');
  if (inputShellEl) inputShellEl.classList.add('locked');
  if (composerEl) composerEl.disabled = true;

  const statusRow = document.createElement('div');
  statusRow.className = 'row ai';
  statusRow.innerHTML = `<div class="status-row"><div class="status-dot"></div><div class="status-text" id="statusText">${PIPELINE_STEPS[0]}</div></div>`;
  messagesEl.appendChild(statusRow);
  scrollInterviewDown();

  const statusText = statusRow.querySelector('#statusText');
  const statusDot = statusRow.querySelector('.status-dot');

  try {
    for (let i = 0; i < PIPELINE_STEPS.length; i++) {
      await sleep(850, signal);
      statusText.style.opacity = 0;
      await sleep(100, signal);
      statusText.textContent = PIPELINE_STEPS[i];
      statusText.style.opacity = 1;
    }
    await sleep(400, signal);
    statusRow.remove();

    addAiBubble("Plan ready — redirecting you to Step 02 (Implementation Plan Review)…");
    STATE.interviewDone = true;
    STATE.planGenerated = true;

    await sleep(650, signal);
    showScreen('plan');
    showToast("Implementation Plan generated — review and leave comments on any item.");
  } catch (err) {
    if (err.name === 'AbortError') {
      if (statusRow && statusRow.parentNode) {
        statusRow.remove();
      }
      showToast("Generation stopped by user.");
    }
  } finally {
    setOperationRunning(false);
    STATE.activeController = null;
    if (inputShellEl) inputShellEl.classList.remove('locked');
    if (composerEl) {
      composerEl.disabled = false;
      setSendButtonState(composerEl.value.trim() ? 'ready' : 'idle');
    }
  }
}

/* Run targeted revision pipeline for a specific stage */
const REVISION_META = {
  plan:      { noun: 'Implementation Plan', revising: 'REVISING PLAN', review: 'STEP 02 · REVIEW', redirect: 'plan' },
  structure: { noun: 'Project Structure',   revising: 'REVISING STRUCTURE', review: 'STEP 03 · REVIEW', redirect: 'structure' },
  diagram:   { noun: 'Schema & Architecture JSON', revising: 'REVISING SCHEMA', review: 'STEP 04 · REVIEW', redirect: 'diagram' },
  final:     { noun: 'Final Implementation Plan', revising: 'REVISING FINAL PLAN', review: 'STEP 06 · REVIEW', redirect: 'final' },
};

async function runRevisionPipeline(targetStage) {
  const meta = REVISION_META[targetStage];
  const store = targetStage === 'plan' ? STATE.planComments :
                targetStage === 'structure' ? STATE.structureComments :
                targetStage === 'diagram' ? STATE.diagramJsonComments : STATE.finalComments;
  const count = Object.keys(store).length;

  setOperationRunning(true, meta.revising);
  STATE.activeController = new AbortController();
  const signal = STATE.activeController.signal;

  setSendButtonState('stop');
  if (inputShellEl) inputShellEl.classList.add('locked');
  if (composerEl) composerEl.disabled = true;

  const steps = [];
  for (let i = 1; i <= Math.max(1, count); i++) {
    steps.push(`Processing comment ${i} of ${count} (Gemini fix pass)…`);
  }
  steps.push('Validating revised output with Groq checker…');
  steps.push(`Finalizing updated ${meta.noun}…`);

  addAiBubble(`Received your ${count} comment${count > 1 ? 's' : ''}. Running targeted dual-model revision pipeline on the ${meta.noun}…`);

  const statusRow = document.createElement('div');
  statusRow.className = 'row ai';
  statusRow.innerHTML = `<div class="status-row"><div class="status-dot"></div><div class="status-text" id="statusText">${steps[0]}</div></div>`;
  messagesEl.appendChild(statusRow);
  scrollInterviewDown();

  const statusText = statusRow.querySelector('#statusText');
  const statusDot = statusRow.querySelector('.status-dot');

  try {
    for (let i = 0; i < steps.length; i++) {
      await sleep(850, signal);
      statusText.style.opacity = 0;
      await sleep(100, signal);
      statusText.textContent = steps[i];
      statusText.style.opacity = 1;
    }
    await sleep(400, signal);

    // Apply specific stage updates
    if (targetStage === 'plan') {
      STATE.planComments = {};
      document.querySelectorAll('#docContentPlan .block.commented').forEach(b => b.classList.remove('commented'));
      refreshBadge('plan');
    } else if (targetStage === 'structure') {
      STATE.structureComments = {};
      document.querySelectorAll('#docStruct .file-row.commented').forEach(r => r.classList.remove('commented'));
      refreshBadge('structure');
      applyStructureRevision();
    } else if (targetStage === 'diagram') {
      STATE.diagramJsonComments = {};
      document.querySelectorAll('#docDiagram .table-card.commented, #docDiagram .service-card.commented').forEach(c => c.classList.remove('commented'));
      refreshBadge('diagram');
    } else {
      STATE.finalComments = {};
      document.querySelectorAll('#docFinal .block.commented').forEach(b => b.classList.remove('commented'));
      refreshBadge('final');
    }

    statusRow.remove();
    addAiBubble(`Revision completed and verified. Redirecting you back to ${meta.noun}…`);
    await sleep(650, signal);

    showScreen(meta.redirect);
    showToast(`${meta.noun} updated successfully.`);
  } catch (err) {
    if (err.name === 'AbortError') {
      if (statusRow && statusRow.parentNode) {
        statusRow.remove();
      }
      showToast("Generation stopped by user.");
    }
  } finally {
    setOperationRunning(false);
    STATE.activeController = null;
    if (inputShellEl) inputShellEl.classList.remove('locked');
    if (composerEl) {
      composerEl.disabled = false;
      setSendButtonState(composerEl.value.trim() ? 'ready' : 'idle');
    }
  }
}

function applyStructureRevision() {
  const authFlag = document.getElementById('authFlag');
  if (authFlag) authFlag.remove();

  const modelsGroup = document.getElementById('g-models');
  if (modelsGroup && !document.getElementById('f-token-model')) {
    const row = document.createElement('div');
    row.className = 'file-row new-file';
    row.dataset.id = 'f-token-model';
    row.dataset.path = 'src/models/refresh_token.py';
    row.innerHTML = `
      <svg class="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
      <div class="file-main">
        <div class="file-path">refresh_token<span class="dim">.py</span></div>
        <div class="file-tags"><span class="feature-tag">Role-Based Access Control</span><span class="ai-tag">AI-added</span></div>
      </div>
      <div class="comment-trigger" data-icon><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg></div>
    `;
    modelsGroup.appendChild(row);
    const modelsCount = document.getElementById('modelsCount');
    if (modelsCount) modelsCount.textContent = '3 files';
    const structMeta = document.getElementById('structMeta');
    if (structMeta) structMeta.textContent = '5 FILES · 3 FEATURES MAPPED';
  }
}

/* ============================================================
   COMMENT DRAWER & INLINE COMPOSER SYSTEM
   ============================================================ */
function refreshBadge(stage) {
  const store = stage === 'plan' ? STATE.planComments :
                stage === 'structure' ? STATE.structureComments :
                stage === 'diagram' ? STATE.diagramJsonComments : STATE.finalComments;
  const n = Object.keys(store).length;
  const badgeId = stage === 'plan' ? 'reviewBadgePlan' :
                  stage === 'structure' ? 'reviewBadgeStruct' :
                  stage === 'diagram' ? 'reviewBadgeDiagram' : 'reviewBadgeFinal';
  const badge = document.getElementById(badgeId);
  if (badge) {
    badge.style.display = n > 0 ? 'inline-block' : 'none';
    badge.textContent = n;
  }

  // Update Accept button guard state for this stage
  const acceptBtnId = stage === 'plan' ? 'acceptBtnPlan' :
                      stage === 'structure' ? 'acceptBtnStruct' :
                      stage === 'diagram' ? 'acceptBtnDiagram' : 'acceptBtnFinal';
  const acceptBtn = document.getElementById(acceptBtnId);
  if (acceptBtn && !isStageAccepted(stage)) {
    if (n > 0) {
      acceptBtn.classList.add('disabled-by-comments');
      acceptBtn.setAttribute('title', `Cannot accept with ${n} pending review comment(s). Submit comments for AI revision, or delete comments to accept.`);
    } else {
      acceptBtn.classList.remove('disabled-by-comments');
      acceptBtn.removeAttribute('title');
    }
  }
}

function setupCommentSystem(stage, docElId, sheetBackdropId, sheetId, listId, subId, submitId, cancelId) {
  const docEl = document.getElementById(docElId);
  const backdrop = document.getElementById(sheetBackdropId);
  const sheet = document.getElementById(sheetId);
  const list = document.getElementById(listId);
  const sub = document.getElementById(subId);
  const submitBtn = document.getElementById(submitId);
  const cancelBtn = document.getElementById(cancelId);

  const getStore = () => {
    if (stage === 'plan') return STATE.planComments;
    if (stage === 'structure') return STATE.structureComments;
    if (stage === 'diagram') return STATE.diagramJsonComments;
    return STATE.finalComments;
  };

  const closeComposer = () => {
    const live = document.getElementById(`liveComposer_${stage}`);
    if (live) live.remove();
  };

  const openComposer = (targetEl) => {
    // If screen is accepted/read-only, do not allow comments
    if (isStageAccepted(submitId)) return;

    closeComposer();
    const id = targetEl.dataset.id;
    const store = getStore();
    const existing = store[id];

    const box = document.createElement('div');
    box.className = 'composer';
    box.id = `liveComposer_${stage}`;
    box.innerHTML = existing
      ? `<textarea id="cText_${stage}">${escapeHtml(existing.text)}</textarea>
         <div class="composer-actions">
           <button class="danger-btn" id="delC_${stage}">Delete</button>
           <span style="flex:1"></span>
           <button class="ghost-btn" id="cancelC_${stage}">Cancel</button>
           <button class="solid-btn" id="saveC_${stage}">Update Comment</button>
         </div>`
      : `<textarea id="cText_${stage}" placeholder="Leave a comment on this item…"></textarea>
         <div class="composer-actions">
           <button class="ghost-btn" id="cancelC_${stage}">Cancel</button>
           <button class="solid-btn" id="saveC_${stage}">Add Comment</button>
         </div>`;

    targetEl.insertAdjacentElement('afterend', box);
    const textarea = box.querySelector(`#cText_${stage}`);
    textarea.focus();

    box.querySelector(`#cancelC_${stage}`).addEventListener('click', closeComposer);
    box.querySelector(`#saveC_${stage}`).addEventListener('click', withLock(() => {
      const text = textarea.value.trim();
      if (!text) { closeComposer(); return; }
      
      let label = targetEl.dataset.path || targetEl.querySelector('.table-name, .svc-name, .feature-name')?.textContent || targetEl.innerText.trim().split('\n')[0].slice(0, 120);
      store[id] = { text, quote: label };
      targetEl.classList.add('commented');
      refreshBadge(stage);
      closeComposer();
    }));

    const delBtn = box.querySelector(`#delC_${stage}`);
    if (delBtn) {
      delBtn.addEventListener('click', withLock(() => {
        delete store[id];
        targetEl.classList.remove('commented');
        refreshBadge(stage);
        closeComposer();
      }));
    }
  };

  if (docEl) {
    docEl.addEventListener('click', (e) => {
      if (isStageAccepted(submitId)) return;
      if (e.target.closest('.feature-action-btn')) return;
      const trigger = e.target.closest('.comment-trigger');
      const item = e.target.closest('.block, .file-row, .table-card, .service-card');
      if (!item) return;

      if (!trigger) {
        docEl.querySelectorAll('.block.active, .file-row.active, .table-card.active, .service-card.active')
          .forEach(el => el !== item && el.classList.remove('active'));
        item.classList.add('active');
        return;
      }
      openComposer(item);
    });
  }

  const renderSheet = () => {
    const store = getStore();
    const n = Object.keys(store).length;
    if (sub) sub.textContent = n + (n === 1 ? ' COMMENT PENDING' : ' COMMENTS PENDING');
    if (submitBtn) {
      submitBtn.disabled = n === 0 || STATE.operationRunning;
      submitBtn.innerHTML = n === 0 ? 'Submit comments' : `Submit ${n} comment${n > 1 ? 's' : ''} →`;
    }
    if (!list) return;

    if (n === 0) {
      list.innerHTML = `<div class="empty-state">No comments pending on this stage. Click any row or item in the document to leave inline feedback.</div>`;
      return;
    }

    list.innerHTML = '';
    Object.entries(store).forEach(([id, c]) => {
      const card = document.createElement('div');
      card.className = 'comment-card';
      card.innerHTML = `
        <div class="comment-quote">"${escapeHtml(c.quote)}"</div>
        <div class="comment-body">${escapeHtml(c.text)}</div>
        <div class="comment-row-actions">
          <button data-edit="${id}">Edit</button>
          <button data-del="${id}" class="danger">Remove</button>
        </div>
      `;
      list.appendChild(card);
    });

    list.querySelectorAll('[data-del]').forEach(b => {
      b.addEventListener('click', withLock(() => {
        const id = b.dataset.del;
        delete store[id];
        const el = docEl.querySelector(`[data-id="${id}"]`);
        if (el) el.classList.remove('commented');
        refreshBadge(stage);
        renderSheet();
      }));
    });

    list.querySelectorAll('[data-edit]').forEach(b => {
      b.addEventListener('click', withLock(() => {
        const id = b.dataset.edit;
        closeSheet();
        const el = docEl.querySelector(`[data-id="${id}"]`);
        if (el) {
          el.scrollIntoView({ block: 'center', behavior: 'smooth' });
          openComposer(el);
        }
      }));
    });
  };

  const openSheet = () => {
    renderSheet();
    if (backdrop) backdrop.classList.add('open');
    if (sheet) sheet.classList.add('open');
  };

  const closeSheet = () => {
    if (backdrop) backdrop.classList.remove('open');
    if (sheet) sheet.classList.remove('open');
  };

  if (cancelBtn) cancelBtn.addEventListener('click', withLock(closeSheet));
  if (backdrop) backdrop.addEventListener('click', withLock(closeSheet));

  const revBtnId = stage === 'plan' ? 'reviewBtnPlan' :
                   stage === 'structure' ? 'reviewBtnStruct' :
                   stage === 'diagram' ? 'reviewBtnDiagram' : 'reviewBtnFinal';
  const revBtn = document.getElementById(revBtnId);
  if (revBtn) revBtn.addEventListener('click', withLock(openSheet));

  if (submitBtn) {
    submitBtn.addEventListener('click', withLock(async () => {
      const store = getStore();
      if (Object.keys(store).length === 0) return;
      closeSheet();

      // Open Interview in REVISION CONTEXT
      showScreen('interview', {
        isRevision: true,
        revisionContext: {
          targetStage: stage,
          noun: REVISION_META[stage].noun,
          pendingComments: { ...store }
        }
      });
      runRevisionPipeline(stage);
    }));
  }
}

/* ============================================================
   DETERMINISTIC BLUEPRINT SVG RENDERERS (Screen 05)
   ============================================================ */
function blueprintFrame(dwgNo, dwgLabel, bodySvg, stampLine) {
  return `
  <svg class="diagram-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 500">
    <defs>
      <pattern id="gp-${dwgNo}" width="20" height="20" patternUnits="userSpaceOnUse">
        <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(92,138,166,0.14)" stroke-width="1"/>
      </pattern>
      <marker id="arrow-${dwgNo}" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--blueprint-cyan)" />
      </marker>
      <marker id="arrow-o-${dwgNo}" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent-orange)" />
      </marker>
    </defs>
    <rect width="1000" height="500" fill="#0A1422" />
    <rect width="1000" height="500" fill="url(#gp-${dwgNo})" />
    <rect x="15" y="15" width="970" height="470" fill="none" stroke="rgba(92,138,166,0.35)" stroke-width="1.5" stroke-dasharray="8 4"/>
    <text x="30" y="38" fill="var(--blueprint-cyan)" font-family="var(--font-mono)" font-size="11" font-weight="600">${dwgLabel}</text>
    ${bodySvg}
    <g transform="translate(730, 430)">
      <rect width="245" height="45" fill="var(--bg-surface-elevated)" stroke="var(--border-line)" stroke-width="1"/>
      <text x="10" y="16" fill="var(--ink-muted)" font-family="var(--font-mono)" font-size="9">SCALE: 1:1 | PROJ: MIMAR-STUDIO</text>
      <text x="10" y="32" fill="var(--blueprint-cyan)" font-family="var(--font-mono)" font-size="10" font-weight="700">${stampLine}</text>
    </g>
  </svg>`;
}

function renderArchitectureSVG() {
  const isAuditRejected = !!STATE.rejectedFeatures['f3'];
  const auditPath = isAuditRejected ? '' : `
    <path d="M 710 300 L 710 350 L 630 350" stroke="var(--accent-orange)" stroke-width="2" stroke-dasharray="4 4" marker-end="url(#arrow-o-arch)" />
    <text x="670" y="340" fill="var(--accent-orange)" font-family="var(--font-mono)" font-size="10" text-anchor="middle">Audit write (async)</text>

    <path d="M 850 260 L 850 320 L 790 320" stroke="var(--blueprint-cyan)" stroke-width="2" marker-end="url(#arrow-arch)" />
    <text x="850" y="300" fill="var(--ink-muted)" font-family="var(--font-mono)" font-size="9" text-anchor="middle">persists</text>
  `;
  const tablesSummary = isAuditRejected ? 'users · loans' : 'users · loans · audit_logs';

  const body = `
    <path d="M 210 220 L 290 220" stroke="var(--blueprint-cyan)" stroke-width="2" marker-end="url(#arrow-arch)" />
    <text x="250" y="210" fill="var(--ink-muted)" font-family="var(--font-mono)" font-size="10" text-anchor="middle">HTTPS / REST</text>

    <path d="M 450 220 L 550 180" stroke="var(--blueprint-cyan)" stroke-width="2" marker-end="url(#arrow-arch)" />
    <text x="490" y="185" fill="var(--ink-muted)" font-family="var(--font-mono)" font-size="10" text-anchor="middle">JWT issue</text>

    <path d="M 550 240 L 630 240" stroke="var(--blueprint-cyan)" stroke-width="2" marker-end="url(#arrow-arch)" />
    <text x="590" y="230" fill="var(--ink-muted)" font-family="var(--font-mono)" font-size="10" text-anchor="middle">Token verify</text>

    <path d="M 790 220 L 850 220" stroke="var(--blueprint-cyan)" stroke-width="2" marker-end="url(#arrow-arch)" />
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
  `;
  const withMarkers = body.replaceAll('arrow-arch', 'arrow-A').replaceAll('arrow-o-arch', 'arrow-o-A');
  return blueprintFrame('A', 'DWG NO. ARCH-2026-MIMAR-01 // SYSTEM ARCHITECTURE BLUEPRINT', withMarkers, 'MIMAR AI VALIDATED BLUEPRINT');
}

function renderERDSVG() {
  const isAuditRejected = !!STATE.rejectedFeatures['f3'];
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

  const body = `
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
  `;
  return blueprintFrame('E', 'DWG NO. ERD-2026-MIMAR-02 // DATABASE SCHEMA BLUEPRINT', body, 'MIMAR AI VALIDATED BLUEPRINT');
}

async function renderDiagram(kind) {
  const paneArch = document.getElementById('paneArch');
  const paneErd = document.getElementById('paneErd');
  if (kind === 'arch' && paneArch) {
    paneArch.innerHTML = renderArchitectureSVG();
  } else if (kind === 'erd' && paneErd) {
    paneErd.innerHTML = renderERDSVG();
  }
}

function switchDiagramView(kind) {
  STATE.currentDiagramView = kind;
  const btnArch = document.getElementById('btnArch');
  const btnErd = document.getElementById('btnErd');
  const paneArch = document.getElementById('paneArch');
  const paneErd = document.getElementById('paneErd');
  const canvasTitle = document.getElementById('canvasTitle');
  const canvasSub = document.getElementById('canvasSub');
  const askTarget = document.getElementById('askTarget');

  if (btnArch) btnArch.classList.toggle('active', kind === 'arch');
  if (btnErd) btnErd.classList.toggle('active', kind === 'erd');
  if (paneArch) paneArch.classList.toggle('active', kind === 'arch');
  if (paneErd) paneErd.classList.toggle('active', kind === 'erd');

  if (canvasTitle) canvasTitle.textContent = kind === 'arch' ? 'System Architecture Blueprint' : 'Database ERD Blueprint';
  if (canvasSub) canvasSub.textContent = kind === 'arch' ? '3 SERVICES · FASTAPI / NEXT.JS / POSTGRES' : '3 TABLES · REFERENTIAL INTEGRITY VALIDATED';
  if (askTarget) askTarget.textContent = kind === 'arch' ? 'System Architecture' : 'Database ERD';

  renderDiagram(kind);
}

/* ============================================================
   ASK AI CHAT (Rendered Diagram Screen ONLY)
   ============================================================ */
const STRUCTURAL_KEYWORDS = [
  'remove table', 'delete table', 'drop table', 'remove service', 'delete service',
  'remove feature', 'change relationship', 'merge table', 'split service', 'drop column role',
  'remove auth', 'delete loan'
];

function classifyAskRequest(text) {
  const lower = text.toLowerCase();
  return STRUCTURAL_KEYWORDS.some(k => lower.includes(k)) ? 'structural' : 'cosmetic';
}

function setupAskAi() {
  const askAiBtn = document.getElementById('askAiBtn');
  const askBackdrop = document.getElementById('sheetBackdropAsk');
  const askSheet = document.getElementById('askSheet');
  const askClose = document.getElementById('askClose');
  const askMessages = document.getElementById('askMessages');
  const askComposer = document.getElementById('askComposer');
  const askSend = document.getElementById('askSend');

  const openAsk = () => {
    if (STATE.diagramAccepted) return; // Read-only
    if (askBackdrop) askBackdrop.classList.add('open');
    if (askSheet) askSheet.classList.add('open');
    const askTarget = document.getElementById('askTarget');
    if (askTarget) askTarget.textContent = STATE.currentDiagramView === 'arch' ? 'System Architecture' : 'Database ERD';
  };

  const closeAsk = () => {
    if (askBackdrop) askBackdrop.classList.remove('open');
    if (askSheet) askSheet.classList.remove('open');
  };

  if (askAiBtn) askAiBtn.addEventListener('click', withLock(openAsk));
  if (askClose) askClose.addEventListener('click', withLock(closeAsk));
  if (askBackdrop) askBackdrop.addEventListener('click', withLock(closeAsk));

  const addAskUser = (text) => {
    const row = document.createElement('div');
    row.className = 'arow user';
    row.innerHTML = `<div class="abubble user"></div>`;
    row.querySelector('.abubble').textContent = text;
    askMessages.appendChild(row);
    askMessages.scrollTop = askMessages.scrollHeight;
  };

  const addAskAi = (html) => {
    const row = document.createElement('div');
    row.className = 'arow ai';
    row.innerHTML = `<div><div class="eyebrow">MimarAi</div><div class="abubble ai">${html}</div></div>`;
    askMessages.appendChild(row);
    askMessages.scrollTop = askMessages.scrollHeight;
    return row;
  };

  const setAskSendState = (state) => {
    if (!askSend) return;
    if (state === 'stop') {
      askSend.className = 'ask-send stop';
      askSend.setAttribute('aria-label', 'Stop generation');
      askSend.setAttribute('title', 'Stop ongoing AI generation');
      askSend.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`;
    } else if (state === 'ready') {
      askSend.className = 'ask-send ready';
      askSend.setAttribute('aria-label', 'Send message');
      askSend.setAttribute('title', 'Send to Ask AI (Enter)');
      askSend.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>`;
    } else {
      askSend.className = 'ask-send';
      askSend.setAttribute('aria-label', 'Send message');
      askSend.setAttribute('title', 'Type a request first');
      askSend.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>`;
    }
  };

  const handleSend = async () => {
    // If Ask AI is currently running, clicking this button STOPS the generation
    if (STATE.askAiRunning) {
      if (STATE.askAbortController) {
        STATE.askAbortController.abort();
      }
      return;
    }

    const text = askComposer.value.trim();
    if (!text || STATE.operationRunning) return;

    const controller = new AbortController();
    STATE.askAbortController = controller;
    STATE.askAiRunning = true;
    setOperationRunning(true);
    setAskSendState('stop');
    askComposer.disabled = true;

    addAskUser(text);
    askComposer.value = '';
    askComposer.style.height = 'auto';

    const statusRow = document.createElement('div');
    statusRow.className = 'arow ai';
    statusRow.innerHTML = `<div class="status-row"><div class="status-dot"></div><div class="status-text">Classifying request (Gemini + Groq)…</div></div>`;
    askMessages.appendChild(statusRow);
    askMessages.scrollTop = askMessages.scrollHeight;

    try {
      await sleep(650);
      if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      statusRow.remove();

      const kind = classifyAskRequest(text);

      if (kind === 'cosmetic') {
        addAskAi(`Applying cosmetic modification.<div class="classify-tag cosmetic">Cosmetic change</div>`);
        await sleep(600);
        if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');

        addAskAi(`Updated working diagram JSON — Gemini modified and Groq validated. Re-rendered the blueprint canvas.`);
        renderDiagram(STATE.currentDiagramView);
        showToast("Diagram re-rendered. Working JSON updated (not yet merged to Plan).");
      } else {
        const msgRow = addAskAi(`
          This request introduces a <b>structural conflict</b> against an upstream locked feature or structure. It is refused by default to preserve project state integrity.
          <div class="classify-tag structural">Structural conflict</div>
          <div class="confirm-row">
            <button class="force-btn" id="forceBtnLive">Force override &amp; Propagate Upstream</button>
            <button class="cancel-btn" id="cancelForceLive">Cancel</button>
          </div>
        `);

        const forceBtn = msgRow.querySelector('#forceBtnLive');
        const cancelBtn = msgRow.querySelector('#cancelForceLive');

        if (forceBtn) {
          forceBtn.addEventListener('click', async () => {
            if (STATE.askAiRunning) return;
            forceBtn.disabled = true;
            addAskUser('Yes, force override and propagate upstream.');

            const statusRow2 = document.createElement('div');
            statusRow2.className = 'arow ai';
            statusRow2.innerHTML = `<div class="status-row"><div class="status-dot"></div><div class="status-text">Propagating change into locked Feature &amp; Structure JSON…</div></div>`;
            askMessages.appendChild(statusRow2);
            askMessages.scrollTop = askMessages.scrollHeight;

            const controller2 = new AbortController();
            STATE.askAbortController = controller2;
            STATE.askAiRunning = true;
            setOperationRunning(true);
            setAskSendState('stop');

            try {
              await sleep(950);
              if (controller2.signal.aborted) throw new DOMException('Aborted', 'AbortError');
              statusRow2.remove();

              STATE.manuallyAmended = true;
              const amendedNote = document.getElementById('amendedNote');
              if (amendedNote) amendedNote.style.display = 'flex';

              addAskAi(`Done — the change was propagated into the locked feature &amp; structure JSON. The affected entity is now tagged <b>Manually Amended</b> across all views.`);
              renderDiagram(STATE.currentDiagramView);
              showToast("Upstream specifications updated and labeled 'Manually Amended'.");
            } catch (err) {
              if (err.name === 'AbortError') {
                if (statusRow2.parentNode) statusRow2.remove();
                addAskAi('<span style="color:var(--ink-muted)">Propagate override stopped by user.</span>');
                showToast("Ask AI override stopped.");
              }
            } finally {
              STATE.askAiRunning = false;
              STATE.askAbortController = null;
              setOperationRunning(false);
              setAskSendState(askComposer.value.trim() ? 'ready' : 'idle');
            }
          });
        }

        if (cancelBtn) {
          cancelBtn.addEventListener('click', () => {
            addAskAi('No changes were made. Project state remains locked and consistent.');
          });
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        if (statusRow.parentNode) statusRow.remove();
        addAskAi('<span style="color:var(--ink-muted)">AI generation stopped by user.</span>');
        showToast("Ask AI generation stopped.");
      }
    } finally {
      STATE.askAiRunning = false;
      STATE.askAbortController = null;
      setOperationRunning(false);
      askComposer.disabled = false;
      setAskSendState(askComposer.value.trim() ? 'ready' : 'idle');
    }
  };

  if (askSend) askSend.addEventListener('click', handleSend);
  if (askComposer) {
    askComposer.addEventListener('input', () => {
      if (STATE.askAiRunning) return;
      askComposer.style.height = 'auto';
      askComposer.style.height = Math.min(askComposer.scrollHeight, 100) + 'px';
      setAskSendState(askComposer.value.trim().length > 0 ? 'ready' : 'idle');
    });
    askComposer.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });
  }
}

/* ============================================================
   MCP SERVER & DRIFT-CHECK LOGIC (Screen 07)
   ============================================================ */
function setupMcpScreen() {
  const tokenVal = document.getElementById('tokenValue');
  const copyTokenBtn = document.getElementById('copyTokenBtn');
  const regenTokenBtn = document.getElementById('regenTokenBtn');
  const pdfDownloadBtn = document.getElementById('pdfDownloadBtn');
  const runDriftBtn = document.getElementById('runDriftBtn');

  // Display initial masked token
  if (tokenVal) tokenVal.textContent = STATE.mcpToken.slice(0, 8) + '••••••••••••••••';

  if (copyTokenBtn) {
    copyTokenBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(STATE.mcpToken).catch(() => {});
      copyTokenBtn.textContent = '✓ COPIED';
      if (tokenVal) tokenVal.textContent = STATE.mcpToken;
      setTimeout(() => {
        copyTokenBtn.textContent = 'COPY TOKEN';
        if (tokenVal) tokenVal.textContent = STATE.mcpToken.slice(0, 8) + '••••••••••••••••';
      }, 2500);
      showToast("MCP project token copied to clipboard.");
    });
  }

  if (regenTokenBtn) {
    regenTokenBtn.addEventListener('click', () => {
      const confirmRegen = confirm("Regenerate MCP token? Any existing agent connections using the old token will stop working.");
      if (!confirmRegen) return;
      STATE.mcpToken = 'mim_live_' + Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
      if (tokenVal) tokenVal.textContent = STATE.mcpToken;
      showToast("New project token generated (stored securely hashed).");
    });
  }

  // Per-agent snippet copies
  document.querySelectorAll('.agent-copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const agent = btn.dataset.agent;
      let snippet = '';
      if (agent === 'claude') {
        snippet = `// CLAUDE.md\n{\n  "mcpServers": {\n    "mimarai": {\n      "url": "https://mimarai-backend.onrender.com/mcp",\n      "headers": { "Authorization": "Bearer ${STATE.mcpToken}" }\n    }\n  }\n}`;
      } else if (agent === 'cursor') {
        snippet = `// .cursorrules / mcp.json\n{\n  "mcpServers": {\n    "mimarai": {\n      "url": "https://mimarai-backend.onrender.com/mcp",\n      "token": "${STATE.mcpToken}"\n    }\n  }\n}`;
      } else {
        snippet = `// AGENTS.md\n{\n  "tools": ["get_implementation_plan", "check_drift"],\n  "server": "https://mimarai-backend.onrender.com/mcp",\n  "auth_token": "${STATE.mcpToken}"\n}`;
      }
      navigator.clipboard.writeText(snippet).catch(() => {});
      btn.classList.add('copied');
      btn.textContent = '✓ COPIED';
      setTimeout(() => {
        btn.classList.remove('copied');
        btn.textContent = 'COPY CONFIG';
      }, 2200);
      showToast(`Config snippet for ${agent.toUpperCase()} copied with project token.`);
    });
  });

  if (pdfDownloadBtn) {
    pdfDownloadBtn.addEventListener('click', () => {
      showToast("Generating standalone machine-readable Implementation Plan JSON package…");
      const isAuditRejected = !!STATE.rejectedFeatures['f3'];
      const structExport = {
        "src/routes/loan.py": ["Loan & Interest Management"],
        "src/models/loan.py": ["Loan & Interest Management"],
        "src/routes/auth.py": ["Role-Based Access Control"],
        "src/models/refresh_token.py": ["Role-Based Access Control"]
      };
      if (!isAuditRejected) {
        structExport["src/models/audit_log.py"] = ["Audit Logging"];
      }
      const schemaTables = isAuditRejected ? ["users", "loans"] : ["users", "loans", "audit_logs"];

      setTimeout(() => {
        const fakeBlob = new Blob([
          JSON.stringify({
            project: "MimarAi — Loan Desk",
            version: "1.0-validated",
            validated_by: ["Gemini Flash", "Groq Llama 3.3"],
            structure: structExport,
            schema: {
              tables: schemaTables,
              services: ["API Gateway", "Auth Service", "Loan Service"]
            }
          }, null, 2)
        ], { type: 'application/json' });
        const url = URL.createObjectURL(fakeBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'MimarAi_Implementation_Plan_Validated.json';
        a.click();
        URL.revokeObjectURL(url);
        showToast("Implementation Plan downloaded successfully.");
      }, 600);
    });
  }

  if (runDriftBtn) {
    runDriftBtn.addEventListener('click', async () => {
      runDriftBtn.disabled = true;
      runDriftBtn.textContent = 'Running Dual-Model Drift Check…';

      showToast("Scanning codebase against structure map & schema JSON (Gemini + Groq cross-check)…");
      await sleep(1400);

      const reportEl = document.getElementById('driftReport');
      if (reportEl) {
        reportEl.innerHTML = `
          <div class="drift-item">
            <span class="drift-badge implemented">✅ Implemented</span>
            <div class="drift-main">
              <div class="drift-name">Role-Based Access Control</div>
              <div class="drift-desc">src/routes/auth.py &amp; models/refresh_token.py verified. JWT scoping enforced.</div>
            </div>
          </div>
          <div class="drift-item">
            <span class="drift-badge implemented">✅ Implemented</span>
            <div class="drift-main">
              <div class="drift-name">Database Schema Conformance</div>
              <div class="drift-desc">3 tables (users, loans, audit_logs) match accepted column types and PK/FK constraints.</div>
            </div>
          </div>
          <div class="drift-item">
            <span class="drift-badge adjusted">⚠ Adjusted — Please Review</span>
            <div class="drift-main">
              <div class="drift-name">Loan &amp; Interest Management</div>
              <div class="drift-desc">Interest calculation interval set to hourly instead of nightly cron. Requires approval.</div>
            </div>
          </div>
          <div class="drift-item">
            <span class="drift-badge not-started">⚪ Not Started</span>
            <div class="drift-main">
              <div class="drift-name">Automated Audit Log Rotation</div>
              <div class="drift-desc">No code found in codebase yet — scheduled for subsequent agent sprint.</div>
            </div>
          </div>
        `;
      }

      runDriftBtn.disabled = false;
      runDriftBtn.textContent = 'Re-Run Drift Check';
      showToast("Drift Report generated: 2 Implemented, 1 Adjusted, 1 Not Started.");
    });
  }
}

/* ============================================================
   STEP 02 FEATURE REJECTION / UNDO & ACCEPT PROPAGATION
   ============================================================ */
function setupFeatureRejections() {
  const planDoc = document.getElementById('docContentPlan');
  if (!planDoc) return;

  planDoc.addEventListener('click', (e) => {
    const btn = e.target.closest('.feature-action-btn');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();

    if (STATE.planAccepted || STATE.operationRunning) return;

    const block = btn.closest('.block');
    if (!block) return;
    const featureId = btn.dataset.reject || block.dataset.id;
    const isCurrentlyRejected = !!STATE.rejectedFeatures[featureId];

    if (!isCurrentlyRejected) {
      // REJECT FEATURE
      STATE.rejectedFeatures[featureId] = true;
      block.classList.add('rejected');

      btn.className = 'feature-action-btn undo-btn';
      btn.textContent = 'Undo';
      btn.setAttribute('title', 'Undo rejection and restore this feature');
      btn.setAttribute('aria-label', 'Undo rejection of feature');

      const msg = block.querySelector('.rejected-msg');
      if (msg) msg.style.display = 'flex';

      const featureRow = block.querySelector('.feature-row');
      if (featureRow && !featureRow.querySelector('.rejected-chip')) {
        const chip = document.createElement('span');
        chip.className = 'rejected-chip';
        chip.textContent = 'REJECTED';
        const aiTag = featureRow.querySelector('.ai-tag');
        if (aiTag) aiTag.insertAdjacentElement('afterend', chip);
        else featureRow.appendChild(chip);
      }

      showToast("Feature rejected — marked as cut from Implementation Plan.");
    } else {
      // UNDO REJECTION
      delete STATE.rejectedFeatures[featureId];
      block.classList.remove('rejected');

      btn.className = 'feature-action-btn reject-btn';
      btn.textContent = 'Reject';
      btn.setAttribute('title', 'Reject this AI-added feature');
      btn.setAttribute('aria-label', 'Reject this AI-added feature');

      const msg = block.querySelector('.rejected-msg');
      if (msg) msg.style.display = 'none';

      const chip = block.querySelector('.rejected-chip');
      if (chip) chip.remove();

      showToast("Feature restored to active Implementation Plan.");
    }
  });
}

function applyAcceptedPlanToDownstream() {
  const isAuditRejected = !!STATE.rejectedFeatures['f3'];
  const isRecalcRejected = !!STATE.rejectedFeatures['f4'];

  // 1. Step 03: Project Structure
  const auditFileRow = document.querySelector('[data-id="f-audit-model"]');
  const modelsCount = document.getElementById('modelsCount');
  const structMeta = document.getElementById('structMeta');

  if (auditFileRow) {
    if (isAuditRejected) {
      auditFileRow.style.display = 'none';
      if (modelsCount) modelsCount.textContent = '1 file';
      if (structMeta) structMeta.textContent = '3 FILES · 2 FEATURES MAPPED';
    } else {
      auditFileRow.style.display = 'flex';
      if (modelsCount) modelsCount.textContent = '2 files';
      if (structMeta) structMeta.textContent = '4 FILES · 3 FEATURES MAPPED';
    }
  }

  // 2. Step 04: Diagram JSON
  const auditTableCard = document.querySelector('.table-card[data-id="t-audit"]');
  if (auditTableCard) {
    auditTableCard.style.display = isAuditRejected ? 'none' : 'block';
  }
  const diagramSub = document.querySelector('#screen-diagram .toolbar .sub span');
  if (diagramSub) {
    diagramSub.textContent = isAuditRejected ? '2 TABLES · 3 SERVICES' : '3 TABLES · 3 SERVICES';
  }

  // 3. Step 06: Final Consolidated Plan
  const ff3 = document.querySelector('.block[data-id="ff3"]');
  const ff4 = document.querySelector('.block[data-id="ff4"]');
  if (ff3) {
    ff3.style.display = isAuditRejected ? 'none' : 'block';
  }
  if (ff4) {
    ff4.style.display = isRecalcRejected ? 'none' : 'block';
  }

  const ffs1 = document.querySelector('.block[data-id="ffs1"] .json-summary');
  if (ffs1) {
    if (isAuditRejected) {
      ffs1.innerHTML = `{<br>&nbsp;&nbsp;<span class="jk">"src/routes/loan.py"</span>: ["Loan &amp; Interest Management"],<br>&nbsp;&nbsp;<span class="jk">"src/models/loan.py"</span>: ["Loan &amp; Interest Management"],<br>&nbsp;&nbsp;<span class="jk">"src/routes/auth.py"</span>: ["Role-Based Access Control"],<br>&nbsp;&nbsp;<span class="jk">"src/models/refresh_token.py"</span>: ["Role-Based Access Control"]<br>}`;
    } else {
      ffs1.innerHTML = `{<br>&nbsp;&nbsp;<span class="jk">"src/routes/loan.py"</span>: ["Loan &amp; Interest Management"],<br>&nbsp;&nbsp;<span class="jk">"src/models/loan.py"</span>: ["Loan &amp; Interest Management"],<br>&nbsp;&nbsp;<span class="jk">"src/routes/auth.py"</span>: ["Role-Based Access Control"],<br>&nbsp;&nbsp;<span class="jk">"src/models/refresh_token.py"</span>: ["Role-Based Access Control"],<br>&nbsp;&nbsp;<span class="jk">"src/models/audit_log.py"</span>: ["Audit Logging"]<br>}`;
    }
  }

  const ffd1 = document.querySelector('.block[data-id="ffd1"] span.kv');
  if (ffd1) {
    if (isAuditRejected) {
      ffd1.innerHTML = `<b>2 database tables</b> (<code>users</code>, <code>loans</code>) &amp; <b>3 microservices</b> (<code>API Gateway</code>, <code>Auth Service</code>, <code>Loan Service</code>). Committed on diagram acceptance.`;
    } else {
      ffd1.innerHTML = `<b>3 database tables</b> (<code>users</code>, <code>loans</code>, <code>audit_logs</code>) &amp; <b>3 microservices</b> (<code>API Gateway</code>, <code>Auth Service</code>, <code>Loan Service</code>). Committed on diagram acceptance.`;
    }
  }

  // 4. Invalidate rendered cache so SVG diagrams re-render dynamically
  STATE.renderedCache = { arch: false, erd: false };
}

/* ============================================================
   ACCEPT STAGE HANDLERS (Locks and moves to next)
   ============================================================ */
function setupAcceptButtons() {
  // Screen 02: Plan Accept
  const acceptBtnPlan = document.getElementById('acceptBtnPlan');
  if (acceptBtnPlan) {
    acceptBtnPlan.addEventListener('click', withLock(async () => {
      if (STATE.planAccepted) return;

      const commentCount = Object.keys(STATE.planComments).length;
      if (commentCount > 0) {
        showToast(`⚠ Cannot accept plan with ${commentCount} pending comment(s). Click "Review Comments" to submit them for AI revision, or delete your comments to accept.`);
        const revBtn = document.getElementById('reviewBtnPlan');
        if (revBtn) {
          revBtn.classList.add('pulse-attention');
          setTimeout(() => revBtn.classList.remove('pulse-attention'), 1500);
        }
        return;
      }

      acceptBtnPlan.disabled = true;
      acceptBtnPlan.textContent = 'Locking Plan…';
      await sleep(500);

      STATE.planAccepted = true;
      applyAcceptedPlanToDownstream();
      showToast("Implementation Plan locked as accepted. Moving to Step 03 (Project Structure).");
      showScreen('structure');
    }));
  }

  // Screen 03: Structure Accept
  const acceptBtnStruct = document.getElementById('acceptBtnStruct');
  if (acceptBtnStruct) {
    acceptBtnStruct.addEventListener('click', withLock(async () => {
      if (STATE.structureAccepted) return;

      const commentCount = Object.keys(STATE.structureComments).length;
      if (commentCount > 0) {
        showToast(`⚠ Cannot accept structure with ${commentCount} pending comment(s). Click "Review Comments" to submit them for AI revision, or delete your comments to accept.`);
        const revBtn = document.getElementById('reviewBtnStruct');
        if (revBtn) {
          revBtn.classList.add('pulse-attention');
          setTimeout(() => revBtn.classList.remove('pulse-attention'), 1500);
        }
        return;
      }

      acceptBtnStruct.disabled = true;
      acceptBtnStruct.textContent = 'Locking Structure…';
      await sleep(500);

      STATE.structureAccepted = true;
      showToast("Project Structure locked as accepted. Moving to Step 04 (Schema & Architecture JSON).");
      showScreen('diagram');
    }));
  }

  // Screen 04: Diagram JSON Accept & Render
  const acceptBtnDiagram = document.getElementById('acceptBtnDiagram');
  if (acceptBtnDiagram) {
    acceptBtnDiagram.addEventListener('click', withLock(async () => {
      if (STATE.diagramJsonAccepted) return;

      const commentCount = Object.keys(STATE.diagramJsonComments).length;
      if (commentCount > 0) {
        showToast(`⚠ Cannot accept schema JSON with ${commentCount} pending comment(s). Click "Review Comments" to submit them for AI revision, or delete your comments to accept.`);
        const revBtn = document.getElementById('reviewBtnDiagram');
        if (revBtn) {
          revBtn.classList.add('pulse-attention');
          setTimeout(() => revBtn.classList.remove('pulse-attention'), 1500);
        }
        return;
      }

      acceptBtnDiagram.disabled = true;
      acceptBtnDiagram.textContent = 'Rendering Blueprint…';
      await sleep(500);

      STATE.diagramJsonAccepted = true;
      renderDiagram('arch');
      showToast("Schema JSON accepted. Rendered blueprints on Step 05.");
      showScreen('render');
    }));
  }

  // Screen 05: Diagram Accept (Commits to Implementation Plan)
  const acceptBtnRender = document.getElementById('acceptBtnRender');
  if (acceptBtnRender) {
    acceptBtnRender.addEventListener('click', withLock(async () => {
      if (STATE.diagramAccepted) return;

      if (STATE.askAiRunning || STATE.operationRunning) {
        showToast("⚠ Cannot accept diagram while Ask AI is actively generating modifications. Please wait for Ask AI to finish, or click the Stop button.");
        const askSend = document.getElementById('askSend');
        if (askSend) {
          askSend.classList.add('pulse-attention');
          setTimeout(() => askSend.classList.remove('pulse-attention'), 1500);
        }
        return;
      }

      acceptBtnRender.disabled = true;
      acceptBtnRender.textContent = 'Committing into Plan…';
      await sleep(500);

      STATE.diagramAccepted = true;
      showToast("Diagrams accepted and committed into the final Consolidated Plan.");
      showScreen('final');
    }));
  }

  // Screen 06: Final Plan Accept (Send to Agent)
  const acceptBtnFinal = document.getElementById('acceptBtnFinal');
  if (acceptBtnFinal) {
    acceptBtnFinal.addEventListener('click', withLock(async () => {
      if (STATE.finalAccepted) return;

      const commentCount = Object.keys(STATE.finalComments).length;
      if (commentCount > 0) {
        showToast(`⚠ Cannot dispatch plan with ${commentCount} pending comment(s). Click "Review Comments" to submit them for AI revision, or delete your comments to dispatch.`);
        const revBtn = document.getElementById('reviewBtnFinal');
        if (revBtn) {
          revBtn.classList.add('pulse-attention');
          setTimeout(() => revBtn.classList.remove('pulse-attention'), 1500);
        }
        return;
      }

      acceptBtnFinal.disabled = true;
      acceptBtnFinal.textContent = 'Dispatching to Agent…';
      await sleep(650);

      STATE.finalAccepted = true;
      showToast("Plan fully validated and dispatched! Opening MCP Server connection hub.");
      showScreen('mcp');
    }));
  }
}

/* ============================================================
   INIT & EVENT LISTENERS
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  // Setup feature rejections (Step 02 Only)
  setupFeatureRejections();

  // Setup comment systems on all 4 review screens
  setupCommentSystem('plan', 'docContentPlan', 'sheetBackdropPlan', 'reviewSheetPlan', 'sheetListPlan', 'sheetSubPlan', 'sheetSubmitPlan', 'sheetCancelPlan');
  setupCommentSystem('structure', 'docStruct', 'sheetBackdropStruct', 'reviewSheetStruct', 'sheetListStruct', 'sheetSubStruct', 'sheetSubmitStruct', 'sheetCancelStruct');
  setupCommentSystem('diagram', 'docDiagram', 'sheetBackdropDiagram', 'reviewSheetDiagram', 'sheetListDiagram', 'sheetSubDiagram', 'sheetSubmitDiagram', 'sheetCancelDiagram');
  setupCommentSystem('final', 'docFinal', 'sheetBackdropFinal', 'reviewSheetFinal', 'sheetListFinal', 'sheetSubFinal', 'sheetSubmitFinal', 'sheetCancelFinal');

  // Setup accept buttons
  setupAcceptButtons();

  // Setup ask AI
  setupAskAi();

  // Setup MCP
  setupMcpScreen();

  // Folder collapse toggle in structure screen
  document.querySelectorAll('.folder-row').forEach(row => {
    row.addEventListener('click', () => {
      row.classList.toggle('open');
      const target = document.getElementById(row.dataset.target);
      if (target) target.classList.toggle('open');
    });
  });

  // Diagram switch buttons
  const btnArch = document.getElementById('btnArch');
  const btnErd = document.getElementById('btnErd');
  if (btnArch) btnArch.addEventListener('click', () => switchDiagramView('arch'));
  if (btnErd) btnErd.addEventListener('click', () => switchDiagramView('erd'));

  // Chat composer events
  if (composerEl) {
    composerEl.addEventListener('input', () => {
      autoGrow();
      if (!STATE.operationRunning) {
        setSendButtonState(composerEl.value.trim() ? 'ready' : 'idle');
      }
    });
    composerEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (sendBtnEl) sendBtnEl.click();
      }
    });
  }

  if (sendBtnEl) {
    sendBtnEl.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (STATE.operationRunning) {
        if (STATE.activeController) {
          STATE.activeController.abort();
        }
        return;
      }
      const text = composerEl.value.trim();
      if (!text) return;
      addUserBubble(text);
      composerEl.value = '';
      autoGrow();
      setSendButtonState('idle');

      if (STATE.interviewMode === 'revision' && STATE.revisionContext) {
        runRevisionPipeline(STATE.revisionContext.targetStage);
      } else {
        runIdeaPipeline(text);
      }
    });
  }

  // Navbar shortcut clicks
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const target = item.dataset.screen;
      if (!target) return;
      showScreen(target);
    });
  });

  // Brand logo click in app header — Preserves state & allows returning to current progress
  document.querySelectorAll('.brand-logo').forEach(logoLink => {
    logoLink.addEventListener('click', (e) => {
      e.preventDefault();
      saveProjectState();
      window.location.href = 'index.html';
    });
  });

  // Header Stop Generation button click — Halts generation on any screen, resets session, and navigates to landing with toast
  const headerLandingBtn = document.getElementById('headerLandingBtn');
  if (headerLandingBtn) {
    headerLandingBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (STATE.activeController) STATE.activeController.abort();
      if (STATE.askAbortController) STATE.askAbortController.abort();
      clearProjectState();
      try {
        sessionStorage.setItem('mimarai_toast', 'Generation stopped by user.');
      } catch (err) {}
      window.location.href = 'index.html';
    });
  }

  // Restore saved session if user is returning from landing page, else start fresh
  const restored = restoreProjectState();
  if (!restored) {
    showScreen('interview');
  }
});
