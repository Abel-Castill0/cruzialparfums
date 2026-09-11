export const IMPORT_ORDER_MAX_LINES = 40;
export const IMPORT_ORDER_MAX_QUANTITY = 99;

export const IMPORT_DELIVERY_METHOD = "private_delivery" as const;

export type ImportOrderRequestInput = {
  requestId: string;
  lines: Array<{
    offerId: string;
    offerUpdatedAt: string;
    quantity: number;
  }>;
  customer: {
    name: string;
    phone: string;
    district: string;
    address: string;
    note?: string;
  };
};

export type ImportOrderLineSnapshot = {
  offer_id: string;
  offer_updated_at: string;
  quantity: number;
};

export type ValidatedImportOrderRequest = {
  requestId: string;
  customer: {
    name: string;
    phone: string;
    district: string;
    address: string;
    note: string;
  };
  delivery: {
    district: string;
    address: string;
    note: string;
  };
  lines: ImportOrderLineSnapshot[];
};

export type ImportOrderValidationError = {
  ok: false;
  message: string;
  fieldErrors?: Partial<
    Record<
      | "name"
      | "phone"
      | "district"
      | "address"
      | "note"
      | "cart",
      string
    >
  >;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ISO_TS_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;

function normalizeText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max + 1) : "";
}

export function validateAndResolveImportOrder(
  input: unknown,
): ValidatedImportOrderRequest | ImportOrderValidationError {
  if (!input || typeof input !== "object") {
    return {
      ok: false,
      message: "No pudimos leer la solicitud. Revisa los datos e inténtalo otra vez.",
    };
  }

  const candidate = input as Partial<ImportOrderRequestInput>;

  if (
    typeof candidate.requestId !== "string" ||
    !UUID_PATTERN.test(candidate.requestId)
  ) {
    return {
      ok: false,
      message:
        "No pudimos identificar este intento. Recarga la página e inténtalo otra vez.",
    };
  }

  if (!Array.isArray(candidate.lines) || candidate.lines.length === 0) {
    return {
      ok: false,
      message: "Tu carrito está vacío.",
      fieldErrors: { cart: "Añade al menos un producto." },
    };
  }

  if (candidate.lines.length > IMPORT_ORDER_MAX_LINES) {
    return {
      ok: false,
      message:
        "Tu carrito tiene demasiadas líneas. Reduce la selección e inténtalo otra vez.",
      fieldErrors: { cart: `Máximo ${IMPORT_ORDER_MAX_LINES} líneas.` },
    };
  }

  const customer =
    candidate.customer && typeof candidate.customer === "object"
      ? (candidate.customer as Record<string, unknown>)
      : {};

  const name = normalizeText(customer.name, 120);
  const phone = normalizeText(customer.phone, 30);
  const district = normalizeText(customer.district, 120);
  const address = normalizeText(customer.address, 200);
  const note = normalizeText(customer.note ?? "", 500);

  const fieldErrors: ImportOrderValidationError["fieldErrors"] = {};

  if (name.length < 2 || name.length > 120)
    fieldErrors.name = "Ingresa un nombre válido de hasta 120 caracteres.";

  const phoneDigits = phone.replace(/\D/g, "");
  if (phoneDigits.length < 9 || phoneDigits.length > 15)
    fieldErrors.phone = "Ingresa un número de WhatsApp válido.";

  if (district.length < 2 || district.length > 120)
    fieldErrors.district = "Ingresa un distrito o ciudad válido.";

  if (address.length < 2 || address.length > 200)
    fieldErrors.address = "Ingresa una dirección de entrega.";

  if (note.length > 500)
    fieldErrors.note = "La nota no puede superar 500 caracteres.";

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, message: "Revisa los campos marcados.", fieldErrors };
  }

  const lines: ImportOrderLineSnapshot[] = [];
  const seen = new Set<string>();

  for (const rawLine of candidate.lines) {
    if (!rawLine || typeof rawLine !== "object") {
      return {
        ok: false,
        message: "Una línea del carrito no es válida.",
        fieldErrors: { cart: "Actualiza tu selección." },
      };
    }

    const line = rawLine as Record<string, unknown>;

    if (
      typeof line.offerId !== "string" ||
      !UUID_PATTERN.test(line.offerId)
    ) {
      return {
        ok: false,
        message: "No pudimos identificar un producto del carrito.",
        fieldErrors: { cart: "Actualiza tu selección." },
      };
    }

    if (
      typeof line.offerUpdatedAt !== "string" ||
      !ISO_TS_PATTERN.test(line.offerUpdatedAt)
    ) {
      return {
        ok: false,
        message: "Una referencia de producto no es válida.",
        fieldErrors: { cart: "Actualiza tu selección." },
      };
    }

    if (
      typeof line.quantity !== "number" ||
      !Number.isSafeInteger(line.quantity) ||
      line.quantity < 1 ||
      line.quantity > IMPORT_ORDER_MAX_QUANTITY
    ) {
      return {
        ok: false,
        message: "Una cantidad del carrito no es válida.",
        fieldErrors: {
          cart: `Usa cantidades entre 1 y ${IMPORT_ORDER_MAX_QUANTITY}.`,
        },
      };
    }

    if (seen.has(line.offerId)) {
      return {
        ok: false,
        message: "El carrito contiene una línea duplicada.",
        fieldErrors: { cart: "Actualiza tu selección." },
      };
    }
    seen.add(line.offerId);

    lines.push({
      offer_id: line.offerId,
      offer_updated_at: line.offerUpdatedAt,
      quantity: line.quantity,
    });
  }

  return {
    requestId: candidate.requestId,
    customer: { name, phone, district, address, note },
    delivery: { district, address, note },
    lines,
  };
}
