import { DatePipe } from "@angular/common";
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { LucideCheck, LucideRefreshCw, LucideUserPlus, LucideUsersRound, LucideX } from "@lucide/angular";
import { firstValueFrom } from "rxjs";
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

  async loadUsers(): Promise<void> {
    this.loading.set(true);
    try {
      this.users.set(await firstValueFrom(this.api.listUsers()));
    } catch {
      this.toast.error("Não foi possível carregar os acessos.", { id: "access-admin-load-error" });
    } finally {
      this.loading.set(false);
    }
  }

  async addUser(): Promise<void> {
    const email = this.email().trim().toLowerCase();

    if (!this.isValidEmail(email) || this.saving()) {
      this.toast.error("Informe um e-mail válido.", { id: "access-admin-invalid-email" });
      return;
    }

    this.saving.set(true);
    try {
      const user = await firstValueFrom(this.api.createUser({ email }));
      this.upsertUser(user);
      this.email.set("");
      this.toast.success("Acesso liberado.", { id: "access-admin-created" });
    } catch {
      this.toast.error("Não foi possível liberar este acesso.", { id: "access-admin-create-error" });
    } finally {
      this.saving.set(false);
    }
  }

  async setActive(user: AccessUser, active: boolean): Promise<void> {
    if (user.role === "owner" || this.updatingEmail()) {
      return;
    }

    this.updatingEmail.set(user.email);
    try {
      const updated = await firstValueFrom(this.api.updateUser(user.email, { active }));
      this.upsertUser(updated);
      this.toast.success(active ? "Acesso ativado." : "Acesso desativado.", { id: "access-admin-updated" });
    } catch {
      this.toast.error("Não foi possível alterar este acesso.", { id: "access-admin-update-error" });
    } finally {
      this.updatingEmail.set(null);
    }
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
