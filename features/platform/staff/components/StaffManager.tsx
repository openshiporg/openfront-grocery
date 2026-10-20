'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { History, MailPlus, Search, ShieldCheck, UserCog, UserRoundX } from 'lucide-react';
import { staffOperation } from '../actions';
import {
  PlatformCheckboxRow,
  PlatformDetails,
  PlatformEmptyState,
  PlatformFeedback,
  PlatformField,
  PlatformFieldset,
  PlatformStatusBadge,
  PlatformSurface,
  platformButton,
  platformCheckbox,
  platformInput,
  platformSelect,
} from '@/features/platform/components/PlatformPrimitives';
import { PlatformTime } from '@/features/platform/components/PlatformTime';
import { formatRelative } from '@/features/platform/lib/format';

const caps = ['canAccessDashboard','canManageOrders','canManageInventory','canManageDelivery','canManagePayments','canManageProducts','canManageSuppliers','canManageUsers','canManageOnboarding'];
const labels: Record<string,string> = { canAccessDashboard:'Dashboard access',canManageOrders:'Orders',canManageInventory:'Inventory',canManageDelivery:'Delivery',canManagePayments:'Payments',canManageProducts:'Products',canManageSuppliers:'Suppliers',canManageUsers:'Staff and customers',canManageOnboarding:'Store setup' };

function CapabilityFields({ role }: { role?: any }) {
  return <PlatformFieldset legend="Permissions" hint="Permissions cannot exceed your own access.">
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{caps.map((cap) => <PlatformCheckboxRow key={cap}><input className={platformCheckbox} name={cap} type="checkbox" defaultChecked={Boolean(role?.[cap])} />{labels[cap]}</PlatformCheckboxRow>)}</div>
  </PlatformFieldset>;
}

function emptyCopy(hasAny: boolean, page: string, none: string) { return hasAny ? page : none; }

type AccessView = 'all' | 'active' | 'revoked';
const accessViews: Array<{ value: AccessView; label: string }> = [{ value: 'all', label: 'Everyone' }, { value: 'active', label: 'With access' }, { value: 'revoked', label: 'Revoked' }];

/** `now` comes from the server render so expiry state is identical during hydration. */
export function StaffManager({ data, now }: { data: any; now: number }) {
  const [message, setMessage] = useState(''); const [failed, setFailed] = useState(false); const [pending,start] = useTransition();
  const [inviteLink, setInviteLink] = useState('');
  const router = useRouter();
  // Search and access state live in the URL and run on the server across the whole directory.
  const accessView: AccessView = data.access || 'all';
  const [query, setQuery] = useState<string>(data.search || '');
  const hrefFor = (next: { q?: string; access?: string }) => {
    const params = new URLSearchParams();
    const q = next.q ?? data.search ?? ''; const access = next.access ?? accessView;
    if (q) params.set('q', q); if (access !== 'all') params.set('access', access);
    return `/dashboard/platform/staff${params.size ? `?${params}` : ''}`;
  };
  function submit(operation: 'invite'|'access'|'revoke'|'privacy', form: FormData, extra: Record<string,unknown> = {}, revokeAll = false) {
    const input: any = { ...Object.fromEntries(form), ...extra };
    if (operation === 'invite' || operation === 'access') input.capabilities = Object.fromEntries(caps.map((cap) => [cap, !revokeAll && form.get(cap) === 'on']));
    for (const cap of caps) delete input[cap];
    start(async () => { try {
      const outcome = await staffOperation(operation,input);
      if (!outcome.ok) { setFailed(true); setMessage(outcome.error); return; }
      const result = outcome.data || {};
      setFailed(false);
      setInviteLink(operation === 'invite' && typeof result.acceptPath === 'string' ? `${window.location.origin}${result.acceptPath}` : '');
      setMessage(operation === 'invite' ? (result.delivery === 'manual' ? 'Invitation created. Give the link below to the invitee in person; it expires in 48 hours.' : 'Invitation created and queued for email. It expires in 48 hours; delivery is shown in Communications.') : result.message || (result.status === 'deferred' ? 'Erasure deferred under the displayed retention policy.' : 'Saved.'));
      router.refresh();
    } catch { setFailed(true); setMessage('Unable to save. Check your connection and try again.'); } });
  }
  const counts = data.pagination.counts || {};
  const accessCounts = data.accessCounts || {};
  const visibleStaff = data.staff;
  const filtering = Boolean(data.search) || accessView !== 'all';

  return <div className="space-y-5" aria-busy={pending}>
    {message ? <PlatformFeedback tone={failed ? 'error' : 'success'}>{message}</PlatformFeedback> : null}
    {inviteLink ? <PlatformFeedback tone="info" title="Invitation link (shown once)">
      <p>Give this link only to the invitee, in person or through a channel you trust. It works once, expires in 48 hours and can be revoked below. The invitee chooses their own password.</p>
      <div className="mt-2 flex flex-wrap items-center gap-2"><input readOnly value={inviteLink} aria-label="Invitation link" className={`${platformInput} min-w-0 flex-1 font-mono text-xs`} onFocus={(event) => event.currentTarget.select()} /><button type="button" className={platformButton('secondary', 'sm')} onClick={() => { void navigator.clipboard?.writeText(inviteLink).then(() => setMessage('Invitation link copied.'), () => undefined); }}>Copy link</button></div>
    </PlatformFeedback> : null}

    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="min-w-0 space-y-5">
        <PlatformSurface icon={UserCog} title="Staff access" count={accessCounts[accessView] ?? data.staff.length} description="Expand a person to change their permissions or revoke access.">
          {data.staff.length || filtering ? <div className="flex flex-col gap-2 border-b bg-muted/20 px-4 py-2.5 sm:flex-row sm:items-center md:px-5">
            <form role="search" className="relative min-w-0 flex-1" onSubmit={(event) => { event.preventDefault(); router.push(hrefFor({ q: query.trim() })); }}>
              <label>
                <span className="sr-only">Search all staff</span>
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or email — press Enter" className={`${platformInput} pl-8`} />
              </label>
            </form>
            <nav aria-label="Access state" className="flex shrink-0 gap-0.5 rounded-lg border bg-muted/40 p-0.5">
              {accessViews.map((view) => {
                const selected = accessView === view.value;
                return <Link key={view.value} href={hrefFor({ access: view.value })} scroll={false} aria-current={selected ? 'page' : undefined} className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors ${selected ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'}`}>{view.label}<span className="tabular-nums opacity-70">{accessCounts[view.value] ?? 0}</span></Link>;
              })}
            </nav>
          </div> : null}
          {data.staff.length === 0 && filtering ? <PlatformEmptyState compact icon={Search} title="No matching staff" description="Clear the search or choose another access state." /> : data.staff.length === 0 ? <PlatformEmptyState compact icon={UserCog} title="No staff access records" description={emptyCopy(counts.staffCount > 0, 'No staff access records on this page.', 'Invite the first staff member to get started.')} /> : <div className="divide-y">
            {visibleStaff.map((user:any) => {
              const granted = caps.filter((cap) => user.role?.[cap]);
              return <PlatformDetails key={user.id} summary={
                <div className="flex items-center gap-3">
                  <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">{String(user.name || user.email || '?').slice(0, 1).toUpperCase()}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{user.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                  </div>
                  <div className="hidden max-w-[45%] flex-wrap justify-end gap-1 lg:flex">
                    {user.role ? granted.filter((cap) => cap !== 'canAccessDashboard').slice(0, 4).map((cap) => <span key={cap} className="rounded-md border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground">{labels[cap]}</span>) : null}
                    {user.role && granted.length > 5 ? <span className="px-1 text-[11px] text-muted-foreground">+{granted.length - 5}</span> : null}
                  </div>
                  {user.role ? <PlatformStatusBadge status="active" label={`${granted.length} permissions`} /> : <PlatformStatusBadge status="cancelled" label="Revoked" />}
                </div>
              }>
                <form className="space-y-4" action={(form) => submit('access',form,{userId:user.id})}>
                  <CapabilityFields role={user.role} />
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <PlatformField label="Reason for change" className="flex-1"><input name="reason" required minLength={3} maxLength={500} className={platformInput} placeholder="Role change, offboarding, temporary cover…" /></PlatformField>
                    <button disabled={pending} className={platformButton('primary', 'md')}>Save permissions</button>
                    {user.role ? <button type="button" disabled={pending} className={platformButton('destructive', 'md')} onClick={(event) => {
                      const form = event.currentTarget.form;
                      if (!form?.reportValidity()) return;
                      submit('access', new FormData(form), { userId: user.id }, true);
                    }}>Revoke access</button> : null}
                  </div>
                </form>
              </PlatformDetails>;
            })}
          </div>}
        </PlatformSurface>

        <PlatformSurface icon={MailPlus} title="Pending invitations" count={data.invitations.length} description="Revoking requires a reason and is recorded in access history.">
          {data.invitations.length===0 ? <PlatformEmptyState compact icon={MailPlus} title="No pending invitations" description={emptyCopy(counts.invitationCount > 0, 'No pending invitations on this page.', 'Invitations you send will wait here until accepted or expired.')} /> : <div className="divide-y">
            {data.invitations.map((invitation:any) => {
              const expired = new Date(invitation.expiresAt).getTime() <= now;
              return <form className={`flex flex-col gap-3 px-4 py-3 md:flex-row md:items-end md:px-5 ${expired ? 'bg-muted/30' : ''}`} key={invitation.id} action={(form) => submit('revoke',form,{invitationId:invitation.id})}>
              <div className="min-w-0 md:w-64">
                <div className="flex items-center gap-2"><p className="min-w-0 truncate text-sm font-medium">{invitation.email}</p>{expired ? <PlatformStatusBadge status="expired" label="Expired" /> : null}</div>
                <p className="text-xs text-muted-foreground">{expired ? 'Expired' : 'Expires'} {formatRelative(invitation.expiresAt, now)}{expired ? ' · send a new invitation' : ''}</p>
              </div>
              <PlatformField label="Revocation reason" className="flex-1"><input aria-label="Revocation reason" name="reason" minLength={3} required className={platformInput} /></PlatformField>
              <button disabled={pending} className={platformButton('destructive', 'md')}><UserRoundX aria-hidden="true" />Revoke</button>
            </form>;
            })}
          </div>}
        </PlatformSurface>

        <PlatformSurface icon={ShieldCheck} title="Privacy requests" count={data.privacyRequests.length} description="Erasure requests are reviewed subject to retention. Customers download exports themselves from Account → Privacy.">
          {data.privacyRequests.length===0 ? <PlatformEmptyState compact icon={ShieldCheck} title="No privacy requests" description={emptyCopy(counts.privacyCount > 0, 'No privacy requests on this page.', 'Customer export and erasure requests will appear here.')} /> : <div className="divide-y">
            {data.privacyRequests.map((request:any) => <div className="space-y-3 px-4 py-3.5 md:px-5" key={request.id}>
              <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium">{request.user?.name || 'Customer'}</p><span className="rounded-md border px-1.5 py-0.5 text-[11px] font-medium capitalize text-muted-foreground">{request.kind}</span><PlatformStatusBadge status={request.status} /></div>
              {request.kind === 'erasure' ? <form className="flex flex-col gap-2 sm:flex-row sm:items-end" action={(form) => submit('privacy',form,{requestId:request.id,approve:form.get('decision')==='approve'})}>
                <PlatformField label="Review reason" className="flex-1"><input name="reason" aria-label="Review reason" required minLength={3} className={platformInput} /></PlatformField>
                <PlatformField label="Decision" className="sm:w-56"><select name="decision" aria-label="Review decision" className={platformSelect}><option value="approve">Approve subject to retention</option><option value="reject">Reject with reason</option></select></PlatformField>
                <button disabled={pending} className={platformButton('primary', 'md')}>Record review</button>
              </form> : <p className="text-xs text-muted-foreground">The customer downloads their export from Account → Privacy.</p>}
            </div>)}
          </div>}
        </PlatformSurface>
      </div>

      <aside className="min-w-0 space-y-5">
        <PlatformSurface icon={MailPlus} title="Invite staff" description="Invitations expire after 48 hours.">
          <form className="space-y-4 p-4 md:p-5" action={(form) => submit('invite',form)}>
            <PlatformField label="Name"><input className={platformInput} required name="name" minLength={2} maxLength={120} /></PlatformField>
            <PlatformField label="Email"><input className={platformInput} required name="email" type="email" /></PlatformField>
            <CapabilityFields role={{canAccessDashboard:true}} />
            <fieldset className="space-y-2 text-sm">
              <legend className="mb-1 font-medium">How should the invitation reach them?</legend>
              <label className="flex items-start gap-2"><input type="radio" name="delivery" value="email" defaultChecked className="mt-1" />Email the invitation (uses the store&apos;s mail service)</label>
              <label className="flex items-start gap-2"><input type="radio" name="delivery" value="manual" className="mt-1" />Show me a one-time link to hand over in person</label>
            </fieldset>
            <button className={platformButton('primary', 'md', 'w-full')} disabled={pending}><MailPlus aria-hidden="true" />Create invitation</button>
          </form>
        </PlatformSurface>

        <PlatformSurface icon={History} title="Access history" count={data.events.length}>
          {data.events.length===0 ? <PlatformEmptyState compact icon={History} title="No access history" description={emptyCopy(counts.eventCount > 0, 'No access history entries on this page.', 'Grants, changes and revocations are recorded here.')} /> : (
            <ol className="relative space-y-4 px-4 py-4 md:px-5">
              {data.events.map((event:any) => <li className="relative border-l pl-4 text-sm" key={event.id}>
                <span aria-hidden="true" className="absolute top-1.5 -left-[4.5px] size-2 rounded-full bg-muted-foreground/50 ring-2 ring-card" />
                <p className="font-medium capitalize">{String(event.action).replaceAll('_', ' ')} <span className="font-normal text-muted-foreground normal-case">· {event.subject?.name || 'Invitation'}</span></p>
                {event.reason ? <p className="text-xs text-muted-foreground">{event.reason}</p> : null}
                <PlatformTime value={event.createdAt} className="mt-0.5 block text-[11px] text-muted-foreground tabular-nums" />
              </li>)}
            </ol>
          )}
        </PlatformSurface>
      </aside>
    </div>
  </div>;
}
