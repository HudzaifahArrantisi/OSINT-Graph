import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Navbar } from '../components/layout/Navbar';
import { Card, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingState } from '../components/ui/LoadingState';
import { useAppStore } from '../stores/appStore';
import {
  FolderKanban,
  Plus,
  ArrowRight,
  Shield,
  Activity,
  Clock,
  Tag,
  AlertTriangle,
  Flame,
  Search,
  Trash2,
} from 'lucide-react';
import type { Investigation } from '@nexusgraph/shared';

export function DashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { addToast } = useAppStore();

  const { data: investigations = [], isLoading } = useQuery<Investigation[]>({
    queryKey: ['investigations'],
    queryFn: () => api.investigations.list(),
  });

  const handleDeleteDossier = async (id: string, title: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Delete investigation dossier "${title}"?`)) {
      try {
        await api.investigations.delete(id);
        queryClient.invalidateQueries({ queryKey: ['investigations'] });
        addToast(`Deleted dossier "${title}"`, 'info');
      } catch (err: any) {
        addToast(err.message || 'Failed to delete investigation', 'error');
      }
    }
  };

  const activeCases = investigations.filter((inv) => inv.status === 'ACTIVE' || inv.status === 'DRAFT');
  const highPriorityCases = investigations.filter(
    (inv) => inv.priority === 'HIGH' || inv.priority === 'CRITICAL',
  );
  const recentCases = [...investigations].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  ).slice(0, 5);

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'CRITICAL':
        return <Badge variant="danger">Critical</Badge>;
      case 'HIGH':
        return <Badge variant="warning">High</Badge>;
      case 'MEDIUM':
        return <Badge variant="primary">Medium</Badge>;
      default:
        return <Badge variant="muted">Low</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return <Badge variant="success">Active</Badge>;
      case 'DRAFT':
        return <Badge variant="cyan">Draft</Badge>;
      case 'ARCHIVED':
        return <Badge variant="muted">Archived</Badge>;
      case 'CLOSED':
        return <Badge variant="muted">Closed</Badge>;
      default:
        return <Badge variant="default">{status}</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-app flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Top welcome & quick actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border-subtle">
          <div>
            <h1 className="text-xl font-bold text-text tracking-tight">
              Investigation Operations
            </h1>
            <p className="text-xs text-text-muted mt-0.5">
              Public footprint discovery, relationship correlation, and evidence graphing
            </p>
          </div>
          <div className="flex items-center gap-2">
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

        {isLoading ? (
          <LoadingState message="Loading investigations..." />
        ) : investigations.length === 0 ? (
          <EmptyState
            icon={<FolderKanban className="w-8 h-8 text-primary" />}
            title="No investigation cases yet"
            description="Create your first case to begin analyzing seeds, querying public OSINT sources, and correlating digital footprint graphs."
            actionLabel="Create Investigation"
            actionIcon={<Plus className="w-4 h-4" />}
            onAction={() => navigate('/investigations/new')}
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main column: Active & Recent Investigations */}
            <div className="lg:col-span-2 space-y-6">
              {/* Active Cases Section */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <FolderKanban className="w-4 h-4 text-primary" />
                    <h2 className="text-sm font-semibold text-text">
                      Active Cases ({activeCases.length})
                    </h2>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate('/investigations')}
                    className="text-xs"
                  >
                    View All
                  </Button>
                </div>

                <div className="space-y-2.5">
                  {activeCases.slice(0, 4).map((inv) => (
                    <Card
                      key={inv.id}
                      hoverable
                      onClick={() => navigate(`/investigations/${inv.id}`)}
                      className="flex items-center justify-between gap-4 p-3.5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-sm font-medium text-text truncate font-mono">
                            {inv.title}
                          </h3>
                          {getStatusBadge(inv.status)}
                          {getPriorityBadge(inv.priority)}
                        </div>
                        {inv.description && (
                          <p className="text-xs text-text-muted truncate mb-1.5">
                            {inv.description}
                          </p>
                        )}
                        <div className="flex items-center gap-3 text-[10px] text-text-muted font-mono">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Updated {new Date(inv.updated_at).toLocaleDateString()}
                          </span>
                          {inv.tags && inv.tags.length > 0 && (
                            <span className="flex items-center gap-1 truncate">
                              <Tag className="w-3 h-3" />
                              {inv.tags.join(', ')}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={(e) => handleDeleteDossier(inv.id, inv.title, e)}
                          title="Delete dossier"
                          className="p-1 rounded text-text-muted hover:text-status-danger hover:bg-status-danger/10 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <ArrowRight className="w-4 h-4 text-text-muted" />
                      </div>
                    </Card>
                  ))}
                </div>
              </div>

              {/* High Priority Alerts if any */}
              {highPriorityCases.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Flame className="w-4 h-4 text-status-danger" />
                    <h2 className="text-sm font-semibold text-text">
                      High Priority Focus ({highPriorityCases.length})
                    </h2>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {highPriorityCases.slice(0, 2).map((inv) => (
                      <Card
                        key={inv.id}
                        hoverable
                        onClick={() => navigate(`/investigations/${inv.id}`)}
                        className="p-3 border-status-danger/30 bg-surface"
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-mono text-status-danger font-semibold uppercase">
                            {inv.priority}
                          </span>
                          <span className="text-[10px] text-text-muted font-mono">
                            {new Date(inv.updated_at).toLocaleDateString()}
                          </span>
                        </div>
                        <h4 className="text-xs font-semibold text-text truncate mb-1">
                          {inv.title}
                        </h4>
                        <p className="text-[11px] text-text-muted line-clamp-2">
                          {inv.description || 'No case notes description provided.'}
                        </p>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar column: Operational Activity & Guidance */}
            <div className="space-y-6">
              {/* Quick Start Seed Card */}
              <Card className="p-4 bg-primary/5 border-primary/30">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1 rounded-md bg-primary/20 text-primary">
                    <Shield className="w-4 h-4" />
                  </div>
                  <h3 className="text-xs font-semibold text-text">OSINT Methodology</h3>
                </div>
                <p className="text-[11px] text-text-muted leading-relaxed mb-3">
                  Start an investigation by adding a seed indicator (Domain, IP, Email, Username, or
                  URL). NexusGraph automatically correlates observations and generates evidence-backed
                  graphs.
                </p>
                <Button
                  variant="primary"
                  size="sm"
                  className="w-full"
                  onClick={() => navigate('/investigations/new')}
                >
                  Start New Case
                </Button>
              </Card>

              {/* Recently Updated */}
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border-subtle">
                  <Activity className="w-4 h-4 text-accent-cyan" />
                  <h3 className="text-xs font-semibold text-text">Recently Updated Cases</h3>
                </div>
                <div className="space-y-2.5">
                  {recentCases.map((inv) => (
                    <div
                      key={inv.id}
                      onClick={() => navigate(`/investigations/${inv.id}`)}
                      className="flex items-center justify-between text-xs cursor-pointer hover:text-primary transition-colors py-1"
                    >
                      <span className="text-text font-mono truncate max-w-[170px]">
                        {inv.title}
                      </span>
                      <span className="text-[10px] text-text-muted font-mono shrink-0">
                        {new Date(inv.updated_at).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
