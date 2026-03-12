import React from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";

type ErrorBoundaryState = {
  errorMessage: string | null;
};

export class AppErrorBoundary extends React.Component<
  React.PropsWithChildren,
  ErrorBoundaryState
> {
  public state: ErrorBoundaryState = {
    errorMessage: null,
  };

  componentDidCatch(error: Error) {
    if (this.isResizeObserverNoise(error.message)) {
      return;
    }
    this.setState({
      errorMessage: error.message || "Неизвестная ошибка",
    });
  }

  componentDidMount() {
    window.addEventListener("error", this.handleWindowError);
    window.addEventListener("unhandledrejection", this.handleUnhandledRejection);
  }

  componentWillUnmount() {
    window.removeEventListener("error", this.handleWindowError);
    window.removeEventListener("unhandledrejection", this.handleUnhandledRejection);
  }

  private handleWindowError = (event: ErrorEvent) => {
    const message = event.error?.message || event.message || "";
    if (this.isResizeObserverNoise(message)) {
      event.preventDefault();
      return;
    }

    this.setState({
      errorMessage: message || "Ошибка приложения",
    });
  };

  private handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === "string"
        ? reason
        : "Необработанное исключение";

    if (this.isResizeObserverNoise(message)) {
      event.preventDefault();
      return;
    }

    this.setState({ errorMessage: message });
  };

  private isResizeObserverNoise(message: string | null | undefined): boolean {
    const normalized = String(message ?? "");
    return (
      normalized.includes("ResizeObserver loop completed with undelivered notifications") ||
      normalized.includes("ResizeObserver loop limit exceeded")
    );
  }

  private handleReset = () => {
    this.setState({ errorMessage: null });
  };

  render() {
    if (!this.state.errorMessage) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen app-shell flex items-center justify-center p-4">
        <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 shadow-xl">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-red-600">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Что-то пошло не так</h1>
              <p className="text-sm text-slate-500">Ошибка в интерфейсе приложения</p>
            </div>
          </div>

          <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
            {this.state.errorMessage}
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              onClick={this.handleReset}
              className="btn-secondary flex items-center justify-center gap-2 px-4 py-2.5"
            >
              <RefreshCcw className="h-4 w-4" />
              Попробовать снова
            </button>
            <button
              onClick={() => window.location.reload()}
              className="btn-primary px-4 py-2.5"
            >
              Перезагрузить страницу
            </button>
          </div>
        </div>
      </div>
    );
  }
}
