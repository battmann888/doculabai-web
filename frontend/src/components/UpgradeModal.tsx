import { Check, X, Zap } from 'lucide-react';

interface UpgradeModalProps {
  onClose: () => void;
}

export function UpgradeModal({ onClose }: UpgradeModalProps) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="upgrade-modal animate-scale-in" role="dialog" aria-modal="true" aria-labelledby="upgrade-title">
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close upgrade dialog"><X className="h-4 w-4" /></button>
        <div className="upgrade-modal__icon"><Zap className="h-5 w-5" /></div>
        <span className="modal-kicker">PRO PLAN</span>
        <h2 id="upgrade-title">Limit harian Anda telah habis.</h2>
        <p>Jadikan dokumen Anda tanpa cela tanpa batas.</p>
        <div className="upgrade-price"><strong>$4.99</strong><span>/ bulan</span></div>
        <ul className="upgrade-list"><li><Check /> AI edits tanpa batas</li><li><Check /> Layout dan formatting tetap aman</li><li><Check /> Export DOCX tanpa watermark</li></ul>
        <button type="button" className="modal-primary-button upgrade-button" onClick={onClose}>Upgrade to Pro</button>

        <button type="button" className="upgrade-later" onClick={onClose}>Nanti saja</button>

      </section>
    </div>
  );
}
