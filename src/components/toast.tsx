"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CircleAlert, CircleCheck } from "lucide-react";
import { cn } from "@/lib/shared/cn";

type ToastTone = "success" | "error";
interface ToastItem {
  id: number;
  tone: ToastTone;
  text: string;
}

interface ToastApi {
  success: (text: string) => void;
  error: (text: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const push = useCallback((tone: ToastTone, text: string) => {
    const id = nextId.current++;
    setItems((current) => [...current.slice(-2), { id, tone, text }]);
    window.setTimeout(
      () => setItems((current) => current.filter((item) => item.id !== id)),
      tone === "error" ? 6000 : 3500,
    );
  }, []);

  const value = useMemo<ToastApi>(
    () => ({
      success: (text) => push("success", text),
      error: (text) => push("error", text),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
      >
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              "animate-pop pointer-events-auto flex max-w-md items-start gap-2.5 rounded-xl border px-4 py-3 text-sm shadow-pop",
              "border-border bg-surface",
            )}
          >
            {item.tone === "success" ? (
              <CircleCheck size={18} className="mt-px shrink-0 text-success" />
            ) : (
              <CircleAlert size={18} className="mt-px shrink-0 text-danger" />
            )}
            <span>{item.text}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used inside <ToastProvider>");
  return value;
}
