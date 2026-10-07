'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { storefrontGraphQL, throwGraphQLErrors } from '../../lib/data/graphql';
export default function RemoveFavorite({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition(), [error, setError] = useState('');
  const router = useRouter();
  return <div><button type="button" disabled={pending} aria-label={`Remove ${name} from favorites`} className="inline-flex min-h-11 items-center text-sm underline" onClick={() => { setError(''); start(async () => { try { const result = await storefrontGraphQL<{ deleteFavoriteProduct: { id: string } | null }>('mutation RemoveFavorite($id:ID!){deleteFavoriteProduct(where:{id:$id}){id}}', { id }); throwGraphQLErrors(result.errors); if (result.data?.deleteFavoriteProduct?.id !== id) throw new Error('This favorite could not be removed.'); router.refresh(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'This favorite could not be removed.'); } }); }}>{pending ? 'Removing…' : 'Remove favorite'}</button>{error ? <p role="alert" className="text-xs text-[var(--sf-danger)]">{error}</p> : null}</div>;
}
