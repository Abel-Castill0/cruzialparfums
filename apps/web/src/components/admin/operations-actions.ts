"use server";
import { revalidatePath } from "next/cache";
import { requireUnitAdmin } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { wakeNotificationWorker } from "@/domains/notifications/wake";
import type { NotificationUnit } from "@/domains/notifications/provider";
async function context(unit:NotificationUnit){
 if(unit!=="parfums"&&unit!=="import")throw new Error("Unidad inválida.");
 const auth=await requireUnitAdmin(unit);if(!auth.ok)throw new Error("Acceso con MFA requerido.");
 const db=await createSupabaseServerClient();if(!db)throw new Error("Backend no configurado.");return db;
}
export async function retryNotificationAction(unit:NotificationUnit,id:string,version:string,verifiedNotSent:boolean){
 const db=await context(unit);const result=await db.rpc("admin_retry_notification",{p_business_unit_code:unit,p_id:id,p_expected_updated_at:version,p_verified_not_sent:verifiedNotSent});
 if(result.error)return {ok:false,message:result.error.code==="P2011"?"La notificación cambió. Recarga.":"No se puede reintentar con seguridad. Revisa destinatario, configuración y prueba de entrega."};
 wakeNotificationWorker();revalidatePath(`/admin/${unit}`);return {ok:true,message:"Reintento registrado en la cola."};
}
export async function updateOperationsSettingsAction(unit:NotificationUnit,version:string,phone:string,days:number){
 const db=await context(unit);const result=await db.rpc("admin_update_operations_settings",{p_unit_code:unit,p_expected_updated_at:version,p_operations_phone:phone,p_reminder_business_days:days});
 if(result.error)return {ok:false,message:result.error.code==="P2011"?"La configuración cambió. Recarga.":"Revisa el móvil peruano y el plazo de 1 a 7 días hábiles."};
 revalidatePath(`/admin/${unit}`);return {ok:true,message:"Configuración guardada."};
}
