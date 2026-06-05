import { TestBed } from "@angular/core/testing";
import { provideRouter, Router } from "@angular/router";
import { authGuard, publicOnlyGuard } from "./auth.guard";
import { AuthService } from "./auth.service";

describe("auth guards", () => {
  it("redirects unauthenticated users to login", async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            waitUntilReady: () => Promise.resolve(),
            isAuthenticated: () => false,
            isAllowed: () => false,
            refreshProfile: () => Promise.resolve()
          }
        }
      ]
    });

    const result = await TestBed.runInInjectionContext(() => authGuard({} as never, {} as never));
    expect(TestBed.inject(Router).serializeUrl(result as never)).toBe("/login");
  });

  it("keeps authenticated allowed users out of the public login route", async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            waitUntilReady: () => Promise.resolve(),
            isAuthenticated: () => true,
            isAllowed: () => true
          }
        }
      ]
    });

    const result = await TestBed.runInInjectionContext(() => publicOnlyGuard({} as never, {} as never));
    expect(TestBed.inject(Router).serializeUrl(result as never)).toBe("/dashboard");
  });
});
