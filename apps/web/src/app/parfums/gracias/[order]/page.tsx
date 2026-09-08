import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OrderHandoff } from "@/components/parfums/checkout/order-handoff";
import { PARFUMS_SETTINGS } from "@/domains/platform/settings";

export const metadata: Metadata = {
  title: "Solicitud registrada",
  description: "Continúa la coordinación de tu solicitud por WhatsApp.",
  robots: { index: false, follow: false },
};

const ORDER_NUMBER_PATTERN = /^CRP-[0-9]{8}-[A-F0-9]{12}$/;

export default async function ParfumsOrderThankYouPage({
  params,
}: {
  params: Promise<{ order: string }>;
}) {
  const { order } = await params;
  if (!ORDER_NUMBER_PATTERN.test(order)) notFound();

  return (
    <main>
      <OrderHandoff orderNumber={order} whatsappNumber={PARFUMS_SETTINGS.whatsappNumber} />
    </main>
  );
}
