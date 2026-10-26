/**
 * GrantOS API client.
 *
 * Drop-in replacement for the Base44 SDK: it exposes the same surface the
 * existing components already call —
 *
 *   api.entities.<Name>.{list, filter, get, create, update, delete}
 *   api.auth.{me, login, logout, isAuthenticated, changePassword, permissions}
 *   api.users.inviteUser
 *   api.integrations.Core.{UploadFile, InvokeLLM, SendEmail}
 *   api.functions.invoke(name, payload)   → { data }
 *
 * so the UI did not have to be rewritten around a new data layer.
 *
 * Requests go to `/api` on the same origin (Vite proxies it in development,
 * nginx in the container). Same-origin means the httpOnly session cookie used
 * for document downloads works without any CORS configuration.
 */

const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL || '/api';

const ACCESS_TOKEN_KEY = 'grantos_access_token';
const REFRESH_TOKEN_KEY = 'grantos_refresh_token';

export interface ApiErrorShape {
  status: number;
  message: string;
  data: any;
}

/** Error carrying `.status`, which existing components branch on. */
export class ApiError extends Error implements ApiErrorShape {
  status: number;
  data: any;

  constructor(status: number, message: string, data: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

// ─── Token storage ──────────────────────────────────────────────────────────

export const tokenStore = {
  getAccess(): string | null {
    try {
      return localStorage.getItem(ACCESS_TOKEN_KEY);
    } catch {
      return null;
    }
  },
  getRefresh(): string | null {
    try {
      return localStorage.getItem(REFRESH_TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(access: string, refresh: string): void {
    try {
      localStorage.setItem(ACCESS_TOKEN_KEY, access);
      localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
    } catch {
      /* private browsing — the session simply will not persist */
    }
  },
  clear(): void {
    try {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
    } catch {
      /* ignore */
    }
  },
};

// ─── Core request handling ──────────────────────────────────────────────────

let refreshInFlight: Promise<boolean> | null = null;

/** Exchanges the refresh token for a new pair. Concurrent callers share one call. */
async function refreshTokens(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refresh = tokenStore.getRefresh();
    if (!refresh) return false;

    try {
      const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ refresh_token: refresh }),
      });
      if (!response.ok) {
        tokenStore.clear();
        return false;
      }
      const data = await response.json();
      tokenStore.set(data.access_token, data.refresh_token);
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

interface RequestOptions {
  method?: string;
  body?: any;
  isFormData?: boolean;
  /** Internal: prevents infinite retry loops after a refresh. */
  _retry?: boolean;
}

async function request<T = any>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, isFormData = false, _retry = false } = options;

  const headers: Record<string, string> = {};
  const token = tokenStore.getAccess();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (!isFormData && body !== undefined) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      credentials: 'include',
      body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
    });
  } catch (networkError: any) {
    throw new ApiError(
      0,
      `Cannot reach the GrantOS API at ${API_BASE}. Is the backend running?`,
      { cause: networkError?.message },
    );
  }

  // One transparent refresh-and-retry on an expired access token.
  if (response.status === 401 && !_retry && tokenStore.getRefresh()) {
    const refreshed = await refreshTokens();
    if (refreshed) {
      return request<T>(path, { ...options, _retry: true });
    }
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let payload: any = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    const message =
      (payload && typeof payload === 'object' && (payload.message || payload.error)) ||
      `Request failed with status ${response.status}`;
    throw new ApiError(response.status, message, payload);
  }

  return payload as T;
}

// ─── Entities ───────────────────────────────────────────────────────────────

/** Entity names handled by dedicated routes rather than the generic CRUD API. */
const SPECIAL_ENTITIES: Record<string, string> = { User: '/users' };

function buildEntityApi(name: string) {
  const special = SPECIAL_ENTITIES[name];

  if (special) {
    return {
      list: () => request<any[]>(special),
      filter: async (where: Record<string, any> = {}) => {
        const all = await request<any[]>(special);
        // The users endpoint returns a small, already-scoped collection.
        return all.filter((row) =>
          Object.entries(where).every(([k, v]) => row[k] === v),
        );
      },
      get: (id: string) => request<any>(`${special}/${id}`),
      create: (data: any) => request<any>(special, { method: 'POST', body: data }),
      update: (id: string, data: any) =>
        request<any>(`${special}/${id}`, { method: 'PATCH', body: data }),
      delete: (id: string) => request<any>(`${special}/${id}`, { method: 'DELETE' }),
    };
  }

  const base = `/entities/${encodeURIComponent(name)}`;

  return {
    /** Base44 signature: list(sort?, limit?) */
    list: (sort?: string, limit?: number) => {
      const params = new URLSearchParams();
      if (sort) params.set('sort', sort);
      if (limit) params.set('limit', String(limit));
      const qs = params.toString();
      return request<any[]>(`${base}${qs ? `?${qs}` : ''}`);
    },

    /** Base44 signature: filter(where, sort?, limit?) — supports $in, $gte, … */
    filter: (where: Record<string, any> = {}, sort?: string, limit?: number) =>
      request<any[]>(`${base}/filter`, { method: 'POST', body: { where, sort, limit } }),

    get: (id: string) => request<any>(`${base}/${id}`),
    create: (data: any) => request<any>(base, { method: 'POST', body: data }),
    update: (id: string, data: any) =>
      request<any>(`${base}/${id}`, { method: 'PATCH', body: data }),
    delete: (id: string) => request<any>(`${base}/${id}`, { method: 'DELETE' }),
  };
}

const ENTITY_NAMES = [
  'Grant', 'Milestone', 'GrantDeliverable', 'GrantTranche', 'GrantReportingObligation',
  'ReportingDeadline', 'GrantHealthScoreConfig', 'GrantHealthScoreSnapshot',
  'MOU', 'MouCommitment', 'MSA', 'MsaKeyClause',
  'SOW', 'SowMilestone', 'SowDeliverable', 'SowInvoice',
  'DocumentUploadLog', 'DocumentValidationLog',
  'AppSettings', 'NotificationRule', 'NotificationTemplate', 'NotificationLog',
  'AuditLog', 'CleanupLog', 'User',
] as const;

const entities = Object.fromEntries(
  ENTITY_NAMES.map((name) => [name, buildEntityApi(name)]),
) as Record<(typeof ENTITY_NAMES)[number], ReturnType<typeof buildEntityApi>>;

// ─── Auth ───────────────────────────────────────────────────────────────────

const auth = {
  async login(email: string, password: string) {
    const data = await request<any>('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    tokenStore.set(data.access_token, data.refresh_token);
    return data;
  },

  me: () => request<any>('/auth/me'),

  permissions: () => request<any>('/auth/permissions'),

  isAuthenticated: () => Boolean(tokenStore.getAccess()),

  async logout(redirectTo?: string) {
    const refresh = tokenStore.getRefresh();
    tokenStore.clear();
    try {
      await request('/auth/logout', { method: 'POST', body: { refresh_token: refresh } });
    } catch {
      /* the local session is cleared regardless */
    }
    if (redirectTo) window.location.href = redirectTo;
  },

  /** Base44 compatibility: the app now has its own in-app login route. */
  redirectToLogin(_fromUrl?: string) {
    if (!window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
  },

  /**
   * Accepts both the snake_case API shape and the camelCase shape
   * UpdatePasswordModal already uses, so that screen needed no change.
   */
  changePassword: (payload: {
    current_password?: string;
    new_password?: string;
    currentPassword?: string;
    newPassword?: string;
  }) =>
    request('/auth/change-password', {
      method: 'POST',
      body: {
        current_password: payload.current_password ?? payload.currentPassword,
        new_password: payload.new_password ?? payload.newPassword,
      },
    }),
};

// ─── Users ──────────────────────────────────────────────────────────────────

const users = {
  /**
   * Base44 signature: inviteUser(email, role).
   * Extended with permissions so the invitation carries them, rather than the
   * UI creating an account and patching it afterwards.
   */
  inviteUser: (
    email: string,
    role: 'admin' | 'user' = 'user',
    options: { allowed_modules?: string[]; can_upload_pdf?: boolean } = {},
  ) =>
    request<any>('/users/invite', {
      method: 'POST',
      body: {
        email,
        role,
        allowed_modules: options.allowed_modules,
        can_upload_pdf: options.can_upload_pdf,
      },
    }),
};

/**
 * Dashboard assistant.
 *
 * The backend loads and authorises the data, computes the counts and dates
 * deterministically, and returns prose. Nothing is assembled in the browser.
 */
const assistant = {
  ask: (payload: {
    question: string;
    scope?: string;
    history?: Array<{ role: string; text: string }>;
  }) => request<any>('/assistant/ask', { method: 'POST', body: payload }),
};

/** Invitation lifecycle. */
const invitations = {
  /** Admin: every invitation, newest first. */
  list: () => request<any[]>('/admin/invitations'),

  /** Admin: issue a fresh token and email it again. */
  resend: (id: string) => request<any>(`/admin/invitations/${id}/resend`, { method: 'POST' }),

  /** Admin: invalidate a pending invitation link. */
  revoke: (id: string) => request<any>(`/admin/invitations/${id}`, { method: 'DELETE' }),

  /** Public: who is this invitation for? Used by the acceptance page. */
  preview: (token: string) => request<any>(`/invitations/${encodeURIComponent(token)}`),

  /**
   * Public: set a password and activate the account.
   * Role and permissions come from the stored invitation, not from here.
   */
  accept: (token: string, payload: { password: string; full_name?: string }) =>
    request<any>(`/invitations/${encodeURIComponent(token)}/accept`, {
      method: 'POST',
      body: payload,
    }),
};

// ─── Integrations (Base44 `integrations.Core.*`) ────────────────────────────

const integrations = {
  Core: {
    /** Uploads to local storage; returns `{ file_url }` as the SDK did. */
    async UploadFile({
      file,
      entity_type,
      entity_id,
    }: {
      file: File;
      entity_type?: string;
      entity_id?: string;
    }) {
      const form = new FormData();
      form.append('file', file);
      if (entity_type) form.append('entity_type', entity_type);
      if (entity_id) form.append('entity_id', entity_id);
      return request<any>('/files/upload', { method: 'POST', body: form, isFormData: true });
    },

    /** Runs server-side; the model credential never reaches the browser. */
    InvokeLLM: (payload: { prompt: string; file_urls?: string[]; response_json_schema?: any }) =>
      request<any>('/ai/invoke', { method: 'POST', body: payload }),

    SendEmail: ({
      to,
      subject,
      body,
      from_name,
    }: {
      to: string;
      subject: string;
      body: string;
      from_name?: string;
    }) => request<any>('/notifications/send-email', {
      method: 'POST',
      body: { to, subject, body, from_name },
    }),
  },
};

// ─── Backend functions (Base44 `functions.invoke`) ──────────────────────────

/** Maps each Base44 function name to its replacement endpoint. */
const FUNCTION_ROUTES: Record<string, { path: string; method?: string }> = {
  extractDeliverablesAndMilestones: { path: '/extraction/extractDeliverablesAndMilestones' },
  extractGrantTranches: { path: '/extraction/extractGrantTranches' },
  extractGrantContacts: { path: '/extraction/extractGrantContacts' },
  extractMsaServicesAndKeyClauses: { path: '/extraction/extractMsaServicesAndKeyClauses' },
  extractMouAll: { path: '/extraction/extractMouAll' },
  getMyPermissions: { path: '/auth/permissions', method: 'GET' },
  performDatabaseReset: { path: '/admin/performDatabaseReset' },
  performFileCleanup: { path: '/admin/performFileCleanup' },
  sendTestNotification: { path: '/notifications/test' },
  sendNotifications: { path: '/notifications/run' },
};

const functions = {
  /**
   * Returns `{ data }` because the Base44 SDK did, and the components read
   * `res.data`.
   */
  async invoke(name: string, payload: any = {}) {
    const route = FUNCTION_ROUTES[name];
    if (!route) {
      throw new ApiError(404, `Unknown backend function "${name}"`, { name });
    }
    const method = route.method ?? 'POST';
    const data = await request<any>(route.path, {
      method,
      body: method === 'GET' ? undefined : payload,
    });
    return { data };
  },
};

// ─── Misc helpers used by the health/settings screens ───────────────────────

const system = {
  health: () => request<any>('/health'),
  aiStatus: () => request<any>('/ai/status'),
  mailStatus: () => request<any>('/notifications/status'),
};

export const api = { entities, auth, users, invitations, assistant, integrations, functions, system, request };

export default api;
