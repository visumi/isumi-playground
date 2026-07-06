import { ChangeDetectionStrategy, Component, booleanAttribute, computed, input, output } from "@angular/core";

export type IsumiFilterChipType = "button" | "submit" | "reset";

@Component({
  selector: "isumi-filter-chip",
  standalone: true,
  template: `
    <button
      [type]="type()"
      [class]="chipClasses()"
      [disabled]="disabled()"
      [attr.aria-pressed]="selected()"
      [attr.aria-label]="ariaLabel()"
      (click)="pressed.emit()">
      <ng-content />
    </button>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class IsumiFilterChipComponent {
  readonly selected = input(false, { transform: booleanAttribute });
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly type = input<IsumiFilterChipType>("button");
  readonly ariaLabel = input<string | null>(null);
  readonly pressed = output<void>();

  readonly chipClasses = computed(() => {
    const stateClasses = this.selected()
      ? "bg-primary text-primary-foreground"
      : "bg-secondary/80 text-muted-foreground hover:bg-accent hover:text-foreground";

    return `inline-flex min-h-8 shrink-0 items-center justify-center rounded-full px-3.5 text-[0.8125rem] font-bold leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-40 ${stateClasses}`;
  });
}
