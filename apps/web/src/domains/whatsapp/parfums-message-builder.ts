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

export function buildCustomComboMessage({
  storeName,
  lines,
  total,
}: {
  storeName: string;
  lines: readonly Pick<ParfumsCheckoutMessageLine, "brand" | "name" | "subtotal" | "variantLabel">[];
  total: number;
}) {
  return [
    `Hola ${storeName}. Quiero solicitar un combo personalizado de ${lines.length} fragancias, cada una con su propio tamaño:`,
    "",
    ...lines.map((line) => `- ${line.brand} ${line.name} (${line.variantLabel}) — ${money(line.subtotal)}`),
    "",
    `TOTAL ESTIMADO: ${money(total)}`,
    "",
    "Continúo en WhatsApp para confirmar stock y total final.",
  ].join("\n");
}

export function buildContactMessage({
  storeName,
  name,
  phone,
  topic,
  message,
}: {
  storeName: string;
  name: string;
  phone: string;
  topic: string;
  message: string;
}) {
  return [
    `Hola ${storeName}. Quiero hacer una consulta.`,
    "",
    `Nombre: ${name.trim()}`,
    `WhatsApp: ${phone.trim()}`,
    `Motivo: ${topic.trim()}`,
    `Mensaje: ${message.trim()}`,
    "",
    "Continúo en WhatsApp para que me orienten.",
  ].join("\n");
}

export function buildWholesaleProductMessage({
  storeName,
  brand,
  productName,
  prices,
}: {
  storeName: string;
  brand: string;
  productName: string;
  prices: { unit: number; m4: number; m12: number };
}) {
  return [
    `Hola ${storeName}. Quiero cotizar ${brand} ${productName}.`,
    "Cantidad: ___ unidades.",
    `Precios referenciales legacy: ${money(prices.unit)} (unidad) / ${money(prices.m4)} (4+ uds) / ${money(prices.m12)} (12+ uds).`,
    "Tipo de compra: Mayorista.",
    "¿Tiene decants de cortesía?",
    "",
    "Continúo en WhatsApp para confirmar disponibilidad y tarifa exacta.",
  ].join("\n");
}

export function buildWholesaleInquiryMessage({
  storeName,
  name,
  business,
  phone,
  volume,
  message,
}: {
  storeName: string;
  name: string;
  business?: string;
  phone: string;
  volume: string;
  message?: string;
}) {
  return [
    `Hola ${storeName}. Quiero información sobre precios por MAYOR.`,
    "",
    `Nombre: ${name.trim()}`,
    `Negocio: ${business?.trim() || "—"}`,
    `WhatsApp: ${phone.trim()}`,
    `Volumen estimado: ${volume}`,
    `Fragancias de interés: ${message?.trim() || "—"}`,
    "",
    "Continúo en WhatsApp para confirmar disponibilidad y tarifa exacta.",
  ].join("\n");
}
