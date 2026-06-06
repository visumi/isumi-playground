import { ChangeDetectionStrategy, Component, ElementRef, OnChanges, OnInit, Renderer2, inject, input } from "@angular/core";
import { splitClasses } from "./class-list";

export type IsumiBadgeVariant = "accent" | "primary" | "secondary";

@Component({
  selector: "isumi-badge",
  standalone: true,
  template: "<ng-content />",
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class IsumiBadgeComponent implements OnChanges, OnInit {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly renderer = inject(Renderer2);
  private appliedClasses: string[] = [];

  readonly variant = input<IsumiBadgeVariant>("accent");

  ngOnInit(): void {
    this.syncClasses();
  }

  ngOnChanges(): void {
    this.syncClasses();
  }

  private syncClasses(): void {
    for (const className of this.appliedClasses) {
      this.renderer.removeClass(this.element.nativeElement, className);
    }

    const variantClasses: Record<IsumiBadgeVariant, string> = {
      accent: "bg-accent text-accent-foreground",
      primary: "bg-purple-500/10 text-purple-400",
      secondary: "bg-secondary text-secondary-foreground"
    };
    this.appliedClasses = splitClasses(`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs ${variantClasses[this.variant()]}`);

    for (const className of this.appliedClasses) {
      this.renderer.addClass(this.element.nativeElement, className);
    }
  }
}
