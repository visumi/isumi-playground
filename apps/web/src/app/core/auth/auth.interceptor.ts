import { HttpInterceptorFn } from "@angular/common/http";
import { inject } from "@angular/core";
import { from, switchMap } from "rxjs";
import { environment } from "../../../environments/environment";
import { AuthService } from "./auth.service";

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);

  if (!request.url.startsWith(environment.apiBaseUrl)) {
    return next(request);
  }

  return from(auth.idToken()).pipe(
    switchMap((token) => {
      if (!token) {
        return next(request);
      }

      return next(
        request.clone({
          setHeaders: {
            Authorization: `Bearer ${token}`
          }
        })
      );
    })
  );
};
