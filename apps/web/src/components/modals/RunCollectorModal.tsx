import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { SEED_TYPES, SeedType, CollectorName, COLLECTOR_NAMES } from '@nexusgraph/shared';
import { Play, ShieldAlert, Check, Globe2, Mail, User, Network, Link, Building } from 'lucide-react';
import { api } from '../../lib/api';
import { useAppStore } from '../../stores/appStore';

interface RunCollectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  onSuccess?: () => void;
}

const SEED_ICONS: Record<SeedType, React.ComponentType<{ className?: string }>> = {
  DOMAIN: Globe2,
  EMAIL: Mail,
  USERNAME: User,
  IP_ADDRESS: Network,
  URL: Link,
  ORGANIZATION: Building,
  SOCIAL_PROFILE: User,
  PERSON: User,
  NAME: User,
};

export function RunCollectorModal({
  isOpen,
  onClose,
  caseId,
  onSuccess,
}: RunCollectorModalProps) {
  const { addToast } = useAppStore();
  const [seedType, setSeedType] = useState<SeedType>('DOMAIN');
  const [seedValue, setSeedValue] = useState('');
  const [selectedCollectors, setSelectedCollectors] = useState<CollectorName[]>(['dns', 'url-metadata', 'tls-certificate']);
  const [availableCollectors, setAvailableCollectors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Fetch available collectors for the chosen seed type
  useEffect(() => {
    api.collectors
      .available(seedType)
      .then((cols) => {
        setAvailableCollectors(cols);
        // Pre-select supported collectors
        setSelectedCollectors(cols.map((c) => c as CollectorName));
      })
      .catch(() => {
        setAvailableCollectors([...COLLECTOR_NAMES]);
      });
  }, [seedType]);

  const toggleCollector = (name: CollectorName) => {
    if (selectedCollectors.includes(name)) {
      setSelectedCollectors(selectedCollectors.filter((c) => c !== name));
    } else {
      setSelectedCollectors([...selectedCollectors, name]);
    }
  };

  const handleRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!seedValue.trim()) {
      setError('Please enter a valid seed value');
      return;
    }
    if (selectedCollectors.length === 0) {
      setError('Select at least one collector');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const result = await api.collectors.run(caseId, {
        seed_type: seedType,
        seed_value: seedValue.trim(),
        collectors: selectedCollectors,
      });

      addToast(
        `Discovered ${result.totalEntities} entities and ${result.totalRelationships} relationships`,
        'success',
      );
      onClose();
      onSuccess?.();
    } catch (err: any) {
      setError(err.message || 'Collector run failed');
      addToast(err.message || 'Collection failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Run OSINT Collector"
      description="Gather public footprint artifacts and correlate relationships"
      maxWidth="md"
    >
      <form onSubmit={handleRun} className="space-y-4">
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
          label="Seed Value"
          placeholder={
            seedType === 'DOMAIN'
              ? 'example.com'
              : seedType === 'EMAIL'
                ? 'investigation@example.com'
                : seedType === 'USERNAME'
                  ? 'target_handle'
                  : seedType === 'IP_ADDRESS'
                    ? '93.184.216.34'
                    : 'https://example.com/profile'
          }
          value={seedValue}
          onChange={(e) => setSeedValue(e.target.value)}
          error={error}
          disabled={loading}
          autoFocus
        />

        {/* Collector Selection */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5">
            Select Allowed Collectors ({selectedCollectors.length})
          </label>
          <div className="space-y-1.5">
            {COLLECTOR_NAMES.map((colName) => {
              const isAvailable = availableCollectors.includes(colName);
              const isSelected = selectedCollectors.includes(colName);

              return (
                <div
                  key={colName}
                  onClick={() => isAvailable && toggleCollector(colName)}
                  className={`flex items-center justify-between p-2.5 rounded-input border transition-colors ${
                    !isAvailable
                      ? 'opacity-40 bg-surface-2 border-border-subtle cursor-not-allowed'
                      : isSelected
                        ? 'bg-primary/10 border-primary/40 cursor-pointer'
                        : 'bg-surface-2 border-border-subtle hover:border-border cursor-pointer'
                  }`}
                >
                  <div>
                    <span className="text-xs font-medium text-text uppercase">
                      {colName.replace('-', ' ')}
                    </span>
                    <p className="text-[10px] text-text-muted">
                      {colName === 'dns' && 'Public A, AAAA, MX, NS, TXT DNS resolution'}
                      {colName === 'url-metadata' && 'Page title, security headers, redirects (SSRF safe)'}
                      {colName === 'tls-certificate' && 'Certificate Transparency SANs and issuer'}
                      {colName === 'github-public' && 'Public repositories, profile, organization links'}
                      {colName === 'username-presence' && 'Cross-platform profile existence checks'}
                    </p>
                  </div>
                  <div
                    className={`w-4 h-4 rounded flex items-center justify-center border ${
                      isSelected
                        ? 'bg-primary border-primary text-white'
                        : 'border-border-subtle bg-surface-3'
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3" />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Responsible OSINT Scope Reminder */}
        <div className="flex items-start gap-2 p-2.5 rounded-card bg-surface-2/60 border border-border-subtle text-[11px] text-text-muted">
          <ShieldAlert className="w-4 h-4 text-status-warning shrink-0 mt-0.5" />
          <span>
            Only lawful, public information will be gathered. No credentials, exploits, or private
            account bypasses are used.
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-2 pt-2 border-t border-border-subtle">
          <Button variant="secondary" type="button" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" loading={loading} icon={<Play className="w-3.5 h-3.5" />}>
            Run Collection
          </Button>
        </div>
      </form>
    </Modal>
  );
}
