import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import AuthLayout from '@/components/AuthLayout';
import { useAuth } from '@/lib/AuthContext';

/**
 * Sign-in screen.
 *
 * Replaces the Base44 hosted login redirect. Credentials are posted to
 * /api/auth/login; the backend verifies them with argon2 and returns a JWT
 * pair. Nothing about the password is kept in the browser.
 */
export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await login(email.trim(), password);
      navigate('/', { replace: true });
    } catch (err) {
      if (err?.status === 0) {
        setError('Cannot reach the GrantOS API. Make sure the backend is running on port 3001.');
      } else if (err?.status === 429) {
        setError('Too many sign-in attempts. Wait a minute and try again.');
      } else {
        setError(err?.message || 'Sign-in failed. Check your email and password.');
      }
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      icon={KeyRound}
      title="Sign in to GrantOS"
      subtitle="Grants, MoUs, MSAs and SOWs in one place"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@organisation.org"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password"
          />
        </div>

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Signing in...
            </>
          ) : (
            'Sign in'
          )}
        </Button>

        <p className="text-xs text-muted-foreground text-center pt-2">
          Forgotten your password? Ask an administrator to reset it.
        </p>
      </form>
    </AuthLayout>
  );
}
