import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { SeedType, TransformDefinition } from '@nexusgraph/shared';
import {
  Sparkles,
  ShieldCheck,
  Globe2,
  Mail,
  Network,
  Link,
  Building,
  UserRound,
  Phone,
  CheckCircle2,
  XCircle,
  Loader2,
  Key,
  CheckSquare2,
  Square,
  Layers,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAppStore } from '../../stores/appStore';

interface StartDiscoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  onSuccess?: () => void;
}

interface SeedCategoryOption {
  id: SeedType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  placeholder: string;
}

const SEED_CATEGORY_OPTIONS: SeedCategoryOption[] = [
  {
    id: 'USERNAME',
    label: 'Username / Profil',
    icon: UserRound,
    placeholder: 'Contoh: candalenaa atau https://instagram.com/candalenaa',
  },
  {
    id: 'EMAIL',
    label: 'Email',
    icon: Mail,
    placeholder: 'Contoh: target@domain.com',
  },
  {
    id: 'DOMAIN',
    label: 'Domain',
    icon: Globe2,
    placeholder: 'Contoh: target-site.com',
  },
  {
    id: 'IP_ADDRESS',
    label: 'IP Address',
    icon: Network,
    placeholder: 'Contoh: 192.168.1.1 atau 8.8.8.8',
  },
  {
    id: 'URL',
    label: 'URL Web',
    icon: Link,
    placeholder: 'Contoh: https://example.com/target',
  },
  {
    id: 'ORGANIZATION',
    label: 'Organisasi',
    icon: Building,
    placeholder: 'Contoh: Nama Perusahaan / Organisasi',
  },
  {
    id: 'PHONE',
    label: 'No. Telepon',
    icon: Phone,
    placeholder: 'Contoh: +628123456789',
  },
];

interface SocialPlatformOption {
  id: string;
  name: string;
  badge: string;
  detail: string;
}

const SOCIAL_PLATFORMS: SocialPlatformOption[] = [
  {
    id: 'instagram',
    name: 'Instagram',
    badge: '4 Engine API',
    detail: 'Profil, bio & kontak',
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    badge: '2 Engine API',
    detail: 'Profil, bio & stats',
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    badge: '5 Endpoints',
    detail: 'Karir & riwayat kerja',
  },
];

export function StartDiscoveryModal({
  isOpen,
  onClose,
  caseId,
  onSuccess,
}: StartDiscoveryModalProps) {
  const queryClient = useQueryClient();
  const {
    addToast,
    addLiveLog,
    clearLiveLogs,
    setLiveLogsOpen,
    setIsDiscovering,
    setDiscoveryProgress,
    setDiscoverySummary,
  } = useAppStore();

  const [seedType, setSeedType] = useState<SeedType>('USERNAME');
  const [seedValue, setSeedValue] = useState('');
  const [plannedTransforms, setPlannedTransforms] = useState<TransformDefinition[]>([]);
  const [selectedTransformIds, setSelectedTransformIds] = useState<string[]>([]);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([
    'instagram',
    'tiktok',
    'linkedin',
  ]);
  const [loadingPlan, setLoadingPlan] = useState(false);

  // Execution state
  const [discoveryState, setDiscoveryState] = useState<'idle' | 'running' | 'complete'>('idle');
  const [discoveryResult, setDiscoveryResult] = useState<any>(null);
  const [error, setError] = useState('');

  // Fetch discovery plan whenever seedType changes
  useEffect(() => {
    if (!isOpen) return;
    setLoadingPlan(true);
    api.discoveries
      .plan(caseId, seedType, seedValue || 'example')
      .then((res) => {
        const transforms = res.transforms || [];
        setPlannedTransforms(transforms);
        // Default: select all available transforms
        setSelectedTransformIds(transforms.map((t: TransformDefinition) => t.id));
      })
      .catch(() => {
        setPlannedTransforms([]);
        setSelectedTransformIds([]);
      })
      .finally(() => {
        setLoadingPlan(false);
      });
  }, [isOpen, seedType, caseId]);

  const toggleTransform = (id: string) => {
    if (discoveryState === 'running') return;
    setSelectedTransformIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleToggleAllTransforms = () => {
    if (discoveryState === 'running') return;
    if (selectedTransformIds.length === plannedTransforms.length) {
      setSelectedTransformIds([]);
    } else {
      setSelectedTransformIds(plannedTransforms.map((t) => t.id));
    }
  };

  const togglePlatform = (platformId: string) => {
    if (discoveryState === 'running') return;
    setSelectedPlatforms((prev) =>
      prev.includes(platformId)
        ? prev.filter((p) => p !== platformId)
        : [...prev, platformId],
    );
  };

  const handleToggleAllPlatforms = () => {
    if (discoveryState === 'running') return;
    if (selectedPlatforms.length === SOCIAL_PLATFORMS.length) {
      setSelectedPlatforms([]);
    } else {
      setSelectedPlatforms(SOCIAL_PLATFORMS.map((p) => p.id));
    }
  };

  const isSocialIdentity = seedType === 'USERNAME';

  const handleStartDiscovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!seedValue.trim()) {
      setError('Masukkan nilai target / seed investigasi terlebih dahulu');
      return;
    }

    if (selectedTransformIds.length === 0) {
      setError('Pilih minimal 1 modul penelusuran');
      return;
    }

    if (
      isSocialIdentity &&
      selectedPlatforms.length === 0 &&
      selectedTransformIds.includes('social.rapidapi-social-lookup')
    ) {
      setError('Pilih minimal 1 platform media sosial (Instagram, TikTok, atau LinkedIn)');
      return;
    }

    setError('');
    setDiscoveryState('running');
    setDiscoveryResult(null);

    clearLiveLogs();
    setIsDiscovering(true);
    setLiveLogsOpen(true);
    addToast('Proses penelusuran OSINT dimulai...', 'info');

    // Close modal after triggering so user immediately sees graph updating
    onClose();

    try {
      let finalJobId = '';
      let entitiesCount = 0;
      let relCount = 0;
      let evCount = 0;
      let total = 0;

      await api.discoveries.stream(
        caseId,
        {
          seed_type: seedType,
          seed_value: seedValue.trim(),
          platforms: isSocialIdentity ? selectedPlatforms : undefined,
          selected_transforms: selectedTransformIds,
        },
        (event) => {
          if (event.log) {
            addLiveLog(event.log);
          }
          setDiscoveryProgress(event);

          if (event.jobId) finalJobId = event.jobId;
          if (typeof event.foundEntities === 'number') entitiesCount = event.foundEntities;
          if (typeof event.foundRelationships === 'number') relCount = event.foundRelationships;
          if (typeof event.foundEvidence === 'number') evCount = event.foundEvidence;
          if (typeof event.totalTransforms === 'number') total = event.totalTransforms;

          // Invalidate graph on transform completions and entity discoveries
          if (
            event.type === 'transform_complete' ||
            event.type === 'discovery_complete' ||
            event.log?.level === 'found'
          ) {
            queryClient.invalidateQueries({ queryKey: ['graph', caseId] });
            queryClient.invalidateQueries({ queryKey: ['entities', caseId] });
            queryClient.invalidateQueries({ queryKey: ['relationships', caseId] });
          }
        },
      );

      setIsDiscovering(false);
      setDiscoveryState('complete');
      setDiscoveryResult({
        jobId: finalJobId,
        status: 'COMPLETED',
        foundEntities: entitiesCount,
        foundRelationships: relCount,
        foundEvidence: evCount,
        totalTransforms: total,
      });

      setDiscoverySummary({
        jobId: finalJobId,
        status: 'COMPLETED',
        foundEntities: entitiesCount,
        foundRelationships: relCount,
        foundEvidence: evCount,
        totalTransforms: total,
        completedAt: new Date().toISOString(),
      });

      addToast(
        `Penelusuran selesai: Ditemukan ${entitiesCount} entitas dan ${relCount} relasi`,
        'success',
      );
      onSuccess?.();
    } catch (err: any) {
      setError(err.message || 'Proses penelusuran gagal');
      setDiscoveryState('idle');
      setIsDiscovering(false);
      addToast(err.message || 'Penelusuran gagal', 'error');
    }
  };

  const handleReset = () => {
    setDiscoveryState('idle');
    setDiscoveryResult(null);
    setError('');
  };

  const handleFinish = () => {
    handleReset();
    onClose();
  };

  const selectedCategory =
    SEED_CATEGORY_OPTIONS.find((c) => c.id === seedType) || SEED_CATEGORY_OPTIONS[0];

  return (
    <Modal
      isOpen={isOpen}
      onClose={discoveryState === 'running' ? () => {} : onClose}
      title="Mulai Penelusuran OSINT"
      description="Pilih kategori target dan modul investigasi untuk memetakan jejak digital ke dalam graph"
      maxWidth="lg"
    >
      {discoveryState === 'complete' && discoveryResult ? (
        /* DISCOVERY SUMMARY VIEW */
        <div className="space-y-4">
          <div className="p-4 rounded-lg bg-[#0d0d0d] border border-[#262626] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-white" />
                <span className="font-semibold text-white text-xs">
                  Penelusuran Selesai
                </span>
              </div>
              <span className="text-[11px] font-mono text-neutral-400">
                ID: {discoveryResult.jobId?.slice(0, 8)}...
              </span>
            </div>

            {/* Metric counters */}
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="p-2.5 bg-[#141414] rounded border border-[#222222]">
                <div className="text-base font-bold text-white font-mono">
                  {discoveryResult.totalTransforms}
                </div>
                <div className="text-[10px] text-neutral-400 uppercase tracking-wider">Modul</div>
              </div>
              <div className="p-2.5 bg-[#141414] rounded border border-[#222222]">
                <div className="text-base font-bold text-white font-mono">
                  {discoveryResult.foundEntities}
                </div>
                <div className="text-[10px] text-neutral-400 uppercase tracking-wider">Entitas</div>
              </div>
              <div className="p-2.5 bg-[#141414] rounded border border-[#222222]">
                <div className="text-base font-bold text-white font-mono">
                  {discoveryResult.foundRelationships}
                </div>
                <div className="text-[10px] text-neutral-400 uppercase tracking-wider">Relasi</div>
              </div>
              <div className="p-2.5 bg-[#141414] rounded border border-[#222222]">
                <div className="text-base font-bold text-white font-mono">
                  {discoveryResult.foundEvidence}
                </div>
                <div className="text-[10px] text-neutral-400 uppercase tracking-wider">Bukti</div>
              </div>
            </div>
          </div>

          {/* Transform Execution Breakdown */}
          {discoveryResult.transformRuns && discoveryResult.transformRuns.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                Rincian Eksekusi
              </label>
              <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                {discoveryResult.transformRuns.map((run: any) => (
                  <div
                    key={run.transformId}
                    className="flex items-center justify-between p-2 rounded bg-[#0d0d0d] border border-[#222222] text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {run.status === 'COMPLETED' ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-white shrink-0" />
                      ) : run.status === 'NOT_FOUND' ? (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#1a1a1a] text-neutral-400 font-mono shrink-0">
                          TIDAK ADA DATA
                        </span>
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                      )}
                      <span className="font-medium text-white truncate text-xs">{run.transformName}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 text-neutral-400 font-mono text-[10px]">
                      <span>+{run.entitiesFound} entitas</span>
                      {run.relationshipsFound > 0 && (
                        <span className="text-neutral-500">· +{run.relationshipsFound} relasi</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-between items-center pt-3 border-t border-[#1c1c1c]">
            <Button variant="secondary" onClick={handleReset}>
              Penelusuran Lain
            </Button>
            <Button variant="primary" onClick={handleFinish}>
              Lihat di Graph
            </Button>
          </div>
        </div>
      ) : (
        /* FORM & PLANNER PREVIEW VIEW */
        <form onSubmit={handleStartDiscovery} className="space-y-4">
          {/* Seed Category Selection */}
          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1.5">
              1. Kategori Target
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {SEED_CATEGORY_OPTIONS.map((cat) => {
                const Icon = cat.icon;
                const active = seedType === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    disabled={discoveryState === 'running'}
                    onClick={() => setSeedType(cat.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all cursor-pointer select-none ${
                      active
                        ? 'bg-white text-black border-white shadow-sm font-semibold'
                        : 'bg-[#101010] border-[#242424] text-neutral-400 hover:text-white hover:border-neutral-500'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Seed Target Input Value */}
          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1.5">
              2. Nilai Target / Seed
            </label>
            <Input
              placeholder={selectedCategory.placeholder}
              value={seedValue}
              onChange={(e) => setSeedValue(e.target.value)}
              error={error}
              disabled={discoveryState === 'running'}
              autoFocus
            />
          </div>

          {/* Social Media Platform Selection (When Person/Social is chosen) */}
          {isSocialIdentity && (
            <div className="p-3 rounded-lg bg-[#0d0d0d] border border-[#222222] space-y-2.5">
              <div className="flex items-start justify-between gap-2 text-xs">
                <div>
                  <span className="font-medium text-white flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-neutral-400" />
                    Target Platform Media Sosial (RapidAPI Recon):
                  </span>
                  <p className="text-[11px] text-neutral-400 mt-0.5">
                    Pilih target platform media sosial yang akan dipindai secara mendalam
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleToggleAllPlatforms}
                  className="text-[11px] text-neutral-400 hover:text-white font-medium cursor-pointer transition-colors shrink-0 whitespace-nowrap pt-0.5"
                >
                  {selectedPlatforms.length === SOCIAL_PLATFORMS.length
                    ? 'Batal Pilih Semua'
                    : 'Pilih Semua'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {SOCIAL_PLATFORMS.map((platform) => {
                  const isChecked = selectedPlatforms.includes(platform.id);
                  return (
                    <button
                      key={platform.id}
                      type="button"
                      onClick={() => togglePlatform(platform.id)}
                      className={`flex flex-col text-left p-2.5 rounded-lg border transition-all cursor-pointer select-none ${
                        isChecked
                          ? 'bg-[#181818] border-neutral-400 text-white shadow-xs'
                          : 'bg-[#0a0a0a] border-[#222222] text-neutral-400 hover:text-neutral-200 hover:border-neutral-700'
                      }`}
                    >
                      <div className="flex items-center gap-2 w-full">
                        {isChecked ? (
                          <CheckSquare2 className="w-4 h-4 text-white shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-neutral-600 shrink-0" />
                        )}
                        <span className="font-semibold text-xs text-white">
                          {platform.name}
                        </span>
                      </div>

                      <div className="mt-1.5 pl-6 flex flex-col gap-0.5">
                        <span className="text-[10px] font-mono text-neutral-400">
                          {platform.badge}
                        </span>
                        <span className="text-[10px] text-neutral-400 leading-tight">
                          {platform.detail}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Email Discovery Info Banner */}
          {seedType === 'EMAIL' && (
            <div className="p-3 rounded-lg bg-[#0d0d0d] border border-[#222222] space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-white flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-neutral-400" />
                  Pemeriksaan Registrasi Akun (Holehe)
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300 border border-neutral-700">
                  120+ Platform
                </span>
              </div>
              <p className="text-[11px] text-neutral-400 leading-relaxed">
                Mengecek apakah email terdaftar di GitHub, Instagram, Twitter/X, Spotify, dan 100+ layanan lainnya tanpa mengirim notifikasi ke target.
              </p>
            </div>
          )}

          {/* Discovery Plan Selection & Checklist */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div>
                <label className="text-xs font-medium text-neutral-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-neutral-400" />
                  <span>3. Modul Penelusuran ({selectedTransformIds.length} dipilih)</span>
                </label>
              </div>
              {plannedTransforms.length > 0 && (
                <button
                  type="button"
                  onClick={handleToggleAllTransforms}
                  disabled={discoveryState === 'running'}
                  className="text-[11px] text-neutral-400 hover:text-white font-medium cursor-pointer transition-colors"
                >
                  {selectedTransformIds.length === plannedTransforms.length
                    ? 'Batal Pilih Semua'
                    : 'Pilih Semua'}
                </button>
              )}
            </div>

            <div className="p-2 rounded-lg bg-[#0a0a0a] border border-[#222222] space-y-1 max-h-40 overflow-y-auto">
              {loadingPlan ? (
                <div className="text-xs text-neutral-400 flex items-center gap-2 py-3 px-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Menyiapkan modul penelusuran...
                </div>
              ) : plannedTransforms.length === 0 ? (
                <div className="text-xs text-neutral-500 py-2 px-2">Tidak ada modul penelusuran yang tersedia</div>
              ) : (
                plannedTransforms.map((t) => {
                  const isSelected = selectedTransformIds.includes(t.id);
                  const isApiRequired =
                    t.requiresApiKey || t.apiKeyName || t.id.includes('rapidapi');

                  return (
                    <div
                      key={t.id}
                      onClick={() => toggleTransform(t.id)}
                      className={`flex items-center justify-between text-xs py-1.5 px-2.5 rounded border transition-all cursor-pointer select-none ${
                        isSelected
                          ? 'bg-[#141414] border-[#333333] hover:border-neutral-500'
                          : 'bg-[#0d0d0d] border-[#1a1a1a] opacity-40 hover:opacity-75'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 pr-2">
                        <div className="text-neutral-400 shrink-0">
                          {isSelected ? (
                            <CheckSquare2 className="w-3.5 h-3.5 text-white" />
                          ) : (
                            <Square className="w-3.5 h-3.5 text-neutral-600" />
                          )}
                        </div>

                        <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-[#1f1f1f] border border-[#2e2e2e] text-neutral-400 shrink-0">
                          {t.category}
                        </span>

                        <span
                          className={`font-medium truncate text-xs ${
                            isSelected ? 'text-white' : 'text-neutral-400'
                          }`}
                        >
                          {t.name}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isApiRequired && (
                          <span
                            title="Membutuhkan API Key pada file .env"
                            className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-neutral-300 flex items-center gap-1"
                          >
                            <Key className="w-2.5 h-2.5 text-neutral-400" />
                            <span>API</span>
                          </span>
                        )}
                        <span className="text-[10px] text-neutral-500 font-mono">
                          {isSelected ? 'Aktif' : 'Lewati'}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-3 border-t border-[#1c1c1c]">
            <div className="flex items-center gap-1.5 text-[11px] text-neutral-500">
              <ShieldCheck className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
              <span>Penyelidikan OSINT Publik</span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                type="button"
                onClick={onClose}
                disabled={discoveryState === 'running'}
              >
                Batal
              </Button>
              <Button
                variant="primary"
                type="submit"
                disabled={
                  selectedTransformIds.length === 0 ||
                  (isSocialIdentity &&
                    selectedPlatforms.length === 0 &&
                    selectedTransformIds.includes('social.rapidapi-social-lookup'))
                }
                loading={discoveryState === 'running'}
                icon={<Sparkles className="w-3.5 h-3.5" />}
              >
                {discoveryState === 'running'
                  ? 'Menjalankan...'
                  : selectedTransformIds.length === 0
                    ? 'Pilih minimal 1 modul'
                    : `Mulai Penelusuran (${selectedTransformIds.length})`}
              </Button>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}
