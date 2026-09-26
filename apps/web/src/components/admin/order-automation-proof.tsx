import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NOTIFICATION_LABELS } from "@/domains/operations/classifiers";
import type { NotificationUnit } from "@/domains/notifications/provider";
export async function OrderAutomationProof({unit,unitId,orderId}:{unit:NotificationUnit;unitId:string;orderId:string}){
 const db=await createSupabaseServerClient();if(!db)return null;
 const [events,reservations,jobs]=await Promise.all([
  db.from("order_status_events").select("id,from_status,to_status,actor_user_id,occurred_at").eq("business_unit_id",unitId).eq("order_id",orderId).order("occurred_at"),
  db.from("inventory_reservations").select("id,quantity,status,created_at,released_at,consumed_at").eq("business_unit_id",unitId).eq("order_id",orderId),
  db.rpc("admin_list_notifications",{p_business_unit_code:unit,p_entity_id:orderId}),
 ]);
 if(events.error||reservations.error||jobs.error)return <section><h2>Automatización del pedido</h2><p role="alert">No se pudo comprobar la trazabilidad. Recarga.</p></section>;
 const date=(value:string)=>new Date(value).toLocaleString("es-PE",{timeZone:"America/Lima"});
 return <section><h2>Automatización y trazabilidad</h2><h3>Reservas de inventario</h3><ul>{reservations.data.map(r=><li key={r.id}>{r.quantity} unidades · {r.status} · {date(r.consumed_at??r.released_at??r.created_at)}</li>)}</ul>{!reservations.data.length?<p>Este pedido no utiliza reservas de inventario cuantitativo.</p>:null}
 <h3>Transiciones</h3><ul>{events.data.map(e=><li key={e.id}>{e.from_status} → {e.to_status} · {date(e.occurred_at)} · Actor: {e.actor_user_id??"sistema"}</li>)}</ul>
 <h3>Notificaciones</h3><ul>{jobs.data.map(j=><li key={j.id}>{j.event_type}: {NOTIFICATION_LABELS[j.status]??j.status} · Entrega: {j.delivery_status??"sin prueba"}</li>)}</ul></section>;
}
