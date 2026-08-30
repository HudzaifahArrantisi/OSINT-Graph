import { create } from 'zustand';
import type { EntityType, RelationshipType, DiscoveryLogEntry, DiscoveryProgressEvent } from '@nexusgraph/shared';

interface GraphFilter {
  entityTypes: EntityType[];
  relationshipTypes: RelationshipType[];
  confidenceMin: number;
  confidenceMax: number;
  searchQuery: string;
}

interface AppState {
  // Selected investigation
  selectedCaseId: string | null;
  setSelectedCaseId: (id: string | null) => void;

  // Selected node in graph
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;

  // Selected edge in graph
  selectedEdgeId: string | null;
  setSelectedEdgeId: (id: string | null) => void;

  // Detail panel visibility
  detailPanelOpen: boolean;
  setDetailPanelOpen: (open: boolean) => void;

  // Sidebar visibility
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;

  // Real-time System & Execution Logs Sidebar
  liveLogsOpen: boolean;
  setLiveLogsOpen: (open: boolean) => void;
  isLiveStreaming: boolean;
  setIsLiveStreaming: (streaming: boolean) => void;
  liveDiscoveryLogs: DiscoveryLogEntry[];
  addLiveLog: (log: DiscoveryLogEntry) => void;
  setLiveLogs: (logs: DiscoveryLogEntry[]) => void;
  clearLiveLogs: () => void;
  isDiscovering: boolean;
  setIsDiscovering: (discovering: boolean) => void;
  discoveryProgress: DiscoveryProgressEvent | null;
  setDiscoveryProgress: (progress: DiscoveryProgressEvent | null) => void;

  // Graph filters
  graphFilter: GraphFilter;
  setGraphFilter: (filter: Partial<GraphFilter>) => void;
  resetGraphFilter: () => void;

  // Graph layout
  graphLayout: 'force' | 'hierarchical' | 'radial';
  setGraphLayout: (layout: 'force' | 'hierarchical' | 'radial') => void;

  // Path finder highlight
  highlightedPath: { nodeIds: string[]; edgeIds: string[]; confidence: number } | null;
  setHighlightedPath: (path: { nodeIds: string[]; edgeIds: string[]; confidence: number } | null) => void;

  // Toast notifications
  toasts: Array<{ id: string; message: string; type: 'success' | 'error' | 'info' }>;
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  removeToast: (id: string) => void;
}

const defaultFilter: GraphFilter = {
  entityTypes: [],
  relationshipTypes: [],
  confidenceMin: 0,
  confidenceMax: 100,
  searchQuery: '',
};

export const useAppStore = create<AppState>((set) => ({
  selectedCaseId: null,
  setSelectedCaseId: (id) => set({ selectedCaseId: id }),

  selectedNodeId: null,
  setSelectedNodeId: (id) =>
    set({ selectedNodeId: id, selectedEdgeId: null, detailPanelOpen: !!id }),

  selectedEdgeId: null,
  setSelectedEdgeId: (id) =>
    set({ selectedEdgeId: id, selectedNodeId: null, detailPanelOpen: !!id }),

  detailPanelOpen: false,
  setDetailPanelOpen: (open) => set({ detailPanelOpen: open }),

  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  // Real-time System & Execution Logs
  liveLogsOpen: false,
  setLiveLogsOpen: (open) => set({ liveLogsOpen: open }),
  isLiveStreaming: false,
  setIsLiveStreaming: (streaming) => set({ isLiveStreaming: streaming }),
  liveDiscoveryLogs: [],
  addLiveLog: (log) =>
    set((state) => {
      if (state.liveDiscoveryLogs.some((l) => l.id === log.id)) {
        return state;
      }
      return {
        liveDiscoveryLogs: [...state.liveDiscoveryLogs.slice(-600), log],
      };
    }),
  setLiveLogs: (logs) =>
    set({
      liveDiscoveryLogs: logs.slice(-600),
    }),
  clearLiveLogs: () => set({ liveDiscoveryLogs: [], discoveryProgress: null }),
  isDiscovering: false,
  setIsDiscovering: (discovering) => set({ isDiscovering: discovering }),
  discoveryProgress: null,
  setDiscoveryProgress: (progress) => set({ discoveryProgress: progress }),

  graphFilter: { ...defaultFilter },
  setGraphFilter: (filter) =>
    set((state) => ({
      graphFilter: { ...state.graphFilter, ...filter },
    })),
  resetGraphFilter: () => set({ graphFilter: { ...defaultFilter } }),

  graphLayout: 'force',
  setGraphLayout: (layout) => set({ graphLayout: layout }),

  highlightedPath: null,
  setHighlightedPath: (path) => set({ highlightedPath: path }),

  toasts: [],
  addToast: (message, type = 'info') => {
    const id = crypto.randomUUID();
    set((state) => ({
      toasts: [...state.toasts, { id, message, type }],
    }));
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }));
    }, 4000);
  },
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}));
