import { ChangeDetectionStrategy, Component, booleanAttribute, computed, input, output } from "@angular/core";

@Component({
  selector: "isumi-switch",
  standalone: true,
  template: `
    <label [class]="labelClasses()">
      <span class="min-w-0">
        <ng-content />
      </span>
      <span class="relative inline-grid h-6 w-11 shrink-0 items-center rounded-full transition-colors" [class]="trackClasses()">
        <input
          class="peer absolute inset-0 m-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
          type="checkbox"
          role="switch"
          [checked]="checked()"
          [disabled]="disabled() || loading()"
          [attr.aria-label]="ariaLabel()"
          [attr.aria-checked]="checked()"
          (change)="checkedChange.emit($any($event.target).checked)"
        >
        <span class="grid size-5 place-items-center rounded-full bg-foreground shadow-sm transition-transform" [class]="thumbClasses()">
          @if (loading()) {
            <span class="size-3 animate-spin rounded-full border-2 border-zinc-950/70 border-t-transparent" aria-hidden="true"></span>
          }
        </span>
      </span>
    </label>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class IsumiSwitchComponent {
  readonly checked = input(false, { transform: booleanAttribute });
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly loading = input(false, { transform: booleanAttribute });
  readonly ariaLabel = input<string | null>(null);
  readonly checkedChange = output<boolean>();

  readonly labelClasses = computed(() =>
    `inline-flex min-w-0 items-center gap-2 text-sm font-bold ${this.disabled() || this.loading() ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`
  );

  readonly trackClasses = computed(() =>
    this.checked()
      ? "bg-primary focus-within:ring-2 focus-within:ring-ring/60"
      : "bg-secondary ring-1 ring-inset ring-input hover:bg-accent focus-within:ring-2 focus-within:ring-ring/60"
  );

  readonly thumbClasses = computed(() =>
    this.checked() ? "translate-x-5" : "translate-x-0.5"
  );
}
