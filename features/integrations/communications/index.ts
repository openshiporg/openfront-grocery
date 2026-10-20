import { createTransport } from 'nodemailer';
export type GroceryMessage = {id:string;to:string;subject:string;text:string};
export class GroceryEmailDeliveryError extends Error {
  readonly definitive = true;
}
/** Whether customer email can be sent at all; without it, queued work is left untouched. */
export function emailTransportConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
}
/** Transport construction is lazy. Offline callers inject a sender into the consumer. */
export async function sendGroceryEmail(message:GroceryMessage) {
  if (!emailTransportConfigured()) throw new GroceryEmailDeliveryError('Configure SMTP_HOST and SMTP_FROM for customer messages');
  const transport=createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT || 587),connectionTimeout:15000,greetingTimeout:15000,socketTimeout:30000,secure:process.env.SMTP_SECURE==='true',auth:process.env.SMTP_USER?{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD}:undefined});
  const result=await transport.sendMail({from:process.env.SMTP_FROM,to:message.to,subject:message.subject,text:message.text,messageId:`<grocery-${message.id}@${new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost').hostname}>`});
  if (result.rejected?.length) throw new GroceryEmailDeliveryError('Message recipient was rejected');
  return {providerId:String(result.messageId),channel:'email'};
}
