'use client';
import Link from 'next/link';
import { Download, ShieldCheck, Trash2 } from 'lucide-react';
import MarketAccountNav from '../../modules/market/MarketAccountNav';
import { UrbanBadge, UrbanButton, UrbanContainer, UrbanPageShell } from '../../modules/urban/UrbanPrimitives';
import { useEffect, useState, useTransition } from 'react';
import { storefrontGraphQL, throwGraphQLErrors } from '@/features/storefront/lib/data/graphql';

const statusTone = { requested: 'blue', deferred: 'orange', completed: 'primary', rejected: 'danger' } as const;

export default function PrivacyPage() {
  const [data,setData] = useState<any>(null); const [loading,setLoading] = useState(true); const [confirmErasure,setConfirmErasure] = useState(false); const [message,setMessage] = useState(''); const [pending,start] = useTransition();
  async function call(query:string, variables?:Record<string,unknown>) { const response=await storefrontGraphQL(query,variables); throwGraphQLErrors(response.errors); return response.data; }
  async function refresh(page=1){setLoading(true);try {const result=await call('query Privacy($page:Int){ groceryCustomerPrivacy(page:$page) }',{page});if(!result?.groceryCustomerPrivacy) throw new Error('Privacy details could not be loaded.');setData(result.groceryCustomerPrivacy);}finally{setLoading(false);}}
  useEffect(()=>{refresh().catch(error=>setMessage(error.message));},[]);
  function request(kind:string) {
    start(async()=>{
      try {
        const result=await call('mutation Request($kind:String!){requestGroceryCustomerPrivacy(kind:$kind)}',{kind});
        const recorded = result?.requestGroceryCustomerPrivacy;
        if(recorded?.success !== true || typeof recorded.requestId !== 'string' || !recorded.requestId.trim()) throw new Error('Your privacy request could not be confirmed. Please try again.');
        if(kind==='export') {
          const requestId=recorded.requestId;
          const fetchPage=async(collection:string,afterId:string|null)=> (await call('mutation Export($requestId:ID!,$collection:String,$afterId:ID){exportGroceryCustomerData(requestId:$requestId,collection:$collection,afterId:$afterId)}',{requestId,collection,afterId})).exportGroceryCustomerData;
          const first:any=await fetchPage('orders',null);
          const document:any={policy:first.policy,identity:first.identity,collections:{}};
          for(const collection of first.collections) {
            let page:any=collection==='orders'?first:await fetchPage(collection,null);
            document.collections[collection]=[];
            while(true) {
              document.collections[collection].push(...page.records);
              setMessage(`Preparing ${collection}: ${document.collections[collection].length} records`);
              if(!page.nextId) break;
              page=await fetchPage(collection,page.nextId);
            }
          }
          const url=URL.createObjectURL(new Blob([JSON.stringify(document,null,2)],{type:'application/json'}));
          const link=window.document.createElement('a');link.href=url;link.download='grocery-account-data.json';link.click();URL.revokeObjectURL(url);
          setMessage('Your account data was downloaded.');
        } else {setMessage('Erasure request recorded for review under the retention policy.');setConfirmErasure(false);}
        await refresh();
      } catch(error) {setMessage(error instanceof Error?error.message:'Request failed');}
    });
  }

  return <UrbanPageShell><UrbanContainer className="space-y-7 py-8 sm:py-10">
    <header>
      <h1 className="sf-title">Privacy & account data</h1>
      <p className="sf-copy mt-2">Download your information and follow the progress of privacy requests.</p>
    </header>
    <MarketAccountNav active="privacy" />

    {loading && !data ? (
      <div role="status" className="grid gap-5 lg:grid-cols-2"><span className="sr-only">Loading your privacy details…</span><div aria-hidden="true" className="sf-skeleton h-72" /><div aria-hidden="true" className="sf-skeleton h-72" /></div>
    ) : data ? (
      <div className="grid items-start gap-5 lg:grid-cols-2 lg:gap-6">
        <section aria-labelledby="privacy-choices-title" className="sf-panel overflow-hidden">
          <div className="space-y-4 p-5 sm:p-7">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-[var(--sf-sage-light)] text-[var(--sf-sage)]"><ShieldCheck className="h-5 w-5" aria-hidden="true" /></span>
            <h2 id="privacy-choices-title" className="sf-subtitle">Your information, your choices</h2>
            <p className="sf-copy">{data.policy.description}</p>
            <p className="text-xs leading-6 text-[var(--sf-ink-faint)]">Policy <span className="sf-mono">{data.policy.version}</span>. Transaction and audit records are retained as described; staff will review your request.</p>
          </div>
          <div className="grid gap-px border-t border-[var(--sf-rule)] bg-[var(--sf-rule)]">
            <div className="space-y-3 bg-[var(--sf-card)] p-5 sm:p-7">
              <h3 className="flex items-center gap-2 font-semibold"><Download className="h-4 w-4 text-[var(--sf-sage)]" aria-hidden="true" />Download a copy</h3>
              <p className="text-sm leading-6 text-[var(--sf-ink-muted)]">Your orders and account records, saved as a JSON file on this device.</p>
              <UrbanButton variant="dark" disabled={pending || loading} onClick={()=>request('export')}>{pending ? 'Processing request…' : 'Download my data'}</UrbanButton>
            </div>
            <div className="space-y-3 bg-[var(--sf-card)] p-5 sm:p-7">
              <h3 className="flex items-center gap-2 font-semibold"><Trash2 className="h-4 w-4 text-[var(--sf-danger)]" aria-hidden="true" />Request account erasure</h3>
              <p className="text-sm leading-6 text-[var(--sf-ink-muted)]">This sends a request for review. It does not immediately delete your account or records that must be retained.</p>
              {confirmErasure ? (
                <div role="alert" className="space-y-3 rounded-[var(--sf-radius-md)] bg-[var(--sf-danger-bg)] p-4">
                  <p className="text-sm font-semibold text-[var(--sf-ink)]">Submit an erasure request for this account?</p>
                  <div className="flex flex-wrap gap-3"><UrbanButton disabled={pending || loading} onClick={()=>request('erasure')}>Submit erasure request</UrbanButton><UrbanButton variant="ghost" disabled={pending} onClick={()=>setConfirmErasure(false)}>Keep account</UrbanButton></div>
                </div>
              ) : <UrbanButton variant="ghost" disabled={pending || loading} onClick={()=>setConfirmErasure(true)}>Request erasure review</UrbanButton>}
            </div>
          </div>
        </section>

        <section aria-labelledby="privacy-history-title" className="sf-panel space-y-4 p-5 sm:p-7" aria-busy={loading}>
          <h2 id="privacy-history-title" className="sf-subtitle">Request history</h2>
          {data.requests.length ? (
            <ul className="divide-y divide-[var(--sf-rule)] border-y border-[var(--sf-rule)]">
              {data.requests.map((item:any)=><li className="space-y-1.5 py-4" key={item.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold capitalize">{item.kind === 'export' ? 'Data download' : item.kind === 'erasure' ? 'Erasure review' : item.kind}</p>
                  <UrbanBadge tone={statusTone[item.status as keyof typeof statusTone] || 'muted'} className="capitalize">{String(item.status).replace(/_/g,' ')}</UrbanBadge>
                </div>
                {item.reviewReason?<p className="text-sm leading-6 text-[var(--sf-ink-muted)]">{item.reviewReason}</p>:null}
                {item.eligibleAt?<p className="text-xs text-[var(--sf-ink-faint)]">Review after {new Date(item.eligibleAt).toLocaleDateString()}</p>:null}
              </li>)}
            </ul>
          ) : <p className="sf-note">You haven’t made a privacy request.</p>}
          {data.pagination.totalPages > 1 ? (
            <nav className="flex items-center justify-between gap-3" aria-label="Privacy request pages">
              <UrbanButton variant="ghost" size="sm" disabled={pending||loading||data.pagination.page<=1} onClick={()=>refresh(data.pagination.page-1).catch(error=>setMessage(error.message))}>← Previous</UrbanButton>
              <span className="text-sm tabular-nums text-[var(--sf-ink-muted)]">Page {data.pagination.page} of {Math.max(1,data.pagination.totalPages)}</span>
              <UrbanButton variant="ghost" size="sm" disabled={pending||loading||data.pagination.page>=data.pagination.totalPages} onClick={()=>refresh(data.pagination.page+1).catch(error=>setMessage(error.message))}>Next →</UrbanButton>
            </nav>
          ) : null}
        </section>
      </div>
    ) : (
      <div className="sf-panel-soft space-y-4 p-6 sm:p-8">
        <p className="sf-copy">Sign in with your customer account to manage your data. If you are already signed in, try loading it again.</p>
        <div className="flex flex-wrap gap-3"><Link className="inline-flex min-h-11 items-center rounded-full bg-[var(--sf-ink)] px-5 text-sm font-semibold text-[var(--sf-paper)] hover:bg-[var(--sf-header-2)]" href="/account/sign-in?from=%2Faccount%2Fprivacy">Sign in</Link><UrbanButton variant="ghost" onClick={()=>refresh().catch(error=>setMessage(error.message))}>Try again</UrbanButton></div>
      </div>
    )}
    {message ? <p role="status" className="rounded-[var(--sf-radius-md)] bg-[var(--sf-paper-2)] p-4 text-sm leading-6">{message}</p> : null}
  </UrbanContainer></UrbanPageShell>;
}
