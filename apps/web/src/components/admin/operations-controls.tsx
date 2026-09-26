"use client";
import { useState,useTransition } from "react";
import { useRouter } from "next/navigation";
import { retryNotificationAction,updateOperationsSettingsAction } from "./operations-actions";
import type { NotificationUnit } from "@/domains/notifications/provider";
export function RetryNotification({unit,id,version,uncertain}:{unit:NotificationUnit;id:string;version:string;uncertain:boolean}){
 const router=useRouter();const [verified,setVerified]=useState(false);const [pending,startTransition]=useTransition();const [message,setMessage]=useState("");
 return <div>{uncertain?<label><input type="checkbox" checked={verified} onChange={e=>setVerified(e.target.checked)} /> Comprobé en Meta que este mensaje no fue enviado.</label>:null}
 <button disabled={pending||(uncertain&&!verified)} onClick={()=>startTransition(async()=>{try{const r=await retryNotificationAction(unit,id,version,verified);setMessage(r.message);if(r.ok)router.refresh();}catch{setMessage("No se pudo reintentar. Revisa tu sesión.");}})}>Reintentar</button>{message?<p role="status">{message}</p>:null}</div>;
}
export function OperationsSettingsForm({unit,version,initialPhone,initialDays}:{unit:NotificationUnit;version:string;initialPhone:string;initialDays:number}){
 const router=useRouter();const [pending,startTransition]=useTransition();const [message,setMessage]=useState("");
 return <form onSubmit={e=>{e.preventDefault();const data=new FormData(e.currentTarget);startTransition(async()=>{try{const r=await updateOperationsSettingsAction(unit,version,String(data.get("phone")??""),Number(data.get("days")));setMessage(r.message);if(r.ok)router.refresh();}catch{setMessage("No se pudo guardar. Revisa tu sesión.");}});}}>
 <p><label htmlFor="operations-phone">Móvil interno para alertas de reclamos</label><br/><input id="operations-phone" name="phone" type="tel" defaultValue={initialPhone} placeholder="9 dígitos o 51 + móvil" maxLength={30} /></p>
 <p><label htmlFor="operations-days">Anticipación del recordatorio (días hábiles)</label><br/><input id="operations-days" name="days" type="number" min={1} max={7} defaultValue={initialDays} required /></p>
 <button disabled={pending}>Guardar recordatorios</button>{message?<p role="status">{message}</p>:null}</form>;
}
