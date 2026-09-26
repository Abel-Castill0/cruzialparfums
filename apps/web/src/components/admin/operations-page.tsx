import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { notificationProviderReadiness,type NotificationUnit } from "@/domains/notifications/provider";
import { workerState,WORKER_LABELS,NOTIFICATION_LABELS,launchBlockerLabel,type WorkerHealth } from "@/domains/operations/classifiers";
import { OperationsSettingsForm,RetryNotification } from "./operations-controls";
import { isProductionCutoverApproved } from "@/lib/seo/site";
import styles from "./operations.module.css";
function record(value:unknown):Record<string,unknown>{return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};}
export async function OperationsPage({unit}:{unit:NotificationUnit}){
 const session=await getAdminSession();if(session.status!=="ok")redirect("/admin");
 const membership=session.session.memberships.find(m=>m.businessUnitCode===unit);if(!membership)redirect("/admin");
 const db=await createSupabaseServerClient();if(!db)return <p>Backend no configurado.</p>;
 const [summary,jobs,settings,stock]=await Promise.all([
  db.rpc("admin_operations_summary",{p_unit_code:unit}),db.rpc("admin_list_notifications",{p_business_unit_code:unit}),
  db.from("settings").select("value,updated_at").eq("business_unit_id",membership.businessUnitId).eq("key","operations_automation").maybeSingle(),
  db.from("inventory").select("product_variant_id,quantity_on_hand,reserved_quantity,product_variants!inner(product_id,label,products!inner(name,business_unit_id))").eq("product_variants.products.business_unit_id",membership.businessUnitId).eq("inventory_mode","tracked_quantity").order("quantity_on_hand").limit(50),
 ]);
 if(summary.error||jobs.error||settings.error||stock.error)return <p role="alert">No se pudieron comprobar las operaciones. Recarga; el estado no está confirmado.</p>;
 const data=record(summary.data);const launch=record(data.launch);const worker=record(data.worker) as WorkerHealth;const config=record(settings.data?.value);
 const provider=notificationProviderReadiness(unit);const isAdmin=membership.role==="admin";
 const metrics=[
  ["pending_orders","Pedidos por confirmar","pedidos"],["stale_orders","Pendientes por más de 24 horas","pedidos"],
  ["unresolved_complaints","Reclamos sin resolver","reclamos"],["approaching_complaints","Reclamos próximos a vencer","reclamos?urgency=approaching"],
  ["overdue_complaints","Reclamos vencidos","reclamos?urgency=overdue"],
  ["notification_exceptions","Notificaciones que requieren revisión","operaciones#notifications"],
  ["exhausted_tracked_stock","Inventarios rastreados sin saldo libre","operaciones#inventory"],["active_reservations","Reservas activas","operaciones#inventory"],
 ] as const;
 return <main className={styles.page}><h1>Operaciones · {unit==="import"?"Cruzial Import":"Cruzial Parfums"}</h1>
 <section aria-label="Acciones pendientes"><ul className={styles.metrics}>{metrics.map(([key,label,path])=><li key={key}><Link href={`/admin/${unit}/${path}` as Route}><strong>{Number(data[key])}</strong><span>{label}</span></Link></li>)}</ul></section>
 <section className={styles.section}><h2>Automatización y proveedores</h2><p>WhatsApp: {provider.whatsapp==="configured"?"configurado (sin prueba de entrega)":"proveedor no configurado"} · Correo: proveedor no configurado.</p>
 <p>Eventos sin plantilla aprobada configurada: {provider.missingEvents.join(", ")||"ninguno"}. Webhook: {provider.webhook==="configured"?"configurado":"no configurado"}.</p>
 <p>Worker: {WORKER_LABELS[workerState(worker)]}. Última finalización: {worker.last_finished_at?new Date(worker.last_finished_at).toLocaleString("es-PE",{timeZone:"America/Lima"}):"sin registro"}.</p>
 <p>{Number(data.notification_pending)} mensajes pendientes. Recuperación diaria a las 08:00 de Lima; las acciones del cliente también activan procesamiento. Cola limitada a 5 por ejecución.</p></section>
 <section className={styles.section} id="notifications"><h2>Notificaciones y excepciones</h2><p>Hasta 100 registros, con excepciones primero. Una aceptación del proveedor conserva la prueba de envío; el webhook confirma entrega.</p>
 <ul>{jobs.data.map(job=><li key={job.id} className={styles.job}><Link href={`/admin/${unit}/${job.entity_type==="order"?"pedidos":"reclamos"}/${job.entity_id}` as Route}>{job.event_type} · {job.entity_id}</Link><p>{NOTIFICATION_LABELS[job.status]??job.status} · Intentos: {job.attempts} · Entrega: {job.delivery_status??"sin prueba"}</p>
 {job.last_error_safe?<p>Motivo: {job.last_error_safe}</p>:null}
 {isAdmin&&["blocked","failed","retry","uncertain"].includes(job.status)?<RetryNotification unit={unit} id={job.id} version={job.updated_at} uncertain={job.status==="uncertain"}/>:null}</li>)}</ul></section>
 <section className={styles.section} id="inventory"><h2>Inventario rastreado</h2><p>El saldo libre es stock físico menos reservas. Los productos con disponibilidad por estado no tienen cantidades inventadas.</p><ul>{stock.data.map(row=><li key={row.product_variant_id}><Link href={`/admin/${unit}/productos/${row.product_variants.product_id}` as Route}>{row.product_variants.products.name} · {row.product_variants.label}</Link>: físico {row.quantity_on_hand}, reservado {row.reserved_quantity}, libre {Number(row.quantity_on_hand)-row.reserved_quantity}</li>)}</ul></section>
 <section className={styles.section}><h2>Recordatorios internos</h2>{isAdmin&&settings.data?<OperationsSettingsForm unit={unit} version={settings.data.updated_at} initialPhone={String(config.operationsPhone??"")} initialDays={Number(config.complaintReminderBusinessDays??3)} />:<p>Solo el administrador modifica la configuración.</p>}</section>
 <section className={styles.section}><h2>Preparación para lanzamiento</h2><p>{launch.factual_ready===true?"Datos factuales completos. Falta la autorización expresa del operador para cutover.":"Lanzamiento bloqueado por datos pendientes."}</p>
 <p>Indexación aprobada: {isProductionCutoverApproved()?"sí; también requiere hechos completos y entorno de producción":"no"}.</p><ul>{Array.isArray(launch.blockers)?launch.blockers.map(key=><li key={String(key)}>{launchBlockerLabel(String(key))}</li>):null}</ul>
 <p>Sin imagen principal: {Number(launch.missing_primary_media)} · Bloqueos comerciales: {Number(launch.commercial_blockers)} · Productos sin publicar: {Number(launch.unpublished_products)}.</p>
 {unit==="import"?<p>Consolidado {String(launch.campaign_number??"sin registro")}: {String(launch.campaign_status??"sin registro")} · <Link href="/admin/import/lotes">Resolver por lote</Link> · <Link href="/admin/import/publicacion">Ver bloqueos detallados</Link></p>:null}
 <Link href={`/admin/${unit}/configuracion` as Route}>Editar contacto, identidad legal y políticas</Link></section></main>;
}
