import type { Metadata } from 'next';

export function storefrontMetadata({
  title,
  description,
  canonical,
}: {
  title: string;
  description: string;
  canonical?: string;
}): Metadata {
  const metadata: Metadata = {
    title,
    description,
  };
  if (canonical) {
    metadata.alternates = { canonical };
  }
  return metadata;
}
