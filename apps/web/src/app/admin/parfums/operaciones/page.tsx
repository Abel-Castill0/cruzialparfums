import type { Metadata } from "next";
import { OperationsPage } from "@/components/admin/operations-page";
export const metadata: Metadata = { title: "Operaciones Parfums" };
export const dynamic="force-dynamic";
export default function Page(){return <OperationsPage unit="parfums"/>;}
