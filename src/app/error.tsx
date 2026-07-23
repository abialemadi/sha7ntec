'use client';

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="card max-w-md p-6 text-center">
        <h2 className="text-lg font-semibold text-ink">Something went wrong</h2>
        <p className="mt-2 text-sm text-dim">
          An unexpected error occurred. You can try again, or return to the dashboard.
        </p>
        <button
          onClick={reset}
          className="mt-4 rounded-md bg-blue px-4 py-2 text-sm font-medium text-white hover:bg-blue/90"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
