import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Navbar } from '../components/layout/Navbar';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingState } from '../components/ui/LoadingState';
import { useAppStore } from '../stores/appStore';
import {
  FolderKanban,
  Plus,
  Search,
  ArrowRight,
  Clock,
  Trash2,
  CheckSquare,
  Square,
} from 'lucide-react';
import type { Investigation } from '@nexusgraph/shared';

export function InvestigationsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { addToast } = useAppStore();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: investigations = [], isLoading } = useQuery<Investigation[]>({
    queryKey: ['investigations'],
    queryFn: () => api.investigations.list(),
  });

  const filtered = investigations.filter((inv) => {
    if (statusFilter !== 'ALL' && inv.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchTitle = inv.title.toLowerCase().includes(q);
      const matchDesc = (inv.description || '').toLowerCase().includes(q);
      const matchTags = (inv.tags || []).some((t) => t.toLowerCase().includes(q));
      if (!matchTitle && !matchDesc && !matchTags) return false;
    }
    return true;
  });

  const handleToggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((inv) => inv.id)));
    }
  };

  const handleDeleteSingle = async (id: string, title: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Delete investigation dossier "${title}"?`)) {
      try {
        await api.investigations.delete(id);
        queryClient.invalidateQueries({ queryKey: ['investigations'] });
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        addToast(`Deleted dossier "${title}"`, 'info');
      } catch (err: any) {
        addToast(err.message || 'Failed to delete investigation', 'error');
      }
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    if (
      window.confirm(
        `Are you sure you want to permanently delete ${count} selected investigation dossier(s)?`,
      )
    ) {
      try {
        await api.investigations.bulkDelete(Array.from(selectedIds));
        queryClient.invalidateQueries({ queryKey: ['investigations'] });
        setSelectedIds(new Set());
        addToast(`Deleted ${count} investigation dossier(s)`, 'info');
      } catch (err: any) {
        addToast(err.message || 'Failed to delete investigations', 'error');
      }
    }
  };

  return (
    <div className="min-h-screen bg-app flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border-subtle">
          <div>
            <h1 className="text-xl font-bold text-text">Investigation Dossiers</h1>
            <p className="text-xs text-text-muted mt-0.5">
              Manage your security cases, artifacts, and footprint correlation graphs
            </p>
          </div>
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <Button
                variant="danger"
                size="md"
                icon={<Trash2 className="w-4 h-4" />}
                onClick={handleBulkDelete}
              >
                Delete Selected ({selectedIds.size})
              </Button>
            )}
            <Button
              variant="primary"
              size="md"
              icon={<Plus className="w-4 h-4" />}
              onClick={() => navigate('/investigations/new')}
            >
              New Investigation
            </Button>
          </div>
        </div>

        {/* Filter / Search Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
            <div className="w-full sm:w-80">
              <Input
                placeholder="Filter by title, description, or tag..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                leftIcon={<Search className="w-4 h-4" />}
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
              {(['ALL', 'ACTIVE', 'DRAFT', 'ARCHIVED', 'CLOSED'] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`px-3 py-1.5 rounded-button text-xs font-medium transition-colors whitespace-nowrap ${
                    statusFilter === status
                      ? 'bg-primary/20 text-primary border border-primary/40 font-semibold'
                      : 'bg-surface-2 text-text-muted hover:text-text border border-border-subtle'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          {filtered.length > 0 && (
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <button
                onClick={handleToggleSelectAll}
                className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text px-2 py-1 rounded border border-border-subtle bg-surface-2"
              >
                {selectedIds.size === filtered.length ? (
                  <CheckSquare className="w-3.5 h-3.5 text-primary" />
                ) : (
                  <Square className="w-3.5 h-3.5" />
                )}
                <span>Select All ({filtered.length})</span>
              </button>
            </div>
          )}
        </div>

        {/* List of Investigations */}
        {isLoading ? (
          <LoadingState message="Loading cases..." />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<FolderKanban className="w-8 h-8 text-primary" />}
            title="No matching investigations"
            description={
              search || statusFilter !== 'ALL'
                ? 'Try adjusting your search criteria or filter options.'
                : 'Create your first investigation case to begin collecting public evidence.'
            }
            actionLabel={investigations.length === 0 ? 'Create Investigation' : undefined}
            onAction={() => navigate('/investigations/new')}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((inv) => {
              const isSelected = selectedIds.has(inv.id);
              return (
                <Card
                  key={inv.id}
                  hoverable
                  onClick={() => navigate(`/investigations/${inv.id}`)}
                  className={`flex flex-col justify-between p-4 h-48 relative group transition-all ${
                    isSelected ? 'ring-2 ring-primary border-primary bg-primary/5' : ''
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => handleToggleSelect(inv.id, e)}
                          className="text-text-muted hover:text-primary transition-colors"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-primary" />
                          ) : (
                            <Square className="w-4 h-4 text-text-muted" />
                          )}
                        </button>
                        <span className="text-[10px] font-mono font-semibold uppercase text-primary">
                          {inv.priority} PRIORITY
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Badge variant={inv.status === 'ACTIVE' ? 'success' : 'muted'}>
                          {inv.status}
                        </Badge>
                        <button
                          onClick={(e) => handleDeleteSingle(inv.id, inv.title, e)}
                          title="Delete dossier"
                          className="p-1 rounded text-text-muted hover:text-status-danger hover:bg-status-danger/10 opacity-60 group-hover:opacity-100 transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <h3 className="text-sm font-semibold text-text truncate font-mono mb-1">
                      {inv.title}
                    </h3>
                    <p className="text-xs text-text-muted line-clamp-2 leading-relaxed">
                      {inv.description || 'No description provided.'}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-border-subtle flex items-center justify-between text-[10px] text-text-muted font-mono">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(inv.updated_at).toLocaleDateString()}
                    </span>
                    {inv.tags && inv.tags.length > 0 && (
                      <span className="truncate max-w-[120px]">
                        {inv.tags.slice(0, 2).join(', ')}
                        {inv.tags.length > 2 ? ` +${inv.tags.length - 2}` : ''}
                      </span>
                    )}
                    <ArrowRight className="w-3.5 h-3.5 text-text-muted" />
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
