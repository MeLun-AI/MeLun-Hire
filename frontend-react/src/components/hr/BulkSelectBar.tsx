import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

/* ------------------------------------------------------------------ */
/*  Bulk selection controls for HR lists                               */
/*  Shared by every HR list that supports selecting several rows       */
/*  (applicants, interview results, job posts): the per-row checkbox,  */
/*  the "Select all" switch with its partial state, and the sticky-    */
/*  looking action bar.                                                */
/*                                                                     */
/*  The action buttons are passed as children so each page keeps its   */
/*  own existing actions, labels and confirmations.                    */
/* ------------------------------------------------------------------ */

/** Checkbox used to select ONE row/card. */
export function RowCheckbox({
  checked,
  onChange,
  label,
  className = '',
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Accessible name, e.g. "Select Jane Doe". */
  label: string;
  /** Extra classes for vertical alignment inside a specific row layout. */
  className?: string;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      // Stop the click from bubbling into a row/card click handler.
      onClick={(e) => e.stopPropagation()}
      aria-label={label}
      className={`w-3.5 h-3.5 shrink-0 rounded border-white/20 bg-transparent accent-blue-500 cursor-pointer ${className}`}
    />
  );
}

/** Bar shown above a list: select-all + the bulk actions of the page.
 *
 *  Bulk actions only render once at least one row is selected, so the list
 *  never shows controls that cannot do anything. */
export function BulkSelectBar({
  selectedCount,
  selectableCount,
  allSelected,
  onToggleAll,
  onClear,
  children,
}: {
  selectedCount: number;
  /** How many visible rows can be selected at all. Drives "Select all". */
  selectableCount: number;
  allSelected: boolean;
  onToggleAll: (checked: boolean) => void;
  onClear: () => void;
  children: ReactNode;
}) {
  const allRef = useRef<HTMLInputElement>(null);

  // "Select all" shows a partial (indeterminate) state while only some of the
  // selectable rows are selected.
  useEffect(() => {
    if (allRef.current) {
      allRef.current.indeterminate = selectedCount > 0 && !allSelected;
    }
  }, [selectedCount, allSelected]);

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-3">
      <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer select-none hover:text-gray-300 transition-colors">
        <input
          ref={allRef}
          type="checkbox"
          checked={allSelected}
          onChange={(e) => onToggleAll(e.target.checked)}
          aria-label="Select all"
          className="w-3.5 h-3.5 rounded border-white/20 bg-transparent accent-blue-500 cursor-pointer"
        />
        Select all ({selectableCount})
      </label>

      {selectedCount > 0 && (
        <>
          <span className="text-xs font-medium text-white">{selectedCount} selected</span>
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            {children}
            <button
              type="button"
              onClick={onClear}
              className="text-[11px] font-medium text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 rounded-lg transition-colors"
            >
              Clear
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** Bulk action button, styled to match the existing per-row actions. */
export function BulkActionButton({
  tone,
  disabled = false,
  onClick,
  children,
}: {
  tone: 'approve' | 'reject' | 'neutral';
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const toneCls = {
    approve: 'bg-green-500/15 hover:bg-green-500/25 border-green-500/30 text-green-200',
    reject: 'bg-red-500/15 hover:bg-red-500/25 border-red-500/30 text-red-200',
    neutral: 'bg-white/5 hover:bg-white/10 border-white/10 text-gray-300 hover:text-white',
  }[tone];

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`text-xs font-medium border px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${toneCls}`}
    >
      {children}
    </button>
  );
}
