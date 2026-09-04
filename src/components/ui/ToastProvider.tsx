"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

type ToastType =
  | "success"
  | "error"
  | "info";

type Toast = {
  id: number;
  type: ToastType;
  message: string;
  duration: number;
};

type ToastContextValue = {
  showToast: (
    type: ToastType,
    message: string,
    duration?: number,
  ) => void;
};

const ToastContext =
  createContext<ToastContextValue | null>(
    null,
  );

function ToastCard({
  toast,
  close,
}: {
  toast: Toast;
  close: () => void;
}) {
  useEffect(() => {
    const timer =
      window.setTimeout(
        close,
        toast.duration,
      );

    return () =>
      window.clearTimeout(timer);
  }, [
    close,
    toast.duration,
  ]);

  const style =
    toast.type === "success"
      ? "border-green-200 bg-green-600 text-white"
      : toast.type === "error"
        ? "border-red-200 bg-red-600 text-white"
        : "border-blue-200 bg-blue-600 text-white";

  const icon =
    toast.type === "success"
      ? "✓"
      : toast.type === "error"
        ? "!"
        : "i";

  return (
    <div
      role={
        toast.type === "error"
          ? "alert"
          : "status"
      }
      className={`toast-enter pointer-events-auto flex items-start gap-3 rounded-2xl border p-4 shadow-xl ${style}`}
    >
      <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/20 font-bold">
        {icon}
      </div>

      <p className="min-w-0 flex-1 text-sm font-medium leading-5">
        {toast.message}
      </p>

      <button
        type="button"
        onClick={close}
        className="shrink-0 rounded-lg px-2 text-lg leading-none text-white/80 hover:bg-white/10"
        aria-label="Tutup notifikasi"
      >
        ×
      </button>
    </div>
  );
}

export function ToastProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [toasts, setToasts] =
    useState<Toast[]>([]);

  const nextId =
    useRef(1);

  const showToast =
    useCallback(
      (
        type: ToastType,
        message: string,
        duration = 4500,
      ) => {
        if (!message.trim()) {
          return;
        }

        const id =
          nextId.current++;

        setToasts(
          (current) => [
            ...current.slice(-2),
            {
              id,
              type,
              message,
              duration,
            },
          ],
        );
      },
      [],
    );

  const removeToast =
    useCallback(
      (id: number) => {
        setToasts(
          (current) =>
            current.filter(
              (item) =>
                item.id !== id,
            ),
        );
      },
      [],
    );

  return (
    <ToastContext.Provider
      value={{
        showToast,
      }}
    >
      {children}

      <div
        aria-live="polite"
        className="pointer-events-none fixed left-3 right-3 top-3 z-[100] space-y-2 sm:left-auto sm:right-5 sm:top-5 sm:w-[380px]"
      >
        {toasts.map(
          (toast) => (
            <ToastCard
              key={toast.id}
              toast={toast}
              close={() =>
                removeToast(
                  toast.id,
                )
              }
            />
          ),
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context =
    useContext(
      ToastContext,
    );

  if (!context) {
    throw new Error(
      "useToast harus berada di dalam ToastProvider.",
    );
  }

  return context;
}

/*
 * Bridge supaya kode lama
 * setError(...) / setSuccess(...)
 * tidak perlu ditulis ulang.
 */
export function useToastFeedback() {
  const {
    showToast,
  } = useToast();

  const setError =
    useCallback(
      (message: string) => {
        if (message) {
          showToast(
            "error",
            message,
            5500,
          );
        }
      },
      [showToast],
    );

  const setSuccess =
    useCallback(
      (message: string) => {
        if (message) {
          showToast(
            "success",
            message,
            4000,
          );
        }
      },
      [showToast],
    );

  return {
    setError,
    setSuccess,
  };
}