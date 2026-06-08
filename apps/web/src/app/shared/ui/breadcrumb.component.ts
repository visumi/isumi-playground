import { ChangeDetectionStrategy, Component, input } from "@angular/core";
import { RouterLink } from "@angular/router";
import { LucideChevronRight } from "@lucide/angular";

export interface IsumiBreadcrumbItem {
  label: string;
  link?: string | readonly unknown[];
}

@Component({
  selector: "isumi-breadcrumb",
  standalone: true,
  imports: [LucideChevronRight, RouterLink],
  host: {
    class: "block"
  },
  template: `
    <nav aria-label="Breadcrumb" class="overflow-x-auto">
      <ol class="flex min-w-0 items-center gap-1 whitespace-nowrap text-sm font-extrabold text-muted-foreground">
        @for (item of items(); track item.label; let last = $last) {
          <li class="flex min-w-0 items-center gap-1">
            @if (item.link && !last) {
              <a
                class="min-w-0 truncate rounded-sm px-1.5 py-1 no-underline transition-colors hover:bg-secondary hover:text-foreground"
                [routerLink]="item.link"
              >
                {{ item.label }}
              </a>
            } @else {
              <span
                class="min-w-0 truncate px-1.5 py-1"
                [class.text-foreground]="last"
                [attr.aria-current]="last ? 'page' : null"
              >
                {{ item.label }}
              </span>
            }

            @if (!last) {
              <svg lucideChevronRight class="size-4 shrink-0 text-muted-foreground/70" aria-hidden="true"></svg>
            }
          </li>
        }
      </ol>
    </nav>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class IsumiBreadcrumbComponent {
  readonly items = input.required<IsumiBreadcrumbItem[]>();
}
