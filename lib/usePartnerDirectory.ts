"use client";

import { useCallback, useEffect, useState } from "react";
import { PartnerInfo, setPartnerOverrides } from "@/lib/partners";

export interface DirectoryEntry {
  partnerId: string;
  name: string;
  mien: string;
  updatedAt?: string;
  updatedBy?: string | null;
}

/**
 * Tải danh mục partner người dùng đã nhập (DB) và áp lên partnerName/partnerMien.
 * `version` tăng sau mỗi lần tải để các useMemo phụ thuộc tính lại.
 */
export function usePartnerDirectory() {
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [dataIds, setDataIds] = useState<string[]>([]);
  const [version, setVersion] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/partner-directory", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { entries: DirectoryEntry[]; dataIds: string[] };
      const map: Record<string, PartnerInfo> = {};
      for (const e of json.entries) map[e.partnerId] = { name: e.name, mien: e.mien };
      setPartnerOverrides(map);
      setEntries(json.entries);
      setDataIds(json.dataIds);
      setVersion((v) => v + 1);
    } catch (e) {
      console.error("Không tải được danh mục partner:", e);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { entries, dataIds, version, loaded, reload };
}
