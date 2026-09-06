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
