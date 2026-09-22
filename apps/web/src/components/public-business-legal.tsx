import Link from "next/link";
import { createSupabasePublicServerClient } from "@/lib/supabase/server";
import { validateBusinessLegalSettingForm } from "@/domains/admin-parfums/settings-schema";

/** Public settings only: no privileged client or cross-unit fallback. */
export async function PublicBusinessLegal({ unit, policies = false }: { unit: "parfums" | "import"; policies?: boolean }) {
  const client = createSupabasePublicServerClient();
  if (!client) return null;
  const { data, error } = await client.from("settings")
    .select("value,business_units!inner(code)").eq("business_units.code", unit)
    .eq("key", "business_legal").eq("is_public", true).maybeSingle();
  if (error || !data?.value || typeof data.value !== "object" || Array.isArray(data.value)) return null;
  const parsed = validateBusinessLegalSettingForm(data.value);
  if (!parsed.ok) return null;
  const legal = parsed.value;
  return <section aria-label={`Información de Cruzial ${unit === "parfums" ? "Parfums" : "Import"}`}>
    {legal.legalName || legal.ruc || legal.address ? <>
      <h2>Información del proveedor</h2>
      {legal.legalName ? <p>{legal.legalName}</p> : null}
      {legal.ruc ? <p>RUC: {legal.ruc}</p> : null}
      {legal.address ? <p>{legal.address}</p> : null}
    </> : null}
    {policies && legal.paymentMethodsNote ? <><h2>Medios de pago coordinados</h2><p style={{ whiteSpace: "pre-wrap" }}>{legal.paymentMethodsNote}</p></> : null}
    {policies && legal.exchangePolicy ? <><h2>Cambios y devoluciones</h2><p style={{ whiteSpace: "pre-wrap" }}>{legal.exchangePolicy}</p></> : null}
    <h2>Atención de reclamos</h2>
    {legal.claimsEmail ? <p>Correo: <a href={`mailto:${legal.claimsEmail}`}>{legal.claimsEmail}</a></p> : null}
    {legal.claimsPhone ? <p>Teléfono: {legal.claimsPhone}</p> : null}
    <p><Link href={`/libro-de-reclamaciones?unidad=${unit}`}>Libro de Reclamaciones Virtual</Link></p>
  </section>;
}
