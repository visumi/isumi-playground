import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";
import { AuthService } from "./auth.service";

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.waitUntilReady();

  if (!auth.isAuthenticated()) {
    return router.createUrlTree(["/login"]);
  }

  if (!auth.isAllowed()) {
    await auth.refreshProfile();
  }

  return auth.isAllowed() ? true : router.createUrlTree(["/login"]);
};

export const publicOnlyGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.waitUntilReady();
  return auth.isAuthenticated() && auth.isAllowed()
    ? router.createUrlTree(["/dashboard"])
    : true;
};
