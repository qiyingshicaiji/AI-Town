import { useState, useCallback, createContext, useContext, type ReactNode } from 'react';

interface ToastItem {
  id: number;
  message: string;
  type: 'info' | 'success' | 'error';
  onClick?: () => void;
}

interface ToastContextValue {
  addToast: (message: string, type?: ToastItem['type'], onClick?: () => void) => void;
}

const ToastContext = createContext<ToastContextValue>({ addToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

let _nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((message: string, type: ToastItem['type'] = 'info', onClick?: () => void) => {
    const id = ++_nextId;
    setToasts((prev) => [...prev.slice(-4), { id, message, type, onClick }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            onClick={() => { t.onClick?.(); removeToast(t.id); }}
            className={`pointer-events-auto px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium cursor-pointer transition-all animate-slide-in ${
              t.type === 'error' ? 'bg-red-500 text-white' :
              t.type === 'success' ? 'bg-green-500 text-white' :
              'bg-gray-800 text-white'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
