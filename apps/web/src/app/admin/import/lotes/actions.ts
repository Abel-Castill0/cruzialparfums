"use server";
import { revalidatePath } from "next/cache";
import { requireUnitAdmin } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseBulkCatalog, type BulkCatalogRow, type BulkIssue } from "@/domains/admin-import/bulk-catalog";
import type { Json } from "@/lib/supabase/database.types";

async function context() {
 const auth = await requireUnitAdmin("import");
 if (!auth.ok) throw new Error("Acceso de administrador con MFA requerido.");
 const db = await createSupabaseServerClient(); if (!db) throw new Error("Backend no configurado.");
 return { db, unit: auth.membership.businessUnitId };
}
export async function previewCatalogAction(text: string): Promise<{ rows: BulkCatalogRow[]; issues: BulkIssue[]; diffs: string[] }> {
 const { db, unit } = await context(); const parsed = parseBulkCatalog(text); const diffs: string[] = [];
 if (parsed.issues.length) return { ...parsed, diffs };
 const ids = parsed.rows.map(x => x.id);
 const batches = Array.from({length:Math.ceil(ids.length/100)},(_,i)=>ids.slice(i*100,i*100+100));
 const [productBatches, presentationBatches, categories] = await Promise.all([
  Promise.all(batches.map(batch=>db.from("products").select("id,name,brand,updated_at,archived_at").eq("business_unit_id",unit).in("id",batch))),
  Promise.all(batches.map(batch=>db.from("import_presentations").select("id,label,presentation_class,capacity_ml,updated_at,archived_at,products!inner(business_unit_id)").eq("products.business_unit_id",unit).in("id",batch))),
  db.from("categories").select("id").eq("business_unit_id",unit).eq("kind","import_category").is("archived_at",null),
 ]);
 const products={data:productBatches.flatMap(x=>x.data??[]),error:productBatches.some(x=>x.error)};
 const presentations={data:presentationBatches.flatMap(x=>x.data??[]),error:presentationBatches.some(x=>x.error)};
 if (products.error || presentations.error || categories.error) return { rows:[],issues:[{line:1,reason:"No se pudo validar contra el catálogo actual."}],diffs };
 const validCategories = new Set(categories.data.map(x=>x.id));
 const pm = new Map(products.data.map(x=>[x.id,x])); const im = new Map(presentations.data.map(x=>[x.id,x]));
 parsed.rows.forEach((row,i)=>{
  const current = row.kind === "product" ? pm.get(row.id) : im.get(row.id);
  if (!current || current.archived_at) parsed.issues.push({line:i+2,reason:"Identidad inexistente, archivada o de otra unidad."});
  else if (Date.parse(current.updated_at)!==Date.parse(row.updated_at)) parsed.issues.push({line:i+2,reason:"Versión obsoleta. Exporta otra vez."});
  if (row.category_id && !validCategories.has(row.category_id)) parsed.issues.push({line:i+2,reason:"Categoría no válida para Import."});
  if (row.kind === "product") { const p=pm.get(row.id); if(p) diffs.push(`${p.name} → ${row.name}; marca: ${p.brand??""} → ${row.brand}; categoría: ${row.category_id||"conservar"}`); }
  else { const p=im.get(row.id); if(p) diffs.push(`${p.label} → ${row.label}; clase: ${p.presentation_class} → ${row.presentation_class}; capacidad: ${p.capacity_ml??""} → ${row.capacity_ml}`); }
 });
 return {...parsed,diffs};
}
export async function applyCatalogAction(text: string): Promise<{ok:boolean;message:string}> {
 const preview=await previewCatalogAction(text); if(preview.issues.length) return {ok:false,message:"El lote tiene errores; corrígelos y vuelve a validar."};
 const {db}=await context(); const result=await db.rpc("admin_bulk_import_catalog",{p_rows:preview.rows as unknown as Json});
 if(result.error) return {ok:false,message:result.error.code==="P2011"?"El catálogo cambió. Exporta y valida de nuevo.":"El lote fue rechazado; ningún cambio se aplicó."};
 revalidatePath("/admin/import"); return {ok:true,message:`${result.data} filas aplicadas en una sola transacción.`};
}
export async function publishBatchAction(campaignId:string,expectedUpdatedAt:string,rows:Json): Promise<{ok:boolean;message:string}> {
 const {db}=await context(); const result=await db.rpc("admin_bulk_publish_import",{p_campaign_id:campaignId,p_expected_updated_at:expectedUpdatedAt,p_rows:rows});
 if(result.error) return {ok:false,message:"El lote cambió o tiene bloqueos. Recarga y revisa; no se publicó ningún registro."};
 revalidatePath("/admin/import");return {ok:true,message:"Lote publicado. El estado del consolidado conserva la decisión del administrador."};
}
