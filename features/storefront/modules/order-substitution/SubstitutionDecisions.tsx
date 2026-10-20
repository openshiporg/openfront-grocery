'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { GroceryOrderSubstitutionProposal } from '../../types';
import { UrbanButton, formatCents, formatUnit } from '../urban/UrbanPrimitives';
import { answerSubstitution } from './actions';

function Proposal({ orderId, proposal }: { orderId: string; proposal: GroceryOrderSubstitutionProposal }) {
  const router = useRouter();
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null), [error, setError] = useState(''), [status, setStatus] = useState(proposal.status);
  async function answer(decision: 'approve' | 'reject') {
    setBusy(decision); setError('');
    try {
      const result = await answerSubstitution({ orderId, lineItemId: proposal.lineItemId, proposalId: proposal.id, decision });
      if (!result.ok) { setError(result.error); return; }
      setStatus(result.status as typeof status);
      router.refresh();
    } catch { setError('Your answer could not be saved. Check your connection and try again.'); }
    finally { setBusy(null); }
  }
  return <li className="space-y-3 rounded-[var(--sf-radius-md)] border border-[var(--sf-rule)] bg-[var(--sf-card)] p-4">
    <div className="text-sm leading-6">
      <p className="text-[var(--sf-ink-muted)]">Unavailable: <span className="font-semibold text-[var(--sf-ink)]">{proposal.originalTitle}</span></p>
      <p className="text-[var(--sf-ink-muted)]">Suggested replacement: <span className="font-semibold text-[var(--sf-ink)]">{proposal.productTitle}</span> · {proposal.quantity} {formatUnit(proposal.unitOfMeasure)} · about {formatCents(proposal.estimatedSubtotalCents)}</p>
      {proposal.reason ? <p className="text-[var(--sf-ink-muted)]">Note from the store: {proposal.reason}</p> : null}
    </div>
    {status === 'pending' ? <div className="flex flex-wrap gap-2">
      <UrbanButton type="button" disabled={busy !== null} onClick={() => answer('approve')}>{busy === 'approve' ? 'Saving…' : 'Approve replacement'}</UrbanButton>
      <UrbanButton type="button" variant="ghost" disabled={busy !== null} onClick={() => answer('reject')}>{busy === 'reject' ? 'Saving…' : 'Decline, leave it out'}</UrbanButton>
    </div> : <p role="status" className="text-sm font-semibold">{status === 'approved' ? 'You approved this replacement. Your final receipt shows what was picked.' : 'You declined this replacement. The item will be left out and not charged.'}</p>}
    {error ? <p role="alert" className="text-sm">{error}</p> : null}
  </li>;
}

export function SubstitutionDecisions({ orderId, proposals }: { orderId: string; proposals: GroceryOrderSubstitutionProposal[] }) {
  if (!proposals.length) return null;
  const waiting = proposals.some(proposal => proposal.status === 'pending');
  return <section className={`sf-panel space-y-4 p-5 sm:p-7 ${waiting ? 'border-2 border-[var(--sf-accent)]' : ''}`} aria-labelledby="substitution-title">
    {waiting ? <p className="sf-eyebrow">Your answer is needed</p> : null}
    <h2 id="substitution-title" className="sf-subtitle">Replacements</h2>
    <p className="sf-copy">The final charge reflects only what you approve and what is picked.</p>
    <ul className="space-y-3">{proposals.map(proposal => <Proposal key={proposal.id} orderId={orderId} proposal={proposal} />)}</ul>
    <Link href="/support?topic=substitution#contact-form" className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">Questions about a replacement?</Link>
  </section>;
}
