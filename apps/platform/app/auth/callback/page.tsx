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
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a12]">
      {/* Ambient orb */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 h-80 w-80 rounded-full bg-violet-600/20 blur-3xl" />
        <div className="absolute -bottom-32 -right-20 h-96 w-96 rounded-full bg-indigo-600/15 blur-3xl" />
      </div>

      <div className="relative flex flex-col items-center gap-5 text-center">
        <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 grid place-items-center shadow-lg shadow-violet-900/50">
          <ShieldCheck className="h-7 w-7 text-white" />
        </div>

        {status === "loading" ? (
          <>
            <div className="h-7 w-7 rounded-full border-2 border-violet-400 border-t-transparent animate-spin" />
            <div>
              <p className="text-base font-semibold text-white">Completing sign-in…</p>
              <p className="text-sm text-zinc-500 mt-1">Storing your session securely.</p>
            </div>
          </>
        ) : (
          <>
            <div>
              <p className="text-base font-semibold text-rose-400">Something went wrong</p>
              <p className="text-sm text-zinc-500 mt-1">Redirecting back to login…</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
