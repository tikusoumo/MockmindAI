"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { backendGet } from "@/lib/backend";

function isAuthFailure(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const status = (error as { status?: number }).status;
  return status === 401 || status === 403;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isAuth = pathname.startsWith("/auth");
  const [authChecked, setAuthChecked] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    if (isAuth) {
      setAuthChecked(true);
      return;
    }

    setAuthChecked(false);

    const returnTo = typeof window !== "undefined"
      ? `${window.location.pathname}${window.location.search}`
      : pathname;

    const token = localStorage.getItem("auth_token");
    if (!token) {
      // Replace so the protected URL is removed from history
      router.replace(`/auth?returnTo=${encodeURIComponent(returnTo)}`);
      return;
    }

    const validateSession = async () => {
      try {
        await backendGet("/api/user");

        if (!cancelled) {
          setAuthChecked(true);
        }
      } catch (error) {
        if (isAuthFailure(error)) {
          localStorage.removeItem("auth_token");
          localStorage.removeItem("token");
          if (!cancelled) {
            router.replace(`/auth?returnTo=${encodeURIComponent(returnTo)}`);
          }
          return;
        }

        // Keep the user in-app on transient network/backend issues.
        if (!cancelled) {
          setAuthChecked(true);
        }
      }
    };

    void validateSession();

    return () => {
      cancelled = true;
    };
  }, [isAuth, pathname, router]);

  // Auth pages never need a guard check — render immediately
  if (isAuth) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
        {children}
      </div>
    );
  }

  // Block protected content until auth check completes
  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-sm text-muted-foreground">Checking session…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
