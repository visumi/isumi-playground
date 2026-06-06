import { ApplicationConfig } from "@angular/core";
import { DATE_PIPE_DEFAULT_OPTIONS } from "@angular/common";
import { provideHttpClient, withInterceptors } from "@angular/common/http";
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from "@angular/router";
import { routes } from "./app.routes";
import { authInterceptor } from "./core/auth/auth.interceptor";

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: "top" })
    ),
    provideHttpClient(withInterceptors([authInterceptor])),
    {
      provide: DATE_PIPE_DEFAULT_OPTIONS,
      useValue: { timezone: "-0300" }
    }
  ]
};
