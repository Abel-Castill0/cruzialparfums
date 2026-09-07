import type { Metadata } from "next";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/parfums/navigation/breadcrumbs";
import { LegacyCatalogRepository } from "@/domains/catalog/legacy-catalog-repository";
import { PARFUMS_SETTINGS } from "@/domains/platform/settings";
import styles from "@/components/parfums/institutional/institutional.module.css";

export const metadata: Metadata = {
  title: "Política de Privacidad",
  description: "Cómo recopilamos, usamos y protegemos tus datos personales en Cruzial Parfums.",
};

const crumbs: BreadcrumbItem[] = [
  { label: "Parfums", href: "/parfums" },
  { label: "Privacidad" },
];

export default function PrivacidadPage() {
  const catalog = new LegacyCatalogRepository();
  const config = catalog.getStorefrontConfig();
  const whatsappNumber = config.WA_NUMBER ?? PARFUMS_SETTINGS.whatsappNumber;
  const whatsappDisplay = config.PHONE_DISPLAY ?? PARFUMS_SETTINGS.whatsappDisplay;
  const contactEmail = config.CONTACT_EMAIL ?? PARFUMS_SETTINGS.contactEmail;

  return (
    <main>
      <div className={styles.breadcrumbs}>
        <Breadcrumbs items={crumbs} />
      </div>

      <section className={styles.legal}>
        <div className={styles.legalTop}>
          <p className={styles.eyebrow}>Legal</p>
          <h1>Política de Privacidad</h1>
          <p className={styles.legalUpdated}>Última actualización: 27 de agosto de 2026</p>
        </div>

        <div className={styles.legalBody}>
          <h2>1. Información que Recopilamos</h2>
          <p>Cuando nos contactas por WhatsApp, Instagram o nuestro formulario, podemos recopilar:</p>
          <ul>
            <li><b>Nombre completo</b> — para identificar tu pedido y personalizar la atención.</li>
            <li><b>Número de teléfono</b> — exclusivamente para comunicación sobre pedidos y entregas.</li>
            <li><b>Dirección de envío</b> — solo cuando realizas un pedido y requiere envío físico.</li>
            <li><b>Correo electrónico</b> — si lo proporcionas voluntariamente para recibos o notificaciones.</li>
          </ul>

          <h2>2. Cómo Usamos tu Información</h2>
          <p>Utilizamos los datos exclusivamente para:</p>
          <ul>
            <li>Procesar y entregar tus pedidos de decants y frascos.</li>
            <li>Comunicarnos contigo sobre el estado de tu pedido.</li>
            <li>Enviar ofertas y novedades <b>solo si has dado tu consentimiento explícito</b>.</li>
            <li>Cumplir obligaciones legales y fiscales.</li>
          </ul>

          <h2>3. No Vendemos tus Datos</h2>
          <p>Cruzial Parfums <b>nunca vende, alquila ni comparte</b> tus datos personales con terceros para fines de marketing. Tu información solo se comparte con:</p>
          <ul>
            <li>Servicios de mensajería/transporte (para entrega de pedidos).</li>
            <li>Plataformas de pago (cuando aplique).</li>
          </ul>

          <h2>4. Seguridad de los Datos</h2>
          <p>Implementamos medidas razonables de seguridad para proteger tu información. Sin embargo, ningún método de transmisión por internet es 100% seguro. Al contactarnos por WhatsApp o Instagram, aceptas los términos de privacidad de esas plataformas.</p>

          <h2>5. Cookies y Tecnologías de Rastreo</h2>
          <p>Utilizamos las siguientes tecnologías:</p>
          <ul>
            <li><b>Cookies técnicas</b> — necesarias para el funcionamiento del carrito de compras y otras funcionalidades básicas.</li>
          </ul>
          <p>Puedes gestionar las cookies desde la configuración de tu navegador.</p>

          <h2>6. Tus Derechos</h2>
          <p>De conformidad con la Ley de Protección de Datos Personales del Perú (Ley N° 29733), tienes derecho a:</p>
          <ul>
            <li><b>Acceder</b> a tus datos personales que tengamos almacenados.</li>
            <li><b>Solicitar la corrección</b> de datos inexactos.</li>
            <li><b>Solicitar la eliminación</b> de tus datos cuando ya no sean necesarios.</li>
            <li><b>Oponerte</b> al uso de tus datos para fines específicos.</li>
          </ul>

          <h2>7. Retención de Datos</h2>
          <p>Conservamos tus datos personales solo durante el tiempo necesario para cumplir con los fines para los que fueron recopilados, o según lo exija la ley. Los datos de pedidos se conservan por un máximo de 5 años para fines fiscales y contables.</p>

          <h2>8. Cambios en esta Política</h2>
          <p>Podemos actualizar esta política en cualquier momento. Los cambios se publicarán en esta página con la fecha de última actualización.</p>

          <h2>9. Contacto</h2>
          <p>Si tienes preguntas sobre esta política o sobre tus datos personales, contáctanos:</p>
          <ul>
            <li>WhatsApp: <a href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noopener noreferrer">+{whatsappNumber.slice(0, 2)} {whatsappDisplay}</a></li>
            <li>Correo: <a href={`mailto:${contactEmail}`}>{contactEmail}</a></li>
            <li>Instagram: <a href="https://www.instagram.com/Cruzial_parfum/" target="_blank" rel="noopener noreferrer">@Cruzial_parfum</a></li>
          </ul>
        </div>
      </section>
    </main>
  );
}
