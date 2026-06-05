import { ChangeDetectionStrategy, Component, booleanAttribute, computed, input } from "@angular/core";

export type IsumiButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
export type IsumiButtonSize = "sm" | "md" | "lg";
export type IsumiButtonType = "button" | "submit" | "reset";

@Component({
  selector: "isumi-button",
  standalone: true,
  host: {
    class: "inline-block",
    "[class.w-full]": "fullWidth()",
    "[class.max-sm:w-full]": "mobileFull()"
  },
  template: `
    <button [type]="type()" [disabled]="disabled() || loading()" [attr.aria-busy]="loading() ? true : null" [attr.aria-label]="ariaLabel()" [class]="buttonClasses()">
      @if (loading()) {
        <span class="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true"></span>
      } @else {
        <span class="contents" aria-hidden="true">
          <ng-content select="[icon]" />
        </span>
      }
      @if (!iconOnly()) {
        <span class="truncate">
          <ng-content />
        </span>
      }
    </button>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class IsumiButtonComponent {
  readonly variant = input<IsumiButtonVariant>("primary");
  readonly size = input<IsumiButtonSize>("md");
  readonly type = input<IsumiButtonType>("button");
  readonly loading = input(false, { transform: booleanAttribute });
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly fullWidth = input(false, { transform: booleanAttribute });
  readonly mobileFull = input(false, { transform: booleanAttribute });
  readonly iconOnly = input(false, { transform: booleanAttribute });
  readonly ariaLabel = input<string | null>(null);

  readonly buttonClasses = computed(() => {
    const variantClasses: Record<IsumiButtonVariant, string> = {
      primary: "bg-primary text-primary-foreground hover:bg-chart-5 hover:text-primary-foreground",
      secondary: "bg-secondary text-secondary-foreground hover:bg-ring/45 hover:text-foreground",
      ghost: "bg-transparent text-muted-foreground hover:bg-ring/30 hover:text-foreground",
      destructive: "bg-secondary text-secondary-foreground hover:bg-destructive/30 hover:text-destructive"
    };
    const sizeClasses: Record<IsumiButtonSize, string> = {
      sm: "min-h-9 px-3",
      md: "min-h-10 px-3.5",
      lg: "min-h-12 px-4"
    };
    const iconSizeClasses: Record<IsumiButtonSize, string> = {
      sm: "size-8",
      md: "size-10",
      lg: "size-12"
    };
    const widthClass = this.fullWidth() ? "w-full" : this.mobileFull() ? "max-sm:w-full" : "";
    const shapeClass = this.iconOnly() ? iconSizeClasses[this.size()] : sizeClasses[this.size()];

    return `inline-flex items-center justify-center gap-2 rounded-sm text-sm font-extrabold no-underline transition-[background-color,color,filter] hover:cursor-pointer hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-40 disabled:saturate-50 disabled:hover:brightness-100 ${variantClasses[this.variant()]} ${shapeClass} ${widthClass}`;
  });
}
