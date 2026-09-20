import {describe,expect,it} from "vitest";
import {classifyProductReadiness,parseImportCatalogFilters,PRESENTATION_STATUS_LABELS,PRODUCT_STATUS_LABELS} from "./catalog-schema";

describe("Import catalog filters",()=>{
 it("bounds page size and ignores invalid filters",()=>{expect(parseImportCatalogFilters({page:"-8",pageSize:"999",status:"bogus",archived:"oops"})).toEqual({query:"",archived:"active",page:1,pageSize:50});});
 it("preserves supported URL filters",()=>{expect(parseImportCatalogFilters({q:"  Vanilla Freak ",status:"draft",category:"import-niche",presentation:"without_published",offer:"without_offer",archived:"all",page:"3"})).toMatchObject({query:"Vanilla Freak",publicationStatus:"draft",categorySlug:"import-niche",presentationState:"without_published",offerState:"without_offer",archived:"all",page:3});});
});
describe("Import readiness",()=>{
 it("keeps structural, commercial and public states distinct",()=>{const r=classifyProductReadiness({productStatus:"published",archived:false,activePresentations:1,publishedPresentations:1,offerCount:1,unconfirmedOfferCount:1,campaignStatus:"draft"});expect(r.structural).toBe("published");expect(r.commercial).toBe("pending");expect(r.publicVisibility).toBe("not_public");expect(r.blockers).toEqual(["Disponibilidad por confirmar","Consolidado no abierto"]);});
 it("reports unresolved structures generically",()=>{expect(classifyProductReadiness({productStatus:"draft",archived:false,activePresentations:1,publishedPresentations:0,offerCount:0,unconfirmedOfferCount:0,campaignStatus:"draft"}).blockers).toContain("Sin oferta en #6");});
 it("has the real database status labels",()=>{expect(PRODUCT_STATUS_LABELS.hidden).toBe("Oculto");expect(PRESENTATION_STATUS_LABELS.published).toBe("Publicada");});
});
