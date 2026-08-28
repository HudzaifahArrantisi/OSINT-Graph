import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { SEED_TYPES, SeedType, TransformDefinition } from '@nexusgraph/shared';
import {
  Sparkles,
  ShieldAlert,
  Check,
  Globe2,
  Mail,
  User,
  Phone,
  Network,
  Link,
  Building,
  UserRound,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAppStore } from '../../stores/appStore';

interface StartDiscoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  onSuccess?: () => void;
}

const SEED_ICONS: Record<SeedType, React.ComponentType<{ className?: string }>> = {
  ORGANIZATION: Building,
  DOMAIN: Globe2,
  EMAIL: Mail,
  USERNAME: User,
  PERSON: UserRound,
  NAME: UserRound,
  IP_ADDRESS: Network,
  URL: Link,
  SOCIAL_PROFILE: User,
  PHONE: Phone,
};

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
  const [seedType, setSeedType] = useState<SeedType>('ORGANIZATION');
  const [seedValue, setSeedValue] = useState('');
  const [plannedTransforms, setPlannedTransforms] = useState<TransformDefinition[]>([]);
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
        setPlannedTransforms(res.transforms || []);
      })
      .catch(() => {
        setPlannedTransforms([]);
      })
      .finally(() => {
        setLoadingPlan(false);
      });
  }, [isOpen, seedType, caseId]);

  const handleStartDiscovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!seedValue.trim()) {
      setError('Please enter an investigation seed value');
      return;
    }

    setError('');
    setDiscoveryState('running');
    setDiscoveryResult(null);

    clearLiveLogs();
    setIsDiscovering(true);
    setLiveLogsOpen(true);
    addToast('Discovery started in background...', 'info');

    // Close modal after triggering so user immediately sees graph/map updating
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={discoveryState === 'running' ? () => {} : onClose}
      title="Multi-Category OSINT Discovery"
      description="Plan and execute multi-vector public reconnaissance across independent data sources"
      maxWidth="lg"
    >
      {discoveryState === 'complete' && discoveryResult ? (
        /* DISCOVERY SUMMARY VIEW */
        <div className="space-y-4">
          <div className="p-4 rounded-card bg-surface-2 border border-border-subtle space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <span className="font-semibold text-text text-sm">
                  Discovery {discoveryResult.status}
                </span>
              </div>
              <span className="text-xs font-mono text-text-muted">
                Job ID: {discoveryResult.jobId?.slice(0, 8)}...
              </span>
            </div>

            {/* Metric counters */}
            <div className="grid grid-cols-4 gap-2 text-center pt-2">
              <div className="p-2 bg-surface rounded-input border border-border-subtle">
                <div className="text-base font-bold text-text font-mono">
                  {discoveryResult.totalTransforms}
                </div>
                <div className="text-[10px] text-text-muted uppercase">Transforms</div>
              </div>
              <div className="p-2 bg-surface rounded-input border border-border-subtle">
                <div className="text-base font-bold text-emerald-400 font-mono">
                  {discoveryResult.foundEntities}
                </div>
                <div className="text-[10px] text-text-muted uppercase">Entities Found</div>
              </div>
              <div className="p-2 bg-surface rounded-input border border-border-subtle">
                <div className="text-base font-bold text-cyan-400 font-mono">
                  {discoveryResult.foundRelationships}
                </div>
                <div className="text-[10px] text-text-muted uppercase">Relationships</div>
              </div>
              <div className="p-2 bg-surface rounded-input border border-border-subtle">
                <div className="text-base font-bold text-purple-400 font-mono">
                  {discoveryResult.foundEvidence}
                </div>
                <div className="text-[10px] text-text-muted uppercase">Evidence Items</div>
              </div>
            </div>
          </div>

          {/* Transform Execution Breakdown */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-2">
              Transform Execution Details
            </label>
            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {discoveryResult.transformRuns?.map((run: any) => (
                <div
                  key={run.transformId}
                  className="flex items-center justify-between p-2.5 rounded-input bg-surface-2 border border-border-subtle text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {run.status === 'COMPLETED' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : run.status === 'NOT_FOUND' ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-3 text-text-muted font-mono shrink-0">
                        NOT FOUND
                      </span>
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    )}
                    <span className="font-medium text-text truncate">
                      {run.transformName || run.transformId}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-[11px] font-mono shrink-0">
                    {run.entitiesFound > 0 && (
                      <span className="text-emerald-400">+{run.entitiesFound} ent</span>
                    )}
                    {run.relationshipsFound > 0 && (
                      <span className="text-cyan-400">+{run.relationshipsFound} rel</span>
                    )}
                    {run.error && (
                      <span className="text-rose-400 text-[10px] truncate max-w-[150px]" title={run.error}>
                        {run.error}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border-subtle">
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
        <form onSubmit={handleStartDiscovery} className="space-y-4">
          {/* Seed Type Selection */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              Seed Indicator Type
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
              {SEED_TYPES.map((type) => {
                const Icon = SEED_ICONS[type] || Globe2;
                const active = seedType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    disabled={discoveryState === 'running'}
                    onClick={() => setSeedType(type)}
                    className={`flex items-center gap-1.5 p-2 rounded-input border text-xs font-medium transition-all ${
                      active
                        ? 'bg-primary/15 border-primary text-primary shadow-sm shadow-primary/20'
                        : 'bg-surface-2 border-border-subtle text-text-muted hover:text-text hover:border-border'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate text-[11px]">{type.replace('_', ' ')}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Seed Input Value */}
          <Input
            label="Seed Target (Starting Point)"
            placeholder={
              seedType === 'ORGANIZATION'
                ? 'e.g. Nurul Fikri, Acme Corp, OWASP'
                : seedType === 'DOMAIN'
                  ? 'e.g. example.com'
                  : seedType === 'EMAIL'
                    ? 'e.g. security@example.com'
                    : seedType === 'USERNAME'
                      ? 'e.g. target_handle'
                      : seedType === 'PERSON' || seedType === 'NAME'
                        ? 'e.g. John Doe'
                        : seedType === 'IP_ADDRESS'
                          ? 'e.g. 93.184.216.34'
                          : 'https://example.com/target'
            }
            value={seedValue}
            onChange={(e) => setSeedValue(e.target.value)}
            error={error}
            disabled={discoveryState === 'running'}
            autoFocus
          />

          {/* Discovery Plan Preview */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-text-secondary flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                Discovery Plan ({plannedTransforms.length} Transforms Planned)
              </label>
              <span className="text-[10px] text-text-muted">
                Auto-selected based on seed type
              </span>
            </div>

            <div className="p-3 rounded-card bg-surface-2/70 border border-border-subtle space-y-2 max-h-48 overflow-y-auto">
              {loadingPlan ? (
                <div className="text-xs text-text-muted flex items-center gap-2 py-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Generating transform plan...
                </div>
              ) : plannedTransforms.length === 0 ? (
                <div className="text-xs text-text-muted">No transforms configured</div>
              ) : (
                plannedTransforms.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between text-xs py-1 border-b border-border-subtle/50 last:border-0"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono uppercase px-1 py-0.5 rounded bg-surface border border-border-subtle text-text-muted">
                        {t.category}
                      </span>
                      <span className="font-medium text-text">{t.name}</span>
                    </div>
                    <span className="text-[10px] text-emerald-400 font-mono">Ready</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Responsible OSINT Scope Reminder */}
          <div className="flex items-start gap-2 p-2.5 rounded-card bg-surface-2/60 border border-border-subtle text-[11px] text-text-muted">
            <ShieldAlert className="w-4 h-4 text-status-warning shrink-0 mt-0.5" />
            <span>
              All discovery is evidence-backed and public. Seeds are recorded as starting hypotheses with low initial confidence. No fake data is generated.
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-2 border-t border-border-subtle">
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
              loading={discoveryState === 'running'}
              icon={<Sparkles className="w-3.5 h-3.5" />}
            >
              {discoveryState === 'running' ? 'Executing Discovery...' : 'Start Discovery'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
