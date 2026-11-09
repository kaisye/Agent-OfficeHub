"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@officehub/ui";

/**
 * Plays a short pop + soft glow on its children whenever `value` changes after the first render
 * (e.g. a teammate's presence). The CSS (`.oh-pulse`) is disabled under prefers-reduced-motion.
 */
export function PulseOnChange({ value, children, className }: { value: string; children: ReactNode; className?: string }) {
  const prev = useRef(value);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (prev.current === value) return;
    prev.current = value;
    setN((x) => x + 1);
    const t = setTimeout(() => setN(0), 1100);
    return () => clearTimeout(t);
  }, [value]);
  return (
    <div data-pulse={n > 0 ? "on" : "off"} className={cn(n > 0 && "oh-pulse", className)}>
      {children}
    </div>
  );
}
