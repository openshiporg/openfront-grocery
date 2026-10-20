// Operational entrypoint; never import or execute in offline tests.
import os from 'node:os';
import {setTimeout as sleep} from 'node:timers/promises';
import {pathToFileURL} from 'node:url';
import {deliverGroceryEvents,queueAvailableStockAlerts,queueTriggeredPriceAlerts} from '../features/keystone/mutations/deliverGroceryEvents';
import {emailTransportConfigured} from '../features/integrations/communications';
const userId=process.env.GROCERY_EVENT_WORKER_USER_ID;
const workerId=process.env.GROCERY_EVENT_WORKER_ID || `events:${os.hostname()}:${process.pid}`;
let stopping=false;
export async function main() {
  const {keystoneContext}=await import('../features/keystone/context');
  if(!userId) throw new Error('GROCERY_EVENT_WORKER_USER_ID is required');
  try {
    let reportedMissingEmail=false;
    while(!stopping) {
      const user=await keystoneContext.prisma.user.findUnique({where:{id:userId},include:{role:true,store:true}});
      if(!user?.role?.canManageOnboarding || !user.store?.isActive || user.privacyErasedAt) throw new Error('Event worker actor requires a current active Store and onboarding capability');
      // Without SMTP nothing is claimed: queued messages stay pending instead of
      // spending their bounded attempts on a transport that cannot send.
      if(!emailTransportConfigured()) {
        if(!reportedMissingEmail) console.error('Grocery event worker: SMTP_HOST and SMTP_FROM are not configured; queued events stay pending.');
        reportedMissingEmail=true;
        if(process.argv.includes('--once')) break;
        await sleep(60_000);
        continue;
      }
      reportedMissingEmail=false;
      const context=keystoneContext.withSession({itemId:user.id,listKey:'User',data:{role:user.role,store:user.store}} as any);
      await queueAvailableStockAlerts(context);
      await queueTriggeredPriceAlerts(context);
      const result=await deliverGroceryEvents(context,{workerId,limit:20});
      if(process.argv.includes('--once')) break;
      if(!result.length) await sleep(5000);
    }
  } finally {
    // This process owns its database pool; release it on success, failure or signal.
    await keystoneContext.prisma.$disconnect();
  }
}
for(const signal of ['SIGINT','SIGTERM'] as const) process.once(signal,()=>{stopping=true;});
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) main().catch(()=>{console.error('Grocery event worker stopped; inspect failed delivery records.');process.exitCode=1;});
