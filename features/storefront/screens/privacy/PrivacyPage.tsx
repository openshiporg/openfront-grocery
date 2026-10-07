'use client';
import Link from 'next/link';
import MarketAccountNav from '../../modules/market/MarketAccountNav';
import { UrbanButton, UrbanContainer, UrbanPageShell } from '../../modules/urban/UrbanPrimitives';
import { useEffect, useState, useTransition } from 'react';
import { storefrontGraphQL, throwGraphQLErrors } from '@/features/storefront/lib/data/graphql';
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
  return <UrbanPageShell><UrbanContainer className="sf-account-page space-y-7 py-8 sm:py-10"><header className="border-b border-[var(--sf-rule)] pb-6"><p className="sf-eyebrow">Your account</p><h1 className="sf-title mt-2">Privacy & account data</h1><p className="sf-copy mt-3">Download your information and follow the progress of privacy requests.</p></header><MarketAccountNav active="privacy" />
    {loading && !data ? <p role="status" className="sf-panel p-5">Loading your privacy details…</p> : data ? <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"><section className="sf-panel space-y-5 p-5 sm:p-7"><h2 className="font-[family-name:var(--sf-font-display)] text-2xl font-semibold">Your information, your choices</h2><p className="sf-copy">{data.policy.description}</p><p className="sf-copy text-sm">Policy {data.policy.version}. Transaction and audit records are retained as described; staff will review your request.</p><UrbanButton disabled={pending || loading} onClick={()=>request('export')}>{pending ? 'Processing request…' : 'Download my data'}</UrbanButton><div className="space-y-3 border-t border-[var(--sf-rule)] pt-5"><h3 className="font-semibold">Request account erasure</h3><p className="sf-copy text-sm">This sends a request for review. It does not immediately delete your account or records that must be retained.</p>{confirmErasure ? <div className="space-y-3"><p className="text-sm font-medium">Submit an erasure request for this account?</p><div className="flex flex-wrap gap-3"><UrbanButton disabled={pending || loading} onClick={()=>request('erasure')}>Submit erasure request</UrbanButton><UrbanButton variant="ghost" disabled={pending} onClick={()=>setConfirmErasure(false)}>Keep account</UrbanButton></div></div> : <UrbanButton variant="ghost" disabled={pending || loading} onClick={()=>setConfirmErasure(true)}>Request erasure review</UrbanButton>}</div></section><section className="sf-panel space-y-4 p-5 sm:p-7" aria-busy={loading}><h2 className="font-[family-name:var(--sf-font-display)] text-2xl font-semibold">Request history</h2>{data.requests.length ? <ul className="divide-y divide-[var(--sf-rule)]">{data.requests.map((item:any)=><li className="space-y-2 py-4" key={item.id}><p className="font-semibold capitalize">{item.kind} · {String(item.status).replace(/_/g,' ')}</p>{item.reviewReason?<p className="sf-copy">{item.reviewReason}</p>:null}{item.eligibleAt?<p className="sf-copy text-sm">Review after {new Date(item.eligibleAt).toLocaleDateString()}</p>:null}</li>)}</ul> : <p className="sf-copy">You haven’t made a privacy request.</p>}<nav className="flex flex-wrap items-center justify-between gap-3" aria-label="Privacy request pages"><UrbanButton variant="ghost" disabled={pending||loading||data.pagination.page<=1} onClick={()=>refresh(data.pagination.page-1).catch(error=>setMessage(error.message))}>Previous</UrbanButton><span className="text-sm">Page {data.pagination.page} of {Math.max(1,data.pagination.totalPages)}</span><UrbanButton variant="ghost" disabled={pending||loading||data.pagination.page>=data.pagination.totalPages} onClick={()=>refresh(data.pagination.page+1).catch(error=>setMessage(error.message))}>Next</UrbanButton></nav></section></div> : <div className="sf-panel space-y-4 p-5"><p>Sign in with your customer account to manage your data. If you are already signed in, try loading it again.</p><div className="flex flex-wrap gap-4"><Link className="inline-flex min-h-11 items-center font-semibold underline" href="/dashboard/signin?from=%2Faccount%2Fprivacy">Sign in</Link><UrbanButton variant="ghost" onClick={()=>refresh().catch(error=>setMessage(error.message))}>Try again</UrbanButton></div></div>}
    {message ? <p role="status" className="sf-panel p-4 text-sm leading-6">{message}</p> : null}
  </UrbanContainer></UrbanPageShell>;
}
