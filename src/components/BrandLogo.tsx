import Link from "next/link";

type Props = {
  href?: string;
  compact?: boolean;
};

export default function BrandLogo({
  href = "/",
  compact = false,
}: Props) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-3"
    >
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blue-600 text-xl font-black text-white shadow-sm">
        A
      </div>

      {!compact && (
        <div>
          <div className="text-lg font-bold leading-tight text-neutral-900">
            Absensi
          </div>

          <div className="text-xs font-medium tracking-wide text-neutral-500">
            INTERNAL
          </div>
        </div>
      )}
    </Link>
  );
}