import { UpperCasePipe } from "@angular/common";
import { HttpErrorResponse } from "@angular/common/http";
import { ChangeDetectionStrategy, Component, HostListener, OnInit, computed, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import {
  LucideArrowBigRightDash,
  LucideArrowUp,
  LucideBanknoteArrowUp,
  LucideCalendar,
  LucideCalendarDays,
  LucideCheck,
  LucideChevronLeft,
  LucideChevronRight,
  LucideDownload,
  LucideBrushCleaning,
  LucideCoins,
  LucideGoal,
  LucidePencil,
  LucidePiggyBank,
  LucidePlus,
  LucideReceiptText,
  LucideSave,
  LucideSearch,
  LucideSettings2,
  LucideTableOfContents,
  LucideTrash2,
  LucideCalendarRange,
  LucideUpload,
  LucideBrickWall,
  LucideDollarSign,
  LucideBlocks
} from "@lucide/angular";
import { MonthlyExpensesService } from "../../core/api/monthly-expenses.service";
import { MonthlyExpenseCatalogItem, MonthlyExpenseDetail, MonthlyExpenseItem, MonthlyExpenseMonth, MonthlyExpensePendingItem, MonthlyExpenseType, UpsertMonthlyExpenseItemRequest } from "../../core/api/api.types";
import { IsumiButtonComponent, IsumiDownloadService, IsumiEmptyStateComponent, IsumiFilterChipComponent, IsumiInputDirective, IsumiModalService, IsumiSelectDirective, IsumiTabComponent, IsumiTagComponent, IsumiTagTone, IsumiToastService, IsumiTooltipComponent } from "../../shared/ui";
import { IsumiPageHeaderComponent } from "../../shared/ui/page-header.component";
import { formatBrl, formatMoneyInput, normalizeDecimalInput, parseMoneyCents } from "../../shared/utils/money";
import { environment } from "../../../environments/environment";
import { finalize, firstValueFrom } from "rxjs";

import {
  CATALOG_PALETTE,
  MONTH_NAMES,
  TYPE_LABELS,
  TYPE_TAG_TONES,
  MonthlyExpenseCatalogModalComponent,
  MonthlyExpenseItemModalComponent,
  MonthlyExpenseShortcutModalComponent,
  type CatalogKind,
  type MonthlyExpenseCatalogModalData,
  type MonthlyExpenseItemModalData,
  type MonthlyExpenseShortcutModalData
} from "./monthly-expense-modals";

const MAX_CSV_IMPORT_BYTES = 256 * 1024;
const MAX_CSV_IMPORT_ROWS = 1_000;
const MOBILE_SWIPE_LIMIT_PX = 88;
const MOBILE_SWIPE_THRESHOLD_PX = 56;
const MOBILE_SWIPE_AXIS_LOCK_PX = 8;
const CATEGORY_INSIGHT_LIMIT = 5;
const CATEGORY_OTHER_COLOR = "#71717a";
const CATEGORY_CHART_PALETTE = ["#a78bfa", "#34d399", "#38bdf8", "#fbbf24", "#fb7185"];
const CATEGORY_CHART_RADIUS = 42;
const CATEGORY_CHART_CIRCUMFERENCE = 2 * Math.PI * CATEGORY_CHART_RADIUS;

type MonthlyExpenseView = "list" | "insights";

interface MonthlyExpenseCategoryInsight {
  categoryId: string;
  name: string;
  color: string;
  amountCents: number;
  percent: number;
  strokeDasharray: string;
  strokeDashoffset: string;
  delayMs: number;
}

@Component({
  selector: "isumi-monthly-expenses",
  standalone: true,
  imports: [
    FormsModule,
    IsumiButtonComponent,
    IsumiEmptyStateComponent,
    IsumiFilterChipComponent,
    IsumiInputDirective,
    IsumiPageHeaderComponent,
    IsumiSelectDirective,
    IsumiTabComponent,
    IsumiTagComponent,
    IsumiTooltipComponent,
    UpperCasePipe,
    LucideArrowBigRightDash,
    LucideArrowUp,
    LucideBanknoteArrowUp,
    LucideCalendar,
    LucideCalendarDays,
    LucideCheck,
    LucideChevronLeft,
    LucideChevronRight,
    LucideDownload,
    LucideBrushCleaning,
    LucideCoins,
    LucideGoal,
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
    LucideTableOfContents,
    LucideTrash2,
    LucideUpload,
    LucideBlocks
  ],
  templateUrl: "./monthly-expenses.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MonthlyExpensesComponent implements OnInit {
  private readonly api = inject(MonthlyExpensesService);
  private readonly modal = inject(IsumiModalService);
  private readonly toast = inject(IsumiToastService);
  private readonly download = inject(IsumiDownloadService);
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
  readonly selectedView = signal<MonthlyExpenseView>("list");
  readonly typeFilter = signal<MonthlyExpenseType | "ALL">("ALL");
  readonly categoryFilter = signal("ALL");
  readonly paymentFilter = signal("ALL");
  readonly csvErrors = signal<Array<{ line: number; message: string }>>([]);
  readonly mobileActionsOpen = signal(false);
  readonly mobileSwipeItemId = signal<string | null>(null);
  readonly mobileSwipeOffset = signal(0);
  readonly activeCategoryInsightId = signal<string | null>(null);
  readonly chartRadius = CATEGORY_CHART_RADIUS;
  readonly shortcutEndpointUrl = `${environment.apiBaseUrl}/tools/monthly-expenses/apple-pay/pending`;
  private mobileSwipeStart: { itemId: string; pointerId: number; x: number; y: number; lockedAxis: "x" | "y" | null } | null = null;

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
  readonly categoryInsights = computed<MonthlyExpenseCategoryInsight[]>(() => {
    const detail = this.detail();
    const totalCents = detail?.summary.monthTotalCents || 0;
    if (!detail || totalCents <= 0) {
      return [];
    }

    const categoryMap = new Map<string, { name: string; color: string; amountCents: number }>();
    for (const item of detail.items) {
      const current = categoryMap.get(item.categoryId) || {
        name: item.categoryName || "Categoria",
        color: item.categoryColor,
        amountCents: 0
      };

      current.amountCents += item.amountCents;
      categoryMap.set(item.categoryId, current);
    }

    const sorted = [...categoryMap.entries()]
      .map(([categoryId, item]) => ({ categoryId, ...item }))
      .filter((item) => item.amountCents > 0)
      .sort((a, b) => b.amountCents - a.amountCents || a.name.localeCompare(b.name, "pt-BR"));

    const visible = sorted.length > CATEGORY_INSIGHT_LIMIT
      ? [
          ...sorted.slice(0, CATEGORY_INSIGHT_LIMIT - 1),
          {
            categoryId: "other",
            name: "OUTROS",
            color: CATEGORY_OTHER_COLOR,
            amountCents: sorted.slice(CATEGORY_INSIGHT_LIMIT - 1).reduce((total, item) => total + item.amountCents, 0)
          }
        ]
      : sorted;

    const gap = visible.length > 1 ? 12 : 0;
    const drawableCircumference = CATEGORY_CHART_CIRCUMFERENCE - gap * visible.length;
    let cursor = 0;
    return visible.map((item, index) => {
      const rawPercent = item.amountCents / totalCents * 100;
      const segmentLength = visible.length === 1 ? CATEGORY_CHART_CIRCUMFERENCE : Math.max(6, item.amountCents / totalCents * drawableCircumference);
      const strokeDashoffset = -cursor;
      cursor += segmentLength + gap;

      return {
        ...item,
        color: item.categoryId === "other" ? CATEGORY_OTHER_COLOR : CATEGORY_CHART_PALETTE[index % CATEGORY_CHART_PALETTE.length],
        percent: Math.round(rawPercent),
        strokeDasharray: `${segmentLength} ${CATEGORY_CHART_CIRCUMFERENCE - segmentLength}`,
        strokeDashoffset: `${strokeDashoffset}`,
        delayMs: 90 + index * 70
      };
    });
  });
  readonly activeCategoryInsight = computed(() =>
    this.categoryInsights().find((item) => item.categoryId === this.activeCategoryInsightId()) || null
  );
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

    if (this.modal.hasOpenModals()) {
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
    this.modal.open<MonthlyExpenseItemModalComponent, MonthlyExpenseItemModalData, UpsertMonthlyExpenseItemRequest>(MonthlyExpenseItemModalComponent, {
      data: {
        item,
        activeCategories: this.activeCategories(),
        activePaymentMethods: this.activePaymentMethods()
      },
      ariaLabel: item ? "Editar gasto mensal" : "Adicionar gasto mensal",
      panelClass: "w-[min(100%,860px)]",
      onSubmit: (payload) => this.saveExpenseItem(payload, item)
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
    this.modal.open<MonthlyExpenseItemModalComponent, MonthlyExpenseItemModalData, UpsertMonthlyExpenseItemRequest>(MonthlyExpenseItemModalComponent, {
      data: {
        initialDescription: pending.merchantName,
        initialTotalCents: pending.amount,
        activeCategories: this.activeCategories(),
        activePaymentMethods: this.activePaymentMethods()
      },
      ariaLabel: "Aprovar compra pendente",
      panelClass: "w-[min(100%,860px)]",
      onSubmit: (payload) => this.approvePendingItem(pending, payload)
    });
  }

  async approvePendingItem(pending: MonthlyExpensePendingItem, payload: UpsertMonthlyExpenseItemRequest): Promise<void> {
    const detail = this.detail();
    if (!detail) {
      throw new Error("Mês ativo não encontrado.");
    }

    this.saving.set(true);
    try {
      const updated = await firstValueFrom(this.api.approvePendingItem(detail.month.id, pending.id, {
        description: payload.description,
        categoryId: payload.categoryId,
        paymentMethodId: payload.paymentMethodId,
        installmentTotal: payload.installmentTotal,
        expenseType: payload.expenseType
      }));
      this.setDetail(updated);
      this.reloadMonthsOnly();
      this.toast.success("Compra aprovada.", { id: "monthly-expense-pending-approved" });
    } catch (error) {
      this.toast.error("Não foi possível aprovar esta compra.", { id: "monthly-expense-pending-approve-error" });
      throw error;
    } finally {
      this.saving.set(false);
    }
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

  async saveExpenseItem(payload: UpsertMonthlyExpenseItemRequest, item?: MonthlyExpenseItem): Promise<void> {
    const detail = this.detail();

    if (!detail) {
      throw new Error("Mês ativo não encontrado.");
    }

    const request = item
      ? this.api.updateItem(detail.month.id, item.id, payload)
      : this.api.createItem(detail.month.id, payload);

    this.saving.set(true);
    try {
      this.setDetail(await firstValueFrom(request));
      this.reloadMonthsOnly();
    } catch (error) {
      this.toast.error("Não foi possível salvar o gasto.", { id: "monthly-expense-item-save-error" });
      throw error;
    } finally {
      this.saving.set(false);
    }
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

  setTypeFilter(type: MonthlyExpenseType | "ALL"): void {
    this.typeFilter.set(type);
    this.closeMobileExpenseAction();
  }

  setSelectedView(view: MonthlyExpenseView): void {
    this.selectedView.set(view);
    this.closeMobileExpenseAction();
  }

  setActiveCategoryInsight(categoryId: string | null): void {
    this.activeCategoryInsightId.set(categoryId);
  }

  categoryInsightRowBackground(color: string): string {
    return `linear-gradient(90deg, color-mix(in srgb, ${color} 18%, transparent), rgb(255 255 255 / 0.03) 42%, rgb(255 255 255 / 0.015))`;
  }

  toggleMobileActions(): void {
    this.mobileActionsOpen.update((open) => !open);
    this.closeMobileExpenseAction();
  }

  startMobileExpenseSwipe(event: PointerEvent, itemId: string): void {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    this.mobileSwipeStart = {
      itemId,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      lockedAxis: null
    };

    if (this.mobileSwipeItemId() !== itemId) {
      this.mobileSwipeItemId.set(itemId);
      this.mobileSwipeOffset.set(0);
    }

    (event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
  }

  moveMobileExpenseSwipe(event: PointerEvent, itemId: string): void {
    const gesture = this.mobileSwipeStart;
    if (!gesture || gesture.itemId !== itemId || gesture.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - gesture.x;
    const deltaY = event.clientY - gesture.y;

    if (!gesture.lockedAxis) {
      if (Math.abs(deltaX) < MOBILE_SWIPE_AXIS_LOCK_PX && Math.abs(deltaY) < MOBILE_SWIPE_AXIS_LOCK_PX) {
        return;
      }

      gesture.lockedAxis = Math.abs(deltaX) > Math.abs(deltaY) ? "x" : "y";
    }

    if (gesture.lockedAxis !== "x") {
      return;
    }

    event.preventDefault();
    this.mobileSwipeOffset.set(Math.max(-MOBILE_SWIPE_LIMIT_PX, Math.min(MOBILE_SWIPE_LIMIT_PX, deltaX)));
  }

  endMobileExpenseSwipe(event: PointerEvent, itemId: string): void {
    const gesture = this.mobileSwipeStart;
    if (!gesture || gesture.itemId !== itemId || gesture.pointerId !== event.pointerId) {
      return;
    }

    const offset = this.mobileSwipeOffset();
    if (offset <= -MOBILE_SWIPE_THRESHOLD_PX) {
      this.mobileSwipeOffset.set(-MOBILE_SWIPE_LIMIT_PX);
    } else if (offset >= MOBILE_SWIPE_THRESHOLD_PX) {
      this.mobileSwipeOffset.set(MOBILE_SWIPE_LIMIT_PX);
    } else {
      this.closeMobileExpenseAction();
    }

    this.mobileSwipeStart = null;
    (event.currentTarget as HTMLElement | null)?.releasePointerCapture?.(event.pointerId);
  }

  cancelMobileExpenseSwipe(event: PointerEvent, itemId: string): void {
    const gesture = this.mobileSwipeStart;
    if (!gesture || gesture.itemId !== itemId || gesture.pointerId !== event.pointerId) {
      return;
    }

    this.mobileSwipeStart = null;
    this.closeMobileExpenseAction();
  }

  closeMobileExpenseAction(): void {
    this.mobileSwipeStart = null;
    this.mobileSwipeItemId.set(null);
    this.mobileSwipeOffset.set(0);
  }

  mobileExpenseTransform(itemId: string): string {
    return `translateX(${this.mobileSwipeItemId() === itemId ? this.mobileSwipeOffset() : 0}px)`;
  }

  isMobileExpenseSwiping(itemId: string): boolean {
    return this.mobileSwipeStart?.itemId === itemId;
  }

  exportCsv(): void {
    const detail = this.detail();
    if (!detail) {
      return;
    }

    this.api.exportCsv(detail.month.id).subscribe({
      next: (csv) => {
        this.download.downloadText(
          `gastos-${detail.month.year}-${String(detail.month.month).padStart(2, "0")}.csv`,
          csv,
          "text/csv;charset=utf-8"
        );
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

    if (file.size > MAX_CSV_IMPORT_BYTES) {
      input.value = "";
      this.toast.error("O CSV deve ter no máximo 256 KB.", { id: "monthly-expense-csv-import-size-error" });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const csv = String(reader.result || "");
      const rowCount = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim().length > 0).length - 1;
      if (rowCount > MAX_CSV_IMPORT_ROWS) {
        input.value = "";
        this.toast.error("O CSV deve ter no máximo 1.000 linhas.", { id: "monthly-expense-csv-import-row-limit-error" });
        return;
      }

      this.saving.set(true);
      this.api.importCsv(detail.month.id, csv).pipe(
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
