"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { getBackendUrl } from "@/lib/backend";

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
        const response = await fetch(`${getBackendUrl()}/api/user`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Session validation failed with status ${response.status}`);
        }

        if (!cancelled) {
          setAuthChecked(true);
        }
      } catch {
        localStorage.removeItem("auth_token");
        if (!cancelled) {
          router.replace(`/auth?returnTo=${encodeURIComponent(returnTo)}`);
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
