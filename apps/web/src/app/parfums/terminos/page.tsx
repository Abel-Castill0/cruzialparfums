import { PublicBusinessLegal } from "@/components/public-business-legal";
import type { Metadata } from "next";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/parfums/navigation/breadcrumbs";
import { loadParfumsStorefront } from "@/lib/catalog/parfums-storefront";
import styles from "@/components/parfums/institutional/institutional.module.css";

export const metadata: Metadata = {
  title: "Términos y Condiciones",
  description: "Términos y condiciones de uso y compra en Cruzial Parfums.",
};

const crumbs: BreadcrumbItem[] = [
  { label: "Parfums", href: "/parfums" },
  { label: "Términos" },
];

export default async function TerminosPage() {
  const { contact } = await loadParfumsStorefront();
  const whatsappNumber = contact.whatsappNumber;
  const whatsappDisplay = contact.whatsappDisplay;
  const contactEmail = contact.contactEmail;

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
          <PublicBusinessLegal unit="parfums" policies />
          <h2>1. Aceptación de los Términos</h2>
          <p>Al acceder a nuestro sitio web, utilizar nuestros servicios o realizar una compra, aceptas íntegramente estos Términos y Condiciones. Si no estás de acuerdo, no utilices nuestros servicios.</p>

          <h2>2. Descripción del Servicio</h2>
          <p>Cruzial Parfums ofrece la venta de decants (muestras) de perfumes originales de marcas nicho y designer en presentaciones de 3 ml, 5 ml y 10 ml, así como frascos originales completos. El proceso de compra se realiza a través de WhatsApp.</p>

          <h2>3. Productos y Precios</h2>
          <ul>
            <li>Los precios mostrados en el catálogo son en Soles peruanos (S/).</li>
            <li>Los precios de venta por mayor están sujetos a las condiciones de cantidad indicadas en la página de mayorista.</li>
            <li>Los precios del catálogo y los detalles finales de tu pedido se confirman antes de cerrar la venta por WhatsApp.</li>
            <li>Las imágenes del catálogo son representativas. El producto final puede variar ligeramente en color o diseño del frasco respecto a la imagen publicada.</li>
          </ul>

          <h2>4. Proceso de Compra</h2>
          <ol>
            <li>El cliente selecciona los productos en el catálogo y registra su solicitud con sus datos de contacto; la web asigna un número de referencia.</li>
            <li>El pedido se confirma por WhatsApp con un asesor: disponibilidad, envío y total final. Registrar la solicitud no constituye una venta ni un pago.</li>
            <li>Se acuerda la forma de pago.</li>
            <li>Se coordina la entrega según la zona y método seleccionado.</li>
          </ol>

          <h2>5. Formas de Pago</h2>
          <p>Cruzial Parfums no procesa pagos dentro del sitio web. La forma de pago disponible se coordina y confirma directamente por WhatsApp al momento de atender tu solicitud.</p>

          <h2>6. Envíos y Entregas</h2>
          <ul>
            <li>El envío se realiza mediante agencia Shalom. Cobertura, costo y tiempo de entrega se confirman por WhatsApp al coordinar el pedido.</li>
          </ul>

          <h2>7. Incidencias con tu pedido</h2>
          <p>Si tu pedido llega con un problema, contáctanos por WhatsApp al recibirlo para evaluar tu caso. Las condiciones aplicables y tus derechos como consumidor se respetan conforme a la normativa peruana vigente.</p>

          <h2>8. Regalo: Decant 2 ml</h2>
          <p>Con la compra de un frasco completo, el cliente puede solicitar un decant de 2 ml. Esta promoción:</p>
          <ul>
            <li>Solo aplica con la compra de un frasco completo; no aplica a decants (3, 5 o 10 ml) por sí solos.</li>
            <li>No aplica en pedidos mayoristas.</li>
          </ul>

          <h2>9. Propiedad Intelectual</h2>
          <p>El diseño, los textos y los logotipos propios de este sitio web son propiedad de Cruzial Parfums. Las marcas, nombres de producto y fotografías de terceros que aparecen en el catálogo siguen siendo propiedad de sus respectivos titulares; su uso aquí es únicamente ilustrativo del producto vendido, sin implicar afiliación ni patrocinio. Queda prohibida la reproducción del contenido propio del sitio sin autorización.</p>

          <h2>10. Ley Aplicable</h2>
          <p>Estos términos se rigen por las leyes de la República del Perú. Ante cualquier controversia, buscaremos primero una solución directa contigo por WhatsApp o correo electrónico.</p>

          <h2>11. Política de Cookies</h2>
          <p>El carrito se guarda en el almacenamiento local de tu navegador, no en cookies. Las únicas cookies del sitio son técnicas y se usan en el área administrativa para mantener la sesión del personal autorizado. Puedes gestionarlas desde la configuración de tu navegador; consulta la Política de Privacidad para el detalle de proveedores y datos.</p>

          <h2>12. Contacto</h2>
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
