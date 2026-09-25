import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({auth:vi.fn(),read:vi.fn(),write:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
vi.mock("next/navigation",()=>({redirect:vi.fn()}));
vi.mock("@/lib/auth/admin-session",()=>({requireUnitAdmin:mocks.auth}));
vi.mock("@/lib/supabase/server",()=>({createSupabaseServerClient:vi.fn().mockResolvedValue({})}));
vi.mock("@/domains/admin-import/campaign-products-repository",()=>({
  AdminImportCampaignProductsRepository:class {getCampaignProducts=mocks.read;setCampaignProducts=mocks.write;},
}));
import {updatePresentationOfferAction} from "./actions";
const campaign="99003000-0000-4000-8000-000000000001";
const product="99003000-0000-4000-8000-000000000002";
const presentation="99003000-0000-4000-8000-000000000003";
const version="2026-09-21T10:00:00.000Z";
const item={productId:product,productVariantId:null,importPresentationId:presentation,priceAmount:"12.00",availabilityStatus:"unconfirmed",sortOrder:2};
beforeEach(()=>{vi.clearAllMocks();mocks.auth.mockResolvedValue({ok:true,membership:{businessUnitId:"import"}});mocks.read.mockResolvedValue({ok:true,data:[item,{...item,importPresentationId:"99003000-0000-4000-8000-000000000004"}]});mocks.write.mockResolvedValue({ok:true,data:{campaignUpdatedAt:version,itemCount:2}});});
describe("presentation offer edit",()=>{
  it("preserves other offers and sends the displayed campaign version for atomic conflict checking",async()=>{
    const result=await updatePresentationOfferAction(campaign,version,product,presentation,{priceAmount:"16.50",availabilityStatus:"available"});
    expect(result.status).toBe("success");
    expect(mocks.auth).toHaveBeenCalledWith("import");
    expect(mocks.write).toHaveBeenCalledWith(campaign,version,[{...item,priceAmount:"16.50",availabilityStatus:"available"},{...item,importPresentationId:"99003000-0000-4000-8000-000000000004"}]);
  });
  it("does not recreate an offer removed from the selected campaign",async()=>{
    mocks.read.mockResolvedValue({ok:true,data:[]});
    expect((await updatePresentationOfferAction(campaign,version,product,presentation,{priceAmount:"16.50",availabilityStatus:"available"})).status).toBe("error");
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it("returns an actionable conflict without false success",async()=>{
    mocks.write.mockResolvedValue({ok:false,error:{type:"conflict"}});
    expect(await updatePresentationOfferAction(campaign,version,product,presentation,{priceAmount:"16.50",availabilityStatus:"available"})).toMatchObject({status:"error",message:expect.stringMatching(/Recarga/)});
  });
  it("denies a viewer before reading offers",async()=>{
    mocks.auth.mockResolvedValue({ok:false,reason:"forbidden"});
    expect((await updatePresentationOfferAction(campaign,version,product,presentation,{priceAmount:"16.50",availabilityStatus:"available"})).status).toBe("error");
    expect(mocks.read).not.toHaveBeenCalled();
  });
});
