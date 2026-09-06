export function buildProductConsultationMessage({
  storeName,
  brand,
  productName,
  discontinued = false,
}: {
  storeName: string;
  brand: string;
  productName: string;
  discontinued?: boolean;
}) {
  if (discontinued) {
    return `Hola ${storeName}, quiero saber si aún queda ${brand} ${productName} (descontinuado), o una alternativa similar.`;
  }
  return `Hola ${storeName}, quiero consultar por ${brand} ${productName}.`;
}

export function buildWhatsAppUrl(number: string, message: string) {
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

export type ParfumsCheckoutMessageLine = {
  brand: string;
  name: string;
  variantLabel: string;
  quantity: number;
  subtotal: number;
  contents?: readonly string[];
};

export type ParfumsCheckoutCustomer = {
  name: string;
  phone: string;
  district: string;
  delivery: string;
  note?: string;
};

function money(value: number) {
  return `S/ ${value.toFixed(2)}`;
}

export function buildCheckoutMessage({
  storeName,
  lines,
  total,
  customer,
}: {
  storeName: string;
  lines: readonly ParfumsCheckoutMessageLine[];
  total: number;
  customer: ParfumsCheckoutCustomer;
}) {
  const selection = lines.map((line) => {
    const contents = line.contents?.length
      ? `\n   Incluye: ${line.contents.join(" · ")}`
      : "";
    return `- ${line.variantLabel} · ${line.brand} ${line.name} ×${line.quantity} = ${money(line.subtotal)}${contents}`;
  });

  return [
    `Hola ${storeName}. Quiero solicitar la revisión de esta selección:`,
    "",
    ...selection,
    "",
    `TOTAL ESTIMADO: ${money(total)}`,
    "",
    "— MIS DATOS —",
    `Nombre: ${customer.name.trim()}`,
    `WhatsApp: ${customer.phone.trim()}`,
    `Distrito / Ciudad: ${customer.district.trim()}`,
    `Entrega: ${customer.delivery}`,
    `Nota: ${customer.note?.trim() || "—"}`,
    "",
    "Continúo en WhatsApp para confirmar stock, envío y total final.",
  ].join("\n");
}
