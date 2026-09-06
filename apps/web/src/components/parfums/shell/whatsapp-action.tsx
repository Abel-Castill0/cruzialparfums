import { WhatsAppIcon } from "./shell-icons";
import styles from "./parfums-shell.module.css";

function whatsappHref(number: string, message?: string) {
  const base = `https://wa.me/${number}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

export function WhatsAppAction({
  number,
  floating = false,
}: {
  number: string;
  floating?: boolean;
}) {
  return (
    <a
      className={floating ? styles.whatsappFloat : styles.iconButton}
      href={whatsappHref(
        number,
        floating ? "Hola Cruzial Parfums, tengo una consulta." : undefined,
      )}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Escríbenos por WhatsApp"
      title="WhatsApp"
    >
      <WhatsAppIcon size={floating ? 26 : 18} />
    </a>
  );
}
