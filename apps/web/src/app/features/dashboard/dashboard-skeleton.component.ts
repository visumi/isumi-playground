import { ChangeDetectionStrategy, Component } from "@angular/core";

@Component({
  selector: "isumi-dashboard-skeleton",
  standalone: true,
  template: `
    <div class="grid gap-5" aria-label="Carregando dashboard" aria-busy="true">
      <div class="grid grid-cols-[minmax(0,1.05fr)_minmax(19rem,0.95fr)] gap-5 max-lg:grid-cols-1">
        <section class="grid gap-4 rounded-lg bg-card p-5">
          <div class="flex items-start justify-between gap-4">
            <div class="grid gap-2">
              <div class="h-5 w-44 animate-pulse rounded-sm bg-muted"></div>
              <div class="h-4 w-64 max-w-full animate-pulse rounded-sm bg-muted/70"></div>
            </div>
            <div class="size-10 shrink-0 animate-pulse rounded-md bg-muted"></div>
          </div>
          <div class="grid gap-2">
            <div class="h-16 animate-pulse rounded-lg bg-secondary/65"></div>
            <div class="h-16 animate-pulse rounded-lg bg-secondary/65"></div>
            <div class="h-16 animate-pulse rounded-lg bg-secondary/65"></div>
          </div>
          <div class="h-20 animate-pulse rounded-lg bg-zinc-950/45"></div>
        </section>

        <section class="grid gap-5 rounded-lg bg-card p-5">
          <div class="flex items-start justify-between gap-4">
            <div class="grid gap-2">
              <div class="h-6 w-28 animate-pulse rounded-md bg-muted"></div>
              <div class="h-5 w-36 animate-pulse rounded-sm bg-muted"></div>
              <div class="h-4 w-56 max-w-full animate-pulse rounded-sm bg-muted/70"></div>
            </div>
            <div class="size-10 shrink-0 animate-pulse rounded-md bg-muted"></div>
          </div>
          <div class="h-10 w-52 animate-pulse rounded-sm bg-muted"></div>
          <div class="grid gap-3 rounded-lg bg-zinc-950/45 p-4">
            <div class="h-4 w-28 animate-pulse rounded-sm bg-muted"></div>
            <div class="h-3 animate-pulse rounded-full bg-muted"></div>
            <div class="h-4 animate-pulse rounded-sm bg-muted/70"></div>
          </div>
          <div class="h-9 w-48 animate-pulse rounded-sm bg-muted"></div>
        </section>
      </div>

      <section class="grid gap-3 rounded-lg bg-card p-5">
        <div class="flex items-start justify-between gap-4">
          <div class="grid gap-2">
            <div class="h-5 w-52 animate-pulse rounded-sm bg-muted"></div>
            <div class="h-4 w-64 max-w-full animate-pulse rounded-sm bg-muted/70"></div>
          </div>
          <div class="size-10 shrink-0 animate-pulse rounded-md bg-muted"></div>
        </div>
        <div class="grid grid-cols-3 gap-3 max-lg:grid-cols-1">
          <div class="h-20 animate-pulse rounded-lg bg-secondary/65"></div>
          <div class="h-20 animate-pulse rounded-lg bg-secondary/65"></div>
          <div class="h-20 animate-pulse rounded-lg bg-secondary/65"></div>
        </div>
      </section>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardSkeletonComponent {}
