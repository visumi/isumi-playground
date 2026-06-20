import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core";
import { LucideCheck, LucideLoaderCircle, LucideX } from "@lucide/angular";
import { IsumiToast, IsumiToastPosition, IsumiToastService, IsumiToastType } from "./toast.service";

const POSITIONS: IsumiToastPosition[] = ["top-center", "top-right", "bottom-center", "bottom-right"];

@Component({
  selector: "isumi-toast-host",
  standalone: true,
  imports: [LucideCheck, LucideLoaderCircle, LucideX],
  template: `
    @for (position of positions; track position) {
      @if (toastsByPosition()[position].length) {
        <section
          [class]="containerClasses(position)"
          [attr.aria-live]="liveMode(position)"
          aria-atomic="false"
          aria-relevant="additions text"
        >
          @for (toast of toastsByPosition()[position]; track toast.id) {
            <output [class]="toastClasses(toast)" [attr.role]="toast.type === 'error' ? 'alert' : 'status'">
              <span [class]="iconClasses(toast.type)" aria-hidden="true">
                @switch (toast.type) {
                  @case ("success") {
                    <svg icon lucideCheck class="size-4 stroke-3" aria-hidden="true"></svg>
                  }
                  @case ("error") {
                    <svg icon lucideX class="size-4 stroke-[2.5]" aria-hidden="true"></svg>
                  }
                  @case ("loading") {
                    <svg icon lucideLoaderCircle class="size-4 animate-spin" aria-hidden="true"></svg>
                  }
                  @default {
                    <span class="size-2 rounded-full bg-current"></span>
                  }
                }
              </span>

              <span class="min-w-0 flex-1 text-wrap text-sm font-bold leading-5 break-words">{{ toast.message }}</span>

              @if (toast.type !== "loading") {
                <button
                  type="button"
                  class="grid size-7 place-items-center rounded-sm text-muted-foreground transition-colors cursor-pointer hover:bg-secondary hover:text-foreground"
                  aria-label="Fechar notificacao"
                  (click)="toastService.dismiss(toast.id)"
                >
                  <svg icon lucideX class="size-4" aria-hidden="true"></svg>
                </button>
              }
            </output>
          }
        </section>
      }
    }
  `,
  styles: [`
    :host {
      pointer-events: none;
    }

    output {
      pointer-events: auto;
    }

    .isumi-toast {
      opacity: 1;
      transform: translateY(0) scale(1);
      transform-origin: top center;
    }

    .isumi-toast-enter {
      animation: isumi-toast-enter 220ms cubic-bezier(.21, 1.02, .73, 1) both;
    }

    .isumi-toast-exit {
      animation: isumi-toast-exit 220ms ease-in both;
    }

    .isumi-toast-bottom {
      transform-origin: bottom center;
    }

    .isumi-toast-bottom.isumi-toast-enter {
      animation-name: isumi-toast-enter-bottom;
    }

    .isumi-toast-bottom.isumi-toast-exit {
      animation-name: isumi-toast-exit-bottom;
    }

    @keyframes isumi-toast-enter {
      from {
        opacity: 0;
        transform: translateY(-10px) scale(.98);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    @keyframes isumi-toast-enter-bottom {
      from {
        opacity: 0;
        transform: translateY(10px) scale(.98);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    @keyframes isumi-toast-exit {
      from {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
      to {
        opacity: 0;
        transform: translateY(-8px) scale(.98);
      }
    }

    @keyframes isumi-toast-exit-bottom {
      from {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
      to {
        opacity: 0;
        transform: translateY(8px) scale(.98);
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class IsumiToastHostComponent {
  readonly toastService = inject(IsumiToastService);
  readonly positions = POSITIONS;
  readonly toastsByPosition = computed(() => {
    const grouped: Record<IsumiToastPosition, IsumiToast[]> = {
      "top-center": [],
      "top-right": [],
      "bottom-center": [],
      "bottom-right": []
    };

    for (const toast of this.toastService.toasts()) {
      grouped[toast.position].push(toast);
    }

    return grouped;
  });

  containerClasses(position: IsumiToastPosition): string {
    const base = "fixed z-[60] grid w-[min(calc(100vw_-_1.5rem),420px)] max-w-[calc(100vw_-_1.5rem)] gap-2";
    const positionClasses: Record<IsumiToastPosition, string> = {
      "top-center": "left-1/2 top-[max(0.75rem,env(safe-area-inset-top))] -translate-x-1/2",
      "top-right": "right-3 top-[max(0.75rem,env(safe-area-inset-top))]",
      "bottom-center": "bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2",
      "bottom-right": "bottom-[max(0.75rem,env(safe-area-inset-bottom))] right-3"
    };

    return `${base} ${positionClasses[position]}`;
  }

  toastClasses(toast: IsumiToast): string {
    const placementClass = toast.position.startsWith("bottom") ? "isumi-toast-bottom" : "";
    const visibilityClass = toast.visible ? "isumi-toast-enter" : "isumi-toast-exit";

    return [
      "isumi-toast",
      placementClass,
      visibilityClass,
      "flex min-h-12 items-center gap-3 rounded-lg bg-secondary px-3 py-2.5 text-popover-foreground shadow-2xl shadow-black/35 backdrop-blur-md"
    ].filter(Boolean).join(" ");
  }

  iconClasses(type: IsumiToastType): string {
    const typeClasses: Record<IsumiToastType, string> = {
      blank: "bg-secondary text-muted-foreground",
      success: "bg-emerald-500/15 text-emerald-300",
      error: "bg-destructive/15 text-red-200",
      loading: "bg-secondary text-muted-foreground"
    };

    return `grid size-7 shrink-0 place-items-center rounded-full ${typeClasses[type]}`;
  }

  liveMode(position: IsumiToastPosition): "assertive" | "polite" {
    return this.toastsByPosition()[position].some((toast) => toast.ariaLive === "assertive") ? "assertive" : "polite";
  }
}
