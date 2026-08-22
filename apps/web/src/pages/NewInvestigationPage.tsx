import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Navbar } from '../components/layout/Navbar';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { api } from '../lib/api';
import { useAppStore } from '../stores/appStore';
import { INVESTIGATION_PRIORITIES, InvestigationPriority } from '@nexusgraph/shared';
import { ArrowLeft, FolderPlus, ShieldCheck, Tag } from 'lucide-react';

export function NewInvestigationPage() {
  const navigate = useNavigate();
  const { addToast } = useAppStore();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<InvestigationPriority>('MEDIUM');
  const [tagsInput, setTagsInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Investigation title is required');
      return;
    }

    setError('');
    setLoading(true);

    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      const created = await api.investigations.create({
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        tags,
      });

      addToast('Investigation created successfully', 'success');
      navigate(`/investigations/${created.id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create investigation');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-app flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-3xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back</span>
        </button>

        <div className="pb-3 border-b border-border-subtle">
          <h1 className="text-xl font-bold text-text">New Investigation Case</h1>
          <p className="text-xs text-text-muted mt-0.5">
            Initialize an investigation dossier to start correlating public artifacts
          </p>
        </div>

        <Card className="p-6">
          {error && (
            <div className="mb-4 p-3 rounded-input bg-status-danger/10 border border-status-danger/30 text-xs text-status-danger">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Investigation Title"
              placeholder="e.g. Infrastructure Audit — target-domain.org"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={loading}
              autoFocus
            />

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">
                Description / Investigation Hypothesis
              </label>
              <textarea
                rows={4}
                className="input-field resize-none text-xs font-sans"
                placeholder="Document the objective, scope, seed sources, or hypothesis..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={loading}
              />
            </div>

            {/* Priority selection */}
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">
                Priority Level
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {INVESTIGATION_PRIORITIES.map((p) => {
                  const active = priority === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPriority(p)}
                      className={`p-2.5 rounded-input border text-xs font-mono font-medium transition-all ${
                        active
                          ? 'bg-primary/15 border-primary text-primary shadow-sm'
                          : 'bg-surface-2 border-border-subtle text-text-muted hover:text-text'
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tags input */}
            <Input
              label="Tags (comma-separated)"
              placeholder="incident, defensive-audit, domain-pivot"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              leftIcon={<Tag className="w-4 h-4" />}
              disabled={loading}
            />

            <div className="pt-4 border-t border-border-subtle flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
                <ShieldCheck className="w-3.5 h-3.5 text-status-success" />
                <span>Private user-isolated workspace</span>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" type="button" onClick={() => navigate(-1)} disabled={loading}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  type="submit"
                  loading={loading}
                  icon={<FolderPlus className="w-4 h-4" />}
                >
                  Create Dossier
                </Button>
              </div>
            </div>
          </form>
        </Card>
      </main>
    </div>
  );
}
