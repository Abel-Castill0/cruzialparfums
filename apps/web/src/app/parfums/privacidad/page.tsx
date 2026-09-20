import type { Metadata } from "next";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/parfums/navigation/breadcrumbs";
import { loadParfumsStorefront } from "@/lib/catalog/parfums-storefront";
import styles from "@/components/parfums/institutional/institutional.module.css";

export const metadata: Metadata = {
  title: "Política de Privacidad",
  description: "Cómo recopilamos, usamos y protegemos tus datos personales en Cruzial Parfums.",
};

const crumbs: BreadcrumbItem[] = [
  { label: "Parfums", href: "/parfums" },
  { label: "Privacidad" },
];

export default async function PrivacidadPage() {
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
          <h1>Política de Privacidad</h1>
          <p className={styles.legalUpdated}>Última actualización: 20 de septiembre de 2026</p>
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

          <h2>3. Uso Actual de tus Datos</h2>
          <p>La plataforma no implementa actualmente venta de datos ni uso de los datos de pedidos para publicidad de terceros. Tu información se comparte únicamente con:</p>
          <ul>
            <li>Servicios de mensajería/transporte (Agencia Shalom) para la entrega de pedidos.</li>
            <li>Los proveedores técnicos que hacen funcionar esta web, descritos en la sección 5, y solo para prestar las funciones ahí descritas.</li>
          </ul>

          <h2>4. Seguridad de los Datos</h2>
          <p>Implementamos medidas razonables de seguridad para proteger tu información: conexiones cifradas (HTTPS), acceso administrativo restringido con verificación en dos pasos y registro de cambios. Sin embargo, ningún método de transmisión por internet es 100% seguro. Al contactarnos por WhatsApp o Instagram, aceptas los términos de privacidad de esas plataformas.</p>

          <h2>5. Cómo funciona esta web y qué proveedores intervienen</h2>
          <p>Esta web no procesa pagos. Cuando registras una solicitud de pedido guardamos tu nombre, tu número de WhatsApp, tu distrito o ciudad, la nota que escribas y los productos seleccionados, para que nuestro equipo pueda atenderte por WhatsApp. Para ello usamos:</p>
          <ul>
            <li><b>Vercel</b> — alojamiento de la web.</li>
            <li><b>Supabase</b> — base de datos donde se guardan las solicitudes de pedido y la información de nuestro catálogo.</li>
            <li><b>Cloudinary</b> — alojamiento de las fotografías de productos.</li>
            <li><b>WhatsApp (Meta)</b> — canal de coordinación del pedido; al abrir WhatsApp desde la web se aplican sus propias condiciones.</li>
          </ul>
          <p><b>Protección contra abuso.</b> Para evitar solicitudes automatizadas o masivas, al registrar una solicitud generamos identificadores seudonimizados de tu dirección IP y de tu número mediante HMAC-SHA256 con una clave de servidor; se utilizan para aplicar límites de frecuencia sin almacenar esos valores en texto plano en la tabla de control.</p>

          <h2>6. Cookies y almacenamiento local</h2>
          <ul>
            <li><b>Almacenamiento local del navegador</b> — tu carrito se guarda solo en tu dispositivo hasta que lo envías o lo vacías; no lo leemos desde nuestros servidores.</li>
            <li><b>Cookies técnicas</b> — únicamente en el área administrativa, para mantener la sesión del personal autorizado.</li>
          </ul>
          <p>No usamos cookies de publicidad ni de seguimiento entre sitios. Puedes gestionar las cookies y el almacenamiento local desde la configuración de tu navegador.</p>

          <h2>7. Tus Derechos</h2>
          <p>De conformidad con la Ley de Protección de Datos Personales del Perú (Ley N° 29733), tienes derecho a:</p>
          <ul>
            <li><b>Acceder</b> a tus datos personales que tengamos almacenados.</li>
            <li><b>Solicitar la corrección</b> de datos inexactos.</li>
            <li><b>Solicitar la eliminación</b> de tus datos cuando ya no sean necesarios.</li>
            <li><b>Oponerte</b> al uso de tus datos para fines específicos.</li>
          </ul>

          <h2>8. Retención de Datos</h2>
          <p>Conservamos tus datos personales solo durante el tiempo necesario para cumplir con los fines para los que fueron recopilados, o durante el plazo que exija la normativa peruana aplicable en materia fiscal, contable y de protección de datos. Los registros técnicos usados para limitar el abuso se conservan durante aproximadamente 48 horas; las entradas vencidas se depuran de forma automática cuando opera el limitador.</p>

          <h2>9. Cambios en esta Política</h2>
          <p>Podemos actualizar esta política en cualquier momento. Los cambios se publicarán en esta página con la fecha de última actualización.</p>

          <h2>10. Contacto</h2>
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
