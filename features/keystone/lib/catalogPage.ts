export function catalogPageQuery(args: {storeId:string;now:Date;department?:string|null;search?:string|null;availability?:string|null;organic?:boolean|null;sort?:string|null;ids?:string[]|null;handle?:string;take?:number|null;skip?:number|null}) {
  const take=Math.min(100,Math.max(1,Math.trunc(Number(args.take || 24))));
  const skip=Math.max(0,Math.trunc(Number(args.skip || 0)));
  if (!Number.isSafeInteger(take)||!Number.isSafeInteger(skip)) throw new Error('Invalid catalog page');
  const params:unknown[]=[args.storeId,args.now];
  const bind=(value:unknown)=>{params.push(value);return `$${params.length}`;};
  const filters=['p."store" = $1',`p."status" = 'published'`];
  if(args.ids?.length) filters.push(`p."id" = ANY(${bind([...new Set(args.ids)].slice(0,100))}::text[])`);
  if(args.handle) filters.push(`p."handle" = ${bind(args.handle)}`);
  // Only published (active) aisles can be browsed; a hidden aisle's handle selects nothing.
  if(args.department?.trim()) filters.push(`d."handle" = ${bind(args.department.trim())} AND d."isActive" = true`);
  if(args.search?.trim()) {const p=bind(`%${args.search.trim().slice(0,200).replace(/[\\%_]/g,'\\$&')}%`);filters.push(`(p."title" ILIKE ${p} OR p."sku" ILIKE ${p} OR p."handle" ILIKE ${p})`);}
  if(args.organic===true) filters.push('p."organicCertified" = true');
  const availability=args.availability || 'in-stock';
  if(!['all','in-stock','low-stock','on-sale'].includes(availability)) throw new Error('Unsupported catalog availability filter');
  if(availability!=='all') filters.push('COALESCE(stock.quantity,0)>0');
  if(availability==='low-stock') filters.push('COALESCE(stock.quantity,0)<10');
  // Specials: in stock with a compare-at price above today's price.
  if(availability==='on-sale') filters.push('p."compareAtPrice" > p."price"');
  const order:Record<string,string>={'price-asc':'p."priceCents" ASC','price-desc':'p."priceCents" DESC',newest:'p."createdAt" DESC','low-stock':'COALESCE(stock.quantity,0) ASC'};
  const from=`FROM "Product" p LEFT JOIN "Department" d ON d."id"=p."departmentRef"
    LEFT JOIN (SELECT "product",SUM("quantityRemaining") AS quantity FROM "InventoryLot"
      WHERE "store"=$1 AND "expirationDate">$2 AND "quantityRemaining">0 AND "safetyStatus"='available' AND "conditionStatus"='accepted' GROUP BY "product") stock ON stock."product"=p."id"
    WHERE ${filters.join(' AND ')}`;
  return {countSql:`SELECT COUNT(*)::int AS count ${from}`,countParams:[...params],
    pageSql:`SELECT p."id",COALESCE(stock.quantity,0) AS quantity ${from} ORDER BY ${order[args.sort || ''] || 'p."title" ASC'},p."title" ASC,p."id" ASC LIMIT ${bind(take)} OFFSET ${bind(skip)}`,params,take,skip};
}
