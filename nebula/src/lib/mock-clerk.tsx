import React from 'react';

// DUMMY USER DATA
const dummyUser = {
    id: "dummy-user-123",
    firstName: "Guest",
    lastName: "User",
    fullName: "Guest User",
    username: "guestuser",
    emailAddresses: [{ emailAddress: "guest@example.com" }],
    primaryEmailAddress: "email-id",
    imageUrl: "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y",
    publicMetadata: {
        organisation_id: "dummy-org-123",
        name: "Guest User",
    } as Record<string, unknown>,
};

// HOOKS
export const useUser = () => ({
    isLoaded: true,
    isSignedIn: true,
    user: dummyUser,
});

export const useAuth = () => ({
    isLoaded: true,
    isSignedIn: true,
    userId: dummyUser.id,
    sessionId: "dummy-session-123",
    getToken: async () => `debug_token:${dummyUser.id}`,
});

export const useClerk = () => ({
    signOut: () => console.log('Mock signOut called'),
    openSignIn: () => console.log('Mock openSignIn called'),
    openSignUp: () => console.log('Mock openSignUp called'),
});

// COMPONENTS
export const ClerkProvider = ({ children }: { children: React.ReactNode;[key: string]: unknown }) => <>{children}</>;
export const SignedIn = ({ children }: { children: React.ReactNode;[key: string]: unknown }) => <>{children}</>;
export const SignedOut = ({ }: { children?: React.ReactNode;[key: string]: unknown }) => null;
export const SignIn = ({ }: { [key: string]: unknown }) => <div>Sign In (Auth Disabled)</div>;
export const SignUp = ({ }: { [key: string]: unknown }) => <div>Sign Up (Auth Disabled)</div>;
export const UserButton = ({ }: { [key: string]: unknown }) => <div className="h-8 w-8 rounded-full bg-gray-300 flex items-center justify-center text-xs">U</div>;
export const SignInButton = ({ children }: { children?: React.ReactNode;[key: string]: unknown }) => children ? <>{children}</> : <button>Sign In</button>;
export const SignUpButton = ({ children }: { children?: React.ReactNode;[key: string]: unknown }) => children ? <>{children}</> : <button>Sign Up</button>;

// SERVER EXPORTS (For API Routes and Server Components)
export const auth = () => ({
    userId: dummyUser.id,
    sessionId: "dummy-session-123",
    getToken: async () => `debug_token:${dummyUser.id}`,
    redirectToSignIn: () => null,
});

export const currentUser = async () => dummyUser;

export const clerkClient = () => ({
    users: {
        getUser: async () => dummyUser,
        updateUser: async () => dummyUser,
    },
    sessions: {
        revokeSession: async (sessionId: string) => {
            console.log(`Mock revokeSession called for session ${sessionId}`);
            return null;
        },
    }
});

// Middleware
export const clerkMiddleware = (fn?: (authObj: unknown, reqObj: unknown, evObj: unknown) => unknown) => (req: unknown, ev: unknown) => {
    return fn ? fn(auth, req, ev) : undefined;
};
export const createRouteMatcher = () => () => false;
