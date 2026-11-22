"use client";
import { useEffect, useState } from "react";

type Vars<T extends string> = Record<T, string> & { dark: boolean };

/** Resolve CSS custom properties to concrete colors (SVG attributes and Leaflet need real values). */
export function useCssVars<T extends string>(names: readonly T[]): Vars<T> {
  const read = (): Vars<T> => {
    const vals: Record<string, string> = {};
    let dark = false;
    if (typeof window !== "undefined") {
      const cs = getComputedStyle(document.documentElement);
      for (const n of names) vals[n] = cs.getPropertyValue(`--${n}`).trim() || "#888";
      dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    } else {
      for (const n of names) vals[n] = "#888";
    }
    return { ...(vals as Record<T, string>), dark };
  };
  // first render matches the server (placeholder colors); real values arrive after mount
  const [vals, setVals] = useState<Vars<T>>(() => ({ ...(Object.fromEntries(names.map((n) => [n, "#888"])) as Record<T, string>), dark: false }));
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => setVals(read());
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return vals;
}
