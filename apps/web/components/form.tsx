"use client";

import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@officehub/ui";

export const controlCls =
  "w-full rounded-oh-md border border-oh-border-strong bg-oh-surface px-3 py-2 text-oh-base text-oh-ink placeholder:text-oh-ink-muted min-h-10 " +
  "focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-oh-focus disabled:opacity-60";

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  /** Receives the generated id to put on the control. */
  children: (id: string, describedBy: string | undefined) => ReactNode;
  className?: string;
}) {
  const id = useId();
  const hintId = hint || error ? `${id}-hint` : undefined;
  return (
    <div className={cn("space-y-1", className)}>
      <label htmlFor={id} className="block text-oh-sm font-medium">
        {label}
      </label>
      {children(id, hintId)}
      {error ? (
        <p id={hintId} role="alert" className="text-oh-xs text-oh-danger-soft-fg">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-oh-xs text-oh-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlCls, className)} {...rest} />;
}
export function TextArea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(controlCls, "leading-relaxed", className)} {...rest} />;
}
export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(controlCls, className)} {...rest} />;
}
