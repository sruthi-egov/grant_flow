/**
 * Tests for environment parsing.
 *
 * Covers the cases that silently produce a broken mail setup: a boolean read
 * from a string, a Gmail app password copied with its display spaces, and an
 * API key carrying stray punctuation.
 */
import configuration, { describeSuspectApiKey } from './configuration';

const ORIGINAL = { ...process.env };

function load(overrides: Record<string, string | undefined>) {
  process.env = { ...ORIGINAL, ...overrides } as NodeJS.ProcessEnv;
  return configuration();
}

afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe('SMTP_SECURE parsing', () => {
  it.each([
    ['false', false],
    ['FALSE', false],
    ['0', false],
    ['no', false],
    ['', false],
    [undefined, false],
  ])('treats %s as false (STARTTLS on 587)', (value, expected) => {
    expect(load({ SMTP_SECURE: value as any }).mail.secure).toBe(expected);
  });

  it.each([
    ['true', true],
    ['TRUE', true],
    ['1', true],
    ['yes', true],
    ['on', true],
  ])('treats %s as true (implicit TLS)', (value, expected) => {
    expect(load({ SMTP_SECURE: value as any }).mail.secure).toBe(expected);
  });

  it('never coerces the string "false" to true', () => {
    // The classic bug: Boolean('false') === true.
    expect(load({ SMTP_SECURE: 'false' }).mail.secure).not.toBe(true);
  });
});

describe('SMTP_PASS normalisation', () => {
  it('strips the display spaces Gmail shows in an app password', () => {
    expect(load({ SMTP_PASS: 'abcd efgh ijkl mnop' }).mail.pass).toBe('abcdefghijklmnop');
  });

  it('leaves an already-compact password unchanged', () => {
    expect(load({ SMTP_PASS: 'abcdefghijklmnop' }).mail.pass).toBe('abcdefghijklmnop');
  });

  it('removes surrounding whitespace', () => {
    expect(load({ SMTP_PASS: '  abcdefghijklmnop  ' }).mail.pass).toBe('abcdefghijklmnop');
  });

  it('is undefined when not configured', () => {
    expect(load({ SMTP_PASS: '' }).mail.pass).toBeUndefined();
  });
});

describe('SMTP host, port and sender', () => {
  it('reads the Gmail host and port', () => {
    const c = load({ SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: '587' });
    expect(c.mail.host).toBe('smtp.gmail.com');
    expect(c.mail.port).toBe(587);
  });

  it('trims stray whitespace from the host and user', () => {
    const c = load({ SMTP_HOST: ' smtp.gmail.com ', SMTP_USER: ' sender@gmail.com ' });
    expect(c.mail.host).toBe('smtp.gmail.com');
    expect(c.mail.user).toBe('sender@gmail.com');
  });

  it('reads the sender name and address from MAIL_FROM_* variables', () => {
    const c = load({ MAIL_FROM_NAME: 'GrantOS Notifications', MAIL_FROM_ADDRESS: 'sender@gmail.com' });
    expect(c.mail.fromName).toBe('GrantOS Notifications');
    expect(c.mail.fromAddress).toBe('sender@gmail.com');
  });

  it('falls back to a non-routable default rather than an arbitrary address', () => {
    const c = load({ MAIL_FROM_ADDRESS: undefined });
    expect(c.mail.fromAddress).toBe('notifications@grantos.local');
  });
});

describe('MAIL_DRY_RUN', () => {
  it('defaults to off', () => {
    expect(load({ MAIL_DRY_RUN: undefined }).mail.dryRun).toBe(false);
  });
  it('can be enabled', () => {
    expect(load({ MAIL_DRY_RUN: 'true' }).mail.dryRun).toBe(true);
  });
});

describe('OPENAI_API_KEY handling', () => {
  it('trims surrounding whitespace', () => {
    expect(load({ OPENAI_API_KEY: '  sk-proj-abc  ' }).ai.apiKey).toBe('sk-proj-abc');
  });

  it('is disabled when empty', () => {
    const c = load({ OPENAI_API_KEY: '' });
    expect(c.ai.enabled).toBe(false);
    expect(c.ai.apiKey).toBeUndefined();
  });

  it('keeps the configured model', () => {
    expect(load({ OPENAI_MODEL: 'gpt-4o-mini' }).ai.model).toBe('gpt-4o-mini');
  });
});

describe('describeSuspectApiKey', () => {
  it('accepts a well-formed key', () => {
    expect(describeSuspectApiKey('sk-proj-abcdefghijklmnop')).toBeNull();
  });

  it.each([
    ['a trailing full stop', 'sk-proj-abc.', /ends with/],
    ['a trailing comma', 'sk-proj-abc,', /ends with/],
    ['wrapping double quotes', '"sk-proj-abc"', /quotation marks/],
    ['wrapping single quotes', "'sk-proj-abc'", /quotation marks/],
    ['surrounding whitespace', ' sk-proj-abc ', /whitespace/],
    ['an inner space', 'sk-proj abc', /space or line break/],
    ['a missing sk- prefix', 'proj-abcdef', /does not start with/],
  ])('flags %s', (_label, key, pattern) => {
    expect(describeSuspectApiKey(key)).toMatch(pattern);
  });

  it('says nothing when no key is configured', () => {
    expect(describeSuspectApiKey(undefined)).toBeNull();
    expect(describeSuspectApiKey('')).toBeNull();
  });
});
