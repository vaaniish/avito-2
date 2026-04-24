import { useCallback, useEffect, useRef, useState } from "react";
import {
  ConfirmDialog,
  ToastViewport,
  type AppNotice,
  type AppNoticeTone,
} from "./feedback";

type ConfirmOptions = {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmTone?: "default" | "danger";
  confirmPhrase?: string;
  confirmHint?: string;
};

type ConfirmRequest = ConfirmOptions & {
  resolve: (confirmed: boolean) => void;
};

type NotificationBridge = {
  pushToast: (message: string, tone: AppNoticeTone) => void;
  pushConfirm: (request: ConfirmRequest) => void;
};

let bridge: NotificationBridge | null = null;

export function notifyInfo(message: string) {
  bridge?.pushToast(message, "info");
}

export function notifySuccess(message: string) {
  bridge?.pushToast(message, "success");
}

export function notifyError(message: string) {
  bridge?.pushToast(message, "error");
}

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (!bridge) {
      resolve(false);
      return;
    }
    bridge.pushConfirm({ ...options, resolve });
  });
}

export function NotificationHost() {
  const [notices, setNotices] = useState<AppNotice[]>([]);
  const [queue, setQueue] = useState<ConfirmRequest[]>([]);
  const [activeConfirm, setActiveConfirm] = useState<ConfirmRequest | null>(
    null,
  );
  const timersRef = useRef<number[]>([]);
  const nextNoticeIdRef = useRef(1);

  const closeNotice = useCallback((id: number) => {
    setNotices((prev) => prev.filter((notice) => notice.id !== id));
  }, []);

  const pushToast = useCallback(
    (message: string, tone: AppNoticeTone) => {
      if (!message.trim()) return;
      const id = nextNoticeIdRef.current++;
      setNotices((prev) => [...prev, { id, message, tone }]);
      const timer = window.setTimeout(() => {
        closeNotice(id);
      }, 4500);
      timersRef.current.push(timer);
    },
    [closeNotice],
  );

  const pushConfirm = useCallback((request: ConfirmRequest) => {
    setQueue((prev) => [...prev, request]);
  }, []);

  useEffect(() => {
    bridge = { pushToast, pushConfirm };
    return () => {
      if (bridge?.pushToast === pushToast) {
        bridge = null;
      }
    };
  }, [pushConfirm, pushToast]);

  useEffect(() => {
    return () => {
      for (const timer of timersRef.current) {
        window.clearTimeout(timer);
      }
      timersRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (activeConfirm || queue.length === 0) return;
    setActiveConfirm(queue[0]);
    setQueue((prev) => prev.slice(1));
  }, [activeConfirm, queue]);

  const closeConfirm = useCallback((confirmed: boolean) => {
    setActiveConfirm((prev) => {
      prev?.resolve(confirmed);
      return null;
    });
  }, []);

  return (
    <>
      <ToastViewport notices={notices} onClose={closeNotice} />
      <ConfirmDialog
        open={Boolean(activeConfirm)}
        title={activeConfirm?.title ?? ""}
        description={activeConfirm?.description ?? ""}
        confirmLabel={activeConfirm?.confirmLabel ?? "Подтвердить"}
        cancelLabel={activeConfirm?.cancelLabel ?? "Отмена"}
        confirmTone={activeConfirm?.confirmTone ?? "default"}
        confirmPhrase={activeConfirm?.confirmPhrase}
        confirmHint={activeConfirm?.confirmHint}
        onCancel={() => closeConfirm(false)}
        onConfirm={() => closeConfirm(true)}
      />
    </>
  );
}
