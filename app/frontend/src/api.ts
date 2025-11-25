import {
  AiResult,
  BoothStatus,
  CameraSettingsPayload,
  CameraStatus,
  CaptureResponse,
  LiveFrameResponse,
  PrintJobStatus,
  SessionState,
  TemplateResponse,
} from './types';

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
  getStatus: () => request<BoothStatus>('/api/status'),
  getCameraStatus: () => request<CameraStatus>('/api/camera/status'),
  getLiveFrame: () => request<LiveFrameResponse>('/api/live'),
  capture: (payload?: { resumeLive?: boolean }) =>
    request<CaptureResponse>('/api/capture', {
      method: 'POST',
      body: JSON.stringify(payload ?? {}),
    }),
  updateCameraSettings: (payload: CameraSettingsPayload) =>
    request('/api/camera/settings', { method: 'POST', body: JSON.stringify(payload) }),
  generateAI: (payload: Record<string, unknown>) =>
    request<AiResult>('/api/ai/generate', { method: 'POST', body: JSON.stringify(payload) }),
  renderTemplate: (payload: Record<string, unknown>) =>
    request<TemplateResponse>('/api/template', { method: 'POST', body: JSON.stringify(payload) }),
  submitPrint: (payload: Record<string, unknown>) =>
    request<{ id: string }>('/api/print', { method: 'POST', body: JSON.stringify(payload) }),
  getPrintStatus: (id: string) => request<PrintJobStatus>(`/api/print/${id}`),
  createSession: (payload: Record<string, unknown>) =>
    request<SessionState>('/api/session', { method: 'POST', body: JSON.stringify(payload) }),
  getSession: () => request<SessionState | null>('/api/session'),
};
