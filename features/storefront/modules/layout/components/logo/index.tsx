import Link from 'next/link';

export default function Logo() {
  return (
    <Link href="/" className="group flex items-center gap-3" aria-label="Openfront Grocery home">
      <span className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(245,252,244,0.98),rgba(229,244,225,0.98))] shadow-[0_10px_30px_-18px_rgba(31,93,54,0.55)] transition-transform duration-200 group-hover:-translate-y-0.5">
        <span className="absolute inset-x-1 bottom-1 h-3 rounded-full bg-emerald-950/8 blur-sm" />
        <svg
          width="26"
          height="26"
          viewBox="0 0 26 26"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="relative"
        >
          <path
            d="M8 11.5C8 9.01472 10.0147 7 12.5 7H13.5C15.9853 7 18 9.01472 18 11.5V18.5H8V11.5Z"
            fill="rgb(37 99 65)"
            fillOpacity="0.12"
          />
          <path
            d="M8 11.5C8 9.01472 10.0147 7 12.5 7H13.5C15.9853 7 18 9.01472 18 11.5V18.5H8V11.5Z"
            stroke="rgb(23 77 45)"
            strokeWidth="1.4"
          />
          <path d="M10.5 12.5H15.5" stroke="rgb(23 77 45)" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M10.5 15.5H15.5" stroke="rgb(23 77 45)" strokeWidth="1.4" strokeLinecap="round" />
          <path
            d="M13 6C13 3.79086 14.7909 2 17 2C17 4.20914 15.2091 6 13 6Z"
            fill="rgb(34 197 94)"
            fillOpacity="0.9"
          />
          <path
            d="M12.8 9.2C12.8 6.81413 10.8659 4.88 8.48 4.88C8.48 7.26587 10.4141 9.2 12.8 9.2Z"
            fill="rgb(74 222 128)"
            fillOpacity="0.85"
          />
          <path d="M13 6V10" stroke="rgb(23 77 45)" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      </span>
      <span className="flex flex-col leading-none">
        <span className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-emerald-700/80">
          Openfront
        </span>
        <span className="text-lg font-semibold text-zinc-950">Grocery</span>
      </span>
    </Link>
  );
}
