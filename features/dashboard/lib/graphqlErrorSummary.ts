/** Do not serialize GraphQL client errors: their request includes credentials and personal input. */
export function graphqlErrorSummary(error:unknown){
 const response=(error as any)?.response;
 const messages=Array.isArray(response?.errors)?response.errors.map((entry:any)=>{
  const message=typeof entry?.message==='string'?entry.message:'GraphQL request failed';
  if(/\bvariable\b.*(?:\$(?:password|token|secret|sessionId|clientSecret)\b|invalid value)/i.test(message)||/\b(?:client_secret|authorization|cookie)\s*[:=]/i.test(message))return 'A protected input could not be accepted. Review the form and try again.';
  return message.slice(0,1500);
 }):[];
 return {message:messages.length?messages.join('\n'):'The request could not be completed. Please try again.',errors:messages.map((message:string)=>({message}))};
}
