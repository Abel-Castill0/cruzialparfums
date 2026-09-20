import type { Metadata } from "next";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/parfums/navigation/breadcrumbs";
import { readImportPublicContact } from "@/domains/import/import-public-contact";
import { createSupabasePublicServerClient } from "@/lib/supabase/server";
import styles from "@/components/parfums/institutional/institutional.module.css";

export const metadata: Metadata = {
  title: "Política de Privacidad",
  description: "Cómo recopilamos, usamos y protegemos tus datos personales en Cruzial Import.",
};

const crumbs: BreadcrumbItem[] = [
  { label: "Import", href: "/import" },
  { label: "Privacidad" },
];

export default async function ImportPrivacidadPage() {
  const supabase = createSupabasePublicServerClient();
  const contact = supabase ? await readImportPublicContact(supabase) : null;
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
          <h1>Política de Privacidad</h1>
          <p className={styles.legalUpdated}>Última actualización: 20 de septiembre de 2026</p>
        </div>

        <div className={styles.legalBody}>
          <h2>1. Información que Recopilamos</h2>
          <p>Cuando registras una solicitud en Cruzial Import, recopilamos:</p>
          <ul>
            <li><b>Nombre completo</b> — para identificar tu solicitud.</li>
            <li><b>Número de WhatsApp</b> — para coordinar tu solicitud.</li>
            <li><b>Distrito o ciudad y dirección o referencia de entrega</b> — para coordinar el delivery.</li>
            <li><b>Nota</b> — opcional, si la agregas.</li>
            <li><b>Los productos/ofertas seleccionados y sus cantidades</b> — como parte de tu solicitud.</li>
          </ul>

          <h2>2. Cómo funciona esta web y qué proveedores intervienen</h2>
          <p>Esta web no procesa pagos: no se realiza ningún cobro dentro del sitio. Cuando registras una solicitud, guardamos los datos anteriores junto con un número de referencia, para que nuestro equipo pueda atenderte por WhatsApp. Para ello usamos:</p>
          <ul>
            <li><b>Vercel</b> — alojamiento de la web.</li>
            <li><b>Supabase</b> — base de datos donde se guardan las solicitudes y la información del consolidado activo.</li>
            <li><b>Cloudinary</b> — alojamiento de las fotografías de producto que se muestran en el catálogo.</li>
            <li><b>WhatsApp (Meta)</b> — canal de coordinación de tu solicitud; al abrir WhatsApp desde la web se aplican sus propias condiciones.</li>
          </ul>
          <p><b>Protección contra abuso.</b> Para evitar solicitudes automatizadas o masivas, al registrar una solicitud calculamos una huella irreversible (hash con clave) de tu dirección IP y de tu número; esas huellas se usan únicamente para limitar la frecuencia de solicitudes, no permiten reconstruir el dato original, y se eliminan automáticamente a las 48 horas.</p>

          <h2>3. No Vendemos tus Datos</h2>
          <p>Cruzial Import <b>nunca vende, alquila ni comparte</b> tus datos personales con terceros para fines de marketing.</p>

          <h2>4. Cookies y almacenamiento local</h2>
          <ul>
            <li><b>Almacenamiento local del navegador</b> — tu carrito se guarda solo en tu dispositivo hasta que lo envías o lo vacías; no lo leemos desde nuestros servidores.</li>
            <li><b>Cookies técnicas</b> — únicamente en el área administrativa, para mantener la sesión del personal autorizado.</li>
          </ul>
          <p>No usamos cookies de publicidad ni de seguimiento entre sitios.</p>

          <h2>5. Tus Derechos</h2>
          <p>De conformidad con la Ley de Protección de Datos Personales del Perú (Ley N° 29733), tienes derecho a acceder, corregir y solicitar la eliminación de tus datos personales, y a oponerte al uso de tus datos para fines específicos.</p>

          <h2>6. Cambios en esta Política</h2>
          <p>Podemos actualizar esta política en cualquier momento. Los cambios se publicarán en esta página con la fecha de última actualización.</p>

          <h2>7. Contacto</h2>
          <p>Si tienes preguntas sobre esta política o sobre tus datos personales, contáctanos:</p>
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
