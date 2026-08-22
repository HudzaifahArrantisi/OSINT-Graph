import { supabase } from './supabase';
import type { ApiResponse } from '@nexusgraph/shared';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.access_token}`,
  };
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_BASE}/api/v1${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  // For non-JSON responses (CSV, Markdown export)
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('text/csv') || contentType.includes('text/markdown')) {
    return (await response.text()) as unknown as T;
  }

  const data = await response.json();
  return data.data !== undefined ? data.data : data;
}

// ─── API Functions ──────────────────────────────────────────────────

export const api = {
  // Auth
  me: () => request<{ id: string; email: string }>('GET', '/me'),

  // Investigations
  investigations: {
    list: () => request<any[]>('GET', '/investigations'),
    get: (id: string) => request<any>('GET', `/investigations/${id}`),
    create: (data: any) => request<any>('POST', '/investigations', data),
    update: (id: string, data: any) => request<any>('PATCH', `/investigations/${id}`, data),
    delete: (id: string) => request<void>('DELETE', `/investigations/${id}`),
    bulkDelete: (ids: string[]) =>
      request<{ deletedCount: number }>('POST', '/investigations/bulk-delete', { ids }),
    reset: (id: string) => request<{ reset: boolean }>('POST', `/investigations/${id}/reset`),
  },

  // Entities
  entities: {
    list: (caseId: string) => request<any[]>('GET', `/investigations/${caseId}/entities`),
    create: (caseId: string, data: any) =>
      request<any>('POST', `/investigations/${caseId}/entities`, data),
    delete: (caseId: string, entityId: string) =>
      request<void>('DELETE', `/investigations/${caseId}/entities/${entityId}`),
    deleteByType: (caseId: string, type: string) =>
      request<{ deletedCount: number }>('DELETE', `/investigations/${caseId}/entities/by-type/${type}`),
  },

  // Relationships
  relationships: {
    list: (caseId: string) => request<any[]>('GET', `/investigations/${caseId}/relationships`),
    create: (caseId: string, data: any) =>
      request<any>('POST', `/investigations/${caseId}/relationships`, data),
  },

  // Evidence
  evidence: {
    list: (caseId: string) => request<any[]>('GET', `/investigations/${caseId}/evidence`),
    create: (caseId: string, data: any) =>
      request<any>('POST', `/investigations/${caseId}/evidence`, data),
  },

  // Timeline
  timeline: {
    list: (caseId: string) => request<any[]>('GET', `/investigations/${caseId}/timeline`),
    create: (caseId: string, data: any) =>
      request<any>('POST', `/investigations/${caseId}/timeline`, data),
  },

  // Notes
  notes: {
    list: (caseId: string) => request<any[]>('GET', `/investigations/${caseId}/notes`),
    create: (caseId: string, data: any) =>
      request<any>('POST', `/investigations/${caseId}/notes`, data),
    update: (caseId: string, noteId: string, data: any) =>
      request<any>('PATCH', `/investigations/${caseId}/notes/${noteId}`, data),
    delete: (caseId: string, noteId: string) =>
      request<void>('DELETE', `/investigations/${caseId}/notes/${noteId}`),
  },

  // Graph
  graph: {
    get: (caseId: string) => request<any>('GET', `/investigations/${caseId}/graph`),
  },

  // Collectors (legacy)
  collectors: {
    run: (caseId: string, data: any) =>
      request<any>('POST', `/investigations/${caseId}/collect`, data),
    runs: (caseId: string) => request<any[]>('GET', `/investigations/${caseId}/collector-runs`),
    available: (seedType?: string) =>
      request<string[]>('GET', `/collectors/available${seedType ? `?seed_type=${seedType}` : ''}`),
  },

  // Discoveries
  discoveries: {
    start: (caseId: string, data: { seed_type: string; seed_value: string }) =>
      request<any>('POST', `/investigations/${caseId}/discover`, data),
    stream: async (
      caseId: string,
      data: { seed_type: string; seed_value: string },
      onEvent: (event: any) => void,
    ) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_BASE}/api/v1/investigations/${caseId}/discover/stream`, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Stream request failed' }));
        throw new Error(error.message || `HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const block of lines) {
          if (!block.trim()) continue;
          const dataMatch = block.match(/data:\s*(.+)/);
          if (dataMatch) {
            try {
              const parsed = JSON.parse(dataMatch[1]);
              onEvent(parsed);
            } catch {
              // Ignore partial JSON
            }
          }
        }
      }
    },
    plan: (caseId: string, seedType: string, seedValue: string) =>
      request<any>('GET', `/investigations/${caseId}/discover/plan?seed_type=${encodeURIComponent(seedType)}&seed_value=${encodeURIComponent(seedValue)}`),
    list: (caseId: string) => request<any[]>('GET', `/investigations/${caseId}/discoveries`),
    get: (caseId: string, jobId: string) =>
      request<any>('GET', `/investigations/${caseId}/discoveries/${jobId}`),
  },

  // Transforms
  transforms: {
    list: (inputType?: string) =>
      request<any[]>('GET', `/transforms${inputType ? `?inputType=${encodeURIComponent(inputType)}` : ''}`),
    categories: (inputType?: string) =>
      request<Record<string, any[]>>('GET', `/transforms/categories${inputType ? `?inputType=${encodeURIComponent(inputType)}` : ''}`),
    forEntity: (caseId: string, entityId: string) =>
      request<{ transforms: any[]; grouped: Record<string, any[]>; entity: any }>(
        'GET',
        `/investigations/${caseId}/entities/${entityId}/transforms`,
      ),
    run: (caseId: string, transformId: string, entityId: string) =>
      request<any>('POST', `/investigations/${caseId}/transforms/${transformId}/run`, {
        entity_id: entityId,
      }),
  },

  // Search
  search: (caseId: string, query: string, params?: Record<string, string>) => {
    const searchParams = new URLSearchParams({ q: query, ...params });
    return request<any>('GET', `/investigations/${caseId}/search?${searchParams}`);
  },

  // Export
  export: {
    json: (caseId: string) => request<any>('GET', `/investigations/${caseId}/export/json`),
    csv: (caseId: string) => request<string>('GET', `/investigations/${caseId}/export/csv`),
    markdown: (caseId: string) =>
      request<string>('GET', `/investigations/${caseId}/export/markdown`),
  },
};
