import { ChangeDetectionStrategy, Component, ElementRef, OnChanges, OnInit, Renderer2, inject, input } from "@angular/core";
import { splitClasses } from "./class-list";

export type IsumiBadgeVariant = "accent" | "primary" | "secondary" | "tag" | "indigo" | "rose" | "cyan";

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
      secondary: "bg-secondary text-secondary-foreground",
      tag: "bg-accent text-accent-foreground ring-1 ring-inset ring-white/10",
      indigo: "bg-indigo-500/10 text-indigo-300",
      rose: "bg-rose-500/10 text-rose-300",
      cyan: "bg-cyan-500/10 text-cyan-300"
    };
    this.appliedClasses = splitClasses(`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs ${variantClasses[this.variant()]}`);

    for (const className of this.appliedClasses) {
      this.renderer.addClass(this.element.nativeElement, className);
    }
  }
}
