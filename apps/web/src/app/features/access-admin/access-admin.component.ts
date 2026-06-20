import { DatePipe } from "@angular/common";
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { LucideCheck, LucideRefreshCw, LucideUserPlus, LucideUsersRound, LucideX } from "@lucide/angular";
import { finalize } from "rxjs";
import { AccessService } from "../../core/api/access.service";
import { AccessUser } from "../../core/api/api.types";
import { IsumiAvatarComponent, IsumiButtonComponent, IsumiEmptyStateComponent, IsumiInputDirective, IsumiPageHeaderComponent, IsumiSwitchComponent, IsumiTagComponent, IsumiToastService } from "../../shared/ui";

@Component({
  selector: "isumi-access-admin",
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    IsumiAvatarComponent,
    IsumiButtonComponent,
    IsumiEmptyStateComponent,
    IsumiInputDirective,
    IsumiPageHeaderComponent,
    IsumiSwitchComponent,
    IsumiTagComponent,
    LucideCheck,
    LucideRefreshCw,
    LucideUserPlus,
    LucideUsersRound,
    LucideX
  ],
  templateUrl: "./access-admin.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AccessAdminComponent implements OnInit {
  private readonly api = inject(AccessService);
  private readonly toast = inject(IsumiToastService);

  readonly users = signal<AccessUser[]>([]);
  readonly email = signal("");
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly updatingEmail = signal<string | null>(null);
  readonly activeCount = computed(() => this.users().filter((user) => user.active).length);

  ngOnInit(): void {
    this.loadUsers();
  }

  loadUsers(): void {
    this.loading.set(true);
    this.api.listUsers().pipe(
      finalize(() => this.loading.set(false))
    ).subscribe({
      next: (users) => this.users.set(users),
      error: () => this.toast.error("Não foi possível carregar os acessos.", { id: "access-admin-load-error" })
    });
  }

  addUser(): void {
    const email = this.email().trim().toLowerCase();

    if (!this.isValidEmail(email) || this.saving()) {
      this.toast.error("Informe um e-mail válido.", { id: "access-admin-invalid-email" });
      return;
    }

    this.saving.set(true);
    this.api.createUser({ email }).pipe(
      finalize(() => this.saving.set(false))
    ).subscribe({
      next: (user) => {
        this.upsertUser(user);
        this.email.set("");
        this.toast.success("Acesso liberado.", { id: "access-admin-created" });
      },
      error: () => this.toast.error("Não foi possível liberar este acesso.", { id: "access-admin-create-error" })
    });
  }

  setActive(user: AccessUser, active: boolean): void {
    if (user.role === "owner" || this.updatingEmail()) {
      return;
    }

    this.updatingEmail.set(user.email);
    this.api.updateUser(user.email, { active }).pipe(
      finalize(() => this.updatingEmail.set(null))
    ).subscribe({
      next: (updated) => {
        this.upsertUser(updated);
        this.toast.success(active ? "Acesso ativado." : "Acesso desativado.", { id: "access-admin-updated" });
      },
      error: () => this.toast.error("Não foi possível alterar este acesso.", { id: "access-admin-update-error" })
    });
  }

  private upsertUser(user: AccessUser): void {
    this.users.update((users) => [
      user,
      ...users.filter((item) => item.email !== user.email)
    ].sort((a, b) => Number(b.role === "owner") - Number(a.role === "owner") || Number(b.active) - Number(a.active) || a.email.localeCompare(b.email)));
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
}
