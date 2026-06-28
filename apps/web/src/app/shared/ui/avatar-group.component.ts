import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core";
import { LucideEllipsis } from "@lucide/angular";
import { IsumiAvatarComponent, IsumiAvatarSize } from "./avatar.component";

export interface IsumiAvatarGroupItem {
  id?: string | null;
  userId?: string | null;
  name?: string | null;
  email?: string | null;
  src?: string | null;
  picture?: string | null;
}

@Component({
  selector: "isumi-avatar-group",
  standalone: true,
  imports: [IsumiAvatarComponent, LucideEllipsis],
  host: {
    class: "inline-flex shrink-0 align-middle"
  },
  template: `
    <div class="flex -space-x-2" role="list" [attr.aria-label]="resolvedAriaLabel()">
      @for (item of visibleItems(); track itemKey(item, $index); let itemIndex = $index) {
        <isumi-avatar
          class="relative"
          role="listitem"
          [size]="size()"
          [src]="imageSrc(item)"
          [name]="displayName(item)"
          [style.z-index]="stackCount() - itemIndex"
        />
      }

      @if (overflowCount() > 0) {
        <span
          role="listitem"
          [class]="overflowClasses()"
          [attr.aria-label]="overflowAriaLabel()"
          [style.z-index]="1"
          [title]="overflowAriaLabel()"
        >
          <svg lucideEllipsis class="size-4 text-secondary-foreground" aria-hidden="true"></svg>
        </span>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class IsumiAvatarGroupComponent {
  readonly items = input<IsumiAvatarGroupItem[]>([]);
  readonly size = input<IsumiAvatarSize>("sm");
  readonly maxVisible = input(4);
  readonly ariaLabel = input<string | null>(null);

  readonly visibleLimit = computed(() => Math.max(1, Math.trunc(this.maxVisible())));
  readonly overflowCount = computed(() => Math.max(0, this.items().length - this.visibleLimit()));
  readonly visibleItems = computed(() => this.items().slice(0, this.visibleLimit()));
  readonly stackCount = computed(() => this.visibleItems().length + (this.overflowCount() > 0 ? 1 : 0));
  readonly resolvedAriaLabel = computed(() => {
    const customLabel = this.ariaLabel()?.trim();
    if (customLabel) return customLabel;

    const count = this.items().length;
    return count === 1 ? "1 participante" : `${count} participantes`;
  });
  readonly overflowClasses = computed(() => {
    const sizes: Record<IsumiAvatarSize, string> = {
      sm: "size-7 text-[0.7rem]",
      md: "size-8 text-xs",
      lg: "size-10 text-sm"
    };

    return `relative grid place-items-center rounded-full bg-secondary font-extrabold text-secondary-foreground ring-1 ring-border ${sizes[this.size()]}`;
  });
  readonly overflowAriaLabel = computed(() => {
    const count = this.overflowCount();
    return count === 1 ? "Mais 1 participante" : `Mais ${count} participantes`;
  });

  itemKey(item: IsumiAvatarGroupItem, index: number): string {
    return item.id || item.userId || item.email || item.name || String(index);
  }

  displayName(item: IsumiAvatarGroupItem): string | null {
    return item.name || item.email || null;
  }

  imageSrc(item: IsumiAvatarGroupItem): string | null {
    return item.src || item.picture || null;
  }
}
