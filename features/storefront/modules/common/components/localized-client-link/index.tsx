'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';

interface LocalizedClientLinkProps {
  href: string;
  children: React.ReactNode;
  className?: string;
  'data-testid'?: string;
}

export default function LocalizedClientLink({
  href,
  children,
  className = '',
  ...props
}: LocalizedClientLinkProps) {
  const params = useParams();
  const countryCode = (params?.countryCode as string) || 'us';

  // Prepend country code to href if it doesn't already have one
  const localizedHref = href.startsWith(`/${countryCode}`) ? href : `/${countryCode}${href}`;

  return (
    <Link href={localizedHref} className={className} {...props}>
      {children}
    </Link>
  );
}
