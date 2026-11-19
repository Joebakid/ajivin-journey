// app/components/CallButton.tsx
// Plain link, so it works in server and client components.
// On a phone it opens the dialer; on desktop it opens the default calling app (if any).

/** Turns a Nigerian-style number into an international tel: href. */
export function toTelHref(phone?: string | null): string | null {
  if (!phone) return null;

  // Keep digits and a leading +
  let cleaned = String(phone).trim().replace(/[^\d+]/g, '');
  if (!cleaned) return null;

  if (cleaned.startsWith('+')) {
    // already international
  } else if (cleaned.startsWith('00')) {
    cleaned = '+' + cleaned.slice(2);
  } else if (cleaned.startsWith('234')) {
    cleaned = '+' + cleaned;
  } else if (cleaned.startsWith('0')) {
    cleaned = '+234' + cleaned.slice(1); // 0803... -> +234803...
  }

  return cleaned.length >= 8 ? `tel:${cleaned}` : null;
}

export default function CallButton({
  phone,
  name,
  size = 'md',
  label = 'Call',
}: {
  phone?: string | null;
  name?: string;
  size?: 'sm' | 'md';
  label?: string;
}) {
  const href = toTelHref(phone);
  const sizing = size === 'sm' ? 'px-3 py-1.5 text-xs gap-1.5' : 'px-5 py-2.5 text-sm gap-2';

  if (!href) {
    return (
      <span
        title="No phone number on file"
        className={`inline-flex items-center justify-center rounded-xl bg-gray-100 text-gray-400 font-bold cursor-not-allowed ${sizing}`}
      >
        No number
      </span>
    );
  }

  return (
    <a
      href={href}
      aria-label={name ? `Call ${name}` : 'Call'}
      className={`inline-flex items-center justify-center rounded-xl bg-[#0a7337] hover:bg-[#085a2b] text-white font-bold shadow-sm transition-all active:scale-95 ${sizing}`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size === 'sm' ? 14 : 16}
        height={size === 'sm' ? 14 : 16}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
      </svg>
      {label}
    </a>
  );
}