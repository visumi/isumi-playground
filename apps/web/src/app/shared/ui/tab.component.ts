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
      ? "bg-secondary text-foreground shadow-[inset_0_0_0_2px_rgb(147_51_234_/_0.34),inset_0_1px_0_rgb(255_255_255_/_0.06)]"
      : "bg-transparent text-muted-foreground hover:bg-ring/30 hover:text-foreground";
    const widthClass = this.fullWidth() ? "w-full" : "";

    return `relative inline-flex min-h-9 items-center justify-center rounded-sm px-3 text-sm font-extrabold no-underline transition-[background-color,color,box-shadow] hover:cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-40 ${stateClasses} ${widthClass}`;
  });
}
