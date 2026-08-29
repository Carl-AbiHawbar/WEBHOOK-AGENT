import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, authToken, safeEqual } from "@/lib/auth";

/**
 * A deployed instance is an open tap on your Places quota, so everything sits
 * behind a shared password held in APP_PASSWORD.
 *
 * Leaving APP_PASSWORD unset disables the gate, which is fine on localhost.
 */
const PUBLIC_PATHS = ["/login", "/api/login"];

export async function proxy(request: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();

  const supplied = request.cookies.get(AUTH_COOKIE)?.value ?? "";
  if (safeEqual(supplied, await authToken(password))) {
    return NextResponse.next();
  }

  // API callers get JSON they can act on; humans get sent to the login form.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Not signed in.", hint: "Reload the page and enter the app password." },
      { status: 401 },
    );
  }

  const loginUrl = new URL("/login", request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
