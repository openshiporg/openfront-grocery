import {requireFreshCapability} from '../access';
import {requireSessionStore} from '../lib/storeScope';
import {normalizeProductInformation} from '../lib/productInformation';
import {groceryOutboxPayloadHash} from '../lib/groceryOutbox';
export async function updateProductInformation(_root:unknown,{productId,input,idempotencyKey}:{productId:string;input:any;idempotencyKey:string},context:any) {
  await requireFreshCapability(context,'canManageProducts');const store=await requireSessionStore(context);
  const normalized=normalizeProductInformation(input);
  if(idempotencyKey.length<12||idempotencyKey.length>200)throw new Error('A valid request identity is required');
  return context.transaction(async(tc:any)=>{
    for(const id of [...new Set([productId,normalized.variantOfId].filter(Boolean))].sort())await tc.prisma.$queryRawUnsafe('SELECT "id" FROM "Product" WHERE "id"=$1 FOR UPDATE',id);
    const product=await tc.prisma.product.findUnique({where:{id:productId}});if(!product||product.storeId!==store.id)throw new Error('Product not found in active store');
    const existing=await tc.prisma.productInformationVersion.findUnique({where:{idempotencyKey}});
    if(existing){if(existing.productId!==productId||groceryOutboxPayloadHash(existing.snapshot.input)!==groceryOutboxPayloadHash(normalized))throw new Error('Request key was reused with different product information');return {success:true,reused:true,versionId:existing.id};}
    if(normalized.variantOfId){const parent=await tc.prisma.product.findUnique({where:{id:normalized.variantOfId}});if(!parent||parent.storeId!==store.id||parent.id===product.id||parent.variantOfId)throw new Error('Choose another root product in this Store');}
    if(await tc.prisma.product.count({where:{variantOfId:productId}})>0&&normalized.variantOfId)throw new Error('A root product with variants cannot become a variant');
    if((normalized.packBaseUnitsMilli!==Number(product.packBaseUnitsMilli||1000)||(normalized.variantOfId||null)!==(product.variantOfId||null))&&await tc.prisma.inventoryLot.count({where:{productId}})>0)throw new Error('Pack identity on received inventory is immutable; create a separate SKU before changing the pack');
    const version=await tc.prisma.productInformationVersion.create({data:{storeId:store.id,productId,actorId:context.session.itemId,idempotencyKey,sourceReference:normalized.sourceReference,effectiveAt:new Date(),snapshot:{input:normalized,prior:{nutrition:product.nutrition,variantOfId:product.variantOfId,variantLabel:product.variantLabel,packBaseUnitsMilli:product.packBaseUnitsMilli},commercial:{sku:product.sku,priceCents:product.priceCents,taxRateBasisPoints:product.taxRateBasisPoints,unitOfMeasure:product.unitOfMeasure,allergens:product.allergens}}}});
    await tc.prisma.product.update({where:{id:productId},data:{nutrition:normalized.nutrition,...(normalized.allergens===undefined?{}:{allergens:normalized.allergens}),variantOfId:normalized.variantOfId,variantLabel:normalized.variantLabel,packBaseUnitsMilli:normalized.packBaseUnitsMilli,informationSource:normalized.sourceReference}});
    return {success:true,reused:false,versionId:version.id};
  });
}
