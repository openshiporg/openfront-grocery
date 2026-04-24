import Link from 'next/link';

interface InteractiveLinkProps {
  href: string;
  children: React.ReactNode;
  className?: string;
}

export default function InteractiveLink({ href, children, className = '' }: InteractiveLinkProps) {
  return (
    <Link
      href={href}
      className={`text-primary hover:text-primary/80 underline-offset-4 hover:underline ${className}`}
    >
      {children}
    </Link>
  );
}
