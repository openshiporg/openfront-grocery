import {requireFreshCapability} from '../access';
import {requireSessionStore} from '../lib/storeScope';
export async function groceryRecurringOverview(_root:unknown,{page=1,customerOnly=true}:{page?:number;customerOnly?:boolean},context:any){
 if(!Number.isSafeInteger(page)||page<1||page>1000000)throw new Error('Invalid recurring history page');
 if(!customerOnly)await requireFreshCapability(context,'canManageOrders');
 const store=await requireSessionStore(context),where={storeId:store.id,...(customerOnly?{userId:context.session.itemId}:{})},take=25,skip=(page-1)*take;
 const [subscriptions,runs,subscriptionCount,runCount,program]=await Promise.all([
  context.prisma.subscription.findMany({where,take,skip,orderBy:[{createdAt:'desc'},{id:'asc'}],select:{id:true,product:true,quantity:true,frequency:true,nextDeliveryDate:true,status:true,scheduleTimezone:true,pausedUntil:true,productRef:{select:{id:true,title:true}},user:{select:{id:true,email:true}}}}),
  context.prisma.subscriptionRun.findMany({where,take,skip,orderBy:[{createdAt:'desc'},{id:'asc'}],select:{id:true,dueAt:true,status:true,failureReason:true,productTitle:true,quantity:true,user:{select:{id:true,email:true}},order:{select:{id:true}},subscription:{select:{id:true}}}}),
  context.prisma.subscription.count({where}),context.prisma.subscriptionRun.count({where}),
  context.prisma.loyaltyProgram.findFirst({where:{storeId:store.id},orderBy:[{createdAt:'desc'},{id:'asc'}],select:{id:true,name:true,isActive:true,earnPointsPer100Cents:true,redeemPointsPer100Cents:true,minimumRedemptionPoints:true}}),
 ]);
 return {subscriptions,runs,program,pagination:{page,pageSize:take,collections:{subscriptions:{total:subscriptionCount,totalPages:Math.max(1,Math.ceil(subscriptionCount/take))},runs:{total:runCount,totalPages:Math.max(1,Math.ceil(runCount/take))}}}};
}
