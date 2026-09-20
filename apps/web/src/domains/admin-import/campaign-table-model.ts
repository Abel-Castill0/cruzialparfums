import type { CampaignProductAvailability } from "./campaign-products-schema";

export type CampaignTableRow = {
  productId: string; productVariantId: string | null; importPresentationId: string | null;
  productName: string; variantLabel: string | null; presentationLabel: string | null;
  priceAmount: string; availabilityStatus: CampaignProductAvailability;
};

export function campaignRowKey(row: Pick<CampaignTableRow,"productId"|"productVariantId"|"importPresentationId">) {
  return `${row.productId}::${row.productVariantId ?? ""}::${row.importPresentationId ?? ""}`;
}
export function campaignRowsDirty(a: CampaignTableRow[], b: CampaignTableRow[]) {
  return a.length !== b.length || a.some((row,i) => {
    const other=b[i]; return !other || campaignRowKey(row)!==campaignRowKey(other) || row.priceAmount!==other.priceAmount || row.availabilityStatus!==other.availabilityStatus;
  });
}
export function filterCampaignRows<T extends CampaignTableRow>(rows:T[], query:string, availability:"all"|CampaignProductAvailability) {
  const q=query.trim().toLocaleLowerCase("es");
  return rows.filter(row => (availability==="all" || row.availabilityStatus===availability) && (!q || `${row.productName} ${row.variantLabel??""} ${row.presentationLabel??""}`.toLocaleLowerCase("es").includes(q)));
}
export function paginateCampaignRows<T>(rows:T[], page:number, pageSize:number) {
  const size=Math.min(50,Math.max(1,pageSize)); const pages=Math.max(1,Math.ceil(rows.length/size)); const safe=Math.min(pages,Math.max(1,page));
  return { items: rows.slice((safe-1)*size,safe*size), page:safe, pages, from:rows.length?(safe-1)*size+1:0, to:Math.min(safe*size,rows.length), total:rows.length };
}
export function updateCampaignRow<T extends CampaignTableRow>(rows:T[], key:string, patch:Partial<Pick<T,"priceAmount"|"availabilityStatus">>):T[] {
  return rows.map(row=>campaignRowKey(row)===key?{...row,...patch}:row);
}
export function moveCampaignRow<T extends CampaignTableRow>(rows:T[],key:string,position:number):T[] {
  const from=rows.findIndex(row=>campaignRowKey(row)===key); if(from<0)return rows; const target=Math.min(rows.length-1,Math.max(0,Math.trunc(position)-1));
  const next=[...rows]; const [moved]=next.splice(from,1); if(!moved)return rows; next.splice(target,0,moved); return next;
}
export function serializeCampaignRows(rows:CampaignTableRow[]) {
  return rows.map((row,sortOrder)=>({productId:row.productId,productVariantId:row.productVariantId,importPresentationId:row.importPresentationId,priceAmount:row.priceAmount,availabilityStatus:row.availabilityStatus,sortOrder}));
}
