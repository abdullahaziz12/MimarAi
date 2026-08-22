"use client";

import React, { useEffect } from 'react';
import AppHeader from '../../components/AppHeader';
import OpLockBar from '../../components/OpLockBar';
import AppNav from '../../components/AppNav';
import DiagnosticBadge from '../../components/DiagnosticBadge';
import InterviewScreen from '../../components/screens/InterviewScreen';
import PlanScreen from '../../components/screens/PlanScreen';
import StructureScreen from '../../components/screens/StructureScreen';
import DiagramScreen from '../../components/screens/DiagramScreen';
import RenderScreen from '../../components/screens/RenderScreen';
import FinalScreen from '../../components/screens/FinalScreen';
import McpScreen from '../../components/screens/McpScreen';
import { useMimarStore } from '../../store/mimarStore';
import '../../styles/app.css';

export default function BlueprintWizardPage() {
  const {
    currentScreen,
    finalAccepted,
    toastMessage,
    restoreProjectState,
    showToast
  } = useMimarStore();

  useEffect(() => {
    const restored = restoreProjectState();
    if (restored) {
      showToast("Resumed your Blueprint Wizard session right where you left off.");
    }
  }, []);

  return (
    <div className="app-shell" id="appShell">
      {/* GLOBAL APP HEADER */}
      <AppHeader />

      {/* OPERATION LOCK / PROCESSING STATUS BAR */}
      <OpLockBar />

      {/* APP BODY */}
      <div className="app-body">
        {/* LEFT NAVBAR SHORTCUTS */}
        <AppNav />

        {/* MAIN VIEWPORT WITH 7 SCREENS */}
        <main className="app-main" id="appMain">
          <InterviewScreen />
          <PlanScreen />
          <StructureScreen />
          <DiagramScreen />
          <RenderScreen />
          <FinalScreen />
          <McpScreen />
        </main>
      </div>

      {/* APP FOOTER */}
      <footer className="app-footer">
        <div className="hud-item">
          <div className="hud-dot" id="hudDot"></div>
          <span id="hudStatus">
            {finalAccepted
              ? 'STATUS: SPEC VALIDATED & AGENT READY'
              : 'STATUS: DRAFTING IN PROGRESS'}
          </span>
          <DiagnosticBadge />
        </div>
        <div className="hud-item">
          <span>GRID: 24px LOCK</span>
          <span>SCALE: 1:1</span>
          <span style={{ color: 'var(--blueprint-cyan)' }}>DWG: MIMAR-2026-PRODUCTION</span>
        </div>
      </footer>

      {/* TOAST NOTIFICATION */}
      {toastMessage && (
        <div className="toast show" id="toast">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
