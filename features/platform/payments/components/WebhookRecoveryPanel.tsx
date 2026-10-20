'use client';
import {useState} from 'react';
import { RefreshCw, Webhook } from 'lucide-react';
import {loadWebhookRecovery,replayWebhookRecovery} from '../webhookActions';
import { PlatformDisclosure, PlatformFeedback, PlatformField } from '@/features/platform/components/PlatformForm';
import { PlatformStatusBadge } from '@/features/platform/components/PlatformStatus';
import { PlatformTime } from '@/features/platform/components/PlatformTime';
import { platformButton, platformInput } from '@/features/platform/components/platformStyles';

export function WebhookRecoveryPanel(){
 const[data,setData]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function load(page=1){setBusy(true);setError('');try{setData(await loadWebhookRecovery(page));}catch(e){setError(e instanceof Error?e.message:'Unable to load recovery');}finally{setBusy(false);}}
 async function replay(event:React.FormEvent<HTMLFormElement>,id:string){event.preventDefault();const reason=String(new FormData(event.currentTarget).get('reason')||'');setBusy(true);setError('');try{await replayWebhookRecovery(id,reason);setData(await loadWebhookRecovery(data.page));}catch(e){setError(e instanceof Error?e.message:'Replay failed');}finally{setBusy(false);}}
 return <PlatformDisclosure icon={Webhook} title="Unmatched payment events" description="Bounded provider webhook retries. Review a stopped event, resolve its cause, then replay with a reason.">
  <div className="space-y-3" aria-busy={busy}>
   <div className="flex flex-wrap items-center gap-3">
    <button disabled={busy} onClick={()=>load(data?.page||1)} className={platformButton('secondary','sm')}><RefreshCw className={busy?'animate-spin':''} aria-hidden="true" />{busy?'Loading…':data?'Refresh queue':'Load recovery queue'}</button>
    {data?<span className="text-xs text-muted-foreground tabular-nums">{data.total} events · page {data.page} of {data.totalPages}</span>:null}
   </div>
   {error&&<PlatformFeedback tone="error">{error}</PlatformFeedback>}
   {data&&data.events.length===0?<p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">No unmatched payment events.</p>:null}
   {data&&<div className="space-y-2">{data.events.map((row:any)=><div key={row.id} className={`space-y-2 rounded-lg border bg-background p-3 ${row.deadLetterAt?'border-destructive/30':''}`}>
    <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium">{row.eventType}</span><PlatformStatusBadge status={row.deadLetterAt?'dead_letter':row.status} label={row.deadLetterAt?'Stopped for review':undefined} /><span className="ml-auto text-xs text-muted-foreground tabular-nums">{row.processingAttempts} attempts</span></div>
    <p className="font-mono text-xs break-all text-muted-foreground">{row.providerCode} · {row.providerEventId}</p>
    {row.lastProcessingError&&<p className="text-xs text-destructive">{row.lastProcessingError}</p>}
    {row.nextAttemptAt&&<p className="text-xs text-muted-foreground"><PlatformTime value={row.nextAttemptAt} prefix="Next retry" /></p>}
    {row.deadLetterAt&&<form onSubmit={e=>replay(e,row.id)} className="flex flex-wrap items-end gap-2 border-t pt-2.5"><PlatformField label="Resolution and reason" className="min-w-48 flex-1"><input required minLength={3} maxLength={500} name="reason" className={platformInput} /></PlatformField><button disabled={busy} className={platformButton('primary','md')}>Replay reviewed event</button></form>}
   </div>)}</div>}
   {data&&(data.page>1||data.page<data.totalPages)?<div className="flex gap-2">{data.page>1&&<button className={platformButton('secondary','sm')} disabled={busy} onClick={()=>load(data.page-1)}>Previous</button>}{data.page<data.totalPages&&<button className={platformButton('secondary','sm')} disabled={busy} onClick={()=>load(data.page+1)}>Next</button>}</div>:null}
  </div>
 </PlatformDisclosure>;
}
