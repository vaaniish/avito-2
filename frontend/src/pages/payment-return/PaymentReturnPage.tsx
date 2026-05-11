import { useEffect } from "react";

const PAYMENT_RETURN_EVENT_KEY = "ecomm_payment_returned";
const PAYMENT_RETURN_CHANNEL = "ecomm-payment-channel";

export function PaymentReturnPage() {
  useEffect(() => {
    try {
      localStorage.setItem(PAYMENT_RETURN_EVENT_KEY, String(Date.now()));
    } catch {
      // no-op
    }

    try {
      const channel = new BroadcastChannel(PAYMENT_RETURN_CHANNEL);
      channel.postMessage({ type: "payment_returned" });
      channel.close();
    } catch {
      // no-op
    }

    const timer = window.setTimeout(() => {
      window.close();
    }, 250);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center">
        <h1 className="text-lg font-semibold text-slate-900">Возвращаем вас в магазин</h1>
        <p className="mt-2 text-sm text-slate-600">
          Если вкладка не закрылась автоматически, нажмите кнопку ниже.
        </p>
        <button
          type="button"
          onClick={() => window.location.replace("/order-complete")}
          className="btn-primary mt-5 w-full py-3 text-sm"
        >
          Вернуться в магазин
        </button>
      </div>
    </main>
  );
}
