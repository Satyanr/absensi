import { Spinner } from "@/components/ui/Loading";

export default function Loading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-100 p-6">
      <div className="text-center">
        <div className="inline-flex text-blue-600">
          <Spinner size="lg" />
        </div>

        <p className="mt-4 text-sm font-medium text-neutral-600">Memuat...</p>
      </div>
    </main>
  );
}
