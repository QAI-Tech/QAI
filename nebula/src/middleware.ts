import {
  clerkClient,
  clerkMiddleware,
  createRouteMatcher,
} from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { SESSION_TOKEN_COOKIE_NAME } from "./lib/constants";
import { constructUrl } from "./lib/urlUtlis";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/sso-callback(.*)",
  "/verify(.*)",
  "/api/generate-signed-url-for-frame(.*)",
]);

// const whiteList = ["@qaitech.ai"];

export default clerkMiddleware(async (auth, request) => {
  // Check if we're in SSO callback flow
  if (
    request.nextUrl.pathname.includes("/sso-callback") ||
    request.nextUrl.pathname.includes("/verify")
  ) {
    return NextResponse.next();
  }

  const { userId, redirectToSignIn, getToken } = auth();
  const hasSessionToken = request.cookies.has(SESSION_TOKEN_COOKIE_NAME);

  // **1. Redirect immediately if logged out but session token exists**
  if (!userId && hasSessionToken) {
    const response = NextResponse.redirect(new URL("/sign-in", request.url));
    response.cookies.delete(SESSION_TOKEN_COOKIE_NAME);
    return response;
  }
  console.log("user: ", userId);

  // **2. Allow access to public routes**
  if (isPublicRoute(request)) {
    return NextResponse.next();
  }

  // **3. Redirect to /sign-in if no user is authenticated**
  if (!userId) {
    const { redirectToSignIn } = await auth();
    return redirectToSignIn({ returnBackUrl: request.url });
  }
  // **4. Fetch user details from Clerk**
  let user;
  try {
    const clerk = clerkClient();
    user = await clerk.users.getUser(userId);
  } catch (error) {
    console.error("Failed to fetch user:", error);
    return redirectToSignIn({ returnBackUrl: request.url });
  }

  if (!user) {
    return redirectToSignIn({ returnBackUrl: request.url });
  }

  // **5. Verify user email is in the whitelist**
  const userEmail = user.emailAddresses[0]?.emailAddress;
  if (!userEmail) {
    return redirectToSignIn({ returnBackUrl: request.url });
  }
  //Todo: No need of whitelisting
  // const isWhitelisted = whiteList.some((whitelistEmail) =>
  //   whitelistEmail.startsWith("@")
  //     ? userEmail.endsWith(whitelistEmail)
  //     : userEmail === whitelistEmail,
  // );

  // if (!isWhitelisted) {
  //   return NextResponse.redirect(new URL("/access-denied", request.url));
  // }

  // **6. If no session token, fetch from backend**
  if (!hasSessionToken) {
    try {
      console.log("Session Token missing, fetching from backend...");
      const jwtToken = await getToken();

      const unsafeMetadata = user.unsafeMetadata as {
        invite_org_id?: string;
        roles?: string[];
      };
      const inviteOrgId = unsafeMetadata?.invite_org_id || "";
      const roles = unsafeMetadata?.roles || [];

      const fetchSessionToken = await fetch(constructUrl("SignIn"), {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwtToken}`,
        },
      });

      if (fetchSessionToken.ok) {
        const { session_token, first_name, last_name, organisation_id } =
          await fetchSessionToken.json();
        try {
          const clerk = clerkClient();
          await clerk.users.updateUser(userId, {
            publicMetadata: {
              first_name,
              last_name,
              userEmail,
              organisation_id,
              invite_org_id: inviteOrgId || "",
              roles: roles || [],
            },
            // Clear unsafeMetadata after transferring to publicMetadata
            unsafeMetadata: {
              invite_org_id: "",
              roles: [],
            },
          });
        } catch (error) {
          console.error("Failed to update user metadata:", error);
        }

        let redirectPath = "/"; // Default path
        // Only redirect to onboarding if no org ID (from invite or existing)
        if (organisation_id === "") {
          redirectPath = `/onboarding?step=1${inviteOrgId ? `&invite_org_id=${inviteOrgId}` : ""}`;
        }
        // Create redirect response with session token cookie
        const response = NextResponse.redirect(
          new URL(redirectPath, request.url),
        );
        response.cookies.set(SESSION_TOKEN_COOKIE_NAME, session_token, {
          httpOnly: true,
          secure: true,
        });

        console.log(`Redirecting to: ${redirectPath}`);
        return response;
      } else {
        console.error("Failed to fetch session token from backend.");
        return redirectToSignIn({ returnBackUrl: request.url });
      }
    } catch (error) {
      console.error("Error fetching session token:", error);
      return redirectToSignIn({ returnBackUrl: request.url });
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
