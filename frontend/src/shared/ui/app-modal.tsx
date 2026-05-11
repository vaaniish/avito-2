import { ArrowLeft, X } from "lucide-react";
import type { ReactNode } from "react";

type AppModalSize = "md" | "lg" | "xl";

type AppModalProps = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onBack?: () => void;
  size?: AppModalSize;
  danger?: boolean;
  contentClassName?: string;
  panelClassName?: string;
  bodyClassName?: string;
  footerClassName?: string;
  ariaLabel?: string;
  modalKind?: string;
};

function joinClassNames(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function AppModal({
  open,
  onClose,
  title,
  subtitle,
  eyebrow,
  children,
  footer,
  onBack,
  size = "lg",
  danger = false,
  contentClassName,
  panelClassName,
  bodyClassName,
  footerClassName,
  ariaLabel,
  modalKind,
}: AppModalProps) {
  if (!open) return null;

  return (
    <div
      className={joinClassNames("app-modal", danger && "app-modal--danger")}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel ?? (typeof title === "string" ? title : undefined)}
      data-modal-kind={modalKind}
    >
      <div className="app-modal__frame">
        <div className={joinClassNames("app-modal__bar", !onBack && "app-modal__bar--end")}>
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="app-modal__back"
              aria-label="Назад"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="app-modal__close"
            aria-label="Закрыть"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div
          className={joinClassNames(
            "app-modal__panel",
            `app-modal__panel--${size}`,
            panelClassName,
          )}
        >
          <div className={joinClassNames("app-modal__content", contentClassName)}>
            <div className={joinClassNames("app-modal__body", bodyClassName)}>
              {eyebrow || title || subtitle ? (
                <header className="app-modal__hero">
                  {eyebrow ? <p className="app-modal__eyebrow">{eyebrow}</p> : null}
                  {title ? <h2>{title}</h2> : null}
                  {subtitle ? <p className="app-modal__subtitle">{subtitle}</p> : null}
                </header>
              ) : null}
              {children}
            </div>
          </div>

          {footer ? (
            <div className={joinClassNames("app-modal__footer", footerClassName)}>
              <div className="app-modal__actions">{footer}</div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
