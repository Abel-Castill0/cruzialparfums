import type { Metadata } from "next";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/parfums/navigation/breadcrumbs";
import { LegacyCatalogRepository } from "@/domains/catalog/legacy-catalog-repository";
import { PARFUMS_SETTINGS } from "@/domains/platform/settings";
import styles from "@/components/parfums/institutional/institutional.module.css";

export const metadata: Metadata = {
  title: "Términos y Condiciones",
  description: "Términos y condiciones de uso y compra en Cruzial Parfums.",
};

const crumbs: BreadcrumbItem[] = [
  { label: "Parfums", href: "/parfums" },
  { label: "Términos" },
];

export default function TerminosPage() {
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
          <h1>Términos y Condiciones</h1>
          <p className={styles.legalUpdated}>Última actualización: 27 de agosto de 2026</p>
        </div>

        <div className={styles.legalBody}>
          <h2>1. Aceptación de los Términos</h2>
          <p>Al acceder a nuestro sitio web, utilizar nuestros servicios o realizar una compra, aceptas íntegramente estos Términos y Condiciones. Si no estás de acuerdo, no utilices nuestros servicios.</p>

          <h2>2. Descripción del Servicio</h2>
          <p>Cruzial Parfums ofrece la venta de decants (muestras) de perfumes originales de marcas nicho y designer en presentaciones de 3 ml, 5 ml y 10 ml, así como frascos originales completos. El proceso de compra se realiza a través de WhatsApp.</p>

          <h2>3. Productos y Precios</h2>
          <ul>
            <li>Los precios mostrados en el catálogo son en Soles peruanos (S/).</li>
            <li>Los precios de venta por mayor están sujetos a las condiciones de cantidad indicadas en la página de mayorista.</li>
            <li>Cruzial Parfums se reserva el derecho de modificar precios sin previo aviso, aunque los pedidos confirmados no se verán afectados.</li>
            <li>Las imágenes del catálogo son representativas. El producto final puede variar ligeramente en color o diseño del frasco respecto a la imagen publicada.</li>
          </ul>

          <h2>4. Proceso de Compra</h2>
          <ol>
            <li>El cliente selecciona los productos en el catálogo.</li>
            <li>El pedido se confirma por WhatsApp con un asesor.</li>
            <li>Se acuerda la forma de pago.</li>
            <li>Se coordina la entrega según la zona y método seleccionado.</li>
          </ol>

          <h2>5. Formas de Pago</h2>
          <ul>
            <li>Transferencia bancaria</li>
            <li>Yape / Plin</li>
            <li>Efectivo contra entrega (solo Lima y Callao)</li>
          </ul>

          <h2>6. Envíos y Entregas</h2>
          <ul>
            <li><b>Lima y Callao:</b> Entrega el mismo día o al siguiente día hábil.</li>
            <li><b>Provincias:</b> Envío por agencias de transporte. El tiempo de entrega varía según la región.</li>
            <li>El costo de envío a provincias corre por cuenta del cliente.</li>
            <li>Cruzial Parfums no se hace responsable por demoras de servicios de transporte.</li>
          </ul>

          <h2>7. Política de Devoluciones</h2>
          <p>Debido a la naturaleza de los productos (perfumes y decants), <b>no se aceptan devoluciones ni cambios</b> una vez sellado el producto, excepto en caso de:</p>
          <ul>
            <li>Producto defectuoso o dañado durante el transporte (reemplazo sin costo).</li>
            <li>Envío incorrecto (producto distinto al solicitado).</li>
          </ul>
          <p>Para solicitar un reemplazo, contáctanos al recibir tu pedido.</p>

          <h2>8. Regalo: Decant 2 ml</h2>
          <p>Por cada compra retail, el cliente puede solicitar un decant de 2 ml de cualquier perfume árabe de nuestro catálogo, sujeto a disponibilidad. Esta promoción:</p>
          <ul>
            <li>No es acumulable con otros descuentos especiales.</li>
            <li>No aplica en pedidos mayoristas.</li>
            <li>Debe solicitarse al momento del pedido.</li>
          </ul>

          <h2>9. Propiedad Intelectual</h2>
          <p>Todo el contenido del sitio web (diseño, textos, imágenes, logotipos) es propiedad de Cruzial Parfums y está protegido por las leyes de propiedad intelectual. Queda prohibida su reproducción sin autorización.</p>

          <h2>10. Limitación de Responsabilidad</h2>
          <p>Cruzial Parfums no será responsable por:</p>
          <ul>
            <li>Reacciones alérgicas o sensibilidad cutánea a los productos.</li>
            <li>Daños derivados del uso indebido de los perfumes.</li>
            <li>Demoras en entregas por causas de fuerza mayor.</li>
          </ul>

          <h2>11. Ley Aplicable y Arbitraje</h2>
          <p>Estos términos se rigen por las leyes de la República del Perú. Cualquier controversia, diferencia o reclamación derivada de estos términos será resuelta definitivamente mediante arbitraje administrado por la Cámara de Comercio de Lima, de conformidad con su Reglamento de Arbitraje. El tribunal arbitral estará compuesto por un (1) árbitro único. El lugar del arbitraje será la ciudad de Lima, Perú. El idioma del arbitraje será el español.</p>

          <h2>12. Política de Cookies</h2>
          <p>Nuestro sitio web utiliza cookies técnicas necesarias para su funcionamiento (carrito de compras, sesiones). Puedes gestionar o desactivar las cookies desde la configuración de tu navegador. La desactivación de cookies técnicas puede afectar el funcionamiento del sitio.</p>

          <h2>13. Contacto</h2>
          <p>Para consultas sobre estos términos:</p>
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
