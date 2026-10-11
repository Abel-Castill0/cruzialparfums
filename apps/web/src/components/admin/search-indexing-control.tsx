"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setSearchIndexingAction } from "./search-indexing-actions";
import type { NotificationUnit } from "@/domains/notifications/provider";

export function SearchIndexingControl({
  unit,
  enabled,
  version,
  canChange,
  contentComplete,
}: {
  unit: NotificationUnit;
  enabled: boolean;
  version: string;
  canChange: boolean;
  contentComplete: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [confirming, setConfirming] = useState(false);
  const next = !enabled;

  function apply() {
    setConfirming(false);
    startTransition(async () => {
      try {
        const r = await setSearchIndexingAction(unit, next, version);
        setMessage(r.message);
        if (r.ok) router.refresh();
      } catch {
        setMessage("No se pudo guardar. Revisa tu sesión.");
      }
    });
  }

  return (
    <div>
      <p>
        <strong>Permitir indexación en buscadores:</strong> {enabled ? "activada" : "desactivada"}.{" "}
        {enabled ? "Google y otros buscadores pueden listar las tiendas en producción." : "Las tiendas funcionan con normalidad, pero los buscadores no las listan."}
      </p>
      {!contentComplete ? (
        <p role="note">
          Aviso: aún faltan datos comerciales o legales (lista arriba). Puedes activar la indexación igualmente; los datos se pueden completar
          después y nada se inventa mientras tanto.
        </p>
      ) : null}
      {canChange ? (
        confirming ? (
          <p>
            {next ? "¿Permitir que los buscadores indexen Parfums e Import?" : "¿Dejar de permitir la indexación de Parfums e Import?"}{" "}
            <button type="button" disabled={pending} onClick={apply}>
              Sí, {next ? "permitir" : "desactivar"}
            </button>{" "}
            <button type="button" disabled={pending} onClick={() => setConfirming(false)}>
              Cancelar
            </button>
          </p>
        ) : (
          <button type="button" disabled={pending} onClick={() => setConfirming(true)}>
            {next ? "Permitir indexación en buscadores" : "Desactivar indexación en buscadores"}
          </button>
        )
      ) : (
        <p>Solo un administrador de Parfums e Import (con MFA) puede cambiar esta opción. Afecta a todo el dominio.</p>
      )}
      {message ? <p role="status">{message}</p> : null}
    </div>
  );
}
