import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Loads backend/.env, giving the file priority over inherited process
 * variables.
 *
 * Why this exists: dotenv's default is "an existing process variable always
 * wins". On a developer machine that produces a trap — a stale
 * `OPENAI_API_KEY` left in the Windows user environment silently beats the key
 * you just edited into `.env`, and the app keeps using the old one with no
 * indication why.
 *
 * The rule here is narrower and predictable:
 *   - a NON-EMPTY value in .env overrides an inherited variable
 *   - an EMPTY value in .env does NOT override, so `VAR=x npm start` and
 *     container-injected configuration still work
 *   - every override is reported at startup, by name, never by value
 *
 * In Docker and Kubernetes there is no .env file, so this is a no-op and
 * injected environment variables are used unchanged.
 */

/** Variables whose values must never be logged. */
const SECRET_NAMES = /(KEY|SECRET|PASSWORD|PASS|TOKEN|DSN|CREDENTIAL)/i;

/**
 * Every variable the application actually reads.
 *
 * Anything else found in .env is reported at startup. This catches the common
 * failure where a value is set under a plausible-but-wrong name (EMAIL_FROM
 * instead of MAIL_FROM_ADDRESS, say) and silently has no effect.
 */
const RECOGNISED = new Set([
  'NODE_ENV', 'PORT', 'CORS_ORIGINS', 'APP_PUBLIC_URL',
  'DATABASE_URL',
  'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'JWT_ACCESS_TTL', 'JWT_REFRESH_TTL',
  'SEED_ADMIN_EMAIL', 'SEED_ADMIN_PASSWORD', 'SEED_USER_EMAIL', 'SEED_USER_PASSWORD',
  'UPLOAD_DIR', 'MAX_UPLOAD_MB',
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS',
  'MAIL_FROM_NAME', 'MAIL_FROM_ADDRESS', 'MAIL_ALLOWED_DOMAINS', 'MAIL_DRY_RUN',
  'NOTIFICATIONS_CRON_ENABLED', 'NOTIFICATIONS_CRON', 'NOTIFICATIONS_TIMEZONE',
  'INVITATION_EXPIRY_DAYS',
  'OPENAI_API_KEY', 'OPENAI_MODEL', 'OPENAI_BASE_URL', 'AI_MAX_INPUT_CHARS',
  'K8S_NAMESPACE', 'SEED_ON_START',
]);

/** Suggests the correct name for a few likely mistakes. */
const SUGGESTIONS: Record<string, string> = {
  EMAIL_FROM: 'MAIL_FROM_ADDRESS (plus MAIL_FROM_NAME for the display name)',
  MAIL_FROM: 'MAIL_FROM_ADDRESS',
  EMAIL_FROM_NAME: 'MAIL_FROM_NAME',
  EMAIL_HOST: 'SMTP_HOST',
  EMAIL_PORT: 'SMTP_PORT',
  EMAIL_USER: 'SMTP_USER',
  EMAIL_PASS: 'SMTP_PASS',
  EMAIL_PASSWORD: 'SMTP_PASS',
  GMAIL_USER: 'SMTP_USER',
  GMAIL_APP_PASSWORD: 'SMTP_PASS',
  OPENAI_KEY: 'OPENAI_API_KEY',
  OPENAI_SECRET_KEY: 'OPENAI_API_KEY',
};

export interface EnvLoadReport {
  file: string;
  loaded: boolean;
  /** Names set from the file because the process had no value. */
  applied: string[];
  /** Names where a non-empty file value replaced an inherited one. */
  overridden: string[];
  /** Names left as inherited because the file value was empty. */
  deferred: string[];
  /** Names present in .env that the application never reads. */
  unrecognised: string[];
  /**
   * Names assigned more than once. The last assignment wins, so an earlier
   * edit can be silently overridden by a stale line further down the file.
   */
  duplicated: Array<{ name: string; occurrences: number }>;
}

function parse(contents: string): { values: Map<string, string>; counts: Map<string, number> } {
  const result = new Map<string, string>();
  const counts = new Map<string, number>();

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    if (!key) continue;

    let value = line.slice(eq + 1).trim();

    // Strip one layer of matching quotes, if present.
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }

    // A later assignment overwrites an earlier one, which is how a stale line
    // can silently defeat a fresh edit. The count is kept so this is reported.
    counts.set(key, (counts.get(key) ?? 0) + 1);
    result.set(key, value);
  }

  return { values: result, counts };
}

export function loadEnv(cwd: string = process.cwd()): EnvLoadReport {
  const file = resolve(cwd, '.env');
  const report: EnvLoadReport = {
    file,
    loaded: false,
    applied: [],
    overridden: [],
    deferred: [],
    unrecognised: [],
    duplicated: [],
  };

  if (!existsSync(file)) return report;

  report.loaded = true;
  const { values, counts } = parse(readFileSync(file, 'utf8'));

  for (const [name, occurrences] of counts) {
    if (occurrences > 1) report.duplicated.push({ name, occurrences });
  }

  for (const [key, value] of values) {
    if (!RECOGNISED.has(key) && value !== '') {
      report.unrecognised.push(key);
    }

    const inherited = process.env[key];
    const hasInherited = inherited !== undefined && inherited !== '';

    if (!hasInherited) {
      process.env[key] = value;
      if (value !== '') report.applied.push(key);
      continue;
    }

    if (value === '') {
      // Deliberately not overriding: lets an operator inject a value without
      // editing the file.
      report.deferred.push(key);
      continue;
    }

    if (inherited !== value) {
      process.env[key] = value;
      report.overridden.push(key);
    }
  }

  return report;
}

/** Human-readable summary for the startup log. Never includes a value. */
export function describeEnvLoad(report: EnvLoadReport): string[] {
  if (!report.loaded) {
    return [`No .env file at ${report.file}; using the process environment only.`];
  }

  const lines = [`Loaded configuration from ${report.file}`];

  if (report.overridden.length) {
    lines.push(
      `.env overrode inherited value(s) for: ${report.overridden.join(', ')} ` +
        '(the file wins over a stale shell or machine variable)',
    );
  }

  if (report.deferred.length) {
    const names = report.deferred
      .map((n) => (SECRET_NAMES.test(n) ? `${n} (secret)` : n))
      .join(', ');
    lines.push(
      `.env left blank, so the inherited value is still in use for: ${names}. ` +
        'Set it in .env, or clear it from your environment, if that is not what you want.',
    );
  }

  for (const { name, occurrences } of report.duplicated) {
    lines.push(
      `.env assigns ${name} ${occurrences} times — only the LAST one takes effect. ` +
        'Remove the earlier lines, or an edit you made further up the file will be ignored.',
    );
  }

  for (const name of report.unrecognised) {
    const hint = SUGGESTIONS[name];
    lines.push(
      `.env sets ${name}, which this application does not read — it has no effect.` +
        (hint ? ` Did you mean ${hint}?` : ''),
    );
  }

  return lines;
}
