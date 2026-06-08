import { NgComponentOutlet } from "@angular/common";
import { ChangeDetectionStrategy, Component, HostListener, inject } from "@angular/core";
import { IsumiModalEntry, IsumiModalService } from "./modal.service";

@Component({
  selector: "isumi-modal-host",
  standalone: true,
  imports: [NgComponentOutlet],
  template: `
    @for (entry of modal.entries(); track entry.id) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm max-sm:items-end max-sm:p-0" [style.z-index]="50 + $index">
        <button
          type="button"
          class="absolute inset-0 cursor-default"
          [attr.aria-label]="'Fechar ' + entry.ariaLabel"
          (click)="closeFromBackdrop(entry)"
        ></button>

        <section
          [class]="panelClasses(entry)"
          [style.transform]="panelTransform(entry)"
          role="dialog"
          aria-modal="true"
          [attr.aria-label]="entry.ariaLabel"
          tabindex="-1"
        >
          <button
            type="button"
            class="mx-auto mb-4 hidden h-5 w-42 touch-none cursor-grab place-items-center rounded-full active:cursor-grabbing max-sm:grid"
            aria-label="Fechar drawer"
            (click)="closeFromHandle(entry)"
            (pointerdown)="startDrawerDrag($event, entry)"
            (pointermove)="moveDrawerDrag($event, entry)"
            (pointerup)="finishDrawerDrag($event, entry)"
            (pointercancel)="cancelDrawerDrag($event, entry)"
          >
            <span class="h-1 w-24 rounded-full bg-border/80" aria-hidden="true"></span>
          </button>
          <ng-container *ngComponentOutlet="entry.component; injector: entry.injector" />
        </section>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class IsumiModalHostComponent {
  private readonly drawerTapSlop = 8;
  private dragStartY = 0;
  private suppressHandleClickEntryId: number | null = null;

  readonly modal = inject(IsumiModalService);
  draggingEntryId: number | null = null;
  restoringEntryId: number | null = null;
  dragOffsetY = 0;

  @HostListener("document:keydown.escape")
  closeFromEscape(): void {
    const top = this.modal.entries().at(-1);

    if (top?.closeOnEscape) {
      top.ref.close();
    }
  }

  closeFromBackdrop(entry: IsumiModalEntry): void {
    if (entry.closeOnBackdrop) {
      entry.ref.close();
    }
  }

  closeFromHandle(entry: IsumiModalEntry): void {
    if (!this.isMobileDrawer()) {
      return;
    }

    if (this.suppressHandleClickEntryId === entry.id) {
      this.suppressHandleClickEntryId = null;
      return;
    }

    entry.ref.close();
  }

  startDrawerDrag(event: PointerEvent, entry: IsumiModalEntry): void {
    if (!this.isMobileDrawer()) {
      return;
    }

    this.draggingEntryId = entry.id;
    this.restoringEntryId = null;
    this.dragStartY = event.clientY;
    this.dragOffsetY = 0;
    this.suppressHandleClickEntryId = null;
    event.currentTarget instanceof HTMLElement && event.currentTarget.setPointerCapture(event.pointerId);
  }

  moveDrawerDrag(event: PointerEvent, entry: IsumiModalEntry): void {
    if (this.draggingEntryId !== entry.id) {
      return;
    }

    this.dragOffsetY = Math.max(0, event.clientY - this.dragStartY);
  }

  finishDrawerDrag(event: PointerEvent, entry: IsumiModalEntry): void {
    if (this.draggingEntryId !== entry.id) {
      return;
    }

    event.currentTarget instanceof HTMLElement && event.currentTarget.releasePointerCapture(event.pointerId);
    this.draggingEntryId = null;

    if (this.dragOffsetY >= this.drawerCloseThreshold()) {
      entry.ref.close();
      return;
    }

    if (this.dragOffsetY > this.drawerTapSlop) {
      this.suppressHandleClickEntryId = entry.id;
    }

    this.restoreDrawer(entry);
  }

  cancelDrawerDrag(event: PointerEvent, entry: IsumiModalEntry): void {
    if (this.draggingEntryId !== entry.id) {
      return;
    }

    event.currentTarget instanceof HTMLElement && event.currentTarget.releasePointerCapture(event.pointerId);
    this.draggingEntryId = null;
    this.restoreDrawer(entry);
  }

  panelClasses(entry: IsumiModalEntry): string {
    return [
      "relative z-10 max-h-[min(720px,calc(100dvh_-_32px))] w-[min(100%,560px)] overscroll-contain overflow-y-auto rounded-lg bg-popover p-5 text-popover-foreground shadow-2xl shadow-black/40 outline-none max-sm:max-h-[calc(100dvh_-_24px)] max-sm:w-full max-sm:rounded-b-none max-sm:rounded-t-lg max-sm:border-t max-sm:border-border max-sm:p-4 max-sm:pb-[max(1rem,env(safe-area-inset-bottom))]",
      this.restoringEntryId === entry.id ? "transition-transform duration-200 ease-out" : "",
      entry.closing ? "pointer-events-none opacity-0 transition-[opacity,transform] duration-200 ease-in" : "",
      entry.panelClass
    ].filter(Boolean).join(" ");
  }

  panelTransform(entry: IsumiModalEntry): string | null {
    if (this.draggingEntryId === entry.id || this.restoringEntryId === entry.id) {
      return `translateY(${this.dragOffsetY}px)`;
    }

    if (entry.closing) {
      return this.isMobileDrawer() ? "translateY(100dvh)" : "translateY(8px) scale(0.96)";
    }

    return null;
  }

  private restoreDrawer(entry: IsumiModalEntry): void {
    this.restoringEntryId = entry.id;
    this.dragOffsetY = 0;

    setTimeout(() => {
      if (this.restoringEntryId === entry.id) {
        this.restoringEntryId = null;
      }

      if (this.suppressHandleClickEntryId === entry.id) {
        this.suppressHandleClickEntryId = null;
      }
    }, 200);
  }

  private isMobileDrawer(): boolean {
    return typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches;
  }

  private drawerCloseThreshold(): number {
    return typeof window === "undefined" ? 220 : Math.max(220, window.innerHeight * 0.5);
  }
}
