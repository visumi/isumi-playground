import { DATE_PIPE_DEFAULT_OPTIONS, registerLocaleData } from "@angular/common";
import localePt from "@angular/common/locales/pt";
import { ApplicationConfig, isDevMode, LOCALE_ID } from "@angular/core";
import { provideHttpClient, withInterceptors } from "@angular/common/http";
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from "@angular/router";
import { provideServiceWorker } from "@angular/service-worker";
import { routes } from "./app.routes";
import { authInterceptor } from "./core/auth/auth.interceptor";

registerLocaleData(localePt);

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: "top" })
    ),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideServiceWorker("ngsw-worker.js", {
      enabled: !isDevMode(),
      registrationStrategy: "registerWhenStable:30000"
    }),
    {
      provide: DATE_PIPE_DEFAULT_OPTIONS,
      useValue: { timezone: "-0300" }
    },
    {
      provide: LOCALE_ID,
      useValue: "pt-BR"
    }
  ]
};
