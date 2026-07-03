type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

export interface RouteContext {
  request: Request;
  url: URL;
}

export type RouteHandler<TContext extends RouteContext> = (
  context: TContext & { params: Record<string, string | undefined> }
) => Response | Promise<Response>;

export interface HttpRoute<TContext extends RouteContext> {
  method: HttpMethod;
  pattern: RegExp;
  handle: RouteHandler<TContext>;
}

export function route<TContext extends RouteContext>(
  method: HttpMethod,
  pattern: RegExp,
  handle: RouteHandler<TContext>
): HttpRoute<TContext> {
  return { method, pattern, handle };
}

export async function dispatchRoute<TContext extends RouteContext>(
  routes: HttpRoute<TContext>[],
  context: TContext
): Promise<Response | null> {
  for (const currentRoute of routes) {
    if (context.request.method !== currentRoute.method) {
      continue;
    }

    const match = context.url.pathname.match(currentRoute.pattern);
    if (!match) {
      continue;
    }

    return currentRoute.handle({
      ...context,
      params: match.groups ?? {}
    });
  }

  return null;
}

export function routeParam(params: Record<string, string | undefined>, name: string): string {
  const value = params[name];
  if (!value) {
    throw new Error(`Missing route param: ${name}`);
  }
  return value;
}
