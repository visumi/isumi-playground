import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";
import { AuthService } from "./auth.service";

function safeReturnUrl(returnUrl: string | null): string {
  return returnUrl?.startsWith("/") && !returnUrl.startsWith("//") ? returnUrl : "/dashboard";
}

export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.waitUntilReady();

  if (!auth.isAuthenticated()) {
    return router.createUrlTree(["/login"], { queryParams: { returnUrl: state.url } });
  }

  if (!auth.isAllowed()) {
    await auth.refreshProfile();
  }

  return auth.isAllowed() ? true : router.createUrlTree(["/login"]);
};

export const publicOnlyGuard: CanActivateFn = async (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.waitUntilReady();

  if (!auth.isAuthenticated()) {
    return true;
  }

  if (!auth.isAllowed()) {
    await auth.refreshProfile();
  }

  return auth.isAllowed()
    ? router.parseUrl(safeReturnUrl(route.queryParamMap.get("returnUrl")))
    : true;
};

export const ownerGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.waitUntilReady();

  if (!auth.isAuthenticated()) {
    return router.createUrlTree(["/login"]);
  }

  await auth.refreshProfile();

  return auth.isOwner() ? true : router.createUrlTree(["/dashboard"]);
};
