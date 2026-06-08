import { Injectable, computed, signal } from "@angular/core";
import { Observable, firstValueFrom, isObservable } from "rxjs";

export type IsumiToastType = "blank" | "success" | "error" | "loading";
export type IsumiToastPosition = "top-center" | "top-right" | "bottom-center" | "bottom-right";
export type IsumiToastMessage = string;

export interface IsumiToastOptions {
  id?: string;
  duration?: number;
  position?: IsumiToastPosition;
  ariaLive?: "assertive" | "polite";
}

export interface IsumiToast extends Required<Pick<IsumiToastOptions, "position" | "ariaLive">> {
  id: string;
  type: IsumiToastType;
  message: IsumiToastMessage;
  visible: boolean;
  createdAt: number;
}

export interface IsumiToastPromiseMessages<T> {
  loading: IsumiToastMessage;
  success: IsumiToastMessage | ((value: T) => IsumiToastMessage);
  error: IsumiToastMessage | ((error: unknown) => IsumiToastMessage);
}

const DEFAULT_DURATION_BY_TYPE: Record<IsumiToastType, number> = {
  blank: 4000,
  success: 4000,
  error: 5000,
  loading: Number.POSITIVE_INFINITY
};

@Injectable({ providedIn: "root" })
export class IsumiToastService {
  private readonly toastEntries = signal<IsumiToast[]>([]);
  private readonly dismissTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly removeTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private nextId = 1;

  readonly toasts = this.toastEntries.asReadonly();
  readonly hasToasts = computed(() => this.toastEntries().length > 0);

  show(message: IsumiToastMessage, options: IsumiToastOptions = {}): string {
    return this.upsert("blank", message, options);
  }

  success(message: IsumiToastMessage, options: IsumiToastOptions = {}): string {
    return this.upsert("success", message, options);
  }

  error(message: IsumiToastMessage, options: IsumiToastOptions = {}): string {
    return this.upsert("error", message, { ariaLive: "assertive", ...options });
  }

  loading(message: IsumiToastMessage, options: IsumiToastOptions = {}): string {
    return this.upsert("loading", message, options);
  }

  promise<T>(
    input: Promise<T> | Observable<T>,
    messages: IsumiToastPromiseMessages<T>,
    options: IsumiToastOptions = {}
  ): Promise<T> {
    const id = this.loading(messages.loading, options);
    const promise = isObservable(input) ? firstValueFrom(input) : input;

    return promise.then(
      (value) => {
        this.success(this.resolvePromiseMessage(messages.success, value), { ...options, id });
        return value;
      },
      (error: unknown) => {
        this.error(this.resolvePromiseMessage(messages.error, error), { ...options, id });
        throw error;
      }
    );
  }

  dismiss(id?: string): void {
    const ids = id ? [id] : this.toastEntries().map((toast) => toast.id);

    for (const toastId of ids) {
      this.clearDismissTimer(toastId);
      this.toastEntries.update((toasts) =>
        toasts.map((toast) => toast.id === toastId ? { ...toast, visible: false } : toast)
      );
      this.scheduleRemove(toastId);
    }
  }

  remove(id?: string): void {
    const ids = id ? [id] : this.toastEntries().map((toast) => toast.id);

    for (const toastId of ids) {
      this.clearDismissTimer(toastId);
      this.clearRemoveTimer(toastId);
    }

    this.toastEntries.update((toasts) => id ? toasts.filter((toast) => toast.id !== id) : []);
  }

  private upsert(type: IsumiToastType, message: IsumiToastMessage, options: IsumiToastOptions): string {
    const id = options.id || this.createId();
    const toast: IsumiToast = {
      id,
      type,
      message,
      visible: true,
      createdAt: Date.now(),
      position: options.position || "top-center",
      ariaLive: options.ariaLive || "polite"
    };

    this.clearRemoveTimer(id);
    this.toastEntries.update((toasts) => {
      const existingIndex = toasts.findIndex((entry) => entry.id === id);

      if (existingIndex === -1) {
        return [...toasts, toast];
      }

      const nextToasts = [...toasts];
      nextToasts[existingIndex] = { ...nextToasts[existingIndex], ...toast };
      return nextToasts;
    });
    this.scheduleDismiss(id, options.duration ?? DEFAULT_DURATION_BY_TYPE[type]);

    return id;
  }

  private scheduleDismiss(id: string, duration: number): void {
    this.clearDismissTimer(id);

    if (!Number.isFinite(duration) || duration < 0) {
      return;
    }

    this.dismissTimers.set(id, setTimeout(() => this.dismiss(id), duration));
  }

  private scheduleRemove(id: string): void {
    this.clearRemoveTimer(id);
    this.removeTimers.set(id, setTimeout(() => this.remove(id), 240));
  }

  private clearDismissTimer(id: string): void {
    const timer = this.dismissTimers.get(id);

    if (timer) {
      clearTimeout(timer);
      this.dismissTimers.delete(id);
    }
  }

  private clearRemoveTimer(id: string): void {
    const timer = this.removeTimers.get(id);

    if (timer) {
      clearTimeout(timer);
      this.removeTimers.delete(id);
    }
  }

  private createId(): string {
    return `toast-${this.nextId++}`;
  }

  private resolvePromiseMessage<T>(message: IsumiToastMessage | ((value: T) => IsumiToastMessage), value: T): IsumiToastMessage {
    return typeof message === "function" ? message(value) : message;
  }
}
