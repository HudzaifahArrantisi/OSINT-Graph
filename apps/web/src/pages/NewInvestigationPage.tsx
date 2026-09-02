import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Navbar } from '../components/layout/Navbar';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { api } from '../lib/api';
import { useAppStore } from '../stores/appStore';
import { ArrowLeft, FolderPlus, ShieldCheck } from 'lucide-react';

export function NewInvestigationPage() {
  const navigate = useNavigate();
  const { addToast } = useAppStore();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Nama atau target investigasi wajib diisi');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const created = await api.investigations.create({
        title: title.trim(),
        description: description.trim() || undefined,
        priority: 'MEDIUM',
        tags: [],
      });

      addToast('Kasus investigasi baru berhasil dibuat', 'success');
      navigate(`/investigations/${created.id}`);
    } catch (err: any) {
      setError(err.message || 'Gagal membuat kasus investigasi');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-app flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col justify-center -mt-12 space-y-5">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text transition-colors self-start"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Kembali</span>
        </button>

        <div className="space-y-1">
          <h1 className="text-xl font-bold text-text">Buat Investigasi Baru</h1>
          <p className="text-xs text-text-muted">
            Mulai workspace baru untuk memetakan dan mengumpulkan relasi intelijen OSINT.
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
              label="Judul / Nama Target Investigasi"
              placeholder="Contoh: Investigasi target-domain.org atau Nama Target"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={loading}
              autoFocus
            />

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">
                Catatan / Deskripsi Singkat <span className="text-text-muted font-normal">(opsional)</span>
              </label>
              <textarea
                rows={3}
                className="input-field resize-none text-xs font-sans"
                placeholder="Tuliskan catatan singkat, hipotesis awal, atau lingkup penyelidikan..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="pt-4 border-t border-border-subtle flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
                <ShieldCheck className="w-3.5 h-3.5 text-status-success" />
                <span>Private Workspace</span>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" type="button" onClick={() => navigate(-1)} disabled={loading}>
                  Batal
                </Button>
                <Button
                  variant="primary"
                  type="submit"
                  loading={loading}
                  icon={<FolderPlus className="w-4 h-4" />}
                >
                  Mulai Kasus
                </Button>
              </div>
            </div>
          </form>
        </Card>
      </main>
    </div>
  );
}
