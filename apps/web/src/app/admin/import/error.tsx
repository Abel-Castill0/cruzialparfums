"use client";
export default function AdminError({reset}:{reset:()=>void}) {
  return <section role="alert" style={{padding:24}}><h1>No pudimos cargar esta sección</h1><p>Vuelve a intentarlo. Si estabas guardando un cambio, comprueba su estado antes de enviarlo otra vez.</p><button onClick={reset} style={{minHeight:44,padding:"8px 16px"}}>Volver a intentar</button></section>;
}
