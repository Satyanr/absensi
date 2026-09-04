import Image from "next/image";
import Link from "next/link";

type Props = {
  href?: string;
  compact?: boolean;
};

export default function BrandLogo({ href = "/", compact = false }: Props) {
  return (
    <Link href={href} className="inline-flex items-center gap-3">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white">
        <Image
          src="/branding/icon.svg"
          alt="Visitiga Media"
          width={64}
          height={64}
          priority
          className="h-full w-full object-contain"
        />
      </div>

      {!compact && (
        <div>
          <div className="text-lg font-bold leading-tight text-neutral-900">
            Absensi
          </div>

          <div className="text-xs font-medium tracking-wide text-neutral-500">
            Visitiga Media
          </div>
        </div>
      )}
    </Link>
  );
}
