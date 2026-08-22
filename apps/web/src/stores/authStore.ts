import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  initialized: boolean;

  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName?: string) => Promise<{ user: User | null; session: Session | null }>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  loading: true,
  initialized: false,

  initialize: async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      set({
        user: session?.user || null,
        session,
        loading: false,
        initialized: true,
      });

      // Listen for auth changes
      supabase.auth.onAuthStateChange((_event, session) => {
        set({
          user: session?.user || null,
          session,
          loading: false,
        });
      });
    } catch {
      set({ loading: false, initialized: true });
    }
  },

  signIn: async (email: string, password: string) => {
    set({ loading: true });
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      set({ loading: false });
      throw error;
    }
    set({ user: data.user, session: data.session, loading: false });
  },

  signUp: async (email: string, password: string, displayName?: string) => {
    set({ loading: true });
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
      },
    });
    if (error) {
      set({ loading: false });
      throw error;
    }

    if (data.session) {
      set({ user: data.user, session: data.session, loading: false });
    } else {
      set({ loading: false });
    }

    return { user: data.user, session: data.session };
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, session: null });
  },
}));
