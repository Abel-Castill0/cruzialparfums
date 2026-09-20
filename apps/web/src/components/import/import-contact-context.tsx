"use client";

import { createContext, useContext } from "react";
import type { BusinessUnitSettings } from "@/domains/platform/settings";

export type ImportContactContextValue = BusinessUnitSettings | null;

const ImportContactContext = createContext<ImportContactContextValue>(null);

export function ImportContactProvider({
  contact,
  children,
}: {
  contact: ImportContactContextValue;
  children: React.ReactNode;
}) {
  return (
    <ImportContactContext.Provider value={contact}>
      {children}
    </ImportContactContext.Provider>
  );
}

export function useImportContact(): ImportContactContextValue {
  return useContext(ImportContactContext);
}
