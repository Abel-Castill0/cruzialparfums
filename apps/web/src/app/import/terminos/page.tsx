import { PublicBusinessLegal } from "@/components/public-business-legal";
import type { Metadata } from "next";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/parfums/navigation/breadcrumbs";
import { readImportPublicContact } from "@/domains/import/import-public-contact";
import { readImportDepositPercentages } from "@/domains/import/import-deposit-policies";
import { createSupabasePublicServerClient } from "@/lib/supabase/server";
import styles from "@/components/parfums/institutional/institutional.module.css";

export const metadata: Metadata = {
  title: "Términos y Condiciones",
  description: "Términos y condiciones de uso y compra en Cruzial Import.",
};

const crumbs: BreadcrumbItem[] = [
  { label: "Import", href: "/import" },
  { label: "Términos" },
];

export default async function ImportTerminosPage() {
  const supabase = createSupabasePublicServerClient();
  const [contact, depositPercentages] = supabase
    ? await Promise.all([readImportPublicContact(supabase), readImportDepositPercentages(supabase)])
    : [null, { new: null, returning: null }];
  const whatsappNumber = contact?.whatsappNumber ?? "";
  const whatsappDisplay = contact?.whatsappDisplay ?? "";
  const contactEmail = contact?.contactEmail ?? "";

  return (
    <main>
      <div className={styles.breadcrumbs}>
        <Breadcrumbs items={crumbs} />
      </div>

      <section className={styles.legal}>
        <div className={styles.legalTop}>
          <p className={styles.eyebrow}>Legal</p>
          <h1>Términos y Condiciones</h1>
          <p className={styles.legalUpdated}>Última actualización: 20 de septiembre de 2026</p>
        </div>

        <div className={styles.legalBody}>
          <PublicBusinessLegal unit="import" policies />
          <h2>1. Aceptación de los Términos</h2>
          <p>Al acceder a nuestro sitio web, utilizar nuestros servicios o registrar una solicitud, aceptas íntegramente estos Términos y Condiciones. Si no estás de acuerdo, no utilices nuestros servicios.</p>

          <h2>2. Descripción del Servicio</h2>
          <p>Cruzial Import ofrece productos organizados por consolidados (campañas). Un solo consolidado está activo a la vez; los consolidados anteriores se conservan internamente. Los productos, precios y disponibilidad pueden variar de un consolidado a otro.</p>

          <h2>3. Proceso de Solicitud</h2>
          <ol>
            <li>El cliente selecciona productos del consolidado activo y registra su solicitud con sus datos de contacto y entrega; la web asigna un número de referencia.</li>
            <li>El sitio web no procesa pagos: no se realiza ningún cobro dentro de la web.</li>
            <li>La coordinación de disponibilidad, entrega y pago continúa por WhatsApp.</li>
          </ol>

          <h2>4. Adelanto</h2>
          <p>El porcentaje de adelanto se calcula automáticamente según el estado del cliente:</p>
          <ul>
            <li>Cliente nuevo: {depositPercentages.new === null ? "porcentaje a confirmar al registrar la solicitud" : `${depositPercentages.new}% de adelanto`}.</li>
            <li>Cliente recurrente verificado: {depositPercentages.returning === null ? "porcentaje a confirmar al registrar la solicitud" : `${depositPercentages.returning}% de adelanto`}.</li>
          </ul>
          <p>El estado de cliente (nuevo o recurrente verificado) se resuelve mediante verificación interna, no lo declara el propio cliente.</p>

          <h2>5. Entrega</h2>
          <p>La entrega se realiza mediante delivery privado. El costo y el horario se coordinan por WhatsApp.</p>

          <h2>6. Ley Aplicable</h2>
          <p>Estos términos se rigen por las leyes de la República del Perú. Ante cualquier controversia, buscaremos primero una solución directa contigo por WhatsApp o correo electrónico.</p>

          <h2>7. Política de Cookies</h2>
          <p>El carrito se guarda en el almacenamiento local de tu navegador, no en cookies. Las únicas cookies del sitio son técnicas y se usan en el área administrativa para mantener la sesión del personal autorizado. Consulta la Política de Privacidad para el detalle de proveedores y datos.</p>

          <h2>8. Contacto</h2>
          <p>Para consultas sobre estos términos:</p>
          <ul>
            {whatsappNumber ? (
              <li>WhatsApp: <a href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noopener noreferrer">+{whatsappNumber.slice(0, 2)} {whatsappDisplay}</a></li>
            ) : null}
            {contactEmail ? (
              <li>Correo: <a href={`mailto:${contactEmail}`}>{contactEmail}</a></li>
            ) : null}
          </ul>
        </div>
      </section>
    </main>
  );
}
