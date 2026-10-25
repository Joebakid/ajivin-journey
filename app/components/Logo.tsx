import Image from 'next/image';
import Link from 'next/link';

export default function Logo({ className = "w-16 h-16" }: { className?: string }) {
  return (
    <Link href="/" className="inline-block">
      <Image
        src="/logo.png"
        alt="Ajivin Logo"
        width={150}
        height={150}
        className={`object-contain rounded-md ${className}`}
        priority
      />
    </Link>
  );
}
