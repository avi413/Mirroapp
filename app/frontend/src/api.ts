import { CameraStatus, SessionState } from './types';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...init,
  });
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return res.json();
}

export const Api = {
  getCameraStatus: () => request<CameraStatus>('/camera/status'),
  capture: () => request<{ filePath: string; capturedAt: number }>('/camera/capture', { method: 'POST' }),
  processAI: (payload: Record<string, unknown>) =>
    request('/ai/process', { method: 'POST', body: JSON.stringify(payload) }),
  renderTemplate: (payload: Record<string, unknown>) =>
    request('/template/render', { method: 'POST', body: JSON.stringify(payload) }),
  submitPrint: (payload: Record<string, unknown>) =>
    request<{ id: string }>('/print', { method: 'POST', body: JSON.stringify(payload) }),
  createSession: (payload: Record<string, unknown>) =>
    request<SessionState>('/session', { method: 'POST', body: JSON.stringify(payload) }),
  getSession: () => request<SessionState | null>('/session'),
};
