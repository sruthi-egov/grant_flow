/**
 * Tests for SMTP transport configuration.
 *
 * These cover the settings that are easy to get subtly wrong and that fail
 * only at delivery time: STARTTLS on port 587, certificate validation, Gmail
 * app passwords copied with their display spaces, and the rule that a dry run
 * or a refused recipient is never reported as "sent".
 *
 * nodemailer is mocked, so nothing contacts a mail server.
 */
import * as nodemailer from 'nodemailer';
import { MailerService } from './mailer.service';

jest.mock('nodemailer');

const createTransport = nodemailer.createTransport as unknown as jest.Mock;

interface MailOverrides {
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  pass?: string;
  fromName?: string;
  fromAddress?: string;
  recipientPolicy?: 'unrestricted' | 'allowlist';
  allowedDomains?: string[];
  notificationBlockedDomains?: string[];
  dryRun?: boolean;
}

function build(overrides: MailOverrides = {}, extra: Record<string, any> = {}) {
  const mail = {
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    user: 'sender@gmail.com',
    pass: 'abcdefghijklmnop',
    fromName: 'GrantOS Notifications',
    fromAddress: 'sender@gmail.com',
    recipientPolicy: 'unrestricted' as 'unrestricted' | 'allowlist',
    allowedDomains: ['grantos.local'],
    notificationBlockedDomains: ['grantos.local', 'example.com', 'example.org'],
    dryRun: false,
    ...overrides,
  };

  // Typed parameter so the assertions below can read the sent message.
  const sendMail = jest.fn(async (_message: any) => ({ messageId: '<test@local>' }));
  const verify = jest.fn(async () => true);
  createTransport.mockReturnValue({ sendMail, verify });

  const config: any = {
    get: (key: string) => {
      if (key === 'mail') return mail;
      if (key.startsWith('mail.')) return (mail as any)[key.slice(5)];
      const values: Record<string, any> = {
        isProduction: false,
        appPublicUrl: 'http://localhost:5173',
        ...extra,
      };
      return values[key];
    },
  };

  const service = new MailerService(config);
  service.onModuleInit();

  return { service, sendMail, verify, options: createTransport.mock.calls.at(-1)?.[0] ?? {} };
}

beforeEach(() => {
  createTransport.mockReset();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('Gmail transport configuration', () => {
  it('connects to smtp.gmail.com on port 587', () => {
    const { options } = build();
    expect(options.host).toBe('smtp.gmail.com');
    expect(options.port).toBe(587);
  });

  it('uses STARTTLS rather than implicit TLS on 587', () => {
    const { options } = build({ secure: false });
    expect(options.secure).toBe(false);
  });

  it('REQUIRES the STARTTLS upgrade, so a downgrade cannot send in clear text', () => {
    const { options } = build({ secure: false });
    expect(options.requireTLS).toBe(true);
  });

  it('validates the server certificate for a real relay', () => {
    const { options } = build();
    expect(options.tls.rejectUnauthorized).toBe(true);
  });

  it('refuses TLS below 1.2', () => {
    const { options } = build();
    expect(options.tls.minVersion).toBe('TLSv1.2');
  });

  it('passes the configured credentials to the transport', () => {
    const { options } = build({ user: 'sender@gmail.com', pass: 'abcdefghijklmnop' });
    expect(options.auth).toEqual({ user: 'sender@gmail.com', pass: 'abcdefghijklmnop' });
  });

  it('omits auth entirely when no user is configured', () => {
    const { options } = build({ user: undefined, host: 'localhost', port: 1025 });
    expect(options.auth).toBeUndefined();
  });

  it('does not require TLS for a local capture tool with a self-signed certificate', () => {
    const { options } = build({ host: 'localhost', port: 1025, user: undefined });
    expect(options.requireTLS).toBe(false);
    expect(options.tls.rejectUnauthorized).toBe(false);
  });

  it('uses implicit TLS without requireTLS when secure is true', () => {
    const { options } = build({ secure: true, port: 465 });
    expect(options.secure).toBe(true);
    expect(options.requireTLS).toBe(false);
  });
});

describe('delivery mode reporting', () => {
  it('reports real delivery for Gmail', () => {
    const { service } = build();
    expect(service.status.mode).toBe('real_delivery');
    expect(service.isLocalCapture).toBe(false);
  });

  it('reports local capture for localhost', () => {
    const { service } = build({ host: 'localhost', port: 1025, user: undefined });
    expect(service.status.mode).toBe('local_capture');
    expect(service.isLocalCapture).toBe(true);
  });

  it('reports dry run when enabled', () => {
    const { service } = build({ dryRun: true });
    expect(service.status.mode).toBe('dry_run');
    expect(service.status.dry_run).toBe(true);
  });

  it('never exposes the password through status', () => {
    const { service } = build({ pass: 'super-secret-value' });
    expect(JSON.stringify(service.status)).not.toContain('super-secret-value');
  });
});

describe('sending', () => {
  it('sends through the transport with the configured sender name and address', async () => {
    const { service, sendMail } = build({
      fromName: 'GrantOS Notifications',
      fromAddress: 'sender@gmail.com',
    });

    const result = await service.send({
      to: 'someone@grantos.local',
      subject: 'Subject',
      html: '<p>Body</p>',
    });

    expect(result.status).toBe('sent');
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0].from).toBe('"GrantOS Notifications" <sender@gmail.com>');
    expect(sendMail.mock.calls[0][0].to).toBe('someone@grantos.local');
  });

  it('reports a transport failure as failed, never as sent', async () => {
    const { service, sendMail } = build();
    sendMail.mockRejectedValueOnce(new Error('535 Authentication failed'));

    const result = await service.send({ to: 'a@grantos.local', subject: 's', html: 'h' });

    expect(result.status).toBe('failed');
    expect(result.error).toContain('535');
  });

  it('does not transmit anything in dry-run mode', async () => {
    const { service, sendMail } = build({ dryRun: true });

    const result = await service.send({ to: 'a@grantos.local', subject: 's', html: 'h' });

    expect(sendMail).not.toHaveBeenCalled();
    // Crucially 'skipped', so a dry run is never mistaken for a delivery.
    expect(result.status).toBe('skipped');
    expect(result.error).toMatch(/MAIL_DRY_RUN/);
    expect(result.error).toMatch(/not transmitted/i);
  });

  it('refuses a recipient outside the allow-list when that policy is selected', async () => {
    const { service, sendMail } = build({
      recipientPolicy: 'allowlist',
      allowedDomains: ['grantos.local'],
    });

    const result = await service.send({ to: 'stranger@contoso.co.uk', subject: 's', html: 'h' });

    expect(sendMail).not.toHaveBeenCalled();
    expect(result.status).toBe('skipped');
    expect(result.error).toMatch(/MAIL_ALLOWED_DOMAINS/);
  });

  it('allows any recipient when mail cannot leave the machine', async () => {
    const { service, sendMail } = build({
      host: 'localhost',
      port: 1025,
      user: undefined,
      allowedDomains: ['grantos.local'],
    });

    const result = await service.send({ to: 'stranger@example.net', subject: 's', html: 'h' });

    expect(sendMail).toHaveBeenCalled();
    expect(result.status).toBe('sent');
  });

  it('does NOT treat an empty allow-list as unrestricted', async () => {
    // An empty list under the allowlist policy means "nobody", not "everybody".
    const { service, sendMail } = build({ recipientPolicy: 'allowlist', allowedDomains: [] });

    const result = await service.send({ to: 'anyone@contoso.co.uk', subject: 's', html: 'h' });

    expect(sendMail).not.toHaveBeenCalled();
    expect(result.status).toBe('skipped');
  });

  it('always allows the configured sender, so a self-test needs no allow-list change', async () => {
    const { service, sendMail } = build({
      user: 'sender@gmail.com',
      fromAddress: 'sender@gmail.com',
      allowedDomains: ['grantos.local'], // deliberately excludes gmail.com
    });

    const result = await service.send({ to: 'sender@gmail.com', subject: 's', html: 'h' });

    expect(sendMail).toHaveBeenCalled();
    expect(result.status).toBe('sent');
  });

  it('matches the sender case-insensitively and ignores padding', async () => {
    const { service, sendMail } = build({
      user: 'sender@gmail.com',
      fromAddress: 'sender@gmail.com',
      allowedDomains: ['grantos.local'],
    });

    const result = await service.send({ to: '  SENDER@Gmail.COM ', subject: 's', html: 'h' });

    expect(sendMail).toHaveBeenCalled();
    expect(result.status).toBe('sent');
  });

  describe('unrestricted policy accepts real-world providers', () => {
    it.each([
      ['Gmail', 'someone@gmail.com'],
      ['Gmail with a plus tag', 'someone+grants@gmail.com'],
      ['Googlemail', 'someone@googlemail.com'],
      ['Outlook', 'someone@outlook.com'],
      ['Hotmail', 'someone@hotmail.co.uk'],
      ['Microsoft 365 company domain', 'first.last@contoso.com'],
      ['company subdomain', 'ops@mail.contoso.co.uk'],
      ['Indian company domain', 'sruthi@egov.org.in'],
      ['long multi-label domain', 'a@a.b.c.example-corp.org'],
      ['hyphenated domain', 'info@my-company.io'],
      ['numeric domain label', 'user@123corp.com'],
    ])('accepts %s', async (_label, address) => {
      const { service, sendMail } = build({ recipientPolicy: 'unrestricted' });

      const result = await service.send({ to: address, subject: 's', html: 'h' });

      expect(result.status).toBe('sent');
      expect(sendMail).toHaveBeenCalledTimes(1);
      expect(sendMail.mock.calls[0][0].to).toBe(address);
    });

    it('accepts a demo-domain address for a transactional send', async () => {
      // Blocking demo domains is a notification-only rule; a human inviting
      // someone at example.com must still work.
      const { service, sendMail } = build({ recipientPolicy: 'unrestricted' });

      const result = await service.send({ to: 'person@example.com', subject: 's', html: 'h' });

      expect(result.status).toBe('sent');
      expect(sendMail).toHaveBeenCalled();
    });
  });

  describe('invalid addresses are rejected under every policy', () => {
    it.each([
      ['no at-sign', 'not-an-email'],
      ['no domain', 'user@'],
      ['no local part', '@example.com'],
      ['no TLD', 'user@localhost-only'],
      ['embedded space', 'user name@gmail.com'],
      ['empty', ''],
    ])('rejects %s', async (_label, address) => {
      const { service, sendMail } = build({ recipientPolicy: 'unrestricted' });

      const result = await service.send({ to: address, subject: 's', html: 'h' });

      expect(sendMail).not.toHaveBeenCalled();
      expect(result.status).toBe('skipped');
      expect(result.error).toMatch(/not a valid email address/i);
    });
  });

  describe('automated notifications never reach demo domains', () => {
    it.each([
      ['grantos.local', 'anita.raghavan@grantos.local'],
      ['example.com', 'finance@example.com'],
      ['example.org', 'team@example.org'],
    ])('refuses a notification to %s', async (_label, address) => {
      const { service, sendMail } = build({ recipientPolicy: 'unrestricted' });

      const result = await service.send({
        to: address,
        subject: 's',
        html: 'h',
        purpose: 'notification',
      });

      expect(sendMail).not.toHaveBeenCalled();
      expect(result.status).toBe('skipped');
      expect(result.error).toMatch(/NOTIFICATION_BLOCKED_DOMAINS/);
    });

    it('still delivers notifications to a genuine recipient', async () => {
      const { service, sendMail } = build({ recipientPolicy: 'unrestricted' });

      const result = await service.send({
        to: 'real.person@contoso.com',
        subject: 's',
        html: 'h',
        purpose: 'notification',
      });

      expect(result.status).toBe('sent');
      expect(sendMail).toHaveBeenCalled();
    });

    it('blocks demo domains even under local capture, so a dry run matches the real run', async () => {
      const { service, sendMail } = build({
        host: 'localhost',
        port: 1025,
        user: undefined,
      });

      const result = await service.send({
        to: 'anita.raghavan@grantos.local',
        subject: 's',
        html: 'h',
        purpose: 'notification',
      });

      expect(sendMail).not.toHaveBeenCalled();
      expect(result.status).toBe('skipped');
    });

    it('treats the blocked list case-insensitively', async () => {
      const { service, sendMail } = build();
      const result = await service.send({
        to: 'Someone@GrantOS.LOCAL',
        subject: 's',
        html: 'h',
        purpose: 'notification',
      });
      expect(sendMail).not.toHaveBeenCalled();
      expect(result.status).toBe('skipped');
    });

    it('does not block a domain that merely ends with a blocked one', async () => {
      // "notexample.com" must not match "example.com".
      const { service, sendMail } = build();
      const result = await service.send({
        to: 'person@notexample.com',
        subject: 's',
        html: 'h',
        purpose: 'notification',
      });
      expect(result.status).toBe('sent');
      expect(sendMail).toHaveBeenCalled();
    });

    it('defaults to transactional when no purpose is given', async () => {
      const { service, sendMail } = build();
      const result = await service.send({ to: 'person@example.com', subject: 's', html: 'h' });
      expect(result.status).toBe('sent');
      expect(sendMail).toHaveBeenCalled();
    });
  });

  it('still refuses a different address on the sender domain under allowlist', async () => {
    const { service, sendMail } = build({
      recipientPolicy: 'allowlist',
      user: 'sender@gmail.com',
      fromAddress: 'sender@gmail.com',
      allowedDomains: ['grantos.local'],
    });

    const result = await service.send({ to: 'someone-else@gmail.com', subject: 's', html: 'h' });

    expect(sendMail).not.toHaveBeenCalled();
    expect(result.status).toBe('skipped');
  });
});
