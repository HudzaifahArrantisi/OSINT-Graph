import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { api } from '../../lib/api';
import { useAppStore } from '../../stores/appStore';
import { Download, FileJson, FileSpreadsheet, FileText, CheckCircle2 } from 'lucide-react';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  caseTitle: string;
}

export function ExportModal({
  isOpen,
  onClose,
  caseId,
  caseTitle,
}: ExportModalProps) {
  const { addToast } = useAppStore();
  const [format, setFormat] = useState<'json' | 'csv' | 'markdown'>('markdown');
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      let content = '';
      let mimeType = 'text/plain';
      let extension = 'txt';

      if (format === 'json') {
        const data = await api.export.json(caseId);
        content = JSON.stringify(data, null, 2);
        mimeType = 'application/json';
        extension = 'json';
      } else if (format === 'csv') {
        content = await api.export.csv(caseId);
        mimeType = 'text/csv';
        extension = 'csv';
      } else if (format === 'markdown') {
        content = await api.export.markdown(caseId);
        mimeType = 'text/markdown';
        extension = 'md';
      }

      // Trigger browser download
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `investigation-${caseTitle.toLowerCase().replace(/[^a-z0-9]/g, '-')}.${extension}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      addToast(`Exported investigation as ${format.toUpperCase()}`, 'success');
      onClose();
    } catch (err: any) {
      addToast(err.message || 'Export failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Export Investigation"
      description="Download complete case dossier with evidence provenance and timeline"
      maxWidth="md"
    >
      <div className="space-y-4">
        {/* Format Selection Cards */}
        <div className="space-y-2">
          <div
            onClick={() => setFormat('markdown')}
            className={`flex items-start gap-3 p-3 rounded-card border cursor-pointer transition-colors ${
              format === 'markdown'
                ? 'bg-primary/10 border-primary/50 text-text'
                : 'bg-surface-2 border-border-subtle hover:border-border text-text-secondary'
            }`}
          >
            <FileText className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="text-xs font-semibold text-text flex items-center justify-between">
                <span>Markdown Report (.md)</span>
                {format === 'markdown' && <CheckCircle2 className="w-3.5 h-3.5 text-primary" />}
              </div>
              <p className="text-[11px] text-text-muted mt-0.5 leading-relaxed">
                Comprehensive security dossier formatted with case summary, seed indicators, entity
                table, relationships, evidence records, timeline, and analyst notes.
              </p>
            </div>
          </div>

          <div
            onClick={() => setFormat('json')}
            className={`flex items-start gap-3 p-3 rounded-card border cursor-pointer transition-colors ${
              format === 'json'
                ? 'bg-primary/10 border-primary/50 text-text'
                : 'bg-surface-2 border-border-subtle hover:border-border text-text-secondary'
            }`}
          >
            <FileJson className="w-5 h-5 text-accent-cyan shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="text-xs font-semibold text-text flex items-center justify-between">
                <span>Raw JSON Dump (.json)</span>
                {format === 'json' && <CheckCircle2 className="w-3.5 h-3.5 text-primary" />}
              </div>
              <p className="text-[11px] text-text-muted mt-0.5 leading-relaxed">
                Full structured data containing normalized entities, relationships, raw evidence
                payloads, metadata, and timeline events for programmatic analysis.
              </p>
            </div>
          </div>

          <div
            onClick={() => setFormat('csv')}
            className={`flex items-start gap-3 p-3 rounded-card border cursor-pointer transition-colors ${
              format === 'csv'
                ? 'bg-primary/10 border-primary/50 text-text'
                : 'bg-surface-2 border-border-subtle hover:border-border text-text-secondary'
            }`}
          >
            <FileSpreadsheet className="w-5 h-5 text-status-success shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="text-xs font-semibold text-text flex items-center justify-between">
                <span>CSV Spreadsheet (.csv)</span>
                {format === 'csv' && <CheckCircle2 className="w-3.5 h-3.5 text-primary" />}
              </div>
              <p className="text-[11px] text-text-muted mt-0.5 leading-relaxed">
                Tabular export of discovered entities, relationships, and evidence for spreadsheet
                tools (Excel, Google Sheets).
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-2 pt-3 border-t border-border-subtle">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleExport}
            loading={loading}
            icon={<Download className="w-3.5 h-3.5" />}
          >
            Download {format.toUpperCase()}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
