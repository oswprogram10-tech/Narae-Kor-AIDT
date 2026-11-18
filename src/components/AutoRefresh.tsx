"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** 서버에서 그린 화면을 몇 초마다 새로 불러온다(교사 현황). */
export function AutoRefresh({ seconds = 8 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
