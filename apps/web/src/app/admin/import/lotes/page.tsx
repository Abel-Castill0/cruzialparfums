import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { BulkCatalogRow } from "@/domains/admin-import/bulk-catalog";
import { BulkManager } from "./bulk-manager";
import styles from "../productos/page.module.css";
export const dynamic="force-dynamic";
export default async function BulkPage({searchParams}:{searchParams:Promise<{campaign?:string}>}) {
 const session=await getAdminSession(); if(session.status!=="ok") redirect("/admin");
 const membership=session.session.memberships.find(m=>m.businessUnitCode==="import"); if(!membership) redirect("/admin");
 const db=await createSupabaseServerClient(); if(!db) return <p>Backend no configurado.</p>;
 const unit=membership.businessUnitId;
 const [products,presentations,categories,campaigns]=await Promise.all([
  db.from("products").select("id,name,slug,brand,updated_at,product_categories(category_id)").eq("business_unit_id",unit).is("archived_at",null).order("id").range(0,1999),
  db.from("import_presentations").select("id,label,presentation_class,capacity_ml,updated_at,products!inner(business_unit_id)").eq("products.business_unit_id",unit).is("archived_at",null).order("id").range(0,1999),
  db.from("categories").select("id,name").eq("business_unit_id",unit).eq("kind","import_category").is("archived_at",null),
  db.from("campaigns").select("id,number,name,updated_at,status").eq("business_unit_id",unit).is("archived_at",null).order("number",{ascending:false}),
 ]);
 if(products.error||presentations.error||categories.error||campaigns.error) return <p role="alert">No se pudo cargar el catálogo de lotes.</p>;
 const params=await searchParams; const campaign=campaigns.data.find(c=>c.id===params.campaign)??campaigns.data[0];
 const candidateResult=campaign?await db.rpc("admin_import_publish_candidates",{p_campaign_id:campaign.id}):null;
 const catIds=new Set(categories.data.map(c=>c.id));
 const blank={name:"",brand:"",category_id:"",label:"",presentation_class:"",capacity_ml:""};
 const rows:BulkCatalogRow[]=[...products.data.map(p=>({...blank,kind:"product",id:p.id,updated_at:p.updated_at,name:p.name,brand:p.brand??"",category_id:p.product_categories.find(c=>catIds.has(c.category_id))?.category_id??""})),
 ...presentations.data.map(p=>({...blank,kind:"presentation",id:p.id,updated_at:p.updated_at,label:p.label,presentation_class:p.presentation_class,capacity_ml:p.capacity_ml?.toString()??""}))];
 return <div className={styles.page}><header className={styles.header}><div><h1>Operaciones por lote</h1><p>Datos factuales, imágenes y publicación con revisión previa.</p></div></header><main>
 <p><Link href="/admin/import/consolidados">Precios y disponibilidad: exportar / importar CSV en el consolidado</Link></p>
 <form><label htmlFor="campaign">Consolidado para publicación</label> <select name="campaign" id="campaign" defaultValue={campaign?.id}>{campaigns.data.map(c=><option key={c.id} value={c.id}>{c.number} · {c.name} ({c.status})</option>)}</select> <button>Consultar</button></form>
 <BulkManager rows={rows} products={products.data.map(p=>({id:p.id,slug:p.slug,name:p.name}))} categories={categories.data} canWrite={membership.role==="admin"} campaign={campaign??null} candidates={candidateResult?.error?null:candidateResult?.data??[]} />
 </main></div>;
}
