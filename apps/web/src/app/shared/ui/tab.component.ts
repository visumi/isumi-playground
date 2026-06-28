import { ChangeDetectionStrategy, Component, booleanAttribute, computed, input } from "@angular/core";

@Component({
  selector: "isumi-tab",
  standalone: true,
  host: {
    class: "inline-block",
    "[class.w-full]": "fullWidth()"
  },
  template: `
    <button
      type="button"
      role="tab"
      [disabled]="disabled()"
      [attr.aria-selected]="selected()"
      [attr.tabindex]="selected() ? 0 : -1"
      [class]="tabClasses()">
      <span class="min-w-0 truncate text-center">
        <ng-content />
      </span>
    </button>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class IsumiTabComponent {
  readonly selected = input(false, { transform: booleanAttribute });
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly fullWidth = input(false, { transform: booleanAttribute });

  readonly tabClasses = computed(() => {
    const stateClasses = this.selected()
      ? "bg-secondary/90 text-foreground after:opacity-70"
      : "bg-transparent text-muted-foreground hover:bg-secondary/60 hover:text-foreground";
    const widthClass = this.fullWidth() ? "w-full" : "";

    return `relative inline-flex min-h-9 items-center justify-center rounded-sm px-3 text-sm font-extrabold no-underline transition-[background-color,color] after:pointer-events-none after:absolute after:bottom-1 after:left-1/2 after:h-0.5 after:w-5 after:-translate-x-1/2 after:rounded-full after:bg-primary after:opacity-0 after:transition-opacity hover:cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-40 ${stateClasses} ${widthClass}`;
  });
}
