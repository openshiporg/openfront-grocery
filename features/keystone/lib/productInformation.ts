export const GROCERY_ALLERGENS=['milk','eggs','fish','shellfish','tree_nuts','peanuts','wheat','soybeans','sesame'];
export function initialProductInformation(input:any,actorId:string,sourceReference:string){return {version:0,actorId,sourceReference,recordedAt:new Date().toISOString(),allergens:input.allergens||[],nutrition:input.nutrition||{},unitOfMeasure:input.unitOfMeasure||'each',pricingMethod:input.pricingMethod||'unit',packBaseUnitsMilli:input.packBaseUnitsMilli||1000};}
export function normalizeProductInformation(input:any) {
  const sourceReference=String(input.sourceReference || '').trim();
  if(sourceReference.length<3||sourceReference.length>500) throw new Error('A bounded product information source reference is required');
  const packBaseUnitsMilli=Number(input.packBaseUnitsMilli ?? 1000);
  if(!Number.isSafeInteger(packBaseUnitsMilli)||packBaseUnitsMilli<1||packBaseUnitsMilli>1000000000) throw new Error('Pack conversion must be positive integer thousandths');
  const nutrition=input.nutrition || {};
  const allowed=['servingSize','ingredients','calories','fatGrams','saturatedFatGrams','carbohydrateGrams','sugarGrams','proteinGrams','sodiumMilligrams'];
  if(!nutrition || typeof nutrition!=='object'||Array.isArray(nutrition)||Object.keys(nutrition).some(k=>!allowed.includes(k))) throw new Error('Unsupported nutrition information');
  for(const [key,value] of Object.entries(nutrition)) {
    if(['servingSize','ingredients'].includes(key)){if(typeof value!=='string'||value.length>5000)throw new Error('Nutrition text is too long');}
    else if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>100000)throw new Error('Nutrition quantities must be nonnegative numbers');
  }
  const variantLabel=String(input.variantLabel || '').trim();if(variantLabel.length>120)throw new Error('Variant label is too long');
  if(input.allergens!==undefined && (!Array.isArray(input.allergens)||input.allergens.some((value:any)=>!GROCERY_ALLERGENS.includes(value))))throw new Error('Choose supported allergen declarations');
  return {sourceReference,packBaseUnitsMilli,nutrition,variantLabel,variantOfId:input.variantOfId?String(input.variantOfId):null,...(input.allergens===undefined?{}:{allergens:[...new Set(input.allergens)].sort()})};
}
export function convertPackQuantityMilli(packsMilli:number,factorMilli:number) {
  if(!Number.isSafeInteger(packsMilli)||!Number.isSafeInteger(factorMilli)||packsMilli<0||factorMilli<1)throw new Error('Invalid pack quantities');
  const product=BigInt(packsMilli)*BigInt(factorMilli);
  if(product%BigInt(1000)!==BigInt(0))throw new Error('Pack conversion exceeds thousandth precision');
  const result=Number(product/BigInt(1000));if(!Number.isSafeInteger(result))throw new Error('Pack quantity is too large');return result;
}
