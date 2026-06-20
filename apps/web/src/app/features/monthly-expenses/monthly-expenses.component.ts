import { HttpErrorResponse } from "@angular/common/http";
import { ChangeDetectionStrategy, Component, ElementRef, HostListener, OnInit, afterNextRender, computed, inject, signal, viewChild } from "@angular/core";
import { FormsModule } from "@angular/forms";
import {
  LucideArchive,
  LucideArrowBigRightDash,
  LucideArrowUp,
  LucideBanknoteArrowUp,
  LucideCalendar,
  LucideCalendarDays,
  LucideCalendars,
  LucideCheck,
  LucideChevronLeft,
  LucideChevronRight,
  LucideCreditCard,
  LucideDownload,
  LucideBrushCleaning,
  LucideFlag,
  LucideCoins,
  LucideGoal,
  LucidePalette,
  LucidePencil,
  LucidePiggyBank,
  LucidePlus,
  LucideReceiptText,
  LucideSave,
  LucideSearch,
  LucideSettings2,
  LucideTags,
  LucideTrash2,
  LucideCalendarRange,
  LucideCopy,
  LucideUpload,
  LucideX,
  LucideBrickWall,
  LucideDollarSign,
  LucideKeyRound,
  LucideLink,
  LucideRefreshCw,
  LucideBlocks
} from "@lucide/angular";
import { MonthlyExpensesService } from "../../core/api/monthly-expenses.service";
import { MonthlyExpenseCatalogItem, MonthlyExpenseDetail, MonthlyExpenseIngestTokenStatus, MonthlyExpenseItem, MonthlyExpenseMonth, MonthlyExpensePendingItem, MonthlyExpenseType, UpsertMonthlyExpenseItemRequest } from "../../core/api/api.types";
import { IsumiButtonComponent, IsumiEmptyStateComponent, IsumiInputDirective, IsumiModalService, IsumiSelectDirective, IsumiTagComponent, IsumiTagTone, IsumiToastService, IsumiTooltipComponent, injectIsumiModalData, injectIsumiModalRef } from "../../shared/ui";
import { IsumiPageHeaderComponent } from "../../shared/ui/page-header.component";
import { formatBrl, formatMoneyInput, normalizeDecimalInput, parseMoneyCents } from "../../shared/utils/money";
import { environment } from "../../../environments/environment";
import { finalize } from "rxjs";

type CatalogKind = "category" | "payment";

interface MonthlyExpenseCatalogModalData {
  categories: () => MonthlyExpenseCatalogItem[];
  activeCategories: () => MonthlyExpenseCatalogItem[];
  paymentMethods: () => MonthlyExpenseCatalogItem[];
  activePaymentMethods: () => MonthlyExpenseCatalogItem[];
  initialKind: CatalogKind;
  archiveCatalog: (kind: CatalogKind, item: MonthlyExpenseCatalogItem) => void;
  reloadActiveDetail: () => void;
}

interface MonthlyExpenseItemModalData {
  item?: MonthlyExpenseItem;
  initialDescription?: string;
  initialTotalCents?: number;
  activeCategories: MonthlyExpenseCatalogItem[];
  activePaymentMethods: MonthlyExpenseCatalogItem[];
}

interface MonthlyExpenseShortcutModalData {
  endpointUrl: string;
}

const MONTH_NAMES = [
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

const TYPE_LABELS: Record<MonthlyExpenseType, string> = {
  FIXO: "Fixo",
  VARIAVEL: "Variável",
  RESERVA: "Reserva"
};

const TYPE_TAG_TONES: Record<MonthlyExpenseType, IsumiTagTone> = {
  FIXO: "rose",
  VARIAVEL: "indigo",
  RESERVA: "cyan"
};

interface CatalogPaletteOption {
  tone: IsumiTagTone;
  label: string;
  color: string;
  swatchClass: string;
}

const CATALOG_PALETTE: CatalogPaletteOption[] = [
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
    <div class="flex max-h-[calc(min(720px,calc(100dvh-32px))-40px)] min-h-0 flex-col gap-5 overflow-hidden max-sm:max-h-[calc(100dvh-112px)]">
      <header class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <h2 class="m-0 inline-flex items-center gap-2 text-[1.2rem] font-black">
            <span class="grid size-8 place-items-center rounded-md bg-primary/15 text-primary">
              <svg lucideSettings2 class="size-4" aria-hidden="true"></svg>
            </span>
            Categorias e pagamentos
          </h2>
          <p class="m-0 mt-1 text-sm text-muted-foreground">Dê cor e nome aos atalhos que aparecem nos novos gastos.</p>
        </div>
        <isumi-button class="max-sm:hidden" variant="ghost" size="sm" iconOnly ariaLabel="Fechar modal" (click)="modalRef.close()">
          <svg icon lucideX class="size-4" aria-hidden="true"></svg>
          Fechar
        </isumi-button>
      </header>

      <form class="grid gap-4 rounded-lg bg-secondary/55 p-3.5" (ngSubmit)="saveCatalogItem()">
        <div class="grid gap-3">
          <div class="grid gap-1.5" role="group" aria-labelledby="catalog-kind-label">
            <span id="catalog-kind-label" class="min-h-5 text-sm font-extrabold leading-5 text-muted-foreground">Tipo</span>
            <div class="grid h-12 grid-cols-2 gap-1 rounded-md bg-background p-1">
              <isumi-button type="button" size="md" fullWidth [variant]="catalogKind() === 'category' ? 'primary' : 'ghost'" [ariaPressed]="catalogKind() === 'category'" (click)="setCatalogKind('category')">
                <svg icon lucideTags class="size-4" aria-hidden="true"></svg>
                Categoria
              </isumi-button>
              <isumi-button type="button" size="md" fullWidth [variant]="catalogKind() === 'payment' ? 'primary' : 'ghost'" [ariaPressed]="catalogKind() === 'payment'" (click)="setCatalogKind('payment')">
                <svg icon lucideCreditCard class="size-4" aria-hidden="true"></svg>
                Pagamento
              </isumi-button>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-3 gap-y-3 max-sm:grid-cols-1">
          <label class="grid gap-2">
            <span class="text-sm font-extrabold text-muted-foreground">Nome</span>
            <input isumiInput name="catalogName" [ngModel]="catalogName()" (ngModelChange)="catalogName.set($event.slice(0, 80))" maxlength="80" required [placeholder]="catalogKind() === 'category' ? 'Mercado, casa, lazer...' : 'Banco, dinheiro, VR...'">
          </label>
          <div class="grid gap-2" role="radiogroup" aria-label="Escolher cor">
            <span class="inline-flex items-center gap-1.5 text-sm font-extrabold text-muted-foreground">
              <svg lucidePalette class="size-4" aria-hidden="true"></svg>
              Cor
            </span>
            <div class="grid grid-cols-10 gap-2 rounded-md bg-zinc-950/50 border-input border p-2 max-sm:grid-cols-5">
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
          <isumi-button class="sm:col-span-2" fullWidth type="submit" size="lg" [loading]="saving()">
            <svg icon lucidePlus class="size-4" aria-hidden="true"></svg>
            Criar
          </isumi-button>
        </div>
      </form>

      <div class="grid min-h-0 grid-cols-2 gap-4 overflow-hidden max-md:grid-cols-1">
        <section class="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-2">
          <div class="flex items-center justify-between gap-3">
            <h3 class="m-0 text-base font-black">Categorias</h3>
            <isumi-tag tone="secondary">{{ (data?.activeCategories() || []).length }} ativas</isumi-tag>
          </div>

          <div class="grid min-h-0 content-start gap-2 overflow-y-auto overscroll-contain">
            @for (category of data?.categories() || []; track category.id) {
              <div class="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg bg-secondary px-3 py-2.5" [class.opacity-50]="category.archived">
                <span class="inline-flex min-w-0 items-center gap-2">
                  <i class="size-3 rounded-full" [style.background]="category.color"></i>
                  <strong class="truncate">{{ category.name }}</strong>
                </span>
                @if (!category.archived) {
                  <isumi-button variant="ghost" size="sm" iconOnly ariaLabel="Arquivar categoria" (click)="data?.archiveCatalog('category', category)">
                    <svg icon lucideArchive class="size-4" aria-hidden="true"></svg>
                    Arquivar
                  </isumi-button>
                }
              </div>
            } @empty {
              <div class="flex min-h-14 items-center rounded-lg bg-secondary/60 px-3 py-2.5 text-sm font-semibold text-muted-foreground">
                Comece com algo como Mercado, Casa ou Lazer.
              </div>
            }
          </div>
        </section>

        <section class="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-2">
          <div class="flex items-center justify-between gap-3">
            <h3 class="m-0 text-base font-black">Pagamentos</h3>
            <isumi-tag tone="secondary">{{ (data?.activePaymentMethods() || []).length }} ativos</isumi-tag>
          </div>
          <div class="grid min-h-0 content-start gap-2 overflow-y-auto overscroll-contain">
            @for (method of data?.paymentMethods() || []; track method.id) {
            <div class="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg bg-secondary px-3 py-2.5" [class.opacity-50]="method.archived">
              <span class="inline-flex min-w-0 items-center gap-2">
                <i class="size-3 rounded-full" [style.background]="method.color"></i>
                <strong class="truncate">{{ method.name }}</strong>
              </span>
              @if (!method.archived) {
                <isumi-button variant="ghost" size="sm" iconOnly ariaLabel="Arquivar pagamento" (click)="data?.archiveCatalog('payment', method)">
                  <svg icon lucideArchive class="size-4" aria-hidden="true"></svg>
                  Arquivar
                </isumi-button>
              }
            </div>
          } @empty {
            <div class="flex min-h-14 items-center rounded-lg bg-secondary/60 px-3 py-2.5 text-sm font-semibold text-muted-foreground">
              Adicione cartão, dinheiro ou conta principal.
            </div>
          }
          </div>
        </section>
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
      ? "ring-2 ring-white ring-offset-2 ring-offset-background"
      : "ring-1 ring-white/10 hover:ring-white/35";

    return `size-8 cursor-pointer justify-self-center rounded-md ${option.swatchClass} ${selected} transition-[box-shadow,transform] duration-150 active:scale-95`;
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
      let copied = false;

      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(value);
          copied = true;
        } catch {
          copied = false;
        }
      }

      if (!copied) {
        this.copyWithTextarea(value);
      }

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

  private copyWithTextarea(value: string): void {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();

    const copied = document.execCommand("copy");
    textarea.remove();

    if (!copied) {
      throw new Error("Copy command failed");
    }
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
        <isumi-button mobileFull variant="secondary" type="button" (click)="modalRef.close()">Cancelar</isumi-button>
        <isumi-button mobileFull type="submit">
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
      this.modalRef.close(payload);
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

@Component({
  selector: "isumi-monthly-expenses",
  standalone: true,
  imports: [
    FormsModule,
    IsumiButtonComponent,
    IsumiEmptyStateComponent,
    IsumiInputDirective,
    IsumiPageHeaderComponent,
    IsumiSelectDirective,
    IsumiTagComponent,
    IsumiTooltipComponent,
    LucideArchive,
    LucideArrowBigRightDash,
    LucideArrowUp,
    LucideBanknoteArrowUp,
    LucideCalendar,
    LucideCalendarDays,
    LucideCalendars,
    LucideCheck,
    LucideChevronLeft,
    LucideChevronRight,
    LucideCreditCard,
    LucideDownload,
    LucideBrushCleaning,
    LucideFlag,
    LucideCoins,
    LucideGoal,
    LucidePalette,
    LucidePencil,
    LucidePiggyBank,
    LucideCalendarRange,
    LucidePlus,
    LucideReceiptText,
    LucideBrickWall,
    LucideDollarSign,
    LucideSave,
    LucideSearch,
    LucideSettings2,
    LucideTags,
    LucideTrash2,
    LucideUpload,
    LucideBlocks,
    LucideX
  ],
  templateUrl: "./monthly-expenses.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MonthlyExpensesComponent implements OnInit {
  private readonly api = inject(MonthlyExpensesService);
  private readonly modal = inject(IsumiModalService);
  private readonly toast = inject(IsumiToastService);
  private readonly backToTopThreshold = 640;
  private currentDetailRequestId: string | null = null;
  private currentPendingRequestId: string | null = null;

  readonly months = signal<MonthlyExpenseMonth[]>([]);
  readonly detail = signal<MonthlyExpenseDetail | null>(null);
  readonly pendingItems = signal<MonthlyExpensePendingItem[]>([]);
  readonly pendingItemsMonthId = signal<string | null>(null);
  readonly loading = signal(false);
  readonly loadingPending = signal(false);
  readonly saving = signal(false);
  readonly showBackToTop = signal(false);
  readonly selectedYear = signal(new Date().getFullYear());
  readonly selectedMonth = signal(new Date().getMonth() + 1);
  readonly income = signal("");
  readonly variableLimit = signal("");
  readonly query = signal("");
  readonly typeFilter = signal<MonthlyExpenseType | "ALL">("ALL");
  readonly categoryFilter = signal("ALL");
  readonly paymentFilter = signal("ALL");
  readonly catalogModalOpen = signal(false);
  readonly expenseModalOpen = signal(false);
  readonly editingItem = signal<MonthlyExpenseItem | null>(null);
  readonly catalogPalette = CATALOG_PALETTE;
  readonly catalogName = signal("");
  readonly catalogColor = signal("#8b5cf6");
  readonly catalogKind = signal<CatalogKind>("category");
  readonly itemDescription = signal("");
  readonly itemCategoryId = signal("");
  readonly itemPaymentMethodId = signal("");
  readonly itemTotal = signal("");
  readonly itemInstallments = signal(1);
  readonly itemType = signal<MonthlyExpenseType>("VARIAVEL");
  readonly csvErrors = signal<Array<{ line: number; message: string }>>([]);
  readonly shortcutEndpointUrl = `${environment.apiBaseUrl}/tools/monthly-expenses/apple-pay/pending`;

  readonly activeMonth = computed(() =>
    this.months().find((month) => month.year === this.selectedYear() && month.month === this.selectedMonth()) || null
  );
  readonly monthOptions = computed(() =>
    [...this.months()].sort((a, b) => a.year - b.year || a.month - b.month)
  );
  readonly monthLabel = computed(() => `${MONTH_NAMES[this.selectedMonth() - 1]} ${this.selectedYear()}`);
  readonly categories = computed(() => this.detail()?.categories || []);
  readonly activeCategories = computed(() => this.categories().filter((item) => !item.archived));
  readonly paymentMethods = computed(() => this.detail()?.paymentMethods || []);
  readonly activePaymentMethods = computed(() => this.paymentMethods().filter((item) => !item.archived));
  readonly catalogKindLabel = computed(() => this.catalogKind() === "category" ? "Categoria" : "Pagamento");
  readonly visiblePendingItems = computed(() =>
    this.pendingItemsMonthId() === this.detail()?.month.id ? this.pendingItems() : []
  );
  readonly variableProgress = computed(() => {
    const summary = this.detail()?.summary;
    if (!summary || summary.variableLimitCents <= 0) {
      return 0;
    }

    return Math.min(100, Math.round((summary.variableSpentCents / summary.variableLimitCents) * 100));
  });
  readonly filteredItems = computed(() => {
    const search = this.query().trim().toLocaleLowerCase("pt-BR");

    return (this.detail()?.items || []).filter((item) => {
      const matchesSearch = !search || [
        item.description,
        item.categoryName,
        item.paymentMethodName,
        this.typeLabel(item.expenseType)
      ].some((value) => value.toLocaleLowerCase("pt-BR").includes(search));
      const matchesType = this.typeFilter() === "ALL" || item.expenseType === this.typeFilter();
      const matchesCategory = this.categoryFilter() === "ALL" || item.categoryId === this.categoryFilter();
      const matchesPayment = this.paymentFilter() === "ALL" || item.paymentMethodId === this.paymentFilter();

      return matchesSearch && matchesType && matchesCategory && matchesPayment;
    });
  });
  readonly hasMigratableFixedExpenses = computed(() =>
    (this.detail()?.items || []).some((item) =>
      item.expenseType === "FIXO" &&
      item.installmentNumber === 1 &&
      item.installmentTotal === 1
    )
  );

  ngOnInit(): void {
    this.updateBackToTopVisibility();
    this.loadMonths();
  }

  @HostListener("window:scroll")
  onWindowScroll(): void {
    this.updateBackToTopVisibility();
  }

  @HostListener("window:keydown", ["$event"])
  onWindowKeydown(event: KeyboardEvent): void {
    if (!this.isAddExpenseShortcut(event)) {
      return;
    }

    event.preventDefault();

    if (this.modal.hasOpenModals() || this.catalogModalOpen() || this.expenseModalOpen()) {
      return;
    }

    if (!this.detail()) {
      return;
    }

    if (this.activeCategories().length === 0 || this.activePaymentMethods().length === 0) {
      this.toast.error("Crie uma categoria e um pagamento antes de adicionar gastos.", {
        id: "monthly-expense-shortcut-catalog-required"
      });
      return;
    }

    this.openExpenseModal();
  }

  loadMonths(): void {
    this.loading.set(true);
    this.api.listMonths().subscribe({
      next: (months) => {
        this.months.set(months);
        const active = this.activeMonth() || months[0];

        if (active) {
          this.selectedYear.set(active.year);
          this.selectedMonth.set(active.month);
          this.loadDetail(active.id);
        } else {
          this.detail.set(null);
          this.pendingItems.set([]);
          this.pendingItemsMonthId.set(null);
          this.currentPendingRequestId = null;
          this.loading.set(false);
        }
      },
      error: () => {
        this.toast.error("Não foi possível carregar seus meses.", { id: "monthly-expense-load-months-error" });
        this.loading.set(false);
      }
    });
  }

  createSelectedMonth(): void {
    if (this.saving()) {
      return;
    }

    this.saving.set(true);
    this.api.createMonth({ year: this.selectedYear(), month: this.selectedMonth() }).pipe(
      finalize(() => this.saving.set(false))
    ).subscribe({
      next: (detail) => {
        this.setDetail(detail);
        this.months.update((months) => [detail.month, ...months].sort((a, b) => b.year - a.year || b.month - a.month));
        this.toast.success("Orçamento criado com sucesso", { id: "monthly-expense-create-month" });
      },
      error: (error: unknown) => this.handleError(error, "Não foi possível criar este orçamento.")
    });
  }

  shiftMonth(offset: number): void {
    const total = this.selectedYear() * 12 + this.selectedMonth() - 1 + offset;
    this.selectedYear.set(Math.floor(total / 12));
    this.selectedMonth.set(total % 12 + 1);
    const active = this.activeMonth();
    this.detail.set(null);
    this.csvErrors.set([]);

    if (active) {
      this.loadDetail(active.id);
    } else {
      this.currentDetailRequestId = null;
      this.currentPendingRequestId = null;
      this.pendingItems.set([]);
      this.pendingItemsMonthId.set(null);
      this.loading.set(false);
    }
  }

  selectMonth(monthId: string): void {
    const selected = this.months().find((month) => month.id === monthId);
    if (!selected) {
      return;
    }

    this.selectedYear.set(selected.year);
    this.selectedMonth.set(selected.month);
    this.loadDetail(selected.id);
  }

  saveSettings(): void {
    const detail = this.detail();
    if (!detail) {
      return;
    }

    const incomeCents = parseMoneyCents(this.income(), { allowZero: true });
    const variableLimitCents = parseMoneyCents(this.variableLimit(), { allowZero: true });

    if (incomeCents === null || variableLimitCents === null) {
      this.toast.error("Informe entrada e limite variável válidos.", { id: "monthly-expense-settings-invalid" });
      return;
    }

    this.saving.set(true);
    this.api.updateMonth(detail.month.id, { incomeCents, variableLimitCents }).pipe(
      finalize(() => this.saving.set(false))
    ).subscribe({
      next: (updated) => this.setDetail(updated),
      error: () => this.toast.error("Não foi possível salvar os valores do mês.", { id: "monthly-expense-settings-save-error" })
    });
  }

  migrateFixedExpensesToNextMonth(): void {
    const detail = this.detail();
    if (!detail || this.saving()) {
      return;
    }

    this.saving.set(true);
    this.api.migrateFixedExpensesToNextMonth(detail.month.id).pipe(
      finalize(() => this.saving.set(false))
    ).subscribe({
      next: (result) => {
        this.setDetail(result.detail);
        this.selectedYear.set(result.detail.month.year);
        this.selectedMonth.set(result.detail.month.month);
        this.months.update((months) => [
          result.detail.month,
          ...months.filter((month) => month.id !== result.detail.month.id)
        ].sort((a, b) => b.year - a.year || b.month - a.month));
        this.toast.success(
          result.copied === 1
            ? "1 gasto fixo migrado para o próximo mês."
            : `${result.copied} gastos fixos migrados para o próximo mês.`,
          { id: "monthly-expense-fixed-migration" }
        );
      },
      error: () => this.toast.error("Não foi possível migrar os gastos fixos.", { id: "monthly-expense-fixed-migration-error" })
    });
  }

  openCatalogModal(kind: CatalogKind = "category"): void {
    this.modal.open<MonthlyExpenseCatalogModalComponent, MonthlyExpenseCatalogModalData, void>(MonthlyExpenseCatalogModalComponent, {
      data: {
        categories: this.categories,
        activeCategories: this.activeCategories,
        paymentMethods: this.paymentMethods,
        activePaymentMethods: this.activePaymentMethods,
        initialKind: kind,
        archiveCatalog: (catalogKind, item) => this.archiveCatalog(catalogKind, item),
        reloadActiveDetail: () => this.reloadActiveDetail()
      },
      ariaLabel: "Categorias e pagamentos",
      panelClass: "w-[min(100%,860px)]"
    });
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
      finalize(() => {
        this.saving.set(false);
        this.catalogName.set("");
      })
    ).subscribe({
      next: () => {
        this.toast.success(`${this.catalogKindLabel()} criado(a).`, { id: `monthly-expense-catalog-${kindLabel}-created` });
        this.reloadActiveDetail();
      },
      error: () => this.toast.error("Não foi possível salvar este cadastro.", { id: "monthly-expense-catalog-save-error" })
    });
  }

  archiveCatalog(kind: CatalogKind, item: MonthlyExpenseCatalogItem): void {
    const request = kind === "category"
      ? this.api.updateCategory(item.id, { name: item.name, color: item.color, archived: true })
      : this.api.updatePaymentMethod(item.id, { name: item.name, color: item.color, archived: true });

    this.saving.set(true);
    request.pipe(
      finalize(() => this.saving.set(false))
    ).subscribe({
      next: () => this.reloadActiveDetail(),
      error: () => this.toast.error("Não foi possível arquivar este cadastro.", { id: "monthly-expense-catalog-archive-error" })
    });
  }

  openExpenseModal(item?: MonthlyExpenseItem): void {
    const ref = this.modal.open<MonthlyExpenseItemModalComponent, MonthlyExpenseItemModalData, UpsertMonthlyExpenseItemRequest>(MonthlyExpenseItemModalComponent, {
      data: {
        item,
        activeCategories: this.activeCategories(),
        activePaymentMethods: this.activePaymentMethods()
      },
      ariaLabel: item ? "Editar gasto mensal" : "Adicionar gasto mensal",
      panelClass: "w-[min(100%,860px)]"
    });

    ref.afterClosed().subscribe((payload) => {
      if (payload) {
        this.saveExpenseItem(payload, item);
      }
    });
  }

  openShortcutModal(): void {
    this.modal.open<MonthlyExpenseShortcutModalComponent, MonthlyExpenseShortcutModalData, void>(MonthlyExpenseShortcutModalComponent, {
      data: { endpointUrl: this.shortcutEndpointUrl },
      ariaLabel: "Integração com atalhos do iPhone",
      panelClass: "w-[min(100%,820px)]"
    });
  }

  openPendingApproval(pending: MonthlyExpensePendingItem): void {
    const ref = this.modal.open<MonthlyExpenseItemModalComponent, MonthlyExpenseItemModalData, UpsertMonthlyExpenseItemRequest>(MonthlyExpenseItemModalComponent, {
      data: {
        initialDescription: pending.merchantName,
        initialTotalCents: pending.amount,
        activeCategories: this.activeCategories(),
        activePaymentMethods: this.activePaymentMethods()
      },
      ariaLabel: "Aprovar compra pendente",
      panelClass: "w-[min(100%,860px)]"
    });

    ref.afterClosed().subscribe((payload) => {
      if (payload) {
        this.approvePendingItem(pending, payload);
      }
    });
  }

  approvePendingItem(pending: MonthlyExpensePendingItem, payload: UpsertMonthlyExpenseItemRequest): void {
    const detail = this.detail();
    if (!detail) {
      return;
    }

    this.saving.set(true);
    this.api.approvePendingItem(detail.month.id, pending.id, {
      description: payload.description,
      categoryId: payload.categoryId,
      paymentMethodId: payload.paymentMethodId,
      installmentTotal: payload.installmentTotal,
      expenseType: payload.expenseType
    }).pipe(
      finalize(() => this.saving.set(false))
    ).subscribe({
      next: (updated) => {
        this.setDetail(updated);
        this.reloadMonthsOnly();
        this.toast.success("Compra aprovada.", { id: "monthly-expense-pending-approved" });
      },
      error: () => this.toast.error("Não foi possível aprovar esta compra.", { id: "monthly-expense-pending-approve-error" })
    });
  }

  dismissPendingItem(pending: MonthlyExpensePendingItem): void {
    const detail = this.detail();
    if (!detail) {
      return;
    }

    this.saving.set(true);
    this.api.dismissPendingItem(detail.month.id, pending.id).pipe(
      finalize(() => this.saving.set(false))
    ).subscribe({
      next: () => {
        this.pendingItems.update((items) => items.filter((item) => item.id !== pending.id));
        this.toast.success("Compra descartada.", { id: "monthly-expense-pending-dismissed" });
      },
      error: () => this.toast.error("Não foi possível descartar esta compra.", { id: "monthly-expense-pending-dismiss-error" })
    });
  }

  saveExpenseItem(payload?: UpsertMonthlyExpenseItemRequest, item?: MonthlyExpenseItem): void {
    const detail = this.detail();
    const requestPayload = payload || this.buildItemPayload();

    if (!detail || !requestPayload) {
      return;
    }

    const editing = item || this.editingItem();
    const request = editing
      ? this.api.updateItem(detail.month.id, editing!.id, requestPayload)
      : this.api.createItem(detail.month.id, requestPayload);

    this.saving.set(true);
    request.pipe(
      finalize(() => this.saving.set(false))
    ).subscribe({
      next: (updated) => {
        this.setDetail(updated);
        this.reloadMonthsOnly();
      },
      error: () => this.toast.error("Não foi possível salvar o gasto.", { id: "monthly-expense-item-save-error" })
    });
  }

  deleteExpenseItem(item: MonthlyExpenseItem): void {
    const detail = this.detail();
    if (!detail) {
      return;
    }

    this.saving.set(true);
    this.api.deleteItem(detail.month.id, item.id).pipe(
      finalize(() => this.saving.set(false))
    ).subscribe({
      next: () => this.loadDetail(detail.month.id),
      error: () => this.toast.error("Não foi possível remover o gasto.", { id: "monthly-expense-item-delete-error" })
    });
  }

  exportCsv(): void {
    const detail = this.detail();
    if (!detail) {
      return;
    }

    this.api.exportCsv(detail.month.id).subscribe({
      next: (csv) => {
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `gastos-${detail.month.year}-${String(detail.month.month).padStart(2, "0")}.csv`;
        link.click();
        URL.revokeObjectURL(url);
      },
      error: () => this.toast.error("Não foi possível exportar o CSV.", { id: "monthly-expense-csv-export-error" })
    });
  }

  importCsv(event: Event): void {
    const detail = this.detail();
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!detail || !file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      this.saving.set(true);
      this.api.importCsv(detail.month.id, String(reader.result || "")).pipe(
        finalize(() => {
          this.saving.set(false);
          input.value = "";
        })
      ).subscribe({
        next: (result) => {
          this.csvErrors.set(result.errors);
          this.setDetail(result.detail);
          if (result.errors.length === 0) {
            this.toast.success(`${result.imported} gasto(s) importado(s).`, { id: "monthly-expense-csv-imported" });
          }
        },
        error: () => this.toast.error("Não foi possível importar este CSV.", { id: "monthly-expense-csv-import-error" })
      });
    };
    reader.readAsText(file);
  }

  money(amountCents: number): string {
    return formatBrl(amountCents);
  }

  scrollToTop(): void {
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    window.scrollTo({ top: 0, behavior });
  }

  transactionDateLabel(value: string): string {
    const [year, month, day] = value.split("-");
    return year && month && day ? `${day}/${month}/${year}` : value;
  }

  typeLabel(type: MonthlyExpenseType): string {
    return TYPE_LABELS[type];
  }

  typeTagTone(type: MonthlyExpenseType): IsumiTagTone {
    return TYPE_TAG_TONES[type];
  }

  tagTone(color: string): IsumiTagTone {
    const normalized = color.trim().toLowerCase();
    return CATALOG_PALETTE.find((option) => option.color === normalized)?.tone ?? "slate";
  }

  setIncome(value: string | number): void {
    this.income.set(normalizeDecimalInput(value));
  }

  setVariableLimit(value: string | number): void {
    this.variableLimit.set(normalizeDecimalInput(value));
  }

  setItemTotal(value: string | number): void {
    this.itemTotal.set(normalizeDecimalInput(value));
  }

  selectCatalogColor(option: CatalogPaletteOption): void {
    this.catalogColor.set(option.color);
  }

  paletteOptionClasses(option: CatalogPaletteOption): string {
    const selected = this.catalogColor() === option.color
      ? "ring-2 ring-white ring-offset-2 ring-offset-background"
      : "ring-1 ring-white/10 hover:ring-white/35";

    return `size-8 rounded-md ${option.swatchClass} ${selected} transition-[box-shadow,transform] duration-150 active:scale-95`;
  }

  private loadDetail(monthId: string): void {
    this.currentDetailRequestId = monthId;
    this.loading.set(true);
    this.api.getMonth(monthId).pipe(
      finalize(() => {
        if (this.currentDetailRequestId === monthId) {
          this.currentDetailRequestId = null;
          this.loading.set(false);
        }
      })
    ).subscribe({
      next: (detail) => {
        if (this.currentDetailRequestId === monthId) {
          this.setDetail(detail);
        }
      },
      error: () => {
        if (this.currentDetailRequestId === monthId) {
          this.toast.error("Não foi possível carregar este mês.", { id: "monthly-expense-load-detail-error" });
        }
      }
    });
  }

  private reloadActiveDetail(): void {
    const detail = this.detail();
    if (detail) {
      this.loadDetail(detail.month.id);
    }
  }

  private reloadMonthsOnly(): void {
    this.api.listMonths().subscribe({ next: (months) => this.months.set(months) });
  }

  private setDetail(detail: MonthlyExpenseDetail): void {
    if (this.pendingItemsMonthId() !== detail.month.id) {
      this.pendingItems.set([]);
      this.pendingItemsMonthId.set(null);
    }

    this.detail.set(detail);
    this.income.set(formatMoneyInput(detail.month.incomeCents));
    this.variableLimit.set(formatMoneyInput(detail.month.variableLimitCents));
    this.loadPendingItems(detail.month.id);
  }

  private loadPendingItems(monthId: string): void {
    if (this.pendingItemsMonthId() !== monthId) {
      this.pendingItems.set([]);
      this.pendingItemsMonthId.set(null);
    }

    this.currentPendingRequestId = monthId;
    this.loadingPending.set(true);
    this.api.listPendingItems(monthId).pipe(
      finalize(() => {
        if (this.currentPendingRequestId === monthId) {
          this.currentPendingRequestId = null;
          this.loadingPending.set(false);
        }
      })
    ).subscribe({
      next: (items) => {
        if (this.currentPendingRequestId === monthId) {
          this.pendingItems.set(items);
          this.pendingItemsMonthId.set(monthId);
        }
      },
      error: () => {
        if (this.currentPendingRequestId !== monthId) {
          return;
        }

        this.pendingItems.set([]);
        this.pendingItemsMonthId.set(monthId);
        this.toast.error("Não foi possível carregar as compras pendentes.", { id: "monthly-expense-pending-load-error" });
      }
    });
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

  private updateBackToTopVisibility(): void {
    const shouldShow = window.scrollY > this.backToTopThreshold;
    if (this.showBackToTop() !== shouldShow) {
      this.showBackToTop.set(shouldShow);
    }
  }

  private isAddExpenseShortcut(event: KeyboardEvent): boolean {
    return event.altKey &&
      !event.metaKey &&
      !event.shiftKey &&
      !event.repeat &&
      event.key.toLocaleLowerCase("pt-BR") === "n";
  }

  private handleError(error: unknown, fallback: string): void {
    if (error instanceof HttpErrorResponse && error.status === 409) {
      this.toast.error("Este mês já existe.", { id: "monthly-expense-conflict-error" });
      return;
    }

    this.toast.error(fallback, { id: "monthly-expense-fallback-error" });
  }
}
