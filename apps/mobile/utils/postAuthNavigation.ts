let pendingRoute: string | null = null;

export function rememberPostAuthRoute(route: string) {
  pendingRoute = route.startsWith("/") ? route : null;
}

export function takePostAuthRoute() {
  const route = pendingRoute;
  pendingRoute = null;
  return route;
}
