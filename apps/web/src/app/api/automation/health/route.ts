import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { automationAuthorized } from "@/domains/notifications/automation-auth";
import { notificationProviderReadiness } from "@/domains/notifications/provider";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request){
 if(!automationAuthorized(request.headers.get("authorization"),process.env.CRON_SECRET))return Response.json({error:"unauthorized"},{status:401});
 const client=createSupabaseAdminClient();if(!client)return Response.json({app_alive:true,db_reachable:false,schema_compatible:false},{status:503});
 const result=await client.rpc("worker_automation_health");
 if(result.error)return Response.json({app_alive:true,db_reachable:false,schema_compatible:false},{status:503});
 const state=result.data&&typeof result.data==="object"&&!Array.isArray(result.data)?result.data:{};
 return Response.json({app_alive:true,db_reachable:true,...state,providers:{parfums:notificationProviderReadiness("parfums"),import:notificationProviderReadiness("import")}},
 {status:state.schema_compatible===true?200:503,headers:{"Cache-Control":"no-store"}});
}
