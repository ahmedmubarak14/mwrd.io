import { create } from 'zustand';
import { ToastType } from '../components/ui/Toast';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastStoreState {
  toasts: Toast[];
  addToast: (type: ToastType, message: string, duration?: number) => void;
  removeToast: (id: string) => void;
}

const useToastStore = create<ToastStoreState>((set) => ({
  toasts: [],
  addToast: (type, message, duration = 5000) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    set((state) => ({
      toasts: [...state.toasts, { id, type, message, duration }],
    }));
  },
  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    }));
  },
}));

export const useToast = () => {
  const toasts = useToastStore((state) => state.toasts);
  const addToast = useToastStore((state) => state.addToast);
  const removeToast = useToastStore((state) => state.removeToast);

  const success = (message: string, duration?: number) => {
    addToast('success', message, duration);
  };

  const error = (message: string, duration?: number) => {
    addToast('error', message, duration);
  };

  const warning = (message: string, duration?: number) => {
    addToast('warning', message, duration);
  };

  const info = (message: string, duration?: number) => {
    addToast('info', message, duration);
  };

  return {
    toasts,
    removeToast,
    success,
    error,
    warning,
    info,
  };
};
