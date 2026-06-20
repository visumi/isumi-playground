import { TestBed } from "@angular/core/testing";
import { provideRouter, Router } from "@angular/router";
import { authGuard, ownerGuard, publicOnlyGuard } from "./auth.guard";
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

    const result = await TestBed.runInInjectionContext(() => authGuard({} as never, { url: "/tools/expenses/abc" } as never));
    expect(TestBed.inject(Router).serializeUrl(result as never)).toBe("/login?returnUrl=%2Ftools%2Fexpenses%2Fabc");
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

  it("refreshes the profile before allowing an authenticated user to see login", async () => {
    let allowed = false;
    const refreshProfile = jasmine.createSpy("refreshProfile").and.callFake(async () => {
      allowed = true;
    });

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            waitUntilReady: () => Promise.resolve(),
            isAuthenticated: () => true,
            isAllowed: () => allowed,
            refreshProfile
          }
        }
      ]
    });

    const result = await TestBed.runInInjectionContext(() => publicOnlyGuard({} as never, {} as never));

    expect(refreshProfile).toHaveBeenCalled();
    expect(TestBed.inject(Router).serializeUrl(result as never)).toBe("/dashboard");
  });

  it("allows owners to access owner-only routes", async () => {
    const refreshProfile = jasmine.createSpy("refreshProfile").and.resolveTo();

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            waitUntilReady: () => Promise.resolve(),
            isAuthenticated: () => true,
            isOwner: () => true,
            refreshProfile
          }
        }
      ]
    });

    const result = await TestBed.runInInjectionContext(() => ownerGuard({} as never, {} as never));

    expect(refreshProfile).toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it("redirects non-owners away from owner-only routes", async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            waitUntilReady: () => Promise.resolve(),
            isAuthenticated: () => true,
            isOwner: () => false,
            refreshProfile: () => Promise.resolve()
          }
        }
      ]
    });

    const result = await TestBed.runInInjectionContext(() => ownerGuard({} as never, {} as never));

    expect(TestBed.inject(Router).serializeUrl(result as never)).toBe("/dashboard");
  });
});
