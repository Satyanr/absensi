export function Spinner({
  size = "md",
}: {
  size?:
    | "sm"
    | "md"
    | "lg";
}) {
  const sizing =
    size === "sm"
      ? "h-4 w-4"
      : size === "lg"
        ? "h-9 w-9"
        : "h-5 w-5";

  return (
    <span
      aria-hidden="true"
      className={`${sizing} inline-block animate-spin rounded-full border-2 border-current border-t-transparent`}
    />
  );
}

export function LoadingLabel({
  loading,
  loadingText,
  children,
}: {
  loading: boolean;
  loadingText: string;
  children:
    React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center justify-center gap-2">
      {loading && (
        <Spinner size="sm" />
      )}

      {loading
        ? loadingText
        : children}
    </span>
  );
}

export function LoadingOverlay({
  visible,
  message = "Memproses...",
}: {
  visible: boolean;
  message?: string;
}) {
  if (!visible) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/25 px-6 backdrop-blur-[2px]"
    >
      <div className="flex min-w-[220px] flex-col items-center rounded-2xl bg-white p-6 shadow-2xl">
        <div className="text-blue-600">
          <Spinner size="lg" />
        </div>

        <p className="mt-4 text-center text-sm font-semibold text-neutral-800">
          {message}
        </p>

        <p className="mt-1 text-center text-xs text-neutral-500">
          Jangan tutup halaman.
        </p>
      </div>
    </div>
  );
}