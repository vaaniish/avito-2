import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { createPortal } from "react-dom";

export type AppNoticeTone = "success" | "error" | "info";

export type AppNotice = {
  id: number;
  message: string;
  tone: AppNoticeTone;
};

type ToastViewportProps = {
  notices: AppNotice[];
  onClose: (id: number) => void;
};

export function ToastViewport({ notices, onClose }: ToastViewportProps) {
  if (notices.length === 0) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="pointer-events-none fixed right-4 top-[calc(var(--header-height,84px)+0.75rem)] z-[80] flex w-full max-w-md flex-col gap-2">
      {notices.map((notice) => {
        const style =
          notice.tone === "success"
            ? "border-green-200 bg-green-50 text-green-800"
            : notice.tone === "error"
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-blue-200 bg-blue-50 text-blue-800";
        const Icon =
          notice.tone === "success"
            ? CheckCircle2
            : notice.tone === "error"
              ? AlertCircle
              : Info;
        return (
          <div
            key={notice.id}
            className={`pointer-events-auto flex items-start gap-2 rounded-xl border px-3 py-2 shadow-sm ${style}`}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="min-w-0 flex-1 text-sm leading-5">{notice.message}</p>
            <button
              type="button"
              onClick={() => onClose(notice.id)}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-current/70 transition hover:bg-black/5 hover:text-current"
              aria-label="Закрыть уведомление"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  confirmTone?: "default" | "danger";
  confirmPhrase?: string;
  confirmHint?: string;
  isBusy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Отмена",
  confirmTone = "default",
  confirmPhrase,
  confirmHint,
  isBusy = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const [value, setValue] = useState("");

  useEffect(() => {
    if (!open) {
      setValue("");
    }
  }, [open]);

  const normalizedNeedle = useMemo(
    () => (confirmPhrase ? confirmPhrase.trim().toLocaleUpperCase("ru-RU") : ""),
    [confirmPhrase],
  );
  const normalizedInput = value.trim().toLocaleUpperCase("ru-RU");
  const isPhraseValid = !normalizedNeedle || normalizedInput === normalizedNeedle;
  const isConfirmDisabled = isBusy || !isPhraseValid;

  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[90]">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" />
      <div
        className="absolute overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        style={{
          width: "min(96vw, 560px)",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          maxHeight: "calc(100vh - 32px)",
        }}
      >
          <div
            className="border-b border-slate-200"
            style={{ padding: "16px 20px 14px" }}
          >
            <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          </div>
          <div
            className="space-y-3 overflow-y-auto"
            style={{ padding: "14px 20px 16px" }}
          >
            <p className="text-sm text-slate-600">{description}</p>
            {confirmPhrase && (
              <div className="space-y-2">
                <p className="text-xs text-slate-500">
                  {confirmHint ?? `Для подтверждения введите «${confirmPhrase}».`}
                </p>
                <input
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  className="field-control"
                  placeholder={confirmPhrase}
                  autoFocus
                />
              </div>
            )}
          </div>
          <div
            className="flex items-center justify-end gap-2 border-t border-slate-200"
            style={{ padding: "12px 20px 14px" }}
          >
            <button type="button" onClick={onCancel} className="btn-secondary px-4 py-2" disabled={isBusy}>
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isConfirmDisabled}
              className={
                confirmTone === "danger"
                  ? "inline-flex items-center rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-60"
                  : "btn-primary px-4 py-2 disabled:opacity-60"
              }
            >
              {confirmLabel}
            </button>
          </div>
      </div>
    </div>,
    document.body,
  );
}
