import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { SEED_TYPES, SeedType, SEED_PLACEHOLDERS, TransformDefinition } from '@nexusgraph/shared';
import {
  Sparkles,
  ShieldAlert,
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
  Loader2,
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
      title="OSINT Multi-Vector Discovery"
      description="Plan and execute public reconnaissance across verified data sources"
      maxWidth="lg"
    >
      {discoveryState === 'complete' && discoveryResult ? (
        /* DISCOVERY SUMMARY VIEW */
        <div className="space-y-4">
          <div className="p-4 rounded-card bg-[#121212] border border-[#262626] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-white" />
                <span className="font-semibold text-white text-sm">
                  Discovery {discoveryResult.status}
                </span>
              </div>
              <span className="text-xs font-mono text-neutral-400">
                Job ID: {discoveryResult.jobId?.slice(0, 8)}...
              </span>
            </div>

            {/* Metric counters */}
            <div className="grid grid-cols-4 gap-2 text-center pt-2">
              <div className="p-2 bg-[#0a0a0a] rounded-input border border-[#222222]">
                <div className="text-base font-bold text-white font-mono">
                  {discoveryResult.totalTransforms}
                </div>
                <div className="text-[10px] text-neutral-400 uppercase">Transforms</div>
              </div>
              <div className="p-2 bg-[#0a0a0a] rounded-input border border-[#222222]">
                <div className="text-base font-bold text-white font-mono">
                  {discoveryResult.foundEntities}
                </div>
                <div className="text-[10px] text-neutral-400 uppercase">Entities Found</div>
              </div>
              <div className="p-2 bg-[#0a0a0a] rounded-input border border-[#222222]">
                <div className="text-base font-bold text-white font-mono">
                  {discoveryResult.foundRelationships}
                </div>
                <div className="text-[10px] text-neutral-400 uppercase">Relationships</div>
              </div>
              <div className="p-2 bg-[#0a0a0a] rounded-input border border-[#222222]">
                <div className="text-base font-bold text-white font-mono">
                  {discoveryResult.foundEvidence}
                </div>
                <div className="text-[10px] text-neutral-400 uppercase">Evidence Items</div>
              </div>
            </div>
          </div>

          {/* Transform Execution Breakdown */}
          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-2">
              Transform Execution Details
            </label>
            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {discoveryResult.transformRuns?.map((run: any) => (
                <div
                  key={run.transformId}
                  className="flex items-center justify-between p-2.5 rounded-input bg-[#121212] border border-[#262626] text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {run.status === 'COMPLETED' ? (
                      <CheckCircle2 className="w-4 h-4 text-white shrink-0" />
                    ) : run.status === 'NOT_FOUND' ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1a1a1a] text-neutral-400 font-mono shrink-0">
                        NOT FOUND
                      </span>
                    ) : (
                      <XCircle className="w-4 h-4 text-neutral-400 shrink-0" />
                    )}
                    <span className="font-medium text-white truncate">
                      {run.transformName || run.transformId}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-[11px] font-mono shrink-0">
                    {run.entitiesFound > 0 && (
                      <span className="text-white">+{run.entitiesFound} ent</span>
                    )}
                    {run.relationshipsFound > 0 && (
                      <span className="text-neutral-300">+{run.relationshipsFound} rel</span>
                    )}
                    {run.error && (
                      <span className="text-neutral-400 text-[10px] truncate max-w-[150px]" title={run.error}>
                        {run.error}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[#1c1c1c]">
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
            <label className="block text-xs font-medium text-neutral-300 mb-1.5">
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
                    className={`flex items-center gap-1.5 p-2 rounded-input border text-xs font-medium transition-all cursor-pointer ${
                      active
                        ? 'bg-white text-black border-white shadow-sm'
                        : 'bg-[#121212] border-[#262626] text-neutral-400 hover:text-white hover:border-neutral-500'
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
            placeholder={SEED_PLACEHOLDERS[seedType] || 'Enter target seed...'}
            value={seedValue}
            onChange={(e) => setSeedValue(e.target.value)}
            error={error}
            disabled={discoveryState === 'running'}
            autoFocus
          />

          {/* Discovery Plan Preview */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-neutral-300 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-neutral-400" />
                Discovery Plan ({plannedTransforms.length} Transforms Planned)
              </label>
              <span className="text-[10px] text-neutral-500">
                Auto-selected based on seed type
              </span>
            </div>

            <div className="p-3 rounded-card bg-[#0d0d0d] border border-[#222222] space-y-2 max-h-48 overflow-y-auto">
              {loadingPlan ? (
                <div className="text-xs text-neutral-400 flex items-center gap-2 py-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Generating transform plan...
                </div>
              ) : plannedTransforms.length === 0 ? (
                <div className="text-xs text-neutral-500">No transforms configured</div>
              ) : (
                plannedTransforms.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between text-xs py-1 border-b border-[#1f1f1f] last:border-0"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono uppercase px-1 py-0.5 rounded bg-[#161616] border border-[#262626] text-neutral-400">
                        {t.category}
                      </span>
                      <span className="font-medium text-white">{t.name}</span>
                    </div>
                    <span className="text-[10px] text-neutral-300 font-mono">Ready</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Responsible OSINT Scope Reminder */}
          <div className="flex items-start gap-2 p-2.5 rounded-card bg-[#121212] border border-[#222222] text-[11px] text-neutral-400">
            <ShieldAlert className="w-4 h-4 text-neutral-300 shrink-0 mt-0.5" />
            <span>
              All discovery is evidence-backed and public. Seeds are recorded as starting hypotheses with low initial confidence.
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-2 border-t border-[#1c1c1c]">
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
