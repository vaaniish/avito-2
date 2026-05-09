import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { valueOrEmpty } from "./sellers.utils";

export function DetailRow({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2.5">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 break-words text-sm text-slate-900">{valueOrEmpty(value)}</div>
    </div>
  );
}

export function DetailLinkList({ label, urls }: { label: string; urls?: string[] }) {
  const safeUrls = urls?.filter(Boolean) ?? [];
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2.5">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      {safeUrls.length === 0 ? (
        <div className="mt-1 text-sm text-slate-900">Не указано</div>
      ) : (
        <div className="mt-2 space-y-1">
          {safeUrls.map((url) => (
            <a key={url} href={url} target="_blank" rel="noreferrer" className="flex items-center gap-1 break-all text-sm text-blue-700 underline">
              {url}
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <h3 className="mb-2 text-sm font-semibold text-slate-900">{title}</h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{children}</div>
    </section>
  );
}
