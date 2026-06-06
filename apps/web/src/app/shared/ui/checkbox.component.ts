import { ChangeDetectionStrategy, Component, booleanAttribute, computed, input, output } from "@angular/core";

export type IsumiCheckboxVariant = "primary" | "secondary";

@Component({
  selector: "isumi-checkbox",
  standalone: true,
  template: `
    <label [class]="labelClasses()">
      <span class="relative grid size-5 shrink-0 place-items-center rounded-sm border transition-colors" [class]="boxClasses()">
        <input
          class="peer absolute inset-0 m-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
          type="checkbox"
          [checked]="checked()"
          [disabled]="disabled() || loading()"
          [attr.aria-label]="ariaLabel()"
          (change)="checkedChange.emit($any($event.target).checked)"
        >
        @if (loading()) {
          <span class="size-3 animate-spin rounded-full border-2 border-current border-t-transparent text-muted-foreground" aria-hidden="true"></span>
        } @else if (checked()) {
          <svg class="size-3.5 text-primary-foreground" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M3.5 8.5 6.5 11.5 12.5 4.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        }
      </span>
      <span class="min-w-0">
        <ng-content />
      </span>
    </label>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class IsumiCheckboxComponent {
  readonly checked = input(false, { transform: booleanAttribute });
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly loading = input(false, { transform: booleanAttribute });
  readonly ariaLabel = input<string | null>(null);
  readonly variant = input<IsumiCheckboxVariant>("primary");
  readonly checkedChange = output<boolean>();

  readonly labelClasses = computed(() =>
    `inline-flex min-w-0 items-center gap-2 text-sm font-bold ${this.disabled() || this.loading() ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`
  );

  readonly boxClasses = computed(() => {
    const checkedClasses: Record<IsumiCheckboxVariant, string> = {
      primary: "border-primary bg-primary",
      secondary: "border-input bg-background"
    };

    return this.checked()
      ? `${checkedClasses[this.variant()]} focus-within:ring-2 focus-within:ring-ring/60`
      : "border-input bg-background hover:border-ring/70 focus-within:ring-2 focus-within:ring-ring/60";
  });
}
