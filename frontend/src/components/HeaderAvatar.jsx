"use client";

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../context/AuthContext';
import SettingsModal from './SettingsModal';
import '../styles/auth.css';

export default function HeaderAvatar() {
  const router = useRouter();
  const { user, profile, loading, logout, getAvatarColor } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // While session is being resolved, render an invisible placeholder
  // to prevent flashing "Log In" then avatar (or vice-versa) on navigation.
  if (loading) {
    return (
      <span
        aria-hidden="true"
        style={{ display: 'inline-block', width: 68, height: 30, visibility: 'hidden' }}
      />
    );
  }

  if (!user) {
    return (
      <button
        type="button"
        className="btn btn-outline"
        onClick={() => router.push('/login')}
        style={{ fontSize: 12, padding: '7px 14px' }}
      >
        Log In
      </button>
    );
  }

  const displayName = profile?.name || user.user_metadata?.full_name || user.email || 'User';
  const initial = (displayName.trim()[0] || 'U').toUpperCase();
  const bgColor = profile?.avatar_color || getAvatarColor(user.id);

  const handleLogout = async () => {
    setDropdownOpen(false);
    await logout();
    router.push('/');
  };

  return (
    <>
      <div className="avatar-menu-wrap" ref={containerRef}>
        <button
          type="button"
          className="avatar-badge-btn"
          style={{ backgroundColor: bgColor }}
          onClick={() => setDropdownOpen(!dropdownOpen)}
          title={`Logged in as ${displayName}`}
          aria-label="User menu"
        >
          {initial}
        </button>

        {dropdownOpen && (
          <div className="avatar-dropdown">
            <div className="avatar-dropdown-head">
              <div className="avatar-dropdown-name">{displayName}</div>
              <div className="avatar-dropdown-email">{user.email}</div>
            </div>

            <Link
              href="/admin"
              className="avatar-dropdown-item"
              onClick={() => setDropdownOpen(false)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18" />
                <path d="M9 21V9" />
              </svg>
              <span>Admin Portal</span>
            </Link>

            <button
              type="button"
              className="avatar-dropdown-item"
              onClick={() => {
                setDropdownOpen(false);
                setSettingsOpen(true);
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              <span>Settings</span>
            </button>

            <button
              type="button"
              className="avatar-dropdown-item danger"
              onClick={handleLogout}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span>Log Out</span>
            </button>
          </div>
        )}
      </div>

      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
