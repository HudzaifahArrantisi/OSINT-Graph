import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Network, Lock, Mail, ShieldCheck } from 'lucide-react';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { signIn, loading } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter both email and password');
      return;
    }

    setError('');
    try {
      await signIn(email, password);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Invalid login credentials');
    }
  };

  return (
    <div className="min-h-screen bg-app flex flex-col justify-center items-center p-4">
      {/* Container */}
      <div className="w-full max-w-md bg-surface border border-border-subtle rounded-card shadow-2xl p-6 sm:p-8 animate-slide-in-up">
        {/* Brand header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-primary/15 border border-primary/40 flex items-center justify-center text-primary mb-3">
            <Network className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-text">NexusGraph</h1>
          <p className="text-xs text-text-muted mt-1">
            OSINT Investigation & Public Footprint Workspace
          </p>
        </div>

        {/* Error notification */}
        {error && (
          <div className="mb-4 p-3 rounded-input bg-status-danger/10 border border-status-danger/30 text-xs text-status-danger">
            {error}
          </div>
        )}

        {/* Login form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Email Address"
            type="email"
            placeholder="analyst@domain.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            leftIcon={<Mail className="w-4 h-4" />}
            disabled={loading}
            autoFocus
          />

          <Input
            label="Password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            leftIcon={<Lock className="w-4 h-4" />}
            disabled={loading}
          />

          <Button type="submit" variant="primary" size="lg" className="w-full mt-2" loading={loading}>
            Sign In to Investigation Workspace
          </Button>
        </form>

        {/* Footer switch */}
        <div className="mt-6 pt-4 border-t border-border-subtle text-center text-xs text-text-muted">
          <span>Don't have an account? </span>
          <Link to="/register" className="text-primary hover:text-primary-hover font-medium">
            Register now
          </Link>
        </div>

        {/* Security watermark */}
        <div className="mt-6 flex items-center justify-center gap-1.5 text-[10px] text-text-muted">
          <ShieldCheck className="w-3 h-3 text-status-success" />
          <span>Encrypted Session · Row Level Security</span>
        </div>
      </div>
    </div>
  );
}
