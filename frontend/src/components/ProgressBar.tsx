interface ProgressBarProps {
  message: string;
  progress: number;
}

export function ProgressBar({ message, progress }: ProgressBarProps) {
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-surface-900/95 backdrop-blur-sm border border-white/10 rounded-lg px-6 py-4 shadow-2xl min-w-[300px]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-white">{message}</span>
        <span className="text-xs text-white/60">{progress}%</span>
      </div>
      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
