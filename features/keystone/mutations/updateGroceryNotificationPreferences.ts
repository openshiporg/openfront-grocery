import type {Context} from '.keystone/types';
import {lockCurrentCustomer, requireSessionStore} from '../lib/storeScope';

/**
 * Save the optional email categories. The email channel is the customer's own
 * choice: it changes only when `emailEnabled` is sent explicitly, and saving
 * category switches never re-enables an email opt-out. When a category is
 * turned on, alerts that were held back while it was off become eligible again.
 */
export async function updateGroceryNotificationPreferences(_root:unknown,args:{orderUpdates:boolean;deliveryAlerts:boolean;backInStock:boolean;emailEnabled?:boolean|null},context:Context){
  await requireSessionStore(context);const userId=context.session!.itemId;
  return context.transaction(async tx=>{
    await tx.prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext('grocery-preferences'),hashtext($1))",userId);
    await lockCurrentCustomer(tx);
    const existing=await tx.prisma.notificationPreference.findFirst({where:{userId},orderBy:{updatedAt:'desc'}});
    const rawChannels=existing?.channels;
    const currentChannels:string[]=Array.isArray(rawChannels)?rawChannels.filter((value):value is string=>typeof value==='string'):['email'];
    const channels=typeof args.emailEnabled==='boolean'
      ? (args.emailEnabled ? [...new Set([...currentChannels,'email'])] : currentChannels.filter(channel=>channel!=='email'))
      : currentChannels;
    const data={orderUpdates:args.orderUpdates,deliveryAlerts:args.deliveryAlerts,backInStock:args.backInStock,channels};
    if(existing)await tx.prisma.notificationPreference.update({where:{id:existing.id},data});
    else await tx.prisma.notificationPreference.create({data:{...data,userId}});
    const stockEmailNowOn=args.backInStock&&channels.includes('email');
    const stockEmailWasOn=Boolean(!existing||(existing.backInStock!==false&&currentChannels.includes('email')));
    if(stockEmailNowOn&&!stockEmailWasOn){
      // A new occurrence for each still-active alert, so it is sent once now that consent exists.
      await tx.prisma.backInStockAlert.updateMany({where:{userId,isActive:true},data:{isActive:true}});
    }
    return true;
  });
}
