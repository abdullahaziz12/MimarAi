"use client";

import React, { useState } from 'react';
import { useAuth, sanitizeName } from '../context/AuthContext';

export default function OnboardingNameModal() {
  const { user, profile, loading, updateProfileName } = useAuth();
  const [nameInput, setNameInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Show modal only if user exists, loading is finished, and profile name is empty
  const shouldShow = !!user && !loading && (!profile || !profile.name || profile.name.trim() === '');

  if (!shouldShow) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const clean = sanitizeName(nameInput);
    if (!clean) {
      setErrorMsg('Please enter a valid display name.');
      return;
    }
    setErrorMsg('');
    setSubmitting(true);
    try {
      await updateProfileName(clean);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to save name.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 9999 }}>
      <div className="modal-card">
        <div className="modal-head">
          <div>
            <h2 className="modal-title">Welcome to MimarAi</h2>
            <p className="modal-sub">What should we call you? Enter your name to complete onboarding.</p>
          </div>
        </div>

        {errorMsg && (
          <div className="auth-error-banner">
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label className="form-label" htmlFor="onboardName">
              <span>Your Display Name <span className="req">*</span></span>
              <span style={{ fontSize: 10, color: 'var(--ink-muted)' }}>MAX 60 CHARS</span>
            </label>
            <input
              id="onboardName"
              type="text"
              className="form-input"
              placeholder="e.g. Abdullah Aziz"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              maxLength={60}
              required
              autoFocus
            />
          </div>

          <button
            type="submit"
            className="auth-submit-btn"
            disabled={submitting || !nameInput.trim()}
          >
            {submitting ? 'Saving Name…' : 'Complete Setup & Continue →'}
          </button>
        </form>
      </div>
    </div>
  );
}
