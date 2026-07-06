import { ShieldCheck } from "lucide-react";
import { cn } from "@certifychain/shared/lib/cn";

export interface AdminLogoProps {
  iconOnly?: boolean;
  className?: string;
}

/** CertifyChain brand lockup for the admin back-office (with an ADMIN tag). */
export function AdminLogo({ iconOnly = false, className }: AdminLogoProps) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <span className="relative grid place-items-center w-9 h-9 rounded-xl bg-linear-to-br from-indigo-600 to-indigo-500 text-white shadow-[0_8px_20px_-8px_rgba(79,70,229,0.7)]">
        <ShieldCheck className="w-5 h-5" strokeWidth={2.2} />
        <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-lime-500 ring-2 ring-white">
          <span className="absolute inset-0 rounded-full bg-lime-500 animate-pulse-ring" />
        </span>
      </span>
      {!iconOnly && (
        <span className="flex items-center gap-2">
          <span className="font-display font-bold text-ink text-lg tracking-tight">
            Certify<span className="grad-text-cool">Chain</span>
          </span>
          <span className="rounded-md bg-ink/8 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-soft">
            Admin
          </span>
        </span>
      )}
    </span>
  );
}
