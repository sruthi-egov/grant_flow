import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { UserPlus, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import AuthLayout from '@/components/AuthLayout';
import { api } from '@/api/apiClient';

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;

/**
 * Public invitation acceptance page, reached from the emailed link at
 * /invite/:token.
 *
 * The recipient chooses their own password here. Their role and module
 * permissions are NOT submitted from this page — the backend reads them from
 * the stored invitation, so they cannot be edited in the request.
 */
export default function AcceptInvite() {
  const { token } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitError, setSubmitError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const preview = await api.invitations.preview(token);
        if (!cancelled) {
          setInvite(preview);
          setFullName(preview.email.split('@')[0]);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError({
            reason: err?.data?.error ?? 'invitation_invalid',
            message:
              err?.message ||
              'This invitation link is not valid. Ask an administrator to send a new one.',
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const validate = () => {
    if (!password) return 'Choose a password.';
    if (!PASSWORD_REGEX.test(password)) {
      return 'Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number and a special character.';
    }
    if (password !== confirm) return 'The two passwords do not match.';
    return null;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const problem = validate();
    if (problem) {
      setSubmitError(problem);
      return;
    }

    setSubmitError(null);
    setSubmitting(true);
    try {
      await api.invitations.accept(token, { password, full_name: fullName.trim() });
      setDone(true);
      // Short pause so the confirmation is readable before the redirect.
      setTimeout(() => navigate('/login', { replace: true }), 2500);
    } catch (err) {
      setSubmitError(err?.message || 'Could not complete your sign-up. Please try again.');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  if (loadError) {
    const title =
      loadError.reason === 'invitation_expired'
        ? 'This invitation has expired'
        : loadError.reason === 'invitation_already_used'
          ? 'This invitation has already been used'
          : loadError.reason === 'invitation_revoked'
            ? 'This invitation is no longer valid'
            : 'Invitation not valid';

    return (
      <AuthLayout icon={AlertCircle} title={title} subtitle="GrantOS">
        <div className="space-y-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{loadError.message}</AlertDescription>
          </Alert>
          <Button variant="outline" className="w-full" onClick={() => navigate('/login')}>
            Go to sign in
          </Button>
        </div>
      </AuthLayout>
    );
  }

  if (done) {
    return (
      <AuthLayout icon={CheckCircle2} title="Account created" subtitle="GrantOS">
        <div className="space-y-4 text-center">
          <p className="text-sm text-muted-foreground">
            Your account for <strong>{invite.email}</strong> is ready. Taking you to sign in…
          </p>
          <Button className="w-full" onClick={() => navigate('/login', { replace: true })}>
            Sign in now
          </Button>
        </div>
      </AuthLayout>
    );
  }

  const expiryDate = invite.expires_at ? new Date(invite.expires_at).toLocaleDateString() : null;

  return (
    <AuthLayout
      icon={UserPlus}
      title="Accept your invitation"
      subtitle="Choose a password to activate your GrantOS account"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-lg bg-muted/50 border border-border p-3 text-sm space-y-1">
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Email</span>
            <span className="font-medium truncate">{invite.email}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Role</span>
            <span className="font-medium capitalize">{invite.role}</span>
          </div>
          {invite.invited_by && (
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Invited by</span>
              <span className="font-medium truncate">{invite.invited_by}</span>
            </div>
          )}
          {expiryDate && (
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Link valid until</span>
              <span className="font-medium">{expiryDate}</span>
            </div>
          )}
        </div>

        {submitError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label htmlFor="full_name">Your name</Label>
          <Input
            id="full_name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Jane Doe"
            autoComplete="name"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Choose a password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            At least 8 characters, with upper and lower case, a number and a special character.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm password</Label>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Creating your account…
            </>
          ) : (
            'Create account'
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
