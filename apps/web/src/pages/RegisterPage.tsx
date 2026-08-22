import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Network, Lock, Mail, User, ShieldCheck, CheckCircle2 } from 'lucide-react';

export function RegisterPage() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [successInfo, setSuccessInfo] = useState('');
  const { signUp, loading } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in all required fields');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setError('');
    setSuccessInfo('');

    try {
      const res = await signUp(email, password, displayName);
      if (res.session) {
        navigate('/dashboard');
      } else {
        setSuccessInfo(
          'Registration successful! If email confirmation is enabled in Supabase, please check your inbox or disable "Confirm email" in Supabase Authentication settings to login immediately.',
        );
      }
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    }
  };

  return (
    <div className="min-h-screen bg-app flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-surface border border-border-subtle rounded-card shadow-2xl p-6 sm:p-8 animate-slide-in-up">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-primary/15 border border-primary/40 flex items-center justify-center text-primary mb-3">
            <Network className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-text">Create Analyst Account</h1>
          <p className="text-xs text-text-muted mt-1">
            Access the NexusGraph OSINT Investigation Platform
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-input bg-status-danger/10 border border-status-danger/30 text-xs text-status-danger">
            {error}
          </div>
        )}

        {successInfo && (
          <div className="mb-4 p-3 rounded-input bg-status-success/10 border border-status-success/30 text-xs text-status-success flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold mb-1">Account Created</p>
              <p className="text-[11px] text-text-secondary leading-relaxed">{successInfo}</p>
              <Link to="/login" className="inline-block mt-2 font-medium text-primary hover:underline">
                Go to Sign In →
              </Link>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <Input
            label="Analyst Name / Call sign"
            placeholder="John Doe"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            leftIcon={<User className="w-4 h-4" />}
            disabled={loading}
          />

          <Input
            label="Email Address"
            type="email"
            placeholder="analyst@domain.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            leftIcon={<Mail className="w-4 h-4" />}
            disabled={loading}
          />

          <Input
            label="Password"
            type="password"
            placeholder="Min. 6 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            leftIcon={<Lock className="w-4 h-4" />}
            disabled={loading}
          />

          <Input
            label="Confirm Password"
            type="password"
            placeholder="Re-type password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            leftIcon={<Lock className="w-4 h-4" />}
            disabled={loading}
          />

          <Button type="submit" variant="primary" size="lg" className="w-full mt-3" loading={loading}>
            Create Account & Launch Workspace
          </Button>
        </form>

        <div className="mt-6 pt-4 border-t border-border-subtle text-center text-xs text-text-muted">
          <span>Already registered? </span>
          <Link to="/login" className="text-primary hover:text-primary-hover font-medium">
            Sign In
          </Link>
        </div>

        <div className="mt-6 flex items-center justify-center gap-1.5 text-[10px] text-text-muted">
          <ShieldCheck className="w-3 h-3 text-status-success" />
          <span>Self-contained User Ownership Isolation</span>
        </div>
      </div>
    </div>
  );
}
