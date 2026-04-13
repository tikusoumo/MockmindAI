"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export default function AuthCallbackPage() {
  return (
    <Suspense>
      <CallbackContent />
    </Suspense>
  );
}

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = React.useState<"loading" | "error">("loading");

  React.useEffect(() => {
    const token = searchParams.get("token");
    const error = searchParams.get("error");

    if (error) {
      setStatus("error");
      toast.error("Google sign-in failed. Please try again.");
      setTimeout(() => router.replace("/auth"), 2500);
      return;
    }

    if (token) {
      localStorage.setItem("auth_token", token);
      toast.success("Signed in with Google!");
      // Go to returnTo if provided, else home
      const returnTo = searchParams.get("returnTo") || "/";
      window.location.replace(returnTo);
    } else {
      setStatus("error");
      toast.error("No token received from Google. Please try again.");
      setTimeout(() => router.replace("/auth"), 2500);
    }
  }, [router, searchParams]);

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background">
      {/* Ambient orb */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 h-80 w-80 rounded-full bg-violet-500/15 dark:bg-violet-600/20 blur-3xl" />
        <div className="absolute -bottom-32 -right-20 h-96 w-96 rounded-full bg-cyan-500/15 dark:bg-indigo-600/15 blur-3xl" />
      </div>

      <div className="relative flex flex-col items-center gap-5 rounded-2xl border bg-card/80 px-8 py-10 text-center shadow-lg backdrop-blur">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-linear-to-br from-violet-600 to-indigo-600 shadow-lg shadow-violet-900/30">
          <ShieldCheck className="h-7 w-7 text-white" />
        </div>

        {status === "loading" ? (
          <>
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <div>
              <p className="text-base font-semibold text-foreground">Completing sign-in…</p>
              <p className="mt-1 text-sm text-muted-foreground">Storing your session securely.</p>
            </div>
          </>
        ) : (
          <>
            <div>
              <p className="text-base font-semibold text-rose-400">Something went wrong</p>
              <p className="mt-1 text-sm text-muted-foreground">Redirecting back to login…</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
