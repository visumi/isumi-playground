import { HttpErrorResponse } from "@angular/common/http";
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import {
  LucideArchive,
  LucideBanknoteArrowUp,
  LucideCalendar,
  LucideCalendarDays,
  LucideCalendars,
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
  LucideUpload,
  LucideX,
  LucideBrickWall,
  LucideDollarSign
} from "@lucide/angular";
import { MonthlyExpensesService } from "../../core/api/monthly-expenses.service";
import { MonthlyExpenseCatalogItem, MonthlyExpenseDetail, MonthlyExpenseItem, MonthlyExpenseMonth, MonthlyExpenseType, UpsertMonthlyExpenseItemRequest } from "../../core/api/api.types";
import { IsumiBadgeComponent, IsumiBadgeVariant, IsumiButtonComponent, IsumiEmptyStateComponent, IsumiInputDirective, IsumiSelectDirective, IsumiToastService } from "../../shared/ui";
import { IsumiPageHeaderComponent } from "../../shared/ui/page-header.component";
import { finalize } from "rxjs";

type CatalogKind = "category" | "payment";

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
  "NOVE",
  "DEZ"
];

const TYPE_LABELS: Record<MonthlyExpenseType, string> = {
  FIXO: "Fixo",
  VARIAVEL: "Variável",
  RESERVA: "Reserva"
};

const TYPE_BADGE_VARIANTS: Record<MonthlyExpenseType, IsumiBadgeVariant> = {
  FIXO: "rose",
  VARIAVEL: "indigo",
  RESERVA: "cyan"
};

function normalizeMoneyInput(value: string | number): string {
  const raw = String(value).replace(/[^\d,.]/g, "");
  const separatorIndex = raw.search(/[,.]/);

  if (separatorIndex === -1) {
    return raw;
  }

  const whole = raw.slice(0, separatorIndex).replace(/[,.]/g, "");
  const decimal = raw.slice(separatorIndex + 1).replace(/[,.]/g, "").slice(0, 2);
  return `${whole},${decimal}`;
}

@Component({
  selector: "isumi-monthly-expenses",
  standalone: true,
  imports: [
    FormsModule,
    IsumiBadgeComponent,
    IsumiButtonComponent,
    IsumiEmptyStateComponent,
    IsumiInputDirective,
    IsumiPageHeaderComponent,
    IsumiSelectDirective,
    LucideArchive,
    LucideBanknoteArrowUp,
    LucideCalendar,
    LucideCalendarDays,
    LucideCalendars,
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
    LucideX
  ],
  templateUrl: "./monthly-expenses.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MonthlyExpensesComponent implements OnInit {
  private readonly api = inject(MonthlyExpensesService);
  private readonly toast = inject(IsumiToastService);
  private currentDetailRequestId: string | null = null;

  readonly months = signal<MonthlyExpenseMonth[]>([]);
  readonly detail = signal<MonthlyExpenseDetail | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
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
  readonly catalogName = signal("");
  readonly catalogColor = signal("#9333ea");
  readonly catalogKind = signal<CatalogKind>("category");
  readonly itemDescription = signal("");
  readonly itemCategoryId = signal("");
  readonly itemPaymentMethodId = signal("");
  readonly itemTotal = signal("");
  readonly itemInstallments = signal(1);
  readonly itemType = signal<MonthlyExpenseType>("VARIAVEL");
  readonly csvErrors = signal<Array<{ line: number; message: string }>>([]);

  readonly activeMonth = computed(() =>
    this.months().find((month) => month.year === this.selectedYear() && month.month === this.selectedMonth()) || null
  );
  readonly monthLabel = computed(() => `${MONTH_NAMES[this.selectedMonth() - 1]} ${this.selectedYear()}`);
  readonly categories = computed(() => this.detail()?.categories || []);
  readonly activeCategories = computed(() => this.categories().filter((item) => !item.archived));
  readonly paymentMethods = computed(() => this.detail()?.paymentMethods || []);
  readonly activePaymentMethods = computed(() => this.paymentMethods().filter((item) => !item.archived));
  readonly catalogKindLabel = computed(() => this.catalogKind() === "category" ? "Categoria" : "Pagamento");
  readonly catalogPreviewName = computed(() => this.catalogName().trim() || `${this.catalogKindLabel()}`);
  readonly catalogHelperText = computed(() => this.catalogKind() === "category"
    ? "Dê um nome curto para encontrar gastos parecidos rapidinho."
    : "Separe cartões, contas ou dinheiro sem misturar os lançamentos."
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

  ngOnInit(): void {
    this.loadMonths();
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

    const incomeCents = this.parseMoney(this.income());
    const variableLimitCents = this.parseMoney(this.variableLimit());

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

  openCatalogModal(kind: CatalogKind = "category"): void {
    this.catalogKind.set(kind);
    this.catalogName.set("");
    this.catalogColor.set(kind === "category" ? "#9333ea" : "#2563eb");
    this.catalogModalOpen.set(true);
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
    this.editingItem.set(item || null);
    this.itemDescription.set(item?.description || "");
    this.itemCategoryId.set(item?.categoryId || this.activeCategories()[0]?.id || "");
    this.itemPaymentMethodId.set(item?.paymentMethodId || this.activePaymentMethods()[0]?.id || "");
    this.itemTotal.set(item ? this.formatMoneyInput(item.totalPurchaseCents) : "");
    this.itemInstallments.set(item ? 1 : 1);
    this.itemType.set(item?.expenseType || "VARIAVEL");
    this.expenseModalOpen.set(true);
  }

  saveExpenseItem(): void {
    const detail = this.detail();
    const payload = this.buildItemPayload();

    if (!detail || !payload) {
      return;
    }

    const editing = this.editingItem();
    const request = editing
      ? this.api.updateItem(detail.month.id, editing.id, payload)
      : this.api.createItem(detail.month.id, payload);

    this.saving.set(true);
    request.pipe(
      finalize(() => this.saving.set(false))
    ).subscribe({
      next: (updated) => {
        this.setDetail(updated);
        this.expenseModalOpen.set(false);
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
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(amountCents / 100);
  }

  typeLabel(type: MonthlyExpenseType): string {
    return TYPE_LABELS[type];
  }

  typeBadgeVariant(type: MonthlyExpenseType): IsumiBadgeVariant {
    return TYPE_BADGE_VARIANTS[type];
  }

  setIncome(value: string | number): void {
    this.income.set(normalizeMoneyInput(value));
  }

  setVariableLimit(value: string | number): void {
    this.variableLimit.set(normalizeMoneyInput(value));
  }

  setItemTotal(value: string | number): void {
    this.itemTotal.set(normalizeMoneyInput(value));
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
    this.detail.set(detail);
    this.income.set(this.formatMoneyInput(detail.month.incomeCents));
    this.variableLimit.set(this.formatMoneyInput(detail.month.variableLimitCents));
  }

  private buildItemPayload(): UpsertMonthlyExpenseItemRequest | null {
    const totalPurchaseCents = this.parseMoney(this.itemTotal());
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

  private parseMoney(value: string): number | null {
    const normalized = value.replace(/\./g, "").replace(",", ".").trim();

    if (!normalized) {
      return 0;
    }

    const parsed = Number(normalized);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return null;
    }

    return Math.round(parsed * 100);
  }

  private formatMoneyInput(amountCents: number): string {
    return (amountCents / 100).toFixed(2).replace(".", ",");
  }

  private handleError(error: unknown, fallback: string): void {
    if (error instanceof HttpErrorResponse && error.status === 409) {
      this.toast.error("Este mês já existe.", { id: "monthly-expense-conflict-error" });
      return;
    }

    this.toast.error(fallback, { id: "monthly-expense-fallback-error" });
  }
}
