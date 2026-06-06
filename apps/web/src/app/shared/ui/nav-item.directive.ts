import { Directive, ElementRef, OnInit, Renderer2, inject } from "@angular/core";
import { splitClasses } from "./class-list";

const NAV_ITEM_CLASSES = "inline-flex items-center gap-2.5 rounded-sm px-3 py-2.5 font-bold text-muted-foreground no-underline transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground max-md:flex-col max-md:gap-1 max-md:px-2 max-md:py-2 max-md:text-xs";

@Directive({
  selector: "a[isumiNavItem]",
  standalone: true
})
export class IsumiNavItemDirective implements OnInit {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly renderer = inject(Renderer2);

  ngOnInit(): void {
    for (const className of splitClasses(NAV_ITEM_CLASSES)) {
      this.renderer.addClass(this.element.nativeElement, className);
    }
  }
}
