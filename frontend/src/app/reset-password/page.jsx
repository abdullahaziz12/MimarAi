"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import { validatePasswordRules } from '../../lib/passwordValidation';
import '../../styles/auth.css';

export default function ResetPasswordPage() {
  const router = useRouter();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorBanner, setErrorBanner] = useState('');
  const [successBanner, setSuccessBanner] = useState('');

  const pwdValidation = validatePasswordRules(password);
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;
  const canSubmit = pwdValidation.isValid && passwordsMatch;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorBanner('');
    setSuccessBanner('');

    if (!canSubmit) return;

    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setErrorBanner(error.message || 'Failed to reset password. Link may have expired.');
      } else {
        sessionStorage.setItem("mimarai_toast", "Password updated successfully");
        setSuccessBanner('Password reset successfully! Redirecting…');
        setTimeout(() => {
          router.push('/');
        }, 1500);
      }
    } catch (err) {
      setErrorBanner('Failed to reset password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page-root">
      <Link href="/" className="auth-header-brand" title="MimarAi Home">
        <img src="/assets/mimarai-logo-hero.png" alt="MimarAi Emblem" className="auth-header-logo" />
        <span className="auth-header-subtitle">Precision Architecture &amp; Planning Studio</span>
      </Link>

      <div className="auth-card">
        <h3 style={{ fontSize: 18, margin: '0 0 6px', color: 'var(--ink-primary)' }}>Set New Password</h3>
        <p style={{ fontSize: 13, color: 'var(--ink-secondary)', margin: '0 0 20px', lineHeight: 1.4 }}>
          Please choose a strong password conforming to our architectural security standards.
        </p>

        {errorBanner && (
          <div className="auth-error-banner">
            <span>{errorBanner}</span>
          </div>
        )}
        {successBanner && (
          <div className="auth-info-banner" style={{ borderColor: 'var(--success-green)', color: 'var(--success-green)' }}>
            <span>{successBanner}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label className="form-label" htmlFor="resetPwd">
              New Password <span className="req">*</span>
            </label>
            <input
              id="resetPwd"
              type="password"
              className="form-input"
              placeholder="Enter new password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              autoFocus
            />

            {/* Strength Indicator */}
            {password.length > 0 && (
              <div className="pwd-strength-wrap">
                <div className="pwd-strength-bar-bg">
                  <div className={`pwd-strength-bar-fill pwd-strength-fill ${pwdValidation.strength}`} />
                </div>
                <span className={`pwd-strength-label ${pwdValidation.strength}`}>
                  {pwdValidation.strength}
                </span>
              </div>
            )}

            {/* Rules Checklist */}
            {password.length > 0 && (
              <div className="pwd-checklist">
                {pwdValidation.rules.map((rule, idx) => (
                  <div key={idx} className={`pwd-rule ${rule.pass ? 'pass' : 'fail'}`}>
                    <span className="pwd-rule-dot" />
                    <span>{rule.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="resetConfirmPwd">
              Confirm New Password <span className="req">*</span>
            </label>
            <input
              id="resetConfirmPwd"
              type="password"
              className="form-input"
              placeholder="Re-enter new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
            {confirmPassword.length > 0 && !passwordsMatch && (
              <span style={{ fontSize: 11, color: 'var(--danger-red)', marginTop: 4 }}>
                Passwords do not match.
              </span>
            )}
          </div>

          <button
            type="submit"
            className="auth-submit-btn"
            disabled={submitting || !canSubmit}
          >
            {submitting ? 'Updating Password…' : 'Update Password & Continue →'}
          </button>
        </form>
      </div>
    </div>
  );
}
