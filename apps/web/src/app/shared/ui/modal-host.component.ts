import { NgComponentOutlet } from "@angular/common";
import { ChangeDetectionStrategy, Component, HostListener, inject } from "@angular/core";
import { IsumiModalEntry, IsumiModalService } from "./modal.service";

@Component({
  selector: "isumi-modal-host",
  standalone: true,
  imports: [NgComponentOutlet],
  template: `
    @for (entry of modal.entries(); track entry.id) {
      <div class="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4 backdrop-blur-sm" [style.z-index]="50 + $index">
        <button
          type="button"
          class="absolute inset-0 cursor-default"
          [attr.aria-label]="'Fechar ' + entry.ariaLabel"
          (click)="closeFromBackdrop(entry)"
        ></button>

        <section
          [class]="panelClasses(entry)"
          role="dialog"
          aria-modal="true"
          [attr.aria-label]="entry.ariaLabel"
          tabindex="-1"
        >
          <ng-container *ngComponentOutlet="entry.component; injector: entry.injector" />
        </section>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class IsumiModalHostComponent {
  readonly modal = inject(IsumiModalService);

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

  panelClasses(entry: IsumiModalEntry): string {
    return [
      "relative z-10 max-h-[min(720px,calc(100dvh_-_32px))] w-[min(100%,560px)] overflow-y-auto rounded-lg bg-popover p-5 text-popover-foreground shadow-2xl shadow-black/40 outline-none",
      entry.panelClass
    ].filter(Boolean).join(" ");
  }
}
