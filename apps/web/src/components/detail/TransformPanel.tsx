import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Button } from '../ui/Button';
import { useAppStore } from '../../stores/appStore';
import { Play, Sparkles, AlertCircle, CheckCircle2, ChevronRight, Globe, Share2, Code2, Cpu, Phone } from 'lucide-react';
import type { TransformDefinition } from '@nexusgraph/shared';

interface TransformPanelProps {
  caseId: string;
  entityId: string;
  entityType: string;
  entityValue: string;
}

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  web: Globe,
  social: Share2,
  developer: Code2,
  infrastructure: Cpu,
  contact: Phone,
  intelligence: Sparkles,
};

export function TransformPanel({ caseId, entityId, entityType, entityValue }: TransformPanelProps) {
  const queryClient = useQueryClient();
  const { addToast } = useAppStore();
  const [runningTransformId, setRunningTransformId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['entity-transforms', caseId, entityId],
    queryFn: () => api.transforms.forEntity(caseId, entityId),
    enabled: !!caseId && !!entityId,
  });

  const handleRunTransform = async (transform: TransformDefinition) => {
    setRunningTransformId(transform.id);
    try {
      const result = await api.transforms.run(caseId, transform.id, entityId);
      addToast(
        `${transform.name}: Found ${result.entitiesFound} entities, ${result.relationshipsFound} relationships`,
        result.status === 'COMPLETED' ? 'success' : 'info',
      );
      // Invalidate graph, entities, relationships queries
      queryClient.invalidateQueries({ queryKey: ['graph', caseId] });
      queryClient.invalidateQueries({ queryKey: ['entities', caseId] });
      queryClient.invalidateQueries({ queryKey: ['relationships', caseId] });
      queryClient.invalidateQueries({ queryKey: ['evidence', caseId] });
    } catch (err: any) {
      addToast(err.message || 'Transform failed', 'error');
    } finally {
      setRunningTransformId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="p-3 text-xs text-text-muted animate-pulse">
        Loading compatible transforms...
      </div>
    );
  }

  const grouped = data?.grouped || {};
  const categories = Object.keys(grouped);

  if (categories.length === 0) {
    return (
      <div className="p-3 rounded-card bg-surface-2/40 border border-border-subtle text-xs text-text-muted flex items-center gap-2">
        <AlertCircle className="w-3.5 h-3.5 shrink-0 text-text-muted" />
        <span>No direct transforms available for {entityType}</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-text uppercase tracking-wider flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          Available Transforms ({data?.transforms?.length || 0})
        </span>
      </div>

      <div className="space-y-2.5">
        {categories.map((category) => {
          const CategoryIcon = CATEGORY_ICONS[category] || Sparkles;
          const transforms = grouped[category] || [];

          return (
            <div key={category} className="rounded-card bg-surface-2/60 border border-border-subtle p-2.5 space-y-2">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
                <CategoryIcon className="w-3.5 h-3.5 text-primary" />
                <span>{category}</span>
              </div>

              <div className="space-y-1.5">
                {transforms.map((transform: TransformDefinition) => {
                  const isRunning = runningTransformId === transform.id;

                  return (
                    <div
                      key={transform.id}
                      className="flex items-center justify-between p-2 rounded-input bg-surface border border-border-subtle/80 hover:border-border transition-colors gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium text-text truncate">
                          {transform.name}
                        </div>
                        <div className="text-[10px] text-text-muted line-clamp-1">
                          {transform.description}
                        </div>
                      </div>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRunTransform(transform)}
                        loading={isRunning}
                        disabled={!!runningTransformId}
                        className="shrink-0 text-xs text-primary hover:text-primary hover:bg-primary/10 border border-primary/20 hover:border-primary/40 px-2 py-1 h-auto"
                      >
                        <Play className="w-3 h-3 mr-1" />
                        Run
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
