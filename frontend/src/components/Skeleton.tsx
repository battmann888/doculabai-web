export function DocumentSkeleton() {
  return (
    <div className="animate-pulse space-y-4 p-8">
      <div className="h-8 bg-white/10 rounded w-3/4 mb-6" />
      <div className="space-y-3">
        <div className="h-4 bg-white/10 rounded w-full" />
        <div className="h-4 bg-white/10 rounded w-5/6" />
        <div className="h-4 bg-white/10 rounded w-4/6" />
      </div>
      <div className="h-32 bg-white/10 rounded w-full my-6" />
      <div className="space-y-3">
        <div className="h-4 bg-white/10 rounded w-full" />
        <div className="h-4 bg-white/10 rounded w-5/6" />
        <div className="h-4 bg-white/10 rounded w-3/4" />
      </div>
      <div className="h-4 bg-white/10 rounded w-2/3 mt-6" />
    </div>
  );
}

export function ChatSkeleton() {
  return (
    <div className="animate-pulse space-y-4 p-4">
      <div className="space-y-2">
        <div className="h-4 bg-white/10 rounded w-1/3" />
        <div className="h-16 bg-white/10 rounded w-full" />
      </div>
      <div className="space-y-2">
        <div className="h-4 bg-white/10 rounded w-1/4 ml-auto" />
        <div className="h-12 bg-white/10 rounded w-4/5 ml-auto" />
      </div>
      <div className="h-12 bg-white/10 rounded w-full mt-8" />
    </div>
  );
}

export function ButtonSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse h-10 bg-white/10 rounded ${className}`} />
  );
}
