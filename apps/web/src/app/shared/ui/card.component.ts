import { ChangeDetectionStrategy, Component, ElementRef, OnChanges, OnInit, Renderer2, inject, input } from "@angular/core";
import { splitClasses } from "./class-list";

export type IsumiCardVariant = "card" | "secondary" | "muted";
export type IsumiCardPadding = "sm" | "md" | "lg" | "xl";

@Component({
  selector: "isumi-card",
  standalone: true,
  template: "<ng-content />",
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class IsumiCardComponent implements OnChanges, OnInit {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly renderer = inject(Renderer2);
  private appliedClasses: string[] = [];

  readonly variant = input<IsumiCardVariant>("card");
  readonly interactive = input(false);
  readonly padding = input<IsumiCardPadding>("md");

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

    const variantClasses: Record<IsumiCardVariant, string> = {
      card: "bg-card text-card-foreground",
      secondary: "bg-secondary text-secondary-foreground",
      muted: "bg-muted text-foreground"
    };
    const paddingClasses: Record<IsumiCardPadding, string> = {
      sm: "p-4",
      md: "p-5",
      lg: "p-6",
      xl: "p-7"
    };
    const interactiveClasses = this.interactive() ? "transition-colors hover:bg-secondary" : "";
    this.appliedClasses = splitClasses(`block rounded-lg ${paddingClasses[this.padding()]} ${variantClasses[this.variant()]} ${interactiveClasses}`);

    for (const className of this.appliedClasses) {
      this.renderer.addClass(this.element.nativeElement, className);
    }
  }
}
