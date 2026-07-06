import { DOCUMENT } from "@angular/common";
import { Injectable, InjectionToken, Injector, Signal, Type, computed, inject, signal } from "@angular/core";
import { Observable, ReplaySubject } from "rxjs";

export const ISUMI_MODAL_DATA = new InjectionToken<unknown>("ISUMI_MODAL_DATA");
export const ISUMI_MODAL_REF = new InjectionToken<IsumiModalRef<unknown, unknown>>("ISUMI_MODAL_REF");

export function injectIsumiModalData<TData>(): TData | undefined {
  return inject(ISUMI_MODAL_DATA) as TData | undefined;
}

export function injectIsumiModalRef<TData = unknown, TResult = unknown>(): IsumiModalRef<TData, TResult> {
  return inject(ISUMI_MODAL_REF) as IsumiModalRef<TData, TResult>;
}

export interface IsumiModalConfig<TData = unknown, TResult = unknown> {
  data?: TData;
  ariaLabel?: string;
  panelClass?: string;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  onSubmit?: (result: TResult) => Promise<void>;
}

export interface IsumiModalEntry {
  id: number;
  component: Type<unknown>;
  injector: Injector;
  ariaLabel: string;
  panelClass: string;
  closeOnBackdrop: boolean;
  closeOnEscape: boolean;
  closing: boolean;
  ref: IsumiModalRef<unknown, unknown>;
}

export class IsumiModalRef<TData = unknown, TResult = unknown> {
  private readonly closedSubject = new ReplaySubject<TResult | undefined>(1);
  private readonly processingState = signal(false);
  private closeHandler: ((result?: TResult) => void) | null = null;
  private readonly submitHandler: ((result: TResult) => Promise<void>) | null;

  readonly data: TData | undefined;
  readonly closed: Promise<TResult | undefined>;
  readonly processing: Signal<boolean> = this.processingState.asReadonly();

  constructor(data: TData | undefined, submitHandler?: (result: TResult) => Promise<void>) {
    this.data = data;
    this.submitHandler = submitHandler || null;
    this.closed = new Promise((resolve) => {
      this.afterClosed().subscribe((result) => resolve(result));
    });
  }

  afterClosed(): Observable<TResult | undefined> {
    return this.closedSubject.asObservable();
  }

  close(result?: TResult): void {
    if (this.processingState()) {
      return;
    }

    this.closeHandler?.(result);
  }

  async submit(result: TResult): Promise<void> {
    if (this.processingState()) {
      return;
    }

    if (!this.submitHandler) {
      this.close(result);
      return;
    }

    this.processingState.set(true);

    try {
      await this.submitHandler(result);
      this.processingState.set(false);
      this.close(result);
    } catch {
      this.processingState.set(false);
    }
  }

  attachCloseHandler(closeHandler: (result?: TResult) => void): void {
    this.closeHandler = closeHandler;
  }

  finish(result?: TResult): void {
    this.closeHandler = null;
    this.closedSubject.next(result);
    this.closedSubject.complete();
  }
}

@Injectable({ providedIn: "root" })
export class IsumiModalService {
  private readonly closeAnimationMs = 220;
  private readonly document = inject(DOCUMENT);
  private readonly parentInjector = inject(Injector);
  private readonly modalEntries = signal<IsumiModalEntry[]>([]);
  private nextId = 1;
  private scrollLockState: {
    scrollY: number;
    bodyOverflow: string;
    bodyPaddingRight: string;
    bodyPosition: string;
    bodyTop: string;
    bodyWidth: string;
    documentOverflow: string;
  } | null = null;

  readonly entries = this.modalEntries.asReadonly();
  readonly hasOpenModals = computed(() => this.modalEntries().length > 0);

  open<TComponent, TData = unknown, TResult = unknown>(
    component: Type<TComponent>,
    config: IsumiModalConfig<TData, TResult> = {}
  ): IsumiModalRef<TData, TResult> {
    const id = this.nextId++;
    const ref = new IsumiModalRef<TData, TResult>(config.data, config.onSubmit);
    const injector = Injector.create({
      parent: this.parentInjector,
      providers: [
        { provide: ISUMI_MODAL_DATA, useValue: config.data },
        { provide: ISUMI_MODAL_REF, useValue: ref }
      ]
    });

    ref.attachCloseHandler((result) => {
      let startedClosing = false;

      this.modalEntries.update((entries) =>
        entries.map((entry) => {
          if (entry.id !== id || entry.closing) {
            return entry;
          }

          startedClosing = true;
          return { ...entry, closing: true };
        })
      );

      if (!startedClosing) {
        return;
      }

      setTimeout(() => {
        this.modalEntries.update((entries) => {
          const nextEntries = entries.filter((entry) => entry.id !== id);

          if (nextEntries.length === 0) {
            this.unlockPageScroll();
          }

          return nextEntries;
        });
        ref.finish(result);
      }, this.closeAnimationMs);
    });

    if (this.modalEntries().length === 0) {
      this.lockPageScroll();
    }

    this.modalEntries.update((entries) => [
      ...entries,
      {
        id,
        component,
        injector,
        ariaLabel: config.ariaLabel || "Modal",
        panelClass: config.panelClass || "",
        closeOnBackdrop: config.closeOnBackdrop ?? true,
        closeOnEscape: config.closeOnEscape ?? true,
        closing: false,
        ref: ref as IsumiModalRef<unknown, unknown>
      }
    ]);

    return ref;
  }

  closeTop(result?: unknown): void {
    const top = this.modalEntries().at(-1);
    top?.ref.close(result);
  }

  closeAll(result?: unknown): void {
    for (const entry of [...this.modalEntries()].reverse()) {
      entry.ref.close(result);
    }
  }

  private lockPageScroll(): void {
    if (this.scrollLockState) {
      return;
    }

    const defaultView = this.document.defaultView;

    if (!defaultView) {
      return;
    }

    const body = this.document.body;
    const documentElement = this.document.documentElement;
    const scrollY = defaultView.scrollY;
    const scrollbarWidth = Math.max(0, defaultView.innerWidth - documentElement.clientWidth);

    this.scrollLockState = {
      scrollY,
      bodyOverflow: body.style.overflow,
      bodyPaddingRight: body.style.paddingRight,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyWidth: body.style.width,
      documentOverflow: documentElement.style.overflow
    };

    documentElement.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";

    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }
  }

  private unlockPageScroll(): void {
    const state = this.scrollLockState;

    if (!state) {
      return;
    }

    const defaultView = this.document.defaultView;
    const body = this.document.body;
    const documentElement = this.document.documentElement;

    body.style.overflow = state.bodyOverflow;
    body.style.paddingRight = state.bodyPaddingRight;
    body.style.position = state.bodyPosition;
    body.style.top = state.bodyTop;
    body.style.width = state.bodyWidth;
    documentElement.style.overflow = state.documentOverflow;
    this.scrollLockState = null;

    defaultView?.scrollTo(0, state.scrollY);
  }
}
