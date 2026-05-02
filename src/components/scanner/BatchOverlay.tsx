import { Layers, Loader2 } from 'lucide-react';

interface BatchOverlayProps {
  progress: number;
  total: number;
}

export default function BatchOverlay({ progress, total }: BatchOverlayProps) {
  const percentage = (Math.max(1, progress) / total) * 100;

  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-[#dfcaaa]/30 bg-obsidian shadow-[0_0_20px_rgba(190,169,142,0.1)]">
      <div className="relative px-5 py-3">
        <div className="flex items-center gap-3 relative z-10">
          <Layers className="h-5 w-5 animate-pulse text-champagne" />
          <div className="flex-1">
            <p className="text-sm font-bold text-champagne">GALAXY Extraction Engine Active</p>
            <p className="text-xs text-champagne/80">
              Processing {progress} of {total}...
            </p>
          </div>
          <Loader2 className="h-4 w-4 animate-spin text-champagne" />
        </div>
        <div 
          className="absolute top-0 left-0 h-full bg-champagne/10 transition-all duration-700 ease-in-out" 
          style={{ width: `${percentage}%` }} 
        />
      </div>
    </div>
  );
}
