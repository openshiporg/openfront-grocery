import type {Context} from '.keystone/types';
import {requireSessionStore} from '../lib/storeScope';
export async function updateGroceryNotificationPreferences(_root:unknown,args:{orderUpdates:boolean;deliveryAlerts:boolean;backInStock:boolean},context:Context){
  await requireSessionStore(context);const userId=context.session!.itemId;
  return context.transaction(async tx=>{
    await tx.prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext('grocery-preferences'),hashtext($1))",userId);
    const existing=await tx.prisma.notificationPreference.findFirst({where:{userId},orderBy:{updatedAt:'desc'}});
    const data={orderUpdates:args.orderUpdates,deliveryAlerts:args.deliveryAlerts,backInStock:args.backInStock,channels:['email']};
    if(existing)await tx.prisma.notificationPreference.update({where:{id:existing.id},data});
    else await tx.prisma.notificationPreference.create({data:{...data,userId}});
    return true;
  });
}
