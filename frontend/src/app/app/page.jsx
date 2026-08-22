"use client";

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
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
import OnboardingNameModal from '../../components/OnboardingNameModal';
import { useMimarStore } from '../../store/mimarStore';
import '../../styles/app.css';
import '../../styles/auth.css';

export default function BlueprintWizardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const {
    currentScreen,
    finalAccepted,
    toastMessage,
    restoreProjectState,
    showToast
  } = useMimarStore();

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login?redirectTo=/app');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user) return;
    document.body.style.overflow = "hidden";
    const restored = restoreProjectState();
    if (restored) {
      showToast("Resumed your Blueprint Wizard session right where you left off.");
    }
    return () => {
      document.body.style.overflow = "auto";
      document.body.style.height = "auto";
      document.documentElement.style.overflow = "auto";
    };
  }, [user]);

  if (authLoading) {
    return (
      <div className="auth-page-root">
        <div className="auth-card" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ color: 'var(--blueprint-cyan)', fontFamily: 'var(--font-mono)' }}>Verifying security credentials…</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="auth-page-root">
        <div className="auth-card" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ color: 'var(--accent-orange)', fontFamily: 'var(--font-mono)' }}>Redirecting to login…</div>
        </div>
      </div>
    );
  }

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
      {/* Toast Notification Container */}
      <div className={`toast ${toastMessage ? 'show' : ''}`} id="toast">
        {toastMessage}
      </div>

      {/* Mandatory Onboarding Name Modal */}
      <OnboardingNameModal />
    </div>
  );
}
