import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { TERMS_SECTIONS, PRIVACY_SECTIONS } from '../../pages/legalContent';

export type LegalDocType = 'terms' | 'privacy';

interface LegalContentDialogProps {
  open: boolean;
  onClose: () => void;
  type: LegalDocType;
}

const DOC_CONFIG: Record<
  LegalDocType,
  {
    title: string;
    eyebrow: string;
    description: string;
    lastUpdated: string;
    sections: { title: string; body: string }[];
  }
> = {
  terms: {
    title: 'Terms of Service',
    eyebrow: 'MeLun Hire Legal',
    description:
      'These terms govern your access to and use of MeLun Hire, the AI-assisted hiring platform provided by MeLun.',
    lastUpdated: 'Last updated: 1 January 2026',
    sections: TERMS_SECTIONS,
  },
  privacy: {
    title: 'Privacy Policy',
    eyebrow: 'MeLun Hire Privacy',
    description:
      'This policy explains how MeLun collects, uses, and protects the information you share with MeLun Hire.',
    lastUpdated: 'Last updated: 1 January 2026',
    sections: PRIVACY_SECTIONS,
  },
};

export default function LegalContentDialog({
  open,
  onClose,
  type,
}: LegalContentDialogProps) {
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const doc = DOC_CONFIG[type];

  return createPortal(
    <div className="fixed inset-0 z-[999999] flex items-center justify-center p-3 sm:p-6">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close legal viewer"
        onClick={onClose}
        className="modal-backdrop-in absolute inset-0 w-full h-full bg-black/75 backdrop-blur-sm cursor-default"
      />

      {/* Modal Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-dialog-title"
        className="modal-panel-in relative flex flex-col w-full max-w-3xl max-h-[88vh] rounded-2xl bg-navy-900 border border-white/10 shadow-2xl shadow-black/60 overflow-hidden z-10"
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-white/10 bg-navy-950/50">
          <div className="min-w-0">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-primary-light">
              {doc.eyebrow}
            </span>
            <h2 id="legal-dialog-title" className="text-xl font-bold text-white mt-0.5 truncate">
              {doc.title}
            </h2>
            <p className="text-xs text-gray-400 mt-1 line-clamp-2">{doc.description}</p>
            <span className="inline-block text-[10px] text-gray-500 mt-1.5">{doc.lastUpdated}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 divide-y divide-white/5">
          {doc.sections.map((section, idx) => (
            <div key={section.title} className={idx === 0 ? '' : 'pt-4'}>
              <div className="flex items-start gap-3">
                <span className="flex items-center justify-center w-6 h-6 shrink-0 rounded-md bg-primary/10 border border-primary/20 text-primary-light text-xs font-bold">
                  {idx + 1}
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-white tracking-tight">
                    {section.title}
                  </h3>
                  <p className="mt-1 text-xs text-gray-400 leading-relaxed">
                    {section.body}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-white/10 bg-navy-950/40">
          <span className="text-[11px] text-gray-500">
            Official MeLun Hire Documentation
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 font-medium py-2 px-4 rounded-xl transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
