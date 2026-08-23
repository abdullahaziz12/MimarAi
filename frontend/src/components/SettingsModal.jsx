"use client";

import React, { useState, useEffect } from 'react';
import { useAuth, sanitizeName } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { validatePasswordRules } from '../lib/passwordValidation';

export default function SettingsModal({ isOpen, onClose }) {
  const { user, profile, updateProfileName } = useAuth();
  const [activeTab, setActiveTab] = useState('profile'); // 'profile' | 'password'

  // Name state
  const [nameVal, setNameVal] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameMsg, setNameMsg] = useState({ text: '', type: '' });

  // Password state
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPwd, setSavingPwd] = useState(false);
  const [pwdMsg, setPwdMsg] = useState({ text: '', type: '' });

  useEffect(() => {
    if (profile?.name) {
      setNameVal(profile.name);
    }
  }, [profile]);

  if (!isOpen || !user) return null;

  const pwdValidation = validatePasswordRules(newPassword);
  const passMatches = newPassword === confirmPassword && confirmPassword.length > 0;
  const canSavePwd = pwdValidation.isValid && passMatches && oldPassword.length > 0;

  const handleSaveName = async (e) => {
    e.preventDefault();
    setNameMsg({ text: '', type: '' });
    const clean = sanitizeName(nameVal);
    if (!clean) {
      setNameMsg({ text: 'Please enter a valid display name.', type: 'error' });
      return;
    }
    setSavingName(true);
    try {
      await updateProfileName(clean);
      setNameMsg({ text: 'Display name updated successfully.', type: 'success' });
    } catch (err) {
      setNameMsg({ text: err.message || 'Failed to update name.', type: 'error' });
    } finally {
      setSavingName(false);
    }
  };

  const handleSavePassword = async (e) => {
    e.preventDefault();
    setPwdMsg({ text: '', type: '' });
    if (!canSavePwd) return;

    setSavingPwd(true);
    try {
      // Re-authenticate with old password first to verify identity
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: oldPassword
      });

      if (signInError) {
        setPwdMsg({ text: 'Current password is incorrect.', type: 'error' });
        setSavingPwd(false);
        return;
      }

      // Update password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (updateError) {
        setPwdMsg({ text: updateError.message || 'Failed to update password.', type: 'error' });
      } else {
        setPwdMsg({ text: 'Password updated successfully.', type: 'success' });
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch (err) {
      setPwdMsg({ text: err.message || 'An unexpected error occurred.', type: 'error' });
    } finally {
      setSavingPwd(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <div className="modal-head">
          <div>
            <h2 className="modal-title">Account Settings</h2>
            <p className="modal-sub">Manage your profile details and security preferences.</p>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close settings">
            ✕
          </button>
        </div>

        {/* Segmented Control Tabs */}
        <div className="auth-tabs" style={{ marginBottom: 20 }}>
          <button
            type="button"
            className={`auth-tab-btn ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => setActiveTab('profile')}
          >
            Profile Info
          </button>
          <button
            type="button"
            className={`auth-tab-btn ${activeTab === 'password' ? 'active' : ''}`}
            onClick={() => setActiveTab('password')}
          >
            Change Password
          </button>
        </div>

        {/* Tab 1: Profile Info */}
        {activeTab === 'profile' && (
          <form onSubmit={handleSaveName} className="auth-form">
            {nameMsg.text && (
              <div className={nameMsg.type === 'error' ? 'auth-error-banner' : 'auth-info-banner'}>
                <span>{nameMsg.text}</span>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input
                type="email"
                className="form-input"
                value={user.email || ''}
                disabled
                autoComplete="email"
                style={{ opacity: 0.6, cursor: 'not-allowed' }}
              />
              <span style={{ fontSize: 10, color: 'var(--ink-muted)', marginTop: 2 }}>Email address cannot be changed.</span>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="settingsName">
                <span>Display Name <span className="req">*</span></span>
                <span style={{ fontSize: 10, color: 'var(--ink-muted)' }}>MAX 60 CHARS</span>
              </label>
              <input
                id="settingsName"
                type="text"
                className="form-input"
                value={nameVal}
                onChange={(e) => setNameVal(e.target.value)}
                autoComplete="name"
                maxLength={60}
                required
              />
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 10 }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="auth-submit-btn" style={{ width: 'auto' }} disabled={savingName}>
                {savingName ? 'Saving…' : 'Save Name'}
              </button>
            </div>
          </form>
        )}

        {/* Tab 2: Change Password */}
        {activeTab === 'password' && (
          <form onSubmit={handleSavePassword} className="auth-form">
            {pwdMsg.text && (
              <div className={pwdMsg.type === 'error' ? 'auth-error-banner' : 'auth-info-banner'}>
                <span>{pwdMsg.text}</span>
              </div>
            )}

            <div className="form-group">
              <label className="form-label" htmlFor="currentPwd">Current Password <span className="req">*</span></label>
              <input
                id="currentPwd"
                type="password"
                className="form-input"
                placeholder="Enter current password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="newPwd">New Password <span className="req">*</span></label>
              <input
                id="newPwd"
                type="password"
                className="form-input"
                placeholder="Enter new password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                required
              />

              {/* Strength Meter */}
              {newPassword.length > 0 && (
                <div className="pwd-strength-wrap">
                  <div className="pwd-strength-bar-bg">
                    <div className={`pwd-strength-bar-fill pwd-strength-fill ${pwdValidation.strength}`} />
                  </div>
                  <span className={`pwd-strength-label ${pwdValidation.strength}`}>
                    {pwdValidation.strength}
                  </span>
                </div>
              )}

              {/* Password Checklist */}
              {newPassword.length > 0 && (
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
              <label className="form-label" htmlFor="confirmNewPwd">Confirm New Password <span className="req">*</span></label>
              <input
                id="confirmNewPwd"
                type="password"
                className="form-input"
                placeholder="Re-enter new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
              {confirmPassword.length > 0 && !passMatches && (
                <span style={{ fontSize: 11, color: 'var(--danger-red)', marginTop: 4 }}>Passwords do not match.</span>
              )}
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 10 }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="auth-submit-btn" style={{ width: 'auto' }} disabled={savingPwd || !canSavePwd}>
                {savingPwd ? 'Updating…' : 'Update Password'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
