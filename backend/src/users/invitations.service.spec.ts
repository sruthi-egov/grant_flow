/**
 * Unit tests for the invitation rules that protect account creation.
 *
 * The end-to-end script (scripts/verify/invitations.ps1) exercises the full
 * flow against a live database; these cover the decision logic in isolation so
 * a regression is caught without needing the stack running.
 */
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { InvitationsService } from './invitations.service';

/** Minimal stand-ins for the injected dependencies. */
function buildService(overrides: {
  users?: any[];
  invitations?: any[];
  onCreate?: (data: any) => void;
} = {}) {
  const users = overrides.users ?? [];
  const invitations = overrides.invitations ?? [];
  const sent: any[] = [];

  const prisma: any = {
    user: {
      findUnique: jest.fn(async ({ where }: any) =>
        users.find((u) => u.email === where.email) ?? null,
      ),
      create: jest.fn(async ({ data }: any) => ({ id: 'user-1', ...data })),
    },
    invitation: {
      findFirst: jest.fn(async () => null),
      findUnique: jest.fn(async ({ where }: any) =>
        invitations.find((i) => i.token_hash === where.token_hash || i.id === where.id) ?? null,
      ),
      create: jest.fn(async ({ data }: any) => {
        const row = {
          id: 'inv-1',
          accepted_at: null,
          revoked_at: null,
          sent_count: 1,
          last_sent_at: new Date(),
          created_date: new Date(),
          ...data,
        };
        overrides.onCreate?.(row);
        invitations.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = invitations.find((i) => i.id === where.id);
        Object.assign(row ?? {}, data);
        return row;
      }),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    auditLog: { create: jest.fn(async () => ({})) },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
  };

  const auth: any = { hashPassword: jest.fn(async (p: string) => `hashed:${p}`) };
  const mailer: any = {
    send: jest.fn(async (msg: any) => {
      sent.push(msg);
      return { status: 'sent' };
    }),
  };
  const config: any = {
    get: (key: string) => {
      const values: Record<string, any> = {
        'invitations.expiryDays': 7,
        appPublicUrl: 'http://localhost:5173',
        isProduction: false,
      };
      return values[key];
    },
  };

  return {
    service: new InvitationsService(prisma, auth, mailer, config),
    prisma,
    mailer,
    sent,
    invitations,
    users,
  };
}

const actor: any = {
  id: 'admin-1',
  email: 'admin@grantos.local',
  display_name: 'Admin',
  full_name: 'Admin',
  role: 'admin',
};

describe('creating an invitation', () => {
  it('rejects a malformed email address', async () => {
    const { service } = buildService();
    await expect(service.invite({ email: 'not-an-email' }, actor)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('normalises the email to lower case', async () => {
    const { service, invitations } = buildService();
    await service.invite({ email: '  New.Person@Example.ORG ' }, actor);
    expect(invitations[0].email).toBe('new.person@example.org');
  });

  it('refuses to invite someone who already has an account', async () => {
    const { service } = buildService({
      users: [{ email: 'existing@example.org' }],
    });
    await expect(service.invite({ email: 'existing@example.org' }, actor)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('defaults to the user role rather than admin', async () => {
    const { service, invitations } = buildService();
    await service.invite({ email: 'a@example.org' }, actor);
    expect(invitations[0].role).toBe('user');
  });

  it('ignores an unrecognised role value instead of trusting it', async () => {
    const { service, invitations } = buildService();
    await service.invite({ email: 'a@example.org', role: 'superuser' as any }, actor);
    expect(invitations[0].role).toBe('user');
  });

  it('rejects unknown module names rather than silently dropping them', async () => {
    const { service } = buildService();
    await expect(
      service.invite({ email: 'a@example.org', allowed_modules: ['Grants', 'Payroll'] }, actor),
    ).rejects.toThrow(/Unknown module/i);
  });

  it('de-duplicates the module list', async () => {
    const { service, invitations } = buildService();
    await service.invite({ email: 'a@example.org', allowed_modules: ['Grants', 'Grants', 'MOUs'] }, actor);
    expect(invitations[0].allowed_modules).toEqual(['Grants', 'MOUs']);
  });

  it('stores only a SHA-256 hash of the token, never the token itself', async () => {
    const { service, invitations } = buildService();
    const result = await service.invite({ email: 'a@example.org' }, actor);
    const token = result.accept_url!.split('/invite/')[1];

    expect(token.length).toBeGreaterThan(20);
    expect(invitations[0].token_hash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(invitations[0].token_hash).not.toContain(token);
  });

  it('issues a different token every time', async () => {
    const { service } = buildService();
    const a = await service.invite({ email: 'a@example.org' }, actor);
    const b = await service.invite({ email: 'b@example.org' }, actor);
    expect(a.accept_url).not.toBe(b.accept_url);
  });

  it('sets an expiry in the future', async () => {
    const { service, invitations } = buildService();
    await service.invite({ email: 'a@example.org' }, actor);
    expect(invitations[0].expires_at.getTime()).toBeGreaterThan(Date.now());
  });

  it('emails a link and never a password', async () => {
    const { service, sent } = buildService();
    await service.invite({ email: 'a@example.org' }, actor);
    expect(sent).toHaveLength(1);
    expect(sent[0].html).toContain('/invite/');
    expect(sent[0].html.toLowerCase()).not.toContain('temporary password');
  });

  it('reports a delivery failure instead of claiming success', async () => {
    const { service, mailer } = buildService();
    mailer.send = jest.fn(async () => ({ status: 'failed', error: 'connection refused' }));
    const result = await service.invite({ email: 'a@example.org' }, actor);
    expect(result.email_status).toBe('failed');
    // The invitation still exists so it can be resent.
    expect(result.invitation.id).toBeTruthy();
  });
});

describe('resolving a token', () => {
  const tokenFor = (raw: string) => createHash('sha256').update(raw).digest('hex');

  function withInvitation(partial: Partial<any>) {
    const raw = 'a'.repeat(43);
    return {
      raw,
      ...buildService({
        invitations: [
          {
            id: 'inv-1',
            email: 'a@example.org',
            token_hash: tokenFor(raw),
            role: 'user',
            allowed_modules: [],
            can_upload_pdf: false,
            expires_at: new Date(Date.now() + 86_400_000),
            accepted_at: null,
            revoked_at: null,
            invited_by: 'admin@grantos.local',
            ...partial,
          },
        ],
      }),
    };
  }

  it('previews a live invitation', async () => {
    const { service, raw } = withInvitation({});
    const preview = await service.preview(raw);
    expect(preview.email).toBe('a@example.org');
    expect(preview.role).toBe('user');
  });

  it('never returns the token hash in a preview', async () => {
    const { service, raw } = withInvitation({});
    expect(await service.preview(raw)).not.toHaveProperty('token_hash');
  });

  it('rejects an unknown token', async () => {
    const { service } = withInvitation({});
    await expect(service.preview('b'.repeat(43))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects an implausibly short token without a database lookup', async () => {
    const { service, prisma } = withInvitation({});
    await expect(service.preview('short')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.invitation.findUnique).not.toHaveBeenCalled();
  });

  it('rejects an already accepted invitation', async () => {
    const { service, raw } = withInvitation({ accepted_at: new Date() });
    await expect(service.preview(raw)).rejects.toThrow(/already been used/i);
  });

  it('rejects a revoked invitation', async () => {
    const { service, raw } = withInvitation({ revoked_at: new Date() });
    await expect(service.preview(raw)).rejects.toThrow(/replaced or cancelled/i);
  });

  it('rejects an expired invitation', async () => {
    const { service, raw } = withInvitation({ expires_at: new Date(Date.now() - 1000) });
    await expect(service.preview(raw)).rejects.toThrow(/expired/i);
  });
});

describe('accepting an invitation', () => {
  const raw = 'c'.repeat(43);

  function pending(partial: Partial<any> = {}) {
    return buildService({
      invitations: [
        {
          id: 'inv-1',
          email: 'invitee@example.org',
          token_hash: createHash('sha256').update(raw).digest('hex'),
          role: 'user',
          allowed_modules: ['Grants'],
          can_upload_pdf: true,
          expires_at: new Date(Date.now() + 86_400_000),
          accepted_at: null,
          revoked_at: null,
          invited_by: 'admin@grantos.local',
          ...partial,
        },
      ],
    });
  }

  it.each([
    ['too short', 'Ab1!'],
    ['no uppercase', 'abcdefg1!'],
    ['no lowercase', 'ABCDEFG1!'],
    ['no digit', 'Abcdefgh!'],
    ['no special character', 'Abcdefg1'],
  ])('rejects a password that is %s', async (_label, password) => {
    const { service } = pending();
    await expect(service.accept(raw, { password })).rejects.toThrow(/Password must be/i);
  });

  it('accepts a password that meets the policy', async () => {
    const { service } = pending();
    const result = await service.accept(raw, { password: 'ValidPass!2026' });
    expect(result.email).toBe('invitee@example.org');
  });

  it('takes the role from the invitation, not the request body', async () => {
    const { service, prisma } = pending({ role: 'user' });
    await service.accept(raw, { password: 'ValidPass!2026', role: 'admin' } as any);

    const created = prisma.user.create.mock.calls[0][0].data;
    expect(created.role).toBe('user');
  });

  it('takes module permissions from the invitation, not the request body', async () => {
    const { service, prisma } = pending({ allowed_modules: ['Grants'] });
    await service.accept(raw, {
      password: 'ValidPass!2026',
      allowed_modules: ['Grants', 'SOWs', 'MSAs', 'MOUs'],
      can_upload_pdf: true,
    } as any);

    const created = prisma.user.create.mock.calls[0][0].data;
    expect(created.allowed_modules).toEqual(['Grants']);
  });

  it('does not store the password in clear text', async () => {
    const { service, prisma } = pending();
    await service.accept(raw, { password: 'ValidPass!2026' });

    const created = prisma.user.create.mock.calls[0][0].data;
    expect(created.password_hash).toBe('hashed:ValidPass!2026');
    expect(created).not.toHaveProperty('password');
  });

  it('marks the account as active and not needing a password change', async () => {
    const { service, prisma } = pending();
    await service.accept(raw, { password: 'ValidPass!2026' });

    const created = prisma.user.create.mock.calls[0][0].data;
    expect(created.is_active).toBe(true);
    expect(created.must_change_password).toBe(false);
  });

  it('falls back to the email prefix when no name is given', async () => {
    const { service, prisma } = pending();
    await service.accept(raw, { password: 'ValidPass!2026' });
    expect(prisma.user.create.mock.calls[0][0].data.full_name).toBe('invitee');
  });

  it('refuses when an account already exists for the address', async () => {
    const { service } = buildService({
      users: [{ email: 'invitee@example.org' }],
      invitations: [
        {
          id: 'inv-1',
          email: 'invitee@example.org',
          token_hash: createHash('sha256').update(raw).digest('hex'),
          role: 'user',
          allowed_modules: [],
          can_upload_pdf: false,
          expires_at: new Date(Date.now() + 86_400_000),
          accepted_at: null,
          revoked_at: null,
          invited_by: 'admin@grantos.local',
        },
      ],
    });
    await expect(service.accept(raw, { password: 'ValidPass!2026' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('refuses a second simultaneous acceptance of the same token', async () => {
    const { service, prisma } = pending();
    // Simulate another request having already claimed the invitation.
    prisma.invitation.updateMany = jest.fn(async () => ({ count: 0 }));
    await expect(service.accept(raw, { password: 'ValidPass!2026' })).rejects.toThrow(
      /already been used/i,
    );
  });
});
