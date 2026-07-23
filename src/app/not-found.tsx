import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="card max-w-md p-6 text-center">
        <h2 className="text-lg font-semibold text-ink">Not found</h2>
        <p className="mt-2 text-sm text-dim">
          This page doesn&apos;t exist, or you don&apos;t have access to it.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block rounded-md bg-blue px-4 py-2 text-sm font-medium text-white hover:bg-blue/90"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
