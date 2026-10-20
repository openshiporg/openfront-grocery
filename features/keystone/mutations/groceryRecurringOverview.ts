import {requireFreshCapability} from '../access';
import {requireSessionStore} from '../lib/storeScope';

const WAITING=['awaiting_checkout','blocked_cart','blocked_stock'];
type OverviewArgs={page?:number;customerOnly?:boolean;search?:string|null;outcome?:string|null;schedule?:string|null};

/**
 * Recurring schedules and their due-occurrence outcomes. The staff view
 * (customerOnly false) searches, filters and counts across the whole store
 * before paging; the shopper view returns only the shopper's own records.
 */
export async function groceryRecurringOverview(_root:unknown,{page=1,customerOnly=true,search,outcome,schedule}:OverviewArgs,context:any){
 if(!Number.isSafeInteger(page)||page<1||page>1000000)throw new Error('Invalid recurring history page');
 if(!customerOnly)await requireFreshCapability(context,'canManageOrders');
 const store=await requireSessionStore(context),where={storeId:store.id,...(customerOnly?{userId:context.session.itemId}:{})},take=25,skip=(page-1)*take;
 const text=customerOnly?'':String(search||'').trim().slice(0,100);
 const like={contains:text,mode:'insensitive'};
 const runSearch=text?{OR:[{productTitle:like},{user:{email:like}}]}:{};
 const scheduleSearch=text?{OR:[{product:like},{productRef:{title:like}},{user:{email:like}}]}:{};
 const outcomeViews:Record<string,any>={waiting:{status:{in:WAITING}},ordered:{status:'ordered'},closed:{status:{in:['skipped','cancelled']}}};
 const scheduleViews:Record<string,any>={active:{status:'active'},paused:{status:'paused'},cancelled:{status:'cancelled'}};
 const runOutcome=customerOnly?'all':outcomeViews[outcome||'']||outcome==='all'?(outcome||'waiting'):'waiting';
 const scheduleView=customerOnly?'all':scheduleViews[schedule||'']||schedule==='all'?(schedule||'active'):'active';
 const runScope=(view:string)=>({...where,AND:[runSearch,outcomeViews[view]||{}]});
 const scheduleScope=(view:string)=>({...where,AND:[scheduleSearch,scheduleViews[view]||{}]});
 const scheduleOrder=customerOnly?[{createdAt:'desc'},{id:'asc'}]:[{nextDeliveryDate:'asc'},{id:'asc'}];
 const [subscriptions,runs,subscriptionCount,runCount,program,runCounts,scheduleCounts,dueThisWeek]=await Promise.all([
  context.prisma.subscription.findMany({where:scheduleScope(scheduleView),take,skip,orderBy:scheduleOrder,select:{id:true,product:true,quantity:true,frequency:true,nextDeliveryDate:true,status:true,scheduleTimezone:true,pausedUntil:true,productRef:{select:{id:true,title:true}},user:{select:{id:true,email:true}}}}),
  context.prisma.subscriptionRun.findMany({where:runScope(runOutcome),take,skip,orderBy:[{createdAt:'desc'},{id:'asc'}],select:{id:true,dueAt:true,status:true,failureReason:true,productTitle:true,quantity:true,user:{select:{id:true,email:true}},order:{select:{id:true,displayId:true}},subscription:{select:{id:true}}}}),
  context.prisma.subscription.count({where:scheduleScope(scheduleView)}),context.prisma.subscriptionRun.count({where:runScope(runOutcome)}),
  context.prisma.loyaltyProgram.findFirst({where:{storeId:store.id},orderBy:[{createdAt:'desc'},{id:'asc'}],select:{id:true,name:true,isActive:true,earnPointsPer100Cents:true,redeemPointsPer100Cents:true,minimumRedemptionPoints:true}}),
  customerOnly?Promise.resolve([]):Promise.all(['waiting','ordered','closed','all','blocked'].map(async(view)=>[view,await context.prisma.subscriptionRun.count({where:view==='blocked'?{...where,AND:[runSearch,{status:{in:['blocked_cart','blocked_stock']}}]}:runScope(view)})])),
  customerOnly?Promise.resolve([]):Promise.all(['active','paused','cancelled','all'].map(async(view)=>[view,await context.prisma.subscription.count({where:scheduleScope(view)})])),
  customerOnly?Promise.resolve(0):context.prisma.subscription.count({where:{...where,status:'active',nextDeliveryDate:{lte:new Date(Date.now()+7*86_400_000)}}}),
 ]);
 return {subscriptions,runs,program,
  ...(customerOnly?{}:{search:text,outcome:runOutcome,schedule:scheduleView,runCounts:Object.fromEntries(runCounts),scheduleCounts:Object.fromEntries(scheduleCounts),dueThisWeek}),
  pagination:{page,pageSize:take,collections:{subscriptions:{total:subscriptionCount,totalPages:Math.max(1,Math.ceil(subscriptionCount/take))},runs:{total:runCount,totalPages:Math.max(1,Math.ceil(runCount/take))}}}};
}
