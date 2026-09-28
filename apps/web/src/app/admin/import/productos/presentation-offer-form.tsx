"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SaveStatus, adminButtonClass, type SaveStatusState } from "@/components/admin/admin-ui";
import { AVAILABILITY_LABELS } from "@/domains/admin-import/campaign-products-schema";
import { updatePresentationOfferAction } from "../consolidados/actions";
import styles from "@/components/admin/catalog-workspace.module.css";

/** Price + availability for ONE presentation in ONE consolidado. Saves
 * through the existing consolidado action with the campaign's concurrency
 * version; it never changes the product or other consolidados. */
export function PresentationOfferForm({campaignId,version,productId,presentationId,price,currency,availability}: {
  campaignId:string;version:string;productId:string;presentationId:string;price:string;currency:string;availability:string;
}) {
  const router=useRouter();
  const [status,setStatus]=useState<SaveStatusState>("idle");
  const [message,setMessage]=useState<string|undefined>(undefined);
  const [pending,start]=useTransition();
  return <form className={styles.formGrid} onChange={()=>{setStatus("dirty");setMessage(undefined);}} onSubmit={event=>{
    event.preventDefault();
    const data=Object.fromEntries(new FormData(event.currentTarget));
    start(async()=>{
      setStatus("saving");
      try {
        const result=await updatePresentationOfferAction(campaignId,version,productId,presentationId,data);
        if(result.status==="success") {setStatus("saved");setMessage("Oferta guardada para este consolidado");router.refresh();}
        else {setStatus("error");setMessage(`${result.status==="field_errors" ? Object.values(result.errors).join(" ") : result.status==="error" ? result.message : "No se pudo guardar."} No se guardó.`);}
      } catch {setStatus("error");setMessage("No se pudo confirmar el guardado. Recarga antes de volver a intentarlo.");}
    });
  }}>
    <label className={styles.field}><span>Precio en este consolidado ({currency})</span><input name="priceAmount" inputMode="decimal" defaultValue={price} required disabled={pending}/></label>
    <label className={styles.field}><span>Disponibilidad</span><select name="availabilityStatus" defaultValue={availability} disabled={pending}>
      {Object.entries(AVAILABILITY_LABELS).map(([value,label])=><option key={value} value={value}>{label}</option>)}
    </select></label>
    <button type="submit" className={adminButtonClass("secondary")} disabled={pending}>{pending?"Guardando…":"Guardar oferta"}</button>
    <p className={styles.fieldHint}>La moneda de este consolidado es {currency}. Los pedidos anteriores conservan sus precios.</p>
    <SaveStatus state={status} message={message}/>
  </form>;
}
