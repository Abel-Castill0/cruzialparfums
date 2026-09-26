"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { exportBulkCatalog, matchMediaFiles, type BulkCatalogRow, type BulkIssue, type MediaIdentity, type MediaMatch } from "@/domains/admin-import/bulk-catalog";
import { previewCatalogAction, applyCatalogAction, publishBatchAction } from "./actions";
import { getUploadAuthorizationAction, registerMediaAction } from "../productos/[id]/media-actions";
import type { Json } from "@/lib/supabase/database.types";
import styles from "./bulk.module.css";
function download(text:string,filename:string,type="text/csv;charset=utf-8") {
 const url=URL.createObjectURL(new Blob([text],{type})); const a=document.createElement("a");a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);
}
function isCandidate(value:Json):value is { [key:string]:Json } { return typeof value==="object" && value!==null && !Array.isArray(value); }
export function BulkManager({rows,products,categories,canWrite,campaign,candidates}:{rows:BulkCatalogRow[];products:MediaIdentity[];categories:{id:string;name:string}[];canWrite:boolean;campaign:{id:string;updated_at:string;number:number}|null;candidates:Json|null}) {
 const router=useRouter();const [pending,startTransition]=useTransition();const [text,setText]=useState("");
 const [preview,setPreview]=useState<{rows:BulkCatalogRow[];issues:BulkIssue[];diffs:string[]}|null>(null);
 const [message,setMessage]=useState("");const [files,setFiles]=useState<File[]>([]);const [manifest,setManifest]=useState("");
 const [matches,setMatches]=useState<MediaMatch[]|null>(null); const [results,setResults]=useState<string[]>([]);
 const eligible=Array.isArray(candidates)?candidates.filter(isCandidate):[];
 const [selected,setSelected]=useState<Set<string>>(new Set());
 const safeTask=(task:()=>Promise<void>)=>startTransition(async()=>{try {await task();}catch {setMessage("No se pudo completar la operación. Revisa tu sesión y vuelve a validar.");}});
 return <div className={styles.stack}>
 <section className={styles.section}><h2>1. Datos del catálogo</h2><p>Exporta y conserva solo las filas necesarias. Categoría vacía conserva la asignación actual. No cambia precios, disponibilidad ni publicación.</p>
 <button onClick={()=>download(exportBulkCatalog(rows),"import-catalogo.csv")}>Exportar plantilla del catálogo</button>
 <details><summary>Identificadores de categorías</summary><ul>{categories.map(c=><li key={c.id}>{c.name}: <code>{c.id}</code></li>)}</ul></details>
 {canWrite?<><label htmlFor="catalog-csv">CSV del catálogo</label><input id="catalog-csv" type="file" accept=".csv,text/csv" disabled={pending} onChange={e=>{const f=e.target.files?.[0];setPreview(null);if(f)safeTask(async()=>{if(f.size>2*1024*1024){setMessage("Máximo 2 MiB.");return;}setText(await f.text());});}} />
 <button disabled={!text||pending} onClick={()=>safeTask(async()=>{setPreview(await previewCatalogAction(text));setMessage("");})}>Validar y ver cambios</button>
 {preview?<div aria-live="polite"><p>{preview.rows.length} filas válidas · {preview.issues.length} errores.</p><ul>{preview.issues.map((issue,i)=><li key={i}>Fila {issue.line}: {issue.reason}</li>)}</ul>
 {preview.issues.length?<button onClick={()=>download(JSON.stringify(preview.issues,null,2),"errores-catalogo.json","application/json")}>Descargar errores</button>:null}
 <ul>{preview.diffs.map((diff,i)=><li key={i}>{diff}</li>)}</ul><button disabled={pending||!!preview.issues.length||!preview.rows.length} onClick={()=>safeTask(async()=>{const r=await applyCatalogAction(text);setMessage(r.message);if(r.ok){setPreview(null);setText("");router.refresh();}})}>Aplicar {preview.rows.length} filas explícitamente</button></div>:null}</>:<p>Acceso de consulta.</p>}</section>
 <section className={styles.section}><h2>2. Imágenes principales por lote</h2><p>Nombre sin extensión = slug exacto. O manifiesto <code>filename,product_id</code>. Un archivo por producto; sin coincidencias aproximadas.</p>
 <button onClick={()=>download("filename,product_id\r\n"+products.map(p=>`${p.slug}.png,${p.id}`).join("\r\n"),"manifiesto-imagenes.csv")}>Exportar manifiesto</button>
 {canWrite?<><label htmlFor="media-files">Imágenes PNG, JPG o WebP</label><input id="media-files" type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={pending} onChange={e=>{setFiles(Array.from(e.target.files??[]));setMatches(null);setResults([]);}} />
 <label htmlFor="media-manifest">Manifiesto opcional</label><input id="media-manifest" type="file" accept=".csv,text/csv" disabled={pending} onChange={e=>{const f=e.target.files?.[0];setMatches(null);if(f)safeTask(async()=>{if(f.size>2*1024*1024){setMessage("Máximo 2 MiB.");return;}setManifest(await f.text());});}} />
 <button disabled={!files.length||pending} onClick={()=>{setMatches(matchMediaFiles(files.map(f=>f.name),products,manifest));setResults([]);}}>Ver coincidencias</button>
 {matches?<><ul>{matches.map((m,i)=><li key={i}>{m.filename}: {m.reason??products.find(p=>p.id===m.productId)?.name}</li>)}</ul><button disabled={pending||!matches.some(m=>m.productId)} onClick={()=>safeTask(async()=>{
 const report:string[]=[];
 for(const m of matches){if(!m.productId)continue;const f=files.find(f=>f.name===m.filename);if(!f)continue;
 try {const auth=await getUploadAuthorizationAction(m.productId);if(auth.status!=="success")throw new Error(auth.message);
 if(f.size>auth.data.maxBytes)throw new Error("Supera 10 MB.");
 const body=new FormData();body.set("file",f);body.set("api_key",auth.data.apiKey);body.set("timestamp",String(auth.data.timestamp));body.set("signature",auth.data.signature);body.set("public_id",auth.data.publicId);body.set("allowed_formats",auth.data.allowedFormats);
 const response=await fetch(`https://api.cloudinary.com/v1_1/${auth.data.cloudName}/image/upload`,{method:"POST",body});if(!response.ok)throw new Error("Subida rechazada.");const upload=await response.json();
 const r=await registerMediaAction(m.productId,null,{publicId:upload.public_id,secureUrl:upload.secure_url,width:upload.width??null,height:upload.height??null,bytes:upload.bytes,format:upload.format},null,true,auth.data.authorizationToken);
 if(r.status!=="success")throw new Error(r.status==="error"?r.message:"Registro incompleto.");report.push(`${m.filename}: registrada`);
 }catch(e){report.push(`${m.filename}: ${e instanceof Error?e.message:"No se pudo registrar."}`);}setResults([...report]);}
 setMatches(null);router.refresh();})}>Subir y asignar {matches.filter(m=>m.productId).length} imágenes confirmadas</button></>:null}<ul aria-live="polite">{results.map((r,i)=><li key={i}>{r}</li>)}</ul></>:null}</section>
 <section className={styles.section}><h2>3. Publicar registros elegibles</h2><p>Consolidado {campaign?.number??"sin seleccionar"}: {eligible.length} ofertas elegibles. Requiere precio positivo, disponibilidad confirmada, presentación inequívoca e imagen principal.</p>
 {candidates===null?<p role="alert">No se pudo comprobar elegibilidad. Recarga.</p>:null}
 {canWrite&&campaign?<><button disabled={pending} onClick={()=>setSelected(new Set(eligible.map(x=>String(x.offer_id))))}>Seleccionar todos los elegibles ({eligible.length})</button><button disabled={pending} onClick={()=>setSelected(new Set())}>Limpiar selección</button>
 <ul>{eligible.map(row=><li key={String(row.offer_id)}><label><input type="checkbox" checked={selected.has(String(row.offer_id))} onChange={e=>setSelected(previous=>{const next=new Set(previous);if(e.target.checked)next.add(String(row.offer_id));else next.delete(String(row.offer_id));return next;})} /> {String(row.name)} · {String(row.label)}</label></li>)}</ul>
 <button disabled={pending||!selected.size} onClick={()=>safeTask(async()=>{const r=await publishBatchAction(campaign.id,campaign.updated_at,eligible.filter(x=>selected.has(String(x.offer_id))));setMessage(r.message);if(r.ok){setSelected(new Set());router.refresh();}})}>Publicar {selected.size} ofertas seleccionadas</button></>:null}</section>
 {message?<p role="status" className={styles.message}>{message}</p>:null}</div>;
}
