import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { SeedType, TransformDefinition } from '@nexusgraph/shared';
import {
  Sparkles,
  ShieldAlert,
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
  AlertTriangle,
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
    label: 'Person / Social',
    icon: UserRound,
    placeholder: 'e.g. candalenaa, John Doe, or https://instagram.com/candalenaa',
  },
  {
    id: 'EMAIL',
    label: 'Email',
    icon: Mail,
    placeholder: 'e.g. target@domain.com',
  },
  {
    id: 'DOMAIN',
    label: 'Domain',
    icon: Globe2,
    placeholder: 'e.g. example.com',
  },
  {
    id: 'IP_ADDRESS',
    label: 'IP Address',
    icon: Network,
    placeholder: 'e.g. 192.168.1.1 or 8.8.8.8',
  },
  {
    id: 'URL',
    label: 'URL',
    icon: Link,
    placeholder: 'e.g. https://example.com/target',
  },
  {
    id: 'ORGANIZATION',
    label: 'Organization',
    icon: Building,
    placeholder: 'e.g. OpenAI, CyberCorp, Google',
  },
  {
    id: 'PHONE',
    label: 'Phone',
    icon: Phone,
    placeholder: 'e.g. +628123456789',
  },
];

const SOCIAL_PLATFORMS = [
  {
    id: 'instagram',
    name: 'Instagram',
    badge: '4 Engines',
    selectedStyle: 'bg-gradient-to-r from-pink-950/70 to-purple-950/70 border-pink-500/80 text-pink-200',
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    badge: '2 Engines',
    selectedStyle: 'bg-gradient-to-r from-cyan-950/70 to-teal-950/70 border-cyan-500/80 text-cyan-200',
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    badge: '5 Endpoints',
    selectedStyle: 'bg-gradient-to-r from-blue-950/70 to-indigo-950/70 border-blue-500/80 text-blue-200',
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

  const isRapidApiSelected =
    selectedTransformIds.includes('social.rapidapi-social-lookup') ||
    plannedTransforms.some(
      (t) =>
        selectedTransformIds.includes(t.id) &&
        (t.requiresApiKey || t.apiKeyName || t.id.includes('rapidapi')),
    );

  const isSocialIdentity = seedType === 'USERNAME';

  const handleStartDiscovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!seedValue.trim()) {
      setError('Please enter an investigation seed target value');
      return;
    }

    if (selectedTransformIds.length === 0) {
      setError('Please select at least 1 transform to execute');
      return;
    }

    if (
      isSocialIdentity &&
      selectedPlatforms.length === 0 &&
      selectedTransformIds.includes('social.rapidapi-social-lookup')
    ) {
      setError('Please select at least 1 social media platform (Instagram, TikTok, or LinkedIn)');
      return;
    }

    setError('');
    setDiscoveryState('running');
    setDiscoveryResult(null);

    clearLiveLogs();
    setIsDiscovering(true);
    setLiveLogsOpen(true);
    addToast('Multi-Vector Discovery started in background...', 'info');

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

      addToast(
        `Discovery finished: Found ${entitiesCount} entities and ${relCount} relationships`,
        'success',
      );
      onSuccess?.();
    } catch (err: any) {
      setError(err.message || 'Discovery run failed');
      setDiscoveryState('idle');
      setIsDiscovering(false);
      addToast(err.message || 'Discovery failed', 'error');
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
      title="OSINT Multi-Vector Discovery"
      description="Plan and execute targeted public reconnaissance across verified data sources & RapidAPI engines"
      maxWidth="xl"
    >
      {discoveryState === 'complete' && discoveryResult ? (
        /* DISCOVERY SUMMARY VIEW */
        <div className="space-y-3">
          <div className="p-3.5 rounded-card bg-[#121212] border border-[#262626] space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="font-semibold text-white text-xs">
                  Discovery {discoveryResult.status}
                </span>
              </div>
              <span className="text-[11px] font-mono text-neutral-400">
                Job ID: {discoveryResult.jobId?.slice(0, 8)}...
              </span>
            </div>

            {/* Metric counters */}
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="p-2 bg-[#0a0a0a] rounded-input border border-[#222222]">
                <div className="text-sm font-bold text-white font-mono">
                  {discoveryResult.totalTransforms}
                </div>
                <div className="text-[9px] text-neutral-400 uppercase">Transforms</div>
              </div>
              <div className="p-2 bg-[#0a0a0a] rounded-input border border-[#222222]">
                <div className="text-sm font-bold text-white font-mono">
                  {discoveryResult.foundEntities}
                </div>
                <div className="text-[9px] text-neutral-400 uppercase">Entities</div>
              </div>
              <div className="p-2 bg-[#0a0a0a] rounded-input border border-[#222222]">
                <div className="text-sm font-bold text-white font-mono">
                  {discoveryResult.foundRelationships}
                </div>
                <div className="text-[9px] text-neutral-400 uppercase">Relationships</div>
              </div>
              <div className="p-2 bg-[#0a0a0a] rounded-input border border-[#222222]">
                <div className="text-sm font-bold text-white font-mono">
                  {discoveryResult.foundEvidence}
                </div>
                <div className="text-[9px] text-neutral-400 uppercase">Evidence</div>
              </div>
            </div>
          </div>

          {/* Transform Execution Breakdown */}
          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1.5">
              Execution Details
            </label>
            <div className="space-y-1 max-h-44 overflow-y-auto pr-1">
              {discoveryResult.transformRuns?.map((run: any) => (
                <div
                  key={run.transformId}
                  className="flex items-center justify-between p-2 rounded-input bg-[#121212] border border-[#262626] text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {run.status === 'COMPLETED' ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    ) : run.status === 'NOT_FOUND' ? (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-[#1a1a1a] text-neutral-400 font-mono shrink-0">
                        NOT FOUND
                      </span>
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    )}
                    <span className="font-medium text-white truncate text-xs">{run.transformName}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 text-neutral-400 font-mono text-[10px]">
                    <span>+{run.entitiesFound} entities</span>
                    {run.relationshipsFound > 0 && (
                      <span className="text-neutral-500">· +{run.relationshipsFound} rels</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-between items-center pt-2 border-t border-[#1c1c1c]">
            <Button variant="secondary" onClick={handleReset}>
              Run Another Discovery
            </Button>
            <Button variant="primary" onClick={handleFinish}>
              View Graph Results
            </Button>
          </div>
        </div>
      ) : (
        /* FORM & PLANNER PREVIEW VIEW */
        <form onSubmit={handleStartDiscovery} className="space-y-3">
          {/* Seed Category Selection */}
          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1.5">
              Target Category
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-1.5">
              {SEED_CATEGORY_OPTIONS.map((cat) => {
                const Icon = cat.icon;
                const active = seedType === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    disabled={discoveryState === 'running'}
                    onClick={() => setSeedType(cat.id)}
                    className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-input border text-xs font-medium transition-all cursor-pointer select-none ${
                      active
                        ? 'bg-white text-black border-white shadow-xs font-semibold'
                        : 'bg-[#121212] border-[#262626] text-neutral-400 hover:text-white hover:border-neutral-500'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate text-[11px]">{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Social Media Platform Selection (When Person/Social is chosen) */}
          {isSocialIdentity && (
            <div className="p-2.5 rounded-card bg-[#101010] border border-[#222222] space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-neutral-300 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-cyan-400" />
                  Target Platforms (RapidAPI):
                </span>
                <button
                  type="button"
                  onClick={handleToggleAllPlatforms}
                  className="text-[11px] text-cyan-400 hover:text-cyan-300 font-medium cursor-pointer transition-colors"
                >
                  {selectedPlatforms.length === SOCIAL_PLATFORMS.length
                    ? 'Deselect All'
                    : 'Select All (3 Concurrent)'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                {SOCIAL_PLATFORMS.map((platform) => {
                  const isChecked = selectedPlatforms.includes(platform.id);
                  return (
                    <button
                      key={platform.id}
                      type="button"
                      onClick={() => togglePlatform(platform.id)}
                      className={`flex items-center justify-between px-2.5 py-1.5 rounded-md border text-xs font-medium transition-all cursor-pointer select-none ${
                        isChecked
                          ? `${platform.selectedStyle} shadow-xs`
                          : 'bg-[#090909] border-[#1e1e1e] text-neutral-400 opacity-60 hover:opacity-90'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        {isChecked ? (
                          <CheckSquare2 className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
                        ) : (
                          <Square className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                        )}
                        <span className="font-semibold text-white truncate text-xs">
                          {platform.name}
                        </span>
                      </div>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-black/40 border border-white/10 text-neutral-300 shrink-0">
                        {platform.badge}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Seed Target Input Value */}
          <div>
            <Input
              label="Seed Target (Starting Point)"
              placeholder={selectedCategory.placeholder}
              value={seedValue}
              onChange={(e) => setSeedValue(e.target.value)}
              error={error}
              disabled={discoveryState === 'running'}
              autoFocus
            />
          </div>

          {/* Discovery Plan Selection & Checklist */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-neutral-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-neutral-400" />
                <span>
                  Discovery Plan ({selectedTransformIds.length} of {plannedTransforms.length}{' '}
                  Selected)
                </span>
              </label>
              {plannedTransforms.length > 0 && (
                <button
                  type="button"
                  onClick={handleToggleAllTransforms}
                  disabled={discoveryState === 'running'}
                  className="text-[11px] text-cyan-400 hover:text-cyan-300 font-medium cursor-pointer transition-colors"
                >
                  {selectedTransformIds.length === plannedTransforms.length
                    ? 'Deselect All'
                    : 'Select All'}
                </button>
              )}
            </div>

            <div className="p-2 rounded-card bg-[#0d0d0d] border border-[#222222] space-y-1 max-h-36 overflow-y-auto">
              {loadingPlan ? (
                <div className="text-xs text-neutral-400 flex items-center gap-2 py-2 px-1">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Formulating transform discovery plan...
                </div>
              ) : plannedTransforms.length === 0 ? (
                <div className="text-xs text-neutral-500 py-1 px-1">No transforms configured</div>
              ) : (
                plannedTransforms.map((t) => {
                  const isSelected = selectedTransformIds.includes(t.id);
                  const isApiRequired =
                    t.requiresApiKey || t.apiKeyName || t.id.includes('rapidapi');

                  return (
                    <div
                      key={t.id}
                      onClick={() => toggleTransform(t.id)}
                      className={`flex items-center justify-between text-xs py-1.5 px-2 rounded border transition-all cursor-pointer select-none ${
                        isSelected
                          ? 'bg-[#151515] border-[#303030] hover:border-neutral-500'
                          : 'bg-[#090909] border-[#181818] opacity-50 hover:opacity-80'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 pr-2">
                        {/* Checkbox Icon */}
                        <div className="text-neutral-400 shrink-0">
                          {isSelected ? (
                            <CheckSquare2 className="w-3.5 h-3.5 text-cyan-400" />
                          ) : (
                            <Square className="w-3.5 h-3.5 text-neutral-600" />
                          )}
                        </div>

                        {/* Category Badge */}
                        <span className="text-[9px] font-mono uppercase px-1 py-0.2 rounded bg-[#1a1a1a] border border-[#2a2a2a] text-neutral-400 shrink-0">
                          {t.category}
                        </span>

                        {/* Transform Name */}
                        <span
                          className={`font-medium truncate text-xs ${
                            isSelected ? 'text-white' : 'text-neutral-400'
                          }`}
                        >
                          {t.name}
                        </span>
                      </div>

                      {/* API Key / Status Badges */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isApiRequired && (
                          <span
                            title={`Requires ${t.apiKeyName || 'RAPIDAPI_KEY'} in .env`}
                            className="text-[9px] font-medium px-1 py-0.5 rounded bg-amber-950/70 border border-amber-500/50 text-amber-300 flex items-center gap-1"
                          >
                            <Key className="w-2.5 h-2.5 text-amber-400" />
                            <span>API Required</span>
                          </span>
                        )}
                        <span className="text-[10px] text-neutral-400 font-mono">
                          {isSelected ? 'Selected' : 'Skipped'}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* API Key Warning Notification (Compact) */}
          {isRapidApiSelected && (
            <div className="flex items-center gap-2 py-1.5 px-2.5 rounded-card bg-amber-950/20 border border-amber-500/30 text-[11px] text-amber-300">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="truncate">
                <strong className="text-amber-200">API Key:</strong> RapidAPI transforms require{' '}
                <code className="font-mono bg-amber-950/80 px-1 py-0.5 rounded text-amber-100 text-[10px]">
                  RAPIDAPI_KEY
                </code>{' '}
                in <code className="font-mono text-amber-100 text-[10px]">.env</code>.
              </span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-2 border-t border-[#1c1c1c]">
            <div className="flex items-center gap-1.5 text-[10px] text-neutral-500">
              <ShieldAlert className="w-3 h-3 text-neutral-400 shrink-0" />
              <span>Evidence-backed OSINT</span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                type="button"
                onClick={onClose}
                disabled={discoveryState === 'running'}
              >
                Cancel
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
                  ? 'Executing Discovery...'
                  : selectedTransformIds.length === 0
                    ? 'Select at least 1 transform'
                    : `Start Discovery (${selectedTransformIds.length})`}
              </Button>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}
