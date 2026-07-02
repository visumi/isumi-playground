import { NgComponentOutlet } from "@angular/common";
import { ChangeDetectionStrategy, Component, Type, computed, input, output } from "@angular/core";
import { LucideCheck, LucideLock } from "@lucide/angular";

export type IsumiStepState = "pending" | "active" | "complete" | "locked";

export interface IsumiStepItem<T extends string = string> {
  id: T;
  label: string;
  description?: string;
  icon?: Type<unknown>;
  state?: IsumiStepState;
  ariaLabel?: string;
}

@Component({
  selector: "isumi-stepper",
  standalone: true,
  imports: [NgComponentOutlet, LucideCheck, LucideLock],
  template: `
    <nav class="min-w-0 rounded-md bg-secondary/35 px-2 py-3" [attr.aria-label]="ariaLabel()">
      <ol class="relative grid w-full min-w-0" [style.grid-template-columns]="gridTemplateColumns()">
        <span
          class="pointer-events-none absolute top-[1.125rem] z-0 h-0.5 rounded-full bg-border"
          [style.left]="trackInset()"
          [style.right]="trackInset()"
          aria-hidden="true"></span>
        @for (step of steps(); track step.id; let index = $index) {
        @let state = stepState(step);
        @let locked = state === "locked" || disabled();
        <li class="relative min-w-0">
          <button
            class="group relative z-10 grid w-full min-w-0 cursor-pointer justify-items-center gap-1.5 px-1 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed"
            type="button"
            [disabled]="locked"
            [attr.aria-current]="state === 'active' ? 'step' : null"
            [attr.aria-label]="step.ariaLabel || step.label"
            [attr.title]="stepTitle(step, state)"
            (click)="selectStep(step)">
            <span
              class="relative z-10 grid size-9 place-items-center rounded-full border bg-background text-muted-foreground transition-[box-shadow,border-color] group-disabled:ring-0 [&_svg]:size-4"
              [class.border-transparent]="state === 'active' || state === 'complete'"
              [class.border-border]="state !== 'active' && state !== 'complete'"
              [class.group-hover:ring-2]="state === 'pending'"
              [class.group-hover:ring-ring/45]="state === 'pending'"
              [class.bg-primary]="state === 'active'"
              [class.text-primary-foreground]="state === 'active'"
              [class.bg-purple-500]="state === 'complete'"
              [class.text-white]="state === 'complete'"
              [class.bg-secondary]="locked">
              @if (state === "complete") {
              <svg lucideCheck class="size-4 stroke-3" aria-hidden="true"></svg>
              } @else if (locked) {
              <svg lucideLock class="size-3.5" aria-hidden="true"></svg>
              } @else if (step.icon) {
              <ng-container *ngComponentOutlet="step.icon" />
              } @else {
              <span class="text-xs font-black tabular-nums">{{ index + 1 }}</span>
              }
            </span>
            <span
              class="block w-full truncate text-[0.7rem] font-black leading-4 text-muted-foreground transition-colors max-sm:text-[0.66rem]"
              [class.text-foreground]="state === 'active'"
              [class.text-primary]="state === 'complete'">
              {{ step.label }}
            </span>
            @if (step.description) {
            <span
              class="hidden max-w-[8rem] truncate text-[0.68rem] font-semibold leading-4 text-muted-foreground/90 sm:block"
              [class.text-foreground/80]="state === 'active'">
              {{ locked ? "Bloqueado" : step.description }}
            </span>
            }
          </button>
        </li>
        }
      </ol>
    </nav>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class IsumiStepperComponent<T extends string = string> {
  readonly steps = input<ReadonlyArray<IsumiStepItem<T>>>([]);
  readonly activeStepId = input<T | null>(null);
  readonly ariaLabel = input("Etapas");
  readonly disabled = input(false);
  readonly stepSelected = output<T>();

  readonly gridTemplateColumns = computed(() => `repeat(${Math.max(this.steps().length, 1)}, minmax(0, 1fr))`);
  readonly trackInset = computed(() => {
    const count = Math.max(this.steps().length, 1);
    return `calc(100% / ${count * 2})`;
  });

  stepState(step: IsumiStepItem<T>): IsumiStepState {
    return step.state || (step.id === this.activeStepId() ? "active" : "pending");
  }

  stepTitle(step: IsumiStepItem<T>, state: IsumiStepState): string {
    const detail = state === "locked" || this.disabled() ? "Bloqueado" : step.description;
    return [step.label, detail].filter(Boolean).join(" · ");
  }

  selectStep(step: IsumiStepItem<T>): void {
    if (this.disabled() || this.stepState(step) === "locked") return;
    this.stepSelected.emit(step.id);
  }
}
