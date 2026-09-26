export type WorkerHealth = { last_started_at?: string | null; last_finished_at?: string | null; status?: string | null };
export function workerState(health:WorkerHealth|null,now=Date.now()):"never_run"|"running"|"healthy"|"stale"|"failed" {
 if(!health?.last_started_at)return "never_run";
 if(health.status==="failed")return "failed";
 if(health.status==="running")return now-Date.parse(health.last_started_at)>5*60*1000?"stale":"running";
 return !health.last_finished_at||now-Date.parse(health.last_finished_at)>26*60*60*1000?"stale":"healthy";
}
export const WORKER_LABELS={never_run:"Todavía no ejecutado",running:"En proceso",healthy:"Ejecución reciente",stale:"Revisar ejecución atrasada",failed:"Última ejecución falló"};
export const NOTIFICATION_LABELS:Record<string,string>={queued:"En cola",claimed:"En preparación",sending:"Envío en curso",retry:"Reintento programado",blocked:"Configuración pendiente",sent:"Aceptado por proveedor",failed:"Rechazado",uncertain:"Entrega incierta: conciliar",cancelled:"Recordatorio cancelado"};
export function launchBlockerLabel(key:string):string {
 const labels:Record<string,string>={"legal.legalName":"Razón social","legal.ruc":"RUC","legal.address":"Dirección legal","legal.claimsEmail":"Correo de reclamos","legal.claimsPhone":"Teléfono de reclamos","legal.exchangePolicy":"Política de cambios","legal.paymentMethodsNote":"Nota de pagos","contact.whatsappNumber":"WhatsApp público","contact.whatsappDisplay":"Contacto visible","contact.contactEmail":"Correo público","catalog.no_published_products":"Sin productos publicados","catalog.missing_primary_media":"Productos sin imagen principal","catalog.commercial_blockers":"Datos comerciales o presentaciones pendientes","catalog.unpublished_products":"Productos pendientes de publicación","campaign.missing":"Sin consolidado","campaign.not_open_now":"Consolidado pendiente de apertura o fuera de fechas"};
 return labels[key]??"Revisar configuración de lanzamiento";
}
