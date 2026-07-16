import { ChangeDetectionStrategy, Component, ElementRef, OnInit, afterNextRender, computed, inject, signal, viewChild } from "@angular/core";
import { FormsModule } from "@angular/forms";
import {
  LucideArchive,
  LucideBlocks,
  LucideBrushCleaning,
  LucideCalendars,
  LucideCopy,
  LucideCreditCard,
  LucideDollarSign,
  LucideFlag,
  LucideKeyRound,
  LucideLink,
  LucidePalette,
  LucidePlus,
  LucideReceiptText,
  LucideRefreshCw,
  LucideSave,
  LucideSettings2,
  LucideTags,
  LucideTrash2,
  LucideX
} from "@lucide/angular";
import { finalize } from "rxjs";
import { MonthlyExpensesService } from "../../core/api/monthly-expenses.service";
import { MonthlyExpenseCatalogItem, MonthlyExpenseIngestTokenStatus, MonthlyExpenseItem, MonthlyExpenseType, UpsertMonthlyExpenseItemRequest } from "../../core/api/api.types";
import { IsumiButtonComponent, IsumiClipboardService, IsumiInputDirective, IsumiSelectDirective, IsumiTabComponent, IsumiTagComponent, IsumiTagTone, IsumiToastService, injectIsumiModalData, injectIsumiModalRef } from "../../shared/ui";
import { formatMoneyInput, normalizeDecimalInput, parseMoneyCents } from "../../shared/utils/money";

export type CatalogKind = "category" | "payment";

export interface MonthlyExpenseCatalogModalData {
  categories: () => MonthlyExpenseCatalogItem[];
  activeCategories: () => MonthlyExpenseCatalogItem[];
  paymentMethods: () => MonthlyExpenseCatalogItem[];
  activePaymentMethods: () => MonthlyExpenseCatalogItem[];
  initialKind: CatalogKind;
  archiveCatalog: (kind: CatalogKind, item: MonthlyExpenseCatalogItem) => void;
  reloadActiveDetail: () => void;
}

export interface MonthlyExpenseItemModalData {
  item?: MonthlyExpenseItem;
  initialDescription?: string;
  initialTotalCents?: number;
  activeCategories: MonthlyExpenseCatalogItem[];
  activePaymentMethods: MonthlyExpenseCatalogItem[];
}

export interface MonthlyExpenseShortcutModalData {
  endpointUrl: string;
}

export const MONTH_NAMES = [
  "JAN",
  "FEV",
  "MAR",
  "ABR",
  "MAI",
  "JUN",
  "JUL",
  "AGO",
  "SET",
  "OUT",
  "NOV",
  "DEZ"
];

export const TYPE_LABELS: Record<MonthlyExpenseType, string> = {
  FIXO: "Fixo",
  VARIAVEL: "Variável",
  RESERVA: "Reserva"
};

export const TYPE_TAG_TONES: Record<MonthlyExpenseType, IsumiTagTone> = {
  FIXO: "rose",
  VARIAVEL: "indigo",
  RESERVA: "cyan"
};

export interface CatalogPaletteOption {
  tone: IsumiTagTone;
  label: string;
  color: string;
  swatchClass: string;
}

export const CATALOG_PALETTE: CatalogPaletteOption[] = [
  { tone: "slate", label: "Ardósia", color: "#64748b", swatchClass: "bg-slate-500" },
  { tone: "red", label: "Vermelho", color: "#ef4444", swatchClass: "bg-red-500" },
  { tone: "rose", label: "Rosa fechado", color: "#f43f5e", swatchClass: "bg-rose-500" },
  { tone: "amber", label: "Âmbar", color: "#f59e0b", swatchClass: "bg-amber-500" },
  { tone: "emerald", label: "Esmeralda", color: "#10b981", swatchClass: "bg-emerald-500" },
  { tone: "blue", label: "Azul", color: "#3b82f6", swatchClass: "bg-blue-500" },
  { tone: "indigo", label: "Índigo", color: "#6366f1", swatchClass: "bg-indigo-500" },
  { tone: "violet", label: "Violeta", color: "#8b5cf6", swatchClass: "bg-violet-500" },
  { tone: "pink", label: "Pink", color: "#ec4899", swatchClass: "bg-pink-500" },
  { tone: "cyan", label: "Ciano", color: "#06b6d4", swatchClass: "bg-cyan-500" }
];

@Component({
  selector: "isumi-monthly-expense-catalog-modal",
  standalone: true,
  imports: [
    FormsModule,
    IsumiButtonComponent,
    IsumiInputDirective,
    IsumiTabComponent,
    IsumiTagComponent,
    LucideArchive,
    LucideCreditCard,
    LucidePalette,
    LucidePlus,
    LucideSettings2,
    LucideTags,
    LucideX
  ],
  template: `
    <div class="flex max-h-[calc(min(720px,calc(100dvh-32px))-40px)] min-h-0 flex-col gap-6 overflow-hidden max-sm:max-h-[calc(100dvh-112px)] max-sm:gap-5">
      <header class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <h2 class="m-0 inline-flex items-center gap-2 text-[1.3rem] font-black tracking-[-0.02em]">
            <span class="grid size-8 place-items-center rounded-md bg-primary/15 text-primary">
              <svg lucideSettings2 class="size-4" aria-hidden="true"></svg>
            </span>
            Categorias e pagamentos
          </h2>
          <p class="m-0 mt-1.5 max-w-[34rem] text-sm leading-5 text-muted-foreground">Dê cor e nome aos atalhos que aparecem nos novos gastos.</p>
        </div>
        <isumi-button class="max-sm:hidden" variant="ghost" size="sm" iconOnly ariaLabel="Fechar modal" (click)="modalRef.close()">
          <svg icon lucideX class="size-4" aria-hidden="true"></svg>
          Fechar
        </isumi-button>
      </header>

      <form class="grid gap-4 rounded-lg border border-border/70 bg-background/45 p-4 max-sm:p-3.5" (ngSubmit)="saveCatalogItem()">
        <div class="grid gap-3">
          <div class="grid gap-1.5" role="group" aria-labelledby="catalog-kind-label">
            <span id="catalog-kind-label" class="min-h-5 text-xs font-extrabold leading-5 text-muted-foreground">Tipo do cadastro</span>
            <div class="grid grid-cols-2 items-center gap-3 rounded-lg bg-card p-1.5 max-sm:gap-2" role="tablist" aria-label="Tipo de cadastro">
              <isumi-tab fullWidth [selected]="catalogKind() === 'category'" (click)="setCatalogKind('category')">
                <span class="inline-flex items-center gap-2">
                  <svg icon lucideTags class="size-4" aria-hidden="true"></svg>
                  Categoria
                </span>
              </isumi-tab>
              <isumi-tab fullWidth [selected]="catalogKind() === 'payment'" (click)="setCatalogKind('payment')">
                <span class="inline-flex items-center gap-2">
                  <svg icon lucideCreditCard class="size-4" aria-hidden="true"></svg>
                  Pagamento
                </span>
              </isumi-tab>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-3 gap-y-3 max-sm:grid-cols-1">
          <label class="grid gap-1.5">
            <span class="text-xs font-extrabold text-muted-foreground">Nome</span>
            <input isumiInput name="catalogName" [ngModel]="catalogName()" (ngModelChange)="catalogName.set($event.slice(0, 80))" maxlength="80" required [placeholder]="catalogKind() === 'category' ? 'Mercado, casa, lazer...' : 'Banco, dinheiro, VR...'">
          </label>
          <div class="grid gap-1.5" role="radiogroup" aria-label="Escolher cor">
            <span class="inline-flex items-center gap-1.5 text-xs font-extrabold text-muted-foreground">
              <svg lucidePalette class="size-3.5" aria-hidden="true"></svg>
              Cor
            </span>
            <div class="grid grid-cols-10 gap-2 max-sm:grid-cols-5">
              @for (option of catalogPalette; track option.color) {
                <button
                  type="button"
                  [class]="paletteOptionClasses(option)"
                  [attr.aria-label]="option.label"
                  [attr.aria-pressed]="catalogColor() === option.color"
                  (click)="selectCatalogColor(option)"
                >
                  <span class="sr-only">{{ option.label }}</span>
                </button>
              }
            </div>
          </div>
          <isumi-button class="sm:col-span-2" fullWidth type="submit" size="md" [loading]="saving()">
            <svg icon lucidePlus class="size-4" aria-hidden="true"></svg>
            Criar
          </isumi-button>
        </div>
      </form>

      <div class="grid min-h-0 overflow-hidden">
        @if (catalogKind() === 'category') {
        <section class="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-2.5 rounded-lg bg-secondary/45 p-3">
          <div class="flex items-center justify-between gap-3 px-1">
            <h3 class="m-0 text-[0.95rem] font-black">Categorias</h3>
            <isumi-tag tone="secondary">{{ (data?.activeCategories() || []).length }} ativas</isumi-tag>
          </div>

          <div class="grid min-h-0 content-start divide-y divide-border/60 overflow-y-auto overscroll-contain rounded-md bg-background/30 px-3">
            @for (category of data?.categories() || []; track category.id) {
              <div class="grid min-h-13 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2" [class.opacity-45]="category.archived">
                <span class="inline-flex min-w-0 items-center gap-2.5">
                  <i class="size-2.5 shrink-0 rounded-full" [style.background]="category.color"></i>
                  <strong class="truncate text-sm">{{ category.name }}</strong>
                </span>
                @if (!category.archived) {
                  <isumi-button variant="ghost" size="sm" iconOnly ariaLabel="Arquivar categoria" (click)="data?.archiveCatalog('category', category)">
                    <svg icon lucideArchive class="size-4" aria-hidden="true"></svg>
                    Arquivar
                  </isumi-button>
                }
              </div>
            } @empty {
              <div class="flex min-h-24 items-center px-1 text-sm leading-5 text-muted-foreground">
                Comece com algo como Mercado, Casa ou Lazer.
              </div>
            }
          </div>
        </section>
        } @else {
        <section class="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-2.5 rounded-lg bg-secondary/45 p-3">
          <div class="flex items-center justify-between gap-3 px-1">
            <h3 class="m-0 text-[0.95rem] font-black">Pagamentos</h3>
            <isumi-tag tone="secondary">{{ (data?.activePaymentMethods() || []).length }} ativos</isumi-tag>
          </div>
          <div class="grid min-h-0 content-start divide-y divide-border/60 overflow-y-auto overscroll-contain rounded-md bg-background/30 px-3">
            @for (method of data?.paymentMethods() || []; track method.id) {
            <div class="grid min-h-13 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2" [class.opacity-45]="method.archived">
              <span class="inline-flex min-w-0 items-center gap-2.5">
                <i class="size-2.5 shrink-0 rounded-full" [style.background]="method.color"></i>
                <strong class="truncate text-sm">{{ method.name }}</strong>
              </span>
              @if (!method.archived) {
                <isumi-button variant="ghost" size="sm" iconOnly ariaLabel="Arquivar pagamento" (click)="data?.archiveCatalog('payment', method)">
                  <svg icon lucideArchive class="size-4" aria-hidden="true"></svg>
                  Arquivar
                </isumi-button>
              }
            </div>
          } @empty {
            <div class="flex min-h-24 items-center px-1 text-sm leading-5 text-muted-foreground">
              Adicione cartão, dinheiro ou conta principal.
            </div>
          }
          </div>
        </section>
        }
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MonthlyExpenseCatalogModalComponent {
  readonly data = injectIsumiModalData<MonthlyExpenseCatalogModalData>();
  readonly modalRef = injectIsumiModalRef<MonthlyExpenseCatalogModalData, void>();
  private readonly api = inject(MonthlyExpensesService);
  private readonly toast = inject(IsumiToastService);

  readonly catalogPalette = CATALOG_PALETTE;
  readonly saving = signal(false);
  readonly catalogKind = signal<CatalogKind>(this.data?.initialKind || "category");
  readonly catalogName = signal("");
  readonly catalogColor = signal(this.catalogKind() === "category" ? "#8b5cf6" : "#3b82f6");
  readonly catalogKindLabel = computed(() => this.catalogKind() === "category" ? "Categoria" : "Pagamento");

  setCatalogKind(kind: CatalogKind): void {
    this.catalogKind.set(kind);
    this.catalogColor.set(kind === "category" ? "#8b5cf6" : "#3b82f6");
  }

  selectCatalogColor(option: CatalogPaletteOption): void {
    this.catalogColor.set(option.color);
  }

  paletteOptionClasses(option: CatalogPaletteOption): string {
    const selected = this.catalogColor() === option.color
      ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
      : "ring-1 ring-white/10 hover:ring-white/40";

    return `size-7 cursor-pointer justify-self-center rounded-full ${option.swatchClass} ${selected} transition-shadow duration-150 focus-visible:outline-none`;
  }

  saveCatalogItem(): void {
    const kindLabel = this.catalogKindLabel().toLocaleLowerCase("pt-BR");
    const payload = {
      name: this.catalogName().trim(),
      color: this.catalogColor()
    };

    if (!payload.name) {
      this.toast.error("Informe um nome para o cadastro.", { id: "monthly-expense-catalog-invalid" });
      return;
    }

    const request = this.catalogKind() === "category"
      ? this.api.createCategory(payload)
      : this.api.createPaymentMethod(payload);

    this.saving.set(true);
    request.pipe(
      finalize(() => this.saving.set(false))
    ).subscribe({
      next: () => {
        this.catalogName.set("");
        this.toast.success(`${this.catalogKindLabel()} criado(a).`, { id: `monthly-expense-catalog-${kindLabel}-created` });
        this.data?.reloadActiveDetail();
      },
      error: () => this.toast.error("Não foi possível salvar este cadastro.", { id: "monthly-expense-catalog-save-error" })
    });
  }
}

@Component({
  selector: "isumi-monthly-expense-shortcut-modal",
  standalone: true,
  imports: [
    IsumiButtonComponent,
    IsumiInputDirective,
    IsumiTagComponent,
    LucideCopy,
    LucideKeyRound,
    LucideLink,
    LucideRefreshCw,
    LucideBlocks,
    LucideTrash2,
    LucideX
  ],
  template: `
    <div class="flex max-h-[calc(min(720px,calc(100dvh-32px))-40px)] min-h-0 flex-col gap-3 overflow-hidden max-sm:max-h-[calc(100dvh-112px)]">
      <header class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <h2 class="m-0 inline-flex items-center gap-2 text-[1.15rem] font-black leading-6">
            <span class="grid size-8 place-items-center rounded-md bg-primary/15 text-primary">
              <svg lucideBlocks class="size-4" aria-hidden="true"></svg>
            </span>
            Integração com atalhos
          </h2>
          <p class="m-0 mt-1 text-sm text-muted-foreground">Gere a configuração para o atalho da Wallet.</p>
        </div>
        <isumi-button class="max-sm:hidden" variant="ghost" size="sm" iconOnly ariaLabel="Fechar modal" (click)="modalRef.close()">
          <svg icon lucideX class="size-4" aria-hidden="true"></svg>
          Fechar
        </isumi-button>
      </header>

      <section class="grid gap-2 rounded-lg bg-secondary/55 p-2.5">
        <div class="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2.5">
          <div class="grid min-w-0 gap-1">
            <strong class="inline-flex min-w-0 items-center gap-2">
              <svg lucideKeyRound class="size-4 shrink-0 text-primary" aria-hidden="true"></svg>
              <span class="truncate">Token do Atalho</span>
            </strong>
            @if (loadingStatus()) {
              <span class="h-3 w-40 max-w-full animate-pulse rounded-sm bg-muted"></span>
            } @else {
              <span class="text-xs leading-5 text-muted-foreground">{{ tokenStatusText() }}</span>
            }
          </div>
          @if (loadingStatus()) {
            <span class="h-5 w-12 animate-pulse rounded-full bg-muted"></span>
          } @else {
            <isumi-tag [tone]="status()?.active ? 'emerald' : 'secondary'">{{ status()?.active ? "Ativo" : "Não configurado" }}</isumi-tag>
          }
        </div>

        @if (!loadingStatus() && generatedToken()) {
          <label class="grid gap-1.5 rounded-md bg-zinc-950/35 p-2">
            <span class="flex flex-wrap items-center justify-between gap-2 text-xs font-bold leading-4 text-muted-foreground">
              <span>Token gerado agora</span>
              <span class="text-amber-200">Copie agora. Ele não será exibido novamente.</span>
            </span>
            <div class="grid grid-cols-[minmax(0,1fr)_auto] gap-1.5 items-center">
              <input isumiInput readonly [value]="generatedToken()" aria-label="Token gerado para o Atalho">
              <isumi-button type="button" size="lg" iconOnly variant="secondary" [disabled]="actionsBlocked()" (click)="copyText(generatedToken(), 'Token copiado.', 'shortcut-token-copy')">
                <svg icon lucideCopy class="size-4" aria-hidden="true"></svg>
              </isumi-button>
            </div>
          </label>
        }

        <div class="flex flex-wrap gap-2">
          <isumi-button type="button" mobileFull size="sm" [disabled]="actionsBlocked()" [loading]="saving()" (click)="generateToken()">
            <svg icon lucideRefreshCw class="size-4" aria-hidden="true"></svg>
            {{ status()?.active ? "Gerar novo token" : "Gerar token" }}
          </isumi-button>
          <isumi-button mobileFull type="button" variant="secondary" size="sm" [disabled]="actionsBlocked() || !status()?.active" [loading]="saving()" (click)="revokeToken()">
            <svg icon lucideTrash2 class="size-4" aria-hidden="true"></svg>
            Revogar
          </isumi-button>
        </div>
      </section>

      <section class="grid gap-2 rounded-lg bg-secondary/55 p-2.5">
        <div class="grid gap-1.5">
          <strong class="inline-flex items-center gap-2">
            <svg lucideLink class="size-4 text-primary" aria-hidden="true"></svg>
            Configuração do Atalho
          </strong>
          <span class="text-xs font-bold text-muted-foreground">URL do endpoint</span>
          <div class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5">
            <input isumiInput readonly [value]="data?.endpointUrl || ''" aria-label="URL do endpoint do Atalho">
            <isumi-button type="button" iconOnly variant="secondary" [disabled]="actionsBlocked()" (click)="copyText(data?.endpointUrl || '', 'URL copiada.', 'shortcut-url-copy')">
              <svg icon lucideCopy class="size-4" aria-hidden="true"></svg>
            </isumi-button>
          </div>
        </div>

        <div class="grid gap-2 min-[720px]:grid-cols-[0.9fr_1.1fr]">
          <ol class="m-0 grid content-start gap-1 rounded-md bg-zinc-950/60 p-2 text-xs leading-4 text-muted-foreground">
            <li>1. Use Obter conteúdo de URL no app Atalhos.</li>
            <li>2. Método POST com Authorization: Bearer + token.</li>
            <li>3. Body somente com merchant e amount. A API preenche a data.</li>
          </ol>

          <pre class="m-0 overflow-x-auto whitespace-pre rounded-md bg-zinc-950/70 p-2 text-[0.7rem] leading-4 text-zinc-100"><code>{{ examplePayload }}</code></pre>
        </div>
      </section>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MonthlyExpenseShortcutModalComponent implements OnInit {
  readonly data = injectIsumiModalData<MonthlyExpenseShortcutModalData>();
  readonly modalRef = injectIsumiModalRef<MonthlyExpenseShortcutModalData, void>();
  private readonly api = inject(MonthlyExpensesService);
  private readonly toast = inject(IsumiToastService);
  private readonly clipboard = inject(IsumiClipboardService);

  readonly status = signal<MonthlyExpenseIngestTokenStatus | null>(null);
  readonly generatedToken = signal("");
  readonly loadingStatus = signal(true);
  readonly saving = signal(false);
  readonly actionsBlocked = computed(() => this.loadingStatus() || this.saving());
  readonly examplePayload = `Authorization: Bearer SEU_TOKEN
Content-Type: application/json
Body: {"merchant":"Mercado Exemplo","amount":"R$ 45,90"}`;

  ngOnInit(): void {
    this.loadStatus();
  }

  tokenStatusText(): string {
    const status = this.status();

    if (!status && this.loadingStatus()) {
      return "Carregando status do token.";
    }

    if (!status) {
      return "Status indisponível. Tente novamente em instantes.";
    }

    if (!status.active) {
      return "Nenhum token ativo. Gere um token para configurar o Atalho.";
    }

    const lastUsed = status.lastUsedAt
      ? ` Último uso: ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(status.lastUsedAt))}.`
      : " Ainda não usado.";

    return `Token ativo terminado em ${status.tokenLast4}.${lastUsed}`;
  }

  generateToken(): void {
    if (this.actionsBlocked()) {
      return;
    }

    this.saving.set(true);
    this.api.createIngestToken().pipe(
      finalize(() => this.saving.set(false))
    ).subscribe({
      next: (status) => {
        this.status.set(status);
        this.generatedToken.set(status.token || "");
        this.toast.success("Token gerado. Copie agora para configurar o Atalho.", { id: "monthly-expense-shortcut-token-created" });
      },
      error: () => this.toast.error("Não foi possível gerar o token.", { id: "monthly-expense-shortcut-token-error" })
    });
  }

  revokeToken(): void {
    if (this.actionsBlocked() || !this.status()?.active) {
      return;
    }

    this.saving.set(true);
    this.api.revokeIngestToken().pipe(
      finalize(() => this.saving.set(false))
    ).subscribe({
      next: () => {
        this.status.set({ active: false });
        this.generatedToken.set("");
        this.toast.success("Token revogado.", { id: "monthly-expense-shortcut-token-revoked" });
      },
      error: () => this.toast.error("Não foi possível revogar o token.", { id: "monthly-expense-shortcut-token-revoke-error" })
    });
  }

  async copyText(value: string, successMessage: string, toastId: string): Promise<void> {
    if (!value || this.actionsBlocked()) {
      return;
    }

    try {
      await this.clipboard.copyText(value);
      this.toast.success(successMessage, { id: toastId });
    } catch {
      this.toast.error("Não foi possível copiar.", { id: `${toastId}-error` });
    }
  }

  private loadStatus(): void {
    this.loadingStatus.set(true);
    this.api.getIngestToken().pipe(
      finalize(() => this.loadingStatus.set(false))
    ).subscribe({
      next: (status) => this.status.set(status),
      error: () => this.toast.error("Não foi possível carregar a integração.", { id: "monthly-expense-shortcut-status-error" })
    });
  }

}

@Component({
  selector: "isumi-monthly-expense-item-modal",
  standalone: true,
  imports: [
    FormsModule,
    IsumiButtonComponent,
    IsumiInputDirective,
    IsumiSelectDirective,
    LucideCalendars,
    LucideCreditCard,
    LucideDollarSign,
    LucideFlag,
    LucideReceiptText,
    LucideSave,
    LucideTags,
    LucideX
  ],
  template: `
    <form class="flex max-h-[calc(min(720px,calc(100dvh-32px))-40px)] min-h-0 flex-col gap-5 overflow-hidden max-sm:max-h-[calc(100dvh-112px)]" (ngSubmit)="submit()">
      <header class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <h2 class="m-0 inline-flex items-center gap-2 text-[1.2rem] font-black">
            <span class="grid size-8 place-items-center rounded-md bg-primary/15 text-primary">
              <svg lucideReceiptText class="size-4" aria-hidden="true"></svg>
            </span>
            {{ data?.item ? "Editar gasto" : "Adicionar gasto" }}
          </h2>
          <p class="m-0 mt-1 text-sm text-muted-foreground">Organize valor, categoria e pagamento antes de salvar no mês.</p>
        </div>
        <isumi-button class="max-sm:hidden" variant="ghost" size="sm" iconOnly ariaLabel="Fechar modal" (click)="modalRef.close()">
          <svg icon lucideX class="size-4" aria-hidden="true"></svg>
          Fechar
        </isumi-button>
      </header>

      <div class="grid gap-4 rounded-lg bg-secondary/55 p-3.5">
        <label class="grid gap-2">
          <span class="inline-flex items-center gap-2 text-sm font-extrabold text-muted-foreground">
            <svg lucideReceiptText class="size-4" aria-hidden="true"></svg>
            Descrição
          </span>
          <input #descriptionInput isumiInput name="itemDescription" [ngModel]="itemDescription()" (ngModelChange)="itemDescription.set($event.slice(0, 160))" maxlength="160" required placeholder="Mercado, aluguel, academia...">
        </label>

        <div class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 max-sm:grid-cols-1">
          <label class="grid gap-2">
            <span class="inline-flex items-center gap-2 text-sm font-extrabold text-muted-foreground">
              <svg lucideTags class="size-4" aria-hidden="true"></svg>
              Categoria
            </span>
            <select isumiSelect name="itemCategory" [ngModel]="itemCategoryId()" (ngModelChange)="itemCategoryId.set($event)" required>
              @for (category of activeCategories(); track category.id) {
                <option [value]="category.id">{{ category.name }}</option>
              }
            </select>
          </label>

          <label class="grid gap-2">
            <span class="inline-flex items-center gap-2 text-sm font-extrabold text-muted-foreground">
              <svg lucideCreditCard class="size-4" aria-hidden="true"></svg>
              Pagamento
            </span>
            <select isumiSelect name="itemPayment" [ngModel]="itemPaymentMethodId()" (ngModelChange)="itemPaymentMethodId.set($event)" required>
              @for (method of activePaymentMethods(); track method.id) {
                <option [value]="method.id">{{ method.name }}</option>
              }
            </select>
          </label>
        </div>

        <div class="grid gap-3">
          <div class="grid grid-cols-[minmax(0,1fr)_7rem] gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
            <label class="grid gap-2">
              <span class="inline-flex items-center gap-2 text-sm font-extrabold text-muted-foreground">
                <svg lucideDollarSign class="size-4" aria-hidden="true"></svg>
                Valor total
              </span>
              <input isumiInput inputmode="decimal" name="itemTotal" [ngModel]="itemTotal()" (ngModelChange)="setItemTotal($event)" placeholder="0,00" required>
            </label>

            <label class="grid gap-2">
              <span class="inline-flex items-center gap-2 text-sm font-extrabold text-muted-foreground">
                <svg lucideCalendars class="size-4" aria-hidden="true"></svg>
                Parcelas
              </span>
              <input isumiInput type="number" min="1" max="120" name="itemInstallments" [disabled]="!!data?.item" [ngModel]="itemInstallments()" (ngModelChange)="itemInstallments.set($event)">
            </label>
          </div>

          <label class="grid gap-2">
            <span class="inline-flex items-center gap-2 text-sm font-extrabold text-muted-foreground">
              <svg lucideFlag class="size-4" aria-hidden="true"></svg>
              Tipo
            </span>
            <select isumiSelect name="itemType" [ngModel]="itemType()" (ngModelChange)="itemType.set($event)">
              <option value="VARIAVEL">Variável</option>
              <option value="FIXO">Fixo</option>
              <option value="RESERVA">Reserva</option>
            </select>
          </label>
        </div>
      </div>

      <footer class="flex justify-end gap-2 max-sm:grid max-sm:grid-cols-1">
        <isumi-button mobileFull variant="secondary" type="button" [disabled]="modalRef.processing()" (click)="modalRef.close()">Cancelar</isumi-button>
        <isumi-button mobileFull type="submit" [loading]="modalRef.processing()">
          <svg icon lucideSave class="size-4" aria-hidden="true"></svg>
          Salvar gasto
        </isumi-button>
      </footer>
    </form>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MonthlyExpenseItemModalComponent {
  readonly data = injectIsumiModalData<MonthlyExpenseItemModalData>();
  readonly modalRef = injectIsumiModalRef<MonthlyExpenseItemModalData, UpsertMonthlyExpenseItemRequest>();
  private readonly toast = inject(IsumiToastService);
  private readonly descriptionInput = viewChild<ElementRef<HTMLInputElement>>("descriptionInput");

  readonly activeCategories = signal(this.data?.activeCategories || []);
  readonly activePaymentMethods = signal(this.data?.activePaymentMethods || []);
  readonly itemDescription = signal(this.data?.item?.description || this.data?.initialDescription || "");
  readonly itemCategoryId = signal(this.data?.item?.categoryId || this.activeCategories()[0]?.id || "");
  readonly itemPaymentMethodId = signal(this.data?.item?.paymentMethodId || this.activePaymentMethods()[0]?.id || "");
  readonly itemTotal = signal(this.data?.item
    ? formatMoneyInput(this.data.item.totalPurchaseCents)
    : this.data?.initialTotalCents
      ? formatMoneyInput(this.data.initialTotalCents)
      : ""
  );
  readonly itemInstallments = signal(1);
  readonly itemType = signal<MonthlyExpenseType>(this.data?.item?.expenseType || "VARIAVEL");

  constructor() {
    afterNextRender(() => {
      this.descriptionInput()?.nativeElement.focus();
    });
  }

  setItemTotal(value: string | number): void {
    this.itemTotal.set(normalizeDecimalInput(value));
  }

  submit(): void {
    const payload = this.buildItemPayload();

    if (payload) {
      void this.modalRef.submit(payload);
    }
  }

  private buildItemPayload(): UpsertMonthlyExpenseItemRequest | null {
    const totalPurchaseCents = parseMoneyCents(this.itemTotal(), { allowZero: true });
    const description = this.itemDescription().trim();

    if (!description || !this.itemCategoryId() || !this.itemPaymentMethodId() || totalPurchaseCents === null) {
      this.toast.error("Preencha descrição, categoria, pagamento e valor.", { id: "monthly-expense-item-invalid" });
      return null;
    }

    return {
      description,
      categoryId: this.itemCategoryId(),
      paymentMethodId: this.itemPaymentMethodId(),
      totalPurchaseCents,
      installmentTotal: Math.max(1, Math.trunc(Number(this.itemInstallments()) || 1)),
      expenseType: this.itemType()
    };
  }
}
