import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'

export interface ToastItem {
  id: number;
  msg: string;
  type: 'success' | 'error';
}

interface ToastCtx {
  show: (msg: string, type: 'success' | 'error') => void;
}

const Ctx = createContext<ToastCtx>({ show: () => {} });
export const useToast = () => useContext(Ctx);

// Global showToast for non-component usage
let _show: ((msg: string, type: 'success' | 'error') => void) | null = null;
export function showToast(msg: string, type: 'success' | 'error') {
  if (_show) _show(msg, type);
}

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const show = useCallback((msg: string, type: 'success' | 'error') => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, msg, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  useEffect(() => {
    _show = show;
    return () => { _show = null; };
  }, [show]);

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      <div className="toast">
        {toasts.map((t) => (
          <div key={t.id} className={`toast-item ${t.type}`}>
            {t.msg}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
