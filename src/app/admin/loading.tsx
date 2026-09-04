import {
  Spinner,
} from "@/components/ui/Loading";

export default function AdminLoading() {
  return (
    <main className="min-h-screen bg-neutral-100">
      <div className="flex min-h-[70vh] items-center justify-center p-6">
        <div
          role="status"
          className="flex flex-col items-center rounded-2xl bg-white px-8 py-7 shadow-sm"
        >
          <div className="text-blue-600">
            <Spinner size="lg" />
          </div>

          <p className="mt-4 text-sm font-semibold text-neutral-800">
            Memuat halaman...
          </p>

          <p className="mt-1 text-xs text-neutral-500">
            Mengambil data terbaru.
          </p>
        </div>
      </div>
    </main>
  );
}