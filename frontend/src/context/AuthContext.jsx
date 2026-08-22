"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const AuthContext = createContext({
  user: null,
  session: null,
  profile: null,
  loading: true,
  refreshProfile: async () => {},
  updateProfileName: async () => {},
  logout: async () => {},
  getAvatarColor: () => '#38BDF8'
});

const AVATAR_PALETTE = [
  '#38BDF8', // Cyan
  '#F97316', // Orange
  '#10B981', // Green
  '#A855F7', // Purple
  '#EC4899', // Pink
  '#0EA5E9', // Sky Blue
  '#F59E0B', // Amber
  '#6366F1'  // Indigo
];

export function getDeterministicAvatarColor(userId) {
  if (!userId) return AVATAR_PALETTE[0];
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[index];
}

export function sanitizeName(str) {
  if (!str) return '';
  return str.replace(/<[^>]*>?/gm, '').trim().substring(0, 60);
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (currentUser) => {
    if (!currentUser) {
      setProfile(null);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .maybeSingle();

      if (data) {
        setProfile(data);
      } else {
        // Fallback profile if table or row doesn't exist yet
        const metaName = currentUser.user_metadata?.full_name || currentUser.user_metadata?.name || '';
        const fallback = {
          id: currentUser.id,
          name: sanitizeName(metaName),
          email: currentUser.email || '',
          avatar_color: getDeterministicAvatarColor(currentUser.id)
        };
        setProfile(fallback);
      }
    } catch (err) {
      console.warn('Profile fetch error:', err);
      setProfile({
        id: currentUser.id,
        name: sanitizeName(currentUser.user_metadata?.name || ''),
        email: currentUser.email || '',
        avatar_color: getDeterministicAvatarColor(currentUser.id)
      });
    }
  };

  useEffect(() => {
    let mounted = true;

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      setSession(session);
      const currentUser = session?.user || null;
      setUser(currentUser);
      if (currentUser) {
        fetchProfile(currentUser).finally(() => {
          if (mounted) setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    // Listen to auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      if (!mounted) return;
      setSession(currentSession);
      const currentUser = currentSession?.user || null;
      setUser(currentUser);

      if (currentUser) {
        await fetchProfile(currentUser);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user);
    }
  };

  const updateProfileName = async (rawName) => {
    if (!user) throw new Error('User not authenticated');
    const cleanName = sanitizeName(rawName);
    if (!cleanName) throw new Error('Name cannot be empty or whitespace only.');

    const color = profile?.avatar_color || getDeterministicAvatarColor(user.id);
    const payload = {
      id: user.id,
      name: cleanName,
      email: user.email || '',
      avatar_color: color,
      updated_at: new Date().toISOString()
    };

    // Try DB upsert
    try {
      const { error } = await supabase.from('profiles').upsert(payload);
      if (error) {
        console.warn('DB profile upsert warning (RLS or table check):', error.message);
      }
    } catch (e) {
      console.warn('DB profile upsert exception:', e);
    }

    // Always update local profile state
    setProfile(prev => ({
      ...prev,
      id: user.id,
      name: cleanName,
      email: user.email || '',
      avatar_color: color
    }));

    return cleanName;
  };

  const logout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('Sign out error:', err);
    }
    setUser(null);
    setSession(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        refreshProfile,
        updateProfileName,
        logout,
        getAvatarColor: (id) => getDeterministicAvatarColor(id || user?.id)
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
