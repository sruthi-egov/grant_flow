/**
 * Central, typed view of every environment variable the backend reads.
 *
 * Secrets (JWT, SMTP, OPENAI_API_KEY) are resolved here and nowhere else, so
 * they can never leak into a response body or reach the browser bundle.
 */

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function int(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function list(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

export interface AppConfig {
  nodeEnv: string;
  isProduction: boolean;
  port: number;
  corsOrigins: string[];
  appPublicUrl: string;
  auth: {
    accessSecret: string;
    refreshSecret: string;
    accessTtl: string;
    refreshTtl: string;
  };
  uploads: {
    dir: string;
    maxBytes: number;
  };
  mail: {
    host: string;
    port: number;
    secure: boolean;
    user?: string;
    pass?: string;
    fromName: string;
    fromAddress: string;
    allowedDomains: string[];
  };
  notifications: {
    cronEnabled: boolean;
    cron: string;
    timezone: string;
  };
  invitations: {
    /** How long an invitation link stays valid. */
    expiryDays: number;
  };
  ai: {
    apiKey?: string;
    model: string;
    baseUrl?: string;
    maxInputChars: number;
    /** False when OPENAI_API_KEY is absent — extraction then fails loudly. */
    enabled: boolean;
  };
  seed: {
    adminEmail: string;
    adminPassword: string;
    userEmail: string;
    userPassword: string;
  };
}

export default (): AppConfig => {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const apiKey = (process.env.OPENAI_API_KEY ?? '').trim();

  return {
    nodeEnv,
    isProduction: nodeEnv === 'production',
    port: int(process.env.PORT, 3001),
    corsOrigins: list(process.env.CORS_ORIGINS).length
      ? list(process.env.CORS_ORIGINS)
      : ['http://localhost:5173', 'http://127.0.0.1:5173'],
    appPublicUrl: process.env.APP_PUBLIC_URL ?? 'http://localhost:5173',

    auth: {
      accessSecret: process.env.JWT_ACCESS_SECRET ?? '',
      refreshSecret: process.env.JWT_REFRESH_SECRET ?? '',
      accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
      refreshTtl: process.env.JWT_REFRESH_TTL ?? '7d',
    },

    uploads: {
      dir: process.env.UPLOAD_DIR ?? './storage/uploads',
      maxBytes: int(process.env.MAX_UPLOAD_MB, 25) * 1024 * 1024,
    },

    mail: {
      host: process.env.SMTP_HOST ?? 'localhost',
      port: int(process.env.SMTP_PORT, 1025),
      secure: bool(process.env.SMTP_SECURE, false),
      user: process.env.SMTP_USER || undefined,
      pass: process.env.SMTP_PASS || undefined,
      fromName: process.env.MAIL_FROM_NAME ?? 'GrantOS Notifications',
      fromAddress: process.env.MAIL_FROM_ADDRESS ?? 'notifications@grantos.local',
      allowedDomains: list(process.env.MAIL_ALLOWED_DOMAINS),
    },

    notifications: {
      cronEnabled: bool(process.env.NOTIFICATIONS_CRON_ENABLED, true),
      // Base44 ran this at 03:30 UTC = 09:00 Asia/Kolkata.
      cron: process.env.NOTIFICATIONS_CRON ?? '30 3 * * *',
      timezone: process.env.NOTIFICATIONS_TIMEZONE ?? 'Asia/Kolkata',
    },

    invitations: {
      expiryDays: int(process.env.INVITATION_EXPIRY_DAYS, 7),
    },

    ai: {
      apiKey: apiKey || undefined,
      model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
      baseUrl: process.env.OPENAI_BASE_URL || undefined,
      maxInputChars: int(process.env.AI_MAX_INPUT_CHARS, 120000),
      enabled: apiKey.length > 0,
    },

    seed: {
      adminEmail: process.env.SEED_ADMIN_EMAIL ?? 'admin@grantos.local',
      adminPassword: process.env.SEED_ADMIN_PASSWORD ?? 'DemoAdmin!2026',
      userEmail: process.env.SEED_USER_EMAIL ?? 'analyst@grantos.local',
      userPassword: process.env.SEED_USER_PASSWORD ?? 'DemoUser!2026',
    },
  };
};
