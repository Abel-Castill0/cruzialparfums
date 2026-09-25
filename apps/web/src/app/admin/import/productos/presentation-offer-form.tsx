"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AVAILABILITY_LABELS } from "@/domains/admin-import/campaign-products-schema";
import { updatePresentationOfferAction } from "../consolidados/actions";
import styles from "./page.module.css";

export function PresentationOfferForm({campaignId,version,productId,presentationId,price,currency,availability}: {
  campaignId:string;version:string;productId:string;presentationId:string;price:string;currency:string;availability:string;
}) {
  const router=useRouter();
  const [message,setMessage]=useState("");
  const [pending,start]=useTransition();
  return <form className={styles.form} onSubmit={event=>{
    event.preventDefault();
    const data=Object.fromEntries(new FormData(event.currentTarget));
    start(async()=>{
      setMessage("");
      try {
        const result=await updatePresentationOfferAction(campaignId,version,productId,presentationId,data);
        if(result.status==="success") {setMessage("Oferta guardada.");router.refresh();}
        else setMessage(result.status==="field_errors" ? Object.values(result.errors).join(" ") : result.status==="error" ? result.message : "No se pudo guardar.");
      } catch {setMessage("No se pudo confirmar el guardado. Recarga antes de volver a intentarlo.");}
    });
  }}>
    <label>Precio ({currency})<input name="priceAmount" inputMode="decimal" defaultValue={price} required disabled={pending}/></label>
    <label>Disponibilidad<select name="availabilityStatus" defaultValue={availability} disabled={pending}>
      {Object.entries(AVAILABILITY_LABELS).map(([value,label])=><option key={value} value={value}>{label}</option>)}
    </select></label>
    <p className={styles.help}>La moneda de este consolidado es {currency}. Los pedidos anteriores conservan sus precios.</p>
    <button disabled={pending}>{pending?"Guardando…":"Guardar oferta"}</button>
    {message?<p role="status">{message}</p>:null}
  </form>;
}
