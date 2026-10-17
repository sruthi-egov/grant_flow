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
    /**
     * Who may be emailed by ordinary application mail (invitations, password
     * resets, admin-initiated sends).
     *
     *   'unrestricted' — any syntactically valid address, any provider.
     *   'allowlist'    — only domains listed in MAIL_ALLOWED_DOMAINS.
     *
     * Set explicitly. An empty value or "*" is NOT interpreted as unrestricted.
     */
    recipientPolicy: 'unrestricted' | 'allowlist';
    /** Consulted only when recipientPolicy is 'allowlist'. */
    allowedDomains: string[];
    /**
     * Domains that AUTOMATED notification runs must never email, whatever the
     * recipient policy says. The seeded demo contacts live on these, so a
     * scheduled digest cannot reach them. Invitations and admin-initiated
     * sends are not affected.
     */
    notificationBlockedDomains: string[];
    /** When true, messages are logged and never transmitted. */
    dryRun: boolean;
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

/**
 * Flags an API key that is almost certainly mis-copied.
 *
 * A trailing full stop picked up from a sentence, a wrapping quote, or inner
 * whitespace are invisible in a 160-character string but cause an opaque 401
 * from the provider. Returns a reason, or null when the key looks sane.
 */
export function describeSuspectApiKey(raw: string | undefined): string | null {
  if (!raw) return null;

  if (raw !== raw.trim()) return 'it has leading or trailing whitespace';
  const key = raw.trim();

  if (/^['"]|['"]$/.test(key)) return 'it is wrapped in quotation marks';
  if (/[.,;]$/.test(key)) {
    return `it ends with "${key.slice(-1)}", which is not part of an API key — it was probably copied from the end of a sentence`;
  }
  if (/\s/.test(key)) return 'it contains a space or line break';
  if (!/^sk-/.test(key)) return 'it does not start with "sk-"';

  return null;
}

/**
 * Domains that never receive automated notifications unless the operator
 * overrides NOTIFICATION_BLOCKED_DOMAINS. These carry the seeded demo
 * contacts, which do not resolve — emailing them generates bounces that harm
 * the sending account's reputation.
 */
export const DEFAULT_NOTIFICATION_BLOCKED_DOMAINS = [
  'grantos.local',
  'example.com',
  'example.org',
  'example.net',
  'test',
  'invalid',
  'localhost',
];

export class InvalidRecipientPolicyError extends Error {}

/**
 * Parses MAIL_RECIPIENT_POLICY.
 *
 * Only the two documented values are accepted. An unset value defaults to
 * 'unrestricted' — the behaviour an application that emails real users needs —
 * while demo addresses stay protected by the separate notification deny-list.
 *
 * A misspelling throws rather than silently falling back, because quietly
 * choosing either option would be wrong: 'unrestricted' could email strangers,
 * 'allowlist' could block every genuine recipient.
 */
export function recipientPolicy(raw: string | undefined): 'unrestricted' | 'allowlist' {
  const value = (raw ?? '').trim().toLowerCase();
  if (value === '') return 'unrestricted';
  if (value === 'unrestricted' || value === 'allowlist') return value;

  throw new InvalidRecipientPolicyError(
    `MAIL_RECIPIENT_POLICY must be "unrestricted" or "allowlist" (got "${raw}"). ` +
      'An empty value, "*", "all" or "none" are not accepted — state the policy explicitly.',
  );
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
      host: (process.env.SMTP_HOST ?? 'localhost').trim(),
      port: int(process.env.SMTP_PORT, 1025),
      // SMTP_SECURE=false means "connect in the clear, then upgrade with
      // STARTTLS" — which is what port 587 expects. It does NOT mean unencrypted:
      // MailerService sets requireTLS so the upgrade is mandatory.
      secure: bool(process.env.SMTP_SECURE, false),
      user: process.env.SMTP_USER?.trim() || undefined,
      // Gmail displays app passwords in groups of four ("abcd efgh ijkl mnop").
      // Those spaces are presentation only; sending them verbatim fails AUTH,
      // so every whitespace character is stripped.
      pass: process.env.SMTP_PASS?.replace(/\s+/g, '') || undefined,
      fromName: (process.env.MAIL_FROM_NAME ?? 'GrantOS Notifications').trim(),
      fromAddress: (process.env.MAIL_FROM_ADDRESS ?? 'notifications@grantos.local').trim(),
      recipientPolicy: recipientPolicy(process.env.MAIL_RECIPIENT_POLICY),
      allowedDomains: list(process.env.MAIL_ALLOWED_DOMAINS),
      notificationBlockedDomains: process.env.NOTIFICATION_BLOCKED_DOMAINS
        ? list(process.env.NOTIFICATION_BLOCKED_DOMAINS)
        : DEFAULT_NOTIFICATION_BLOCKED_DOMAINS,
      // Lets automated checks exercise the full email path without putting
      // anything on the wire. A dry-run send is reported as 'skipped', never
      // as 'sent'.
      dryRun: bool(process.env.MAIL_DRY_RUN, false),
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
