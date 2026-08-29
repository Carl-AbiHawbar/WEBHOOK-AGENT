import { NextResponse } from "next/server";
import { AUTH_COOKIE, authToken, safeEqual } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) {
    return NextResponse.json({ error: "No password is configured." }, { status: 400 });
  }

  let supplied = "";
  try {
    const body = await request.json();
    supplied = typeof body?.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ error: "Request body was not valid JSON." }, { status: 400 });
  }

  if (!safeEqual(supplied, expected)) {
    return NextResponse.json({ error: "Wrong password." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE, await authToken(expected), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}
