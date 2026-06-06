import { Injectable, computed, inject, signal } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Router } from "@angular/router";
import { initializeApp } from "firebase/app";
import {
  Auth,
  GoogleAuthProvider,
  User,
  getAuth,
  onIdTokenChanged,
  signInWithPopup,
  signOut
} from "firebase/auth";
import { firstValueFrom } from "rxjs";
import { environment } from "../../../environments/environment";
import { MeResponse } from "../api/api.types";

@Injectable({ providedIn: "root" })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly auth: Auth;
  private readonly provider = new GoogleAuthProvider();

  private readonly firebaseUserState = signal<User | null>(null);
  private readonly readyState = signal(false);
  private readonly profileState = signal<MeResponse | null>(null);
  private readonly authErrorState = signal<string | null>(null);

  readonly firebaseUser = this.firebaseUserState.asReadonly();
  readonly ready = this.readyState.asReadonly();
  readonly profile = this.profileState.asReadonly();
  readonly authError = this.authErrorState.asReadonly();
  readonly isAuthenticated = computed(() => this.readyState() && !!this.firebaseUserState());
  readonly isAllowed = computed(() => this.profileState()?.allowed === true);

  constructor() {
    const app = initializeApp(environment.firebase);
    this.auth = getAuth(app);

    onIdTokenChanged(this.auth, async (user) => {
      this.firebaseUserState.set(user);
      this.readyState.set(true);

      if (!user) {
        this.profileState.set(null);
        return;
      }

      await this.refreshProfile();
    });
  }

  async login(returnUrl = "/dashboard"): Promise<void> {
    this.authErrorState.set(null);
    await signInWithPopup(this.auth, this.provider);
    await this.refreshProfile();

    if (this.isAllowed()) {
      await this.router.navigateByUrl(returnUrl.startsWith("/") ? returnUrl : "/dashboard");
      return;
    }

    this.authErrorState.set("Seu e-mail ainda não está autorizado para acessar o playground.");
  }

  async logout(): Promise<void> {
    await signOut(this.auth);
    this.profileState.set(null);
    await this.router.navigateByUrl("/login");
  }

  async idToken(): Promise<string | null> {
    const user = this.firebaseUserState();
    return user ? user.getIdToken() : null;
  }

  async waitUntilReady(): Promise<void> {
    if (this.readyState()) {
      return;
    }

    await new Promise<void>((resolve) => {
      const interval = window.setInterval(() => {
        if (this.readyState()) {
          window.clearInterval(interval);
          resolve();
        }
      }, 20);
    });
  }

  async refreshProfile(): Promise<void> {
    if (!this.firebaseUserState()) {
      this.profileState.set(null);
      return;
    }

    try {
      const profile = await firstValueFrom(
        this.http.get<MeResponse>(`${environment.apiBaseUrl}/me`)
      );
      this.profileState.set(profile);
      this.authErrorState.set(profile.allowed ? null : "Seu e-mail ainda nao esta autorizado.");
    } catch {
      this.profileState.set(null);
      this.authErrorState.set("Não foi possível confirmar sua autorizacão agora.");
    }
  }
}
