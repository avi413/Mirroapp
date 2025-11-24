import { create } from 'zustand';
import { Api } from '../api';
import { SessionState } from '../types';

interface SessionStore {
  session: SessionState | null;
  loading: boolean;
  fetchSession: () => Promise<void>;
  startSession: (payload: Omit<SessionState, 'id' | 'createdAt'>) => Promise<void>;
}

export const useSessionStore = create<SessionStore>((set) => ({
  session: null,
  loading: false,
  fetchSession: async () => {
    set({ loading: true });
    try {
      const res = await Api.getSession();
      set({ session: res, loading: false });
    } catch (error) {
      console.error(error);
      set({ loading: false });
    }
  },
  startSession: async (payload) => {
    set({ loading: true });
    try {
      const res = await Api.createSession(payload);
      set({ session: res, loading: false });
    } catch (error) {
      console.error(error);
      set({ loading: false });
    }
  },
}));
