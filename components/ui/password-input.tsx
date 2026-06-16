"use client";

import { useState, type InputHTMLAttributes } from "react";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

/** A password field with a show/hide eye toggle. Drop-in for <Input type="password">. */
export function PasswordInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={show ? "text" : "password"} className={cn("pr-10", className)} />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-faint transition-colors hover:text-content focus:outline-none"
        aria-label={show ? "Hide password" : "Show password"}
        tabIndex={-1}
      >
        <Icon name={show ? "eyeOff" : "eye"} className="size-4" />
      </button>
    </div>
  );
}
