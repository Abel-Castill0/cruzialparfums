import "server-only";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { mapPostgrestError, type AdminRepositoryResult } from "@/domains/admin-parfums/products-repository";
import type { ImportCatalogFilters } from "./catalog-schema";

type ProductRow=Database["public"]["Tables"]["products"]["Row"];
type PresentationRow=Database["public"]["Tables"]["import_presentations"]["Row"];
type CategoryRow=Database["public"]["Tables"]["categories"]["Row"];
type Rpc=(name:string,args?:Record<string,unknown>)=>Promise<{data:unknown;error:PostgrestError|null}>;

export type ImportCatalogQa={products:number;presentations:number;active_campaigns:number;campaign_number:number|null;campaign_status:string|null;campaign_offers:number;draft_products:number;published_products:number;hidden_products:number;draft_presentations:number;published_presentations:number;unconfirmed_offers:number;available_offers:number;out_of_stock_offers:number;structures_without_offer:number};
export type ImportCatalogItem={id:string;name:string;brand:string|null;slug:string;legacy_id:string|null;publication_status:string;archived_at:string|null;verification_status:string;updated_at:string;category_name:string|null;category_slug:string|null;active_presentations:number;published_presentations:number;campaign_offer_count:number;unconfirmed_offer_count:number;total_count:number};
export type ImportProductDetail={
 product:ProductRow; categories:CategoryRow[]; category:CategoryRow|null;
 presentations:(PresentationRow&{offer:{price_amount:number;currency:string;availability_status:string}|null})[];
 offerCount:number;
};

export class AdminImportCatalogRepository {
  private rpc:Rpc;
  constructor(private readonly supabase:SupabaseClient<Database>,private readonly businessUnitId:string){this.rpc=supabase.rpc.bind(supabase) as unknown as Rpc;}
  async qa():Promise<AdminRepositoryResult<ImportCatalogQa>>{
    const {data,error}=await this.rpc("admin_get_import_catalog_qa"); if(error)return{ok:false,error:mapPostgrestError(error)};
    const row=Array.isArray(data)?data[0]:data; if(!row)return{ok:false,error:{type:"not_found"}};
    return{ok:true,data:row as ImportCatalogQa};
  }
  async list(filters:ImportCatalogFilters):Promise<AdminRepositoryResult<{items:ImportCatalogItem[];total:number}>>{
    const {data,error}=await this.rpc("admin_list_import_products",{p_query:filters.query||null,p_publication_status:filters.publicationStatus??null,p_category_slug:filters.categorySlug??null,p_archived:filters.archived,p_presentation_state:filters.presentationState??null,p_offer_state:filters.offerState??null,p_page:filters.page,p_page_size:filters.pageSize});
    if(error)return{ok:false,error:mapPostgrestError(error)}; const items=(data??[]) as ImportCatalogItem[];
    return{ok:true,data:{items,total:Number(items[0]?.total_count??0)}};
  }
  async get(productId:string):Promise<AdminRepositoryResult<ImportProductDetail>>{
    const productResult=await this.supabase.from("products").select("*").eq("id",productId).eq("business_unit_id",this.businessUnitId).maybeSingle();
    if(productResult.error)return{ok:false,error:mapPostgrestError(productResult.error)}; if(!productResult.data)return{ok:false,error:{type:"not_found"}};
    const [categoriesResult,linksResult,presentationsResult,offersResult]=await Promise.all([
      this.supabase.from("categories").select("*").eq("business_unit_id",this.businessUnitId).eq("kind","import_category").is("archived_at",null).order("name"),
      this.supabase.from("product_categories").select("category_id").eq("product_id",productId).limit(1),
      this.supabase.from("import_presentations").select("*").eq("product_id",productId).order("created_at"),
      this.supabase.from("campaign_products").select("import_presentation_id,price_amount,currency,availability_status,campaigns!inner(number,business_unit_id,archived_at)").eq("product_id",productId).eq("campaigns.number",6).eq("campaigns.business_unit_id",this.businessUnitId).is("campaigns.archived_at",null),
    ]);
    const error=categoriesResult.error||linksResult.error||presentationsResult.error||offersResult.error; if(error)return{ok:false,error:mapPostgrestError(error)};
    const offers=(offersResult.data??[]) as unknown as {import_presentation_id:string|null;price_amount:number;currency:string;availability_status:string}[];
    const presentations=(presentationsResult.data??[]).map(p=>({...p,offer:(()=>{const o=offers.find(x=>x.import_presentation_id===p.id);return o?{price_amount:o.price_amount,currency:o.currency,availability_status:o.availability_status}:null;})()}));
    const categoryId=linksResult.data?.[0]?.category_id??null; const categories=categoriesResult.data??[];
    return{ok:true,data:{product:productResult.data,categories,category:categories.find(c=>c.id===categoryId)??null,presentations,offerCount:offers.length}};
  }
  async updateProduct(id:string,expected:string,input:{name:string;brand:string|null;categoryId:string;publicationStatus:string}){const {data,error}=await this.rpc("admin_update_import_product",{p_product_id:id,p_expected_updated_at:expected,p_name:input.name,p_brand:input.brand,p_category_id:input.categoryId,p_publication_status:input.publicationStatus});return error?{ok:false as const,error:mapPostgrestError(error)}:{ok:true as const,data:data as ProductRow};}
  async archiveProduct(id:string,expected:string,restore=false){const {data,error}=await this.rpc(restore?"admin_restore_import_product":"admin_archive_import_product",{p_product_id:id,p_expected_updated_at:expected});return error?{ok:false as const,error:mapPostgrestError(error)}:{ok:true as const,data:data as ProductRow};}
  async createPresentation(productId:string,input:{label:string;presentationClass:string;capacityMl:number|null}){const {data,error}=await this.rpc("admin_create_import_presentation",{p_product_id:productId,p_label:input.label,p_presentation_class:input.presentationClass,p_capacity_ml:input.capacityMl});return error?{ok:false as const,error:mapPostgrestError(error)}:{ok:true as const,data:data as PresentationRow};}
  async updatePresentation(id:string,expected:string,input:{label:string;presentationClass:string;capacityMl:number|null;publicationStatus:string}){const {data,error}=await this.rpc("admin_update_import_presentation",{p_presentation_id:id,p_expected_updated_at:expected,p_label:input.label,p_presentation_class:input.presentationClass,p_capacity_ml:input.capacityMl,p_publication_status:input.publicationStatus});return error?{ok:false as const,error:mapPostgrestError(error)}:{ok:true as const,data:data as PresentationRow};}
  async archivePresentation(id:string,expected:string,restore=false){const {data,error}=await this.rpc(restore?"admin_restore_import_presentation":"admin_archive_import_presentation",{p_presentation_id:id,p_expected_updated_at:expected});return error?{ok:false as const,error:mapPostgrestError(error)}:{ok:true as const,data:data as PresentationRow};}
}
