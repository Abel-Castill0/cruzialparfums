import { describe, expect, it } from "vitest";
import { BULK_COLUMNS, exportBulkCatalog, matchMediaFiles, parseBulkCatalog, type BulkCatalogRow } from "./bulk-catalog";
const id="48000000-0000-4000-8000-000000000001";
const row: BulkCatalogRow={kind:"product",id,updated_at:"2026-09-26T00:00:00Z",name:"Perfume, verdadero",brand:"Cliente",category_id:"",label:"",presentation_class:"",capacity_ml:""};
describe("factual bulk catalog",()=>{
 it("round trips exact identity and optional category",()=>expect(parseBulkCatalog(exportBulkCatalog([row]))).toEqual({rows:[row],issues:[]}));
 it("rejects duplicate identity before apply",()=>expect(parseBulkCatalog(exportBulkCatalog([row,row])).issues[0]?.reason).toContain("duplicada"));
 it("rejects malformed capacity and cross kind fields",()=>expect(parseBulkCatalog(exportBulkCatalog([{...row,kind:"presentation",capacity_ml:"1e3"}])).issues).toHaveLength(1));
 it("rejects unknown columns and missing data",()=>expect(parseBulkCatalog(BULK_COLUMNS.join(",")+",stock")).toMatchObject({rows:[],issues:[{line:1}]}));
 it("matches exact slugs, never similar names",()=>expect(matchMediaFiles(["exact.png","EXACT.png"],[{id,slug:"exact",name:"Exact"}])).toEqual([{filename:"exact.png",productId:id,reason:null},{filename:"EXACT.png",productId:null,reason:"Sin coincidencia exacta."}]));
 it("requires unique explicit media mapping",()=>expect(matchMediaFiles(["a.png"],[{id,slug:"exact",name:"Exact"}],`filename,product_id\na.png,${id}\na.png,${id}`)[0]?.productId).toBeNull());
 it("accepts explicit identifier and blocks a second primary",()=>expect(matchMediaFiles(["a.png","b.png"],[{id,slug:"exact",name:"Exact"}],`filename,product_id\na.png,${id}\nb.png,${id}`).map(x=>x.productId)).toEqual([id,null]));
});
