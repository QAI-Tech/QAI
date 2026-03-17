import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { SESSION_TOKEN_COOKIE_NAME } from "@/lib/constants";

export async function handleExpiredSessionToken(req: NextRequest) {
  console.log(
    "Session token expired, logging out the user to regenerate token",
  );

  // Redirect response to the sign-in page
  const response = NextResponse.redirect(new URL("/sign-in", req.url));

  // Expire the session token cookie
  response.cookies.set(SESSION_TOKEN_COOKIE_NAME, "", {
    path: "/",
    expires: new Date(0), // Expire immediately
  });

  console.log(`Session token expired, removed the session token from cookie`);

  // Revoke the user's session if available
  const sessionId = auth().sessionId;
  if (sessionId) {
    const clerk = clerkClient();
    await clerk.sessions.revokeSession(sessionId);
  }

  return response;
}
