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

export interface EnvLoadReport {
  file: string;
  loaded: boolean;
  /** Names set from the file because the process had no value. */
  applied: string[];
  /** Names where a non-empty file value replaced an inherited one. */
  overridden: string[];
  /** Names left as inherited because the file value was empty. */
  deferred: string[];
}

function parse(contents: string): Map<string, string> {
  const result = new Map<string, string>();

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

    result.set(key, value);
  }

  return result;
}

export function loadEnv(cwd: string = process.cwd()): EnvLoadReport {
  const file = resolve(cwd, '.env');
  const report: EnvLoadReport = {
    file,
    loaded: false,
    applied: [],
    overridden: [],
    deferred: [],
  };

  if (!existsSync(file)) return report;

  report.loaded = true;
  const values = parse(readFileSync(file, 'utf8'));

  for (const [key, value] of values) {
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

  return lines;
}
