"use client";

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { validatePasswordRules } from '../../lib/passwordValidation';
import '../../styles/auth.css';

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams?.get('redirectTo') || '/app';

  const { user, loading: authLoading } = useAuth();

  // ALL hooks must be called unconditionally before any return
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorBanner, setErrorBanner] = useState('');
  const [infoBanner, setInfoBanner] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [toastPopup, setToastPopup] = useState(null); // { type: 'success' | 'error', message: string }

  // Redirect to app/destination if already logged in
  useEffect(() => {
    if (!authLoading && user) {
      setToastPopup({ type: 'success', message: 'Login successful! Redirecting...' });
      const timer = setTimeout(() => {
        router.push(redirectTo);
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [user, authLoading, redirectTo, router]);

  useEffect(() => {
    let timer;
    if (resendCooldown > 0) {
      timer = setInterval(() => setResendCooldown(prev => prev - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Auto-dismiss toast after 3 seconds
  useEffect(() => {
    if (toastPopup) {
      const t = setTimeout(() => setToastPopup(null), 3500);
      return () => clearTimeout(t);
    }
  }, [toastPopup]);

  // Validation
  const pwdValidation = validatePasswordRules(password);
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;
  const canSubmitSignUp = pwdValidation.isValid && passwordsMatch && email.trim().length > 0;

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setErrorBanner('');
    setInfoBanner('');

    if (!email.trim() || !password) {
      setErrorBanner('Please enter both email and password.');
      return;
    }

    setSubmitting(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password
      });

      if (error) {
        // Generic error message for security / enumeration protection
        if (error.message?.toLowerCase().includes('email not confirmed')) {
          setMode('unverified');
        } else {
          setErrorBanner('Invalid email or password.');
        }
      } else if (data?.user) {
        router.push(redirectTo);
      }
    } catch (err) {
      setErrorBanner('Invalid email or password.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignUpSubmit = async (e) => {
    e.preventDefault();
    setErrorBanner('');
    setInfoBanner('');

    if (!canSubmitSignUp) return;

    setSubmitting(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password: password,
        options: {
          emailRedirectTo: `${window.location.origin}/app`
        }
      });

      if (error) {
        setErrorBanner(error.message || 'Could not complete registration. Please check your details.');
      } else {
        setMode('signup_success');
        setResendCooldown(60);
      }
    } catch (err) {
      setErrorBanner('Could not complete registration. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    setErrorBanner('');
    setInfoBanner('');

    if (!email.trim()) {
      setErrorBanner('Please enter your email address.');
      return;
    }

    setSubmitting(true);

    try {
      await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`
      });
    } catch (err) {
      // Ignore error for user enumeration protection
    } finally {
      setSubmitting(false);
      // Always show generic confirmation
      setInfoBanner("If an account exists for that email, we've sent a password reset link.");
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorBanner('');
    setSubmitting(true);
    try {
      const redirectUri = `${window.location.origin}/login?redirectTo=/app`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUri
        }
      });
      if (error) {
        setToastPopup({ type: 'error', message: 'Google Sign-In failed. Please try again.' });
        setErrorBanner(error.message || 'Google Sign-In failed.');
        setSubmitting(false);
      }
    } catch (err) {
      setToastPopup({ type: 'error', message: 'Google Sign-In failed. Please try again.' });
      setErrorBanner('Google Sign-In failed.');
      setSubmitting(false);
    }
  };

  const handleResendVerification = async () => {
    if (resendCooldown > 0 || !email.trim()) return;
    setSubmitting(true);
    try {
      await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/app`
        }
      });
      setInfoBanner('Verification email resent. Please check your inbox.');
      setResendCooldown(60);
    } catch (err) {
      setInfoBanner('Verification email sent if account exists.');
    } finally {
      setSubmitting(false);
    }
  };

  // Authenticated user: show success card (AFTER all hooks)
  if (user) {
    return (
      <div className="auth-page-root">
        {toastPopup && (
          <div style={{
            position: 'fixed', top: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 9999,
            padding: '14px 28px', borderRadius: 8,
            background: toastPopup.type === 'success' ? 'var(--bg-surface-elevated)' : 'var(--danger-red-dim, rgba(239,68,68,0.15))',
            border: `1px solid ${toastPopup.type === 'success' ? 'var(--success-green)' : 'var(--danger-red)'}`,
            color: toastPopup.type === 'success' ? 'var(--success-green)' : '#FCA5A5',
            fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)', animation: 'fadeInDown 0.3s ease'
          }}>
            {toastPopup.type === 'success' ? '\u2713' : '\u2717'} {toastPopup.message}
          </div>
        )}
        <div className="auth-card" style={{ textAlign: 'center', padding: 36 }}>
          <div style={{ color: 'var(--blueprint-cyan)', fontFamily: 'var(--font-mono)', fontSize: 13, marginBottom: 8 }}>
            Login successful!
          </div>
          <div style={{ color: 'var(--ink-secondary)', fontSize: 12 }}>
            Entering Blueprint Wizard...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page-root">
      {/* Toast Popup */}
      {toastPopup && (
        <div style={{
          position: 'fixed', top: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 9999,
          padding: '14px 28px', borderRadius: 8,
          background: toastPopup.type === 'success' ? 'var(--bg-surface-elevated)' : 'var(--danger-red-dim, rgba(239,68,68,0.15))',
          border: `1px solid ${toastPopup.type === 'success' ? 'var(--success-green)' : 'var(--danger-red)'}`,
          color: toastPopup.type === 'success' ? 'var(--success-green)' : '#FCA5A5',
          fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)', animation: 'fadeInDown 0.3s ease'
        }}>
          {toastPopup.type === 'success' ? '\u2713' : '\u2717'} {toastPopup.message}
        </div>
      )}
      {/* Brand Header */}
      <Link href="/" className="auth-header-brand" title="MimarAi Home">
        <img src="/assets/mimarai-logo-hero.png" alt="MimarAi Emblem" className="auth-header-logo" />
        <span className="auth-header-subtitle">Precision Architecture &amp; Planning Studio</span>
      </Link>

      {/* Main Auth Card */}
      <div className="auth-card">
        {/* Mode Selector Tabs (Log In vs Sign Up) */}
        {(mode === 'login' || mode === 'signup') && (
          <div className="auth-tabs">
            <button
              type="button"
              className={`auth-tab-btn ${mode === 'login' ? 'active' : ''}`}
              onClick={() => {
                setMode('login');
                setErrorBanner('');
                setInfoBanner('');
              }}
            >
              Log In
            </button>
            <button
              type="button"
              className={`auth-tab-btn ${mode === 'signup' ? 'active' : ''}`}
              onClick={() => {
                setMode('signup');
                setErrorBanner('');
                setInfoBanner('');
              }}
            >
              Sign Up
            </button>
          </div>
        )}

        {/* Global Banners */}
        {errorBanner && (
          <div className="auth-error-banner">
            <span>{errorBanner}</span>
          </div>
        )}
        {infoBanner && (
          <div className="auth-info-banner">
            <span>{infoBanner}</span>
          </div>
        )}

        {/* --- VIEW 1: LOG IN --- */}
        {mode === 'login' && (
          <form onSubmit={handleLoginSubmit} className="auth-form">
            <div className="form-group">
              <label className="form-label" htmlFor="loginEmail">
                Email Address <span className="req">*</span>
              </label>
              <input
                id="loginEmail"
                type="email"
                className="form-input"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="form-label" htmlFor="loginPassword" style={{ margin: 0 }}>
                  Password <span className="req">*</span>
                </label>
                <a
                  href="#forgot"
                  className="forgot-pwd-link"
                  onClick={(e) => {
                    e.preventDefault();
                    setMode('forgot');
                    setErrorBanner('');
                    setInfoBanner('');
                  }}
                >
                  Forgot password?
                </a>
              </div>
              <input
                id="loginPassword"
                type="password"
                className="form-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              className="auth-submit-btn"
              disabled={submitting}
            >
              {submitting ? 'Logging In…' : 'Log In →'}
            </button>

            <div className="auth-divider">or</div>

            <button
              type="button"
              className="btn-google"
              onClick={handleGoogleSignIn}
              disabled={submitting}
            >
              <svg className="google-icon" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>Continue with Google</span>
            </button>
          </form>
        )}

        {/* --- VIEW 2: SIGN UP --- */}
        {mode === 'signup' && (
          <form onSubmit={handleSignUpSubmit} className="auth-form">
            <div className="form-group">
              <label className="form-label" htmlFor="signupEmail">
                Email Address <span className="req">*</span>
              </label>
              <input
                id="signupEmail"
                type="email"
                className="form-input"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="signupPassword">
                Password <span className="req">*</span>
              </label>
              <input
                id="signupPassword"
                type="password"
                className="form-input"
                placeholder="Create a strong password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />

              {/* Password Strength Indicator */}
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

              {/* Password Validation Rules Checklist */}
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
              <label className="form-label" htmlFor="confirmPassword">
                Confirm Password <span className="req">*</span>
              </label>
              <input
                id="confirmPassword"
                type="password"
                className="form-input"
                placeholder="Re-enter password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
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
              disabled={submitting || !canSubmitSignUp}
            >
              {submitting ? 'Creating Account…' : 'Sign Up →'}
            </button>

            <div className="auth-divider">or</div>

            <button
              type="button"
              className="btn-google"
              onClick={handleGoogleSignIn}
              disabled={submitting}
            >
              <svg className="google-icon" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span>Continue with Google</span>
            </button>
          </form>
        )}

        {/* --- VIEW 3: FORGOT PASSWORD --- */}
        {mode === 'forgot' && (
          <form onSubmit={handleForgotSubmit} className="auth-form">
            <h3 style={{ fontSize: 16, margin: '0 0 6px', color: 'var(--ink-primary)' }}>Reset Your Password</h3>
            <p style={{ fontSize: 13, color: 'var(--ink-secondary)', margin: '0 0 16px', lineHeight: 1.4 }}>
              Enter your email address and we'll send you a link to reset your password.
            </p>

            <div className="form-group">
              <label className="form-label" htmlFor="forgotEmail">
                Email Address <span className="req">*</span>
              </label>
              <input
                id="forgotEmail"
                type="email"
                className="form-input"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>

            <button type="submit" className="auth-submit-btn" disabled={submitting}>
              {submitting ? 'Sending Link…' : 'Send Reset Link →'}
            </button>

            <div style={{ textAlign: 'center', marginTop: 14 }}>
              <a
                href="#login"
                className="forgot-pwd-link"
                onClick={(e) => {
                  e.preventDefault();
                  setMode('login');
                  setErrorBanner('');
                  setInfoBanner('');
                }}
              >
                ← Back to Log In
              </a>
            </div>
          </form>
        )}

        {/* --- VIEW 4: UNVERIFIED EMAIL --- */}
        {mode === 'unverified' && (
          <div className="auth-form" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>✉️</div>
            <h3 style={{ fontSize: 16, margin: '0 0 6px', color: 'var(--ink-primary)' }}>Email Verification Required</h3>
            <p style={{ fontSize: 13, color: 'var(--ink-secondary)', margin: '0 0 20px', lineHeight: 1.5 }}>
              Please verify your email address (<b>{email}</b>) before logging in.
            </p>

            <button
              type="button"
              className="auth-submit-btn"
              onClick={handleResendVerification}
              disabled={submitting || resendCooldown > 0}
            >
              {submitting
                ? 'Sending…'
                : resendCooldown > 0
                ? `Resend in ${resendCooldown}s`
                : 'Resend Verification Email'}
            </button>

            <div style={{ marginTop: 16 }}>
              <a
                href="#login"
                className="forgot-pwd-link"
                onClick={(e) => {
                  e.preventDefault();
                  setMode('login');
                  setErrorBanner('');
                  setInfoBanner('');
                }}
              >
                ← Back to Log In
              </a>
            </div>
          </div>
        )}

        {/* --- VIEW 5: SIGNUP SUCCESS (CHECK EMAIL) --- */}
        {mode === 'signup_success' && (
          <div className="auth-form" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🎉</div>
            <h3 style={{ fontSize: 18, margin: '0 0 8px', color: 'var(--ink-primary)' }}>Check Your Email</h3>
            <p style={{ fontSize: 13, color: 'var(--ink-secondary)', margin: '0 0 20px', lineHeight: 1.5 }}>
              We've sent a verification link to <b>{email}</b>. Click the link in your email to activate your account and start architecting.
            </p>

            <button
              type="button"
              className="btn btn-outline"
              style={{ width: '100%' }}
              onClick={handleResendVerification}
              disabled={submitting || resendCooldown > 0}
            >
              {submitting
                ? 'Sending…'
                : resendCooldown > 0
                ? `Resend Link in ${resendCooldown}s`
                : 'Resend Verification Email'}
            </button>

            <div style={{ marginTop: 20 }}>
              <a
                href="#login"
                className="forgot-pwd-link"
                onClick={(e) => {
                  e.preventDefault();
                  setMode('login');
                  setErrorBanner('');
                  setInfoBanner('');
                }}
              >
                ← Return to Log In
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="auth-page-root">
        <div className="auth-card" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ color: 'var(--blueprint-cyan)', fontFamily: 'var(--font-mono)' }}>Loading authentication…</div>
        </div>
      </div>
    }>
      <LoginFormContent />
    </Suspense>
  );
}
