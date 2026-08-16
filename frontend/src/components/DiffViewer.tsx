import type { AIOperation, SegmentDiff } from '@/types';

interface DiffViewerProps {
  diffs: SegmentDiff[];
  operations?: AIOperation[];
  onApply: () => void;
  onDiscard: () => void;
}

export function DiffViewer({ diffs, operations = [], onApply, onDiscard }: DiffViewerProps) {
  return (
    <div className="bg-surface-900/50 border border-white/10 rounded-lg p-4 mt-4">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-semibold text-white">Preview Perubahan</h4>
        <div className="flex gap-2">
          <button
            onClick={onDiscard}
            className="px-3 py-1.5 text-xs font-medium text-white/70 hover:text-white hover:bg-white/10 rounded transition-colors"
          >
            Tolak
          </button>
          <button
            onClick={onApply}
            className="px-3 py-1.5 text-xs font-medium bg-primary-500 hover:bg-primary-600 text-white rounded transition-colors"
          >
            Terapkan
          </button>
        </div>
      </div>
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {diffs.length === 0 && operations.length === 0 && (
          <div className="rounded border border-primary-500/20 bg-primary-500/10 p-2 text-sm text-white/80">
            Proposed targeted document change. Apply it only if this is the intended target.
          </div>
        )}
        {operations.map((operation, index) => (
          <div key={`${operation.type}-${operation.segmentId || 'document'}-${index}`} className="rounded border border-primary-500/20 bg-primary-500/10 p-2 text-sm text-white/80">
            <span className="text-xs text-primary-200">Proposed change:</span>{' '}
            {describeOperation(operation)}
          </div>
        ))}
        {diffs.map((diff, index) => (
          <div key={`${diff.segmentId}-${index}`} className="text-sm">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-white/40">{diff.action}</span>
              {diff.target && (
                <span className="text-xs text-white/40">
                  (Cell: {diff.target.row}, {diff.target.column})
                </span>
              )}
            </div>
            <div className="bg-red-500/10 border border-red-500/20 rounded p-2 mb-1">
              <span className="text-xs text-red-400 block mb-1">Sebelum:</span>
              <p className="text-white/80 line-through">{diff.before}</p>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded p-2">
              <span className="text-xs text-emerald-400 block mb-1">Sesudah:</span>
              <p className="text-white/80">{diff.after}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function describeOperation(operation: AIOperation): string {
  switch (operation.type) {
    case 'resize_image':
      return `Resize the selected image to ${operation.widthCm ?? 'a safe'} cm wide.`;
    case 'format_text':
      return 'Update text formatting only for the targeted content.';
    case 'format_paragraph':
      return 'Update spacing only for the targeted paragraph.';
    case 'modify_heading_style':
      return `Update Heading ${operation.level ?? ''} styling.`;
    case 'modify_page_layout':
      return 'Update the requested page layout settings.';
    case 'add_page_break':
      return 'Insert a page break before the targeted content.';
  }
}
