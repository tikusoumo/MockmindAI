"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { backendPost, getBackendUrl, backendGet } from "@/lib/backend";
import { Eye, EyeOff, ShieldCheck, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Suspense } from "react";

/* ─── types ─────────────────────────────────────────────────────────── */
type AuthTab = "login" | "signup" | "forgot-password";

interface AuthResponse {
  user: { name: string; role: string; avatar: string; level: string };
  token: string;
}

/* ─── password policy ────────────────────────────────────────────────── */
interface PolicyCheck {
  label: string;
  test: (p: string) => boolean;
}

const POLICY: PolicyCheck[] = [
  { label: "At least 8 characters",         test: (p) => p.length >= 8 },
  { label: "Uppercase letter (A-Z)",         test: (p) => /[A-Z]/.test(p) },
  { label: "Lowercase letter (a-z)",         test: (p) => /[a-z]/.test(p) },
  { label: "Number (0-9)",                   test: (p) => /\d/.test(p) },
  { label: "Special character (!@#$%…)",    test: (p) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(p) },
];

function policyScore(password: string): number {
  return POLICY.filter((r) => r.test(password)).length;
}

function policyPasses(password: string): boolean {
  return policyScore(password) === POLICY.length;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "message" in error) {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === "string" && maybeMessage.trim()) {
      return maybeMessage;
    }
  }
  return fallback;
}

function isAuthFailure(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const status = (error as { status?: number }).status;
  return status === 401 || status === 403;
}

/* ─── strength bar ───────────────────────────────────────────────────── */
function StrengthBar({ password }: { password: string }) {
  if (!password) return null;
  const score = policyScore(password);
  const segments = 5;
  const colors = ["#ef4444", "#f97316", "#eab308", "#84cc16", "#22c55e"];
  const labels = ["Very Weak", "Weak", "Fair", "Good", "Strong"];

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex gap-1">
        {Array.from({ length: segments }).map((_, i) => (
          <div
            key={i}
            className="h-1 flex-1 rounded-full transition-all duration-300"
            style={{
              backgroundColor: i < score ? colors[score - 1] : "var(--border)",
            }}
          />
        ))}
      </div>
      <p className="text-[11px]" style={{ color: score > 0 ? colors[score - 1] : "transparent" }}>
        {labels[score - 1] ?? ""}
      </p>
    </div>
  );
}

/* ─── policy checklist ───────────────────────────────────────────────── */
function PolicyChecklist({ password }: { password: string }) {
  if (!password) return null;
  return (
    <ul className="mt-2 space-y-1">
      {POLICY.map((rule) => {
        const ok = rule.test(password);
        return (
          <li key={rule.label} className="flex items-center gap-1.5 text-[11px]">
            {ok ? (
              <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-400" />
            ) : (
              <XCircle className="h-3 w-3 shrink-0 text-rose-500/70" />
            )}
            <span className={ok ? "text-emerald-500" : "text-muted-foreground"}>{rule.label}</span>
          </li>
        );
      })}
    </ul>
  );
}

/* ─── password input ─────────────────────────────────────────────────── */
interface PasswordInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  show: boolean;
  onToggle: () => void;
  inputId: string;
}

function PasswordInput({ show, onToggle, inputId, ...rest }: PasswordInputProps) {
  return (
    <div className="relative">
      <input
        id={inputId}
        type={show ? "text" : "password"}
        {...rest}
        className={`w-full rounded-lg border border-border bg-background/70 px-3 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-all focus:border-primary/70 focus:ring-1 focus:ring-primary/40 ${rest.className ?? ""}`}
      />
      <button
        type="button"
        onClick={onToggle}
        tabIndex={-1}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Toggle password visibility"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

/* ─── field label ────────────────────────────────────────────────────── */
function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-xs font-medium text-muted-foreground mb-1.5">
      {children}
    </label>
  );
}

/* ─── base input ─────────────────────────────────────────────────────── */
function BaseInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-border bg-background/70 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-all focus:border-primary/70 focus:ring-1 focus:ring-primary/40 disabled:opacity-50 ${props.className ?? ""}`}
    />
  );
}

/* ─── submit button ──────────────────────────────────────────────────── */
function SubmitButton({ loading, children, disabled }: { loading: boolean; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={loading || disabled}
      className="w-full rounded-lg bg-linear-to-r from-violet-600 to-indigo-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-900/30 transition-all hover:from-violet-500 hover:to-indigo-500 hover:shadow-violet-800/40 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

/* ─── divider ────────────────────────────────────────────────────────── */
function OrDivider() {
  return (
    <div className="relative my-5">
      <div className="absolute inset-0 flex items-center">
        <span className="w-full border-t border-border" />
      </div>
      <div className="relative flex justify-center text-[10px] uppercase tracking-widest">
        <span className="bg-background px-3 text-muted-foreground">or continue with</span>
      </div>
    </div>
  );
}

/* ─── google button ──────────────────────────────────────────────────── */
function GoogleButton() {
  return (
    <button
      type="button"
      onClick={() => {
        window.location.href = `${getBackendUrl()}/api/auth/google`;
      }}
      className="w-full flex items-center justify-center gap-2 rounded-lg border border-border bg-background/70 py-2.5 text-sm text-foreground transition-all hover:bg-accent hover:text-accent-foreground active:scale-[0.98]"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
      </svg>
      Google
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   ROOT — suspense wrapper
═════════════════════════════════════════════════════════════════════════ */
export default function AuthPage() {
  return (
    <Suspense>
      <AuthPageContent />
    </Suspense>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   MAIN CONTENT
═════════════════════════════════════════════════════════════════════════ */
function AuthPageContent() {
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") || "/";

  const [tab, setTab] = React.useState<AuthTab>("login");
  const [loading, setLoading] = React.useState(false);

  // Login state
  const [login, setLogin] = React.useState({ email: "", password: "" });
  const [showLoginPw, setShowLoginPw] = React.useState(false);

  // Signup state
  const [signup, setSignup] = React.useState({
    name: "", email: "", password: "", confirmPassword: "", otp: "",
  });
  const [showSignupPw, setShowSignupPw] = React.useState(false);
  const [showConfirmPw, setShowConfirmPw] = React.useState(false);
  const [otpSent, setOtpSent] = React.useState(false);
  const [showPolicy, setShowPolicy] = React.useState(false);
  const [emailExists, setEmailExists] = React.useState(false);
  const [checkingEmail, setCheckingEmail] = React.useState(false);

  // Forgot password state
  const [forgot, setForgot] = React.useState({ email: "", otp: "", newPassword: "", confirmNewPassword: "" });
  const [forgotOtpSent, setForgotOtpSent] = React.useState(false);
  const [showForgotPw, setShowForgotPw] = React.useState(false);
  const [showForgotConfirmPw, setShowForgotConfirmPw] = React.useState(false);

  // If already logged in → go straight to app
  React.useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
    if (!token) {
      return;
    }

    let cancelled = false;

    const validateToken = async () => {
      try {
        await backendGet("/api/user");
        if (!cancelled) {
          window.location.replace(returnTo);
        }
      } catch (error) {
        if (isAuthFailure(error)) {
          localStorage.removeItem("auth_token");
          localStorage.removeItem("token");
        }
        // Keep auth page available if backend is temporarily unreachable
        // or the request failed for non-auth reasons.
      }
    };

    void validateToken();

    return () => {
      cancelled = true;
    };
  }, [returnTo]);

  // Check if email exists while typing
  React.useEffect(() => {
    if (tab !== "signup" || signup.email === "" || !signup.email.includes("@") || otpSent) {
      setEmailExists(false);
      return;
    }

    const timer = setTimeout(async () => {
      const email = signup.email;
      setCheckingEmail(true);
      try {
        const data = await backendGet<{ exists: boolean }>(`/api/auth/check-email?email=${encodeURIComponent(email)}`);
        if (data.exists) {
            setEmailExists(true);
            toast.error("Account already exists", {
              description: "This email is already associated with an account. Please sign in instead.",
              duration: 5000,
              className: "glass-toast",
            });
        } else {
            setEmailExists(false);
        }
      } catch (err) {
        console.error("Email check failed", err);
      } finally {
        setCheckingEmail(false);
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [signup.email, tab, otpSent]);

  /* ── derived ─────────────────────────────────────── */
  const passwordPasses     = policyPasses(signup.password);
  const passwordsMatch     = signup.password === signup.confirmPassword && signup.confirmPassword !== "";
  const canSendOtp         = signup.name.trim() !== "" && signup.email.trim() !== "" && passwordPasses && passwordsMatch;
  const canSubmitSignup    = otpSent && signup.otp.trim() !== "";

  /* ── forgot pass derived ───────────────────────── */
  const forgotPasswordPasses = policyPasses(forgot.newPassword);
  const forgotPasswordsMatch = forgot.newPassword === forgot.confirmNewPassword && forgot.confirmNewPassword !== "";
  const canSendForgotOtp     = forgot.email.trim() !== "";
  const canSubmitReset       = forgotOtpSent && forgot.otp.trim() !== "" && forgotPasswordPasses && forgotPasswordsMatch;

  /* ── handlers ────────────────────────────────────── */
  async function handleSendOtp() {
    if (!canSendOtp) {
      if (!passwordPasses)  toast.error("Password does not meet requirements.");
      else if (!passwordsMatch) toast.error("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await backendPost("/api/auth/send-otp", { email: signup.email });
      setOtpSent(true);
      toast.success("OTP sent to your email!");
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "Could not send OTP"));
    } finally {
      setLoading(false);
    }
  }

  async function handleSendForgotOtp() {
    if (!canSendForgotOtp) {
      toast.error("Please enter your email address.");
      return;
    }
    setLoading(true);
    try {
      await backendPost("/api/auth/forgot-password", { email: forgot.email });
      setForgotOtpSent(true);
      toast.success("OTP sent to your email!");
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "Could not send OTP"));
    } finally {
      setLoading(false);
    }
  }

  async function onResetSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!forgotPasswordPasses) { toast.error("New password does not meet requirements."); return; }
    if (!forgotPasswordsMatch) { toast.error("Passwords do not match."); return; }
    setLoading(true);
    try {
      await backendPost("/api/auth/reset-password", {
        email: forgot.email,
        code: forgot.otp,
        newPassword: forgot.newPassword,
      });
      toast.success("Password reset successfully! Please log in.");
      setTab("login");
      setLogin((s) => ({ ...s, email: forgot.email }));
      // Clear forgot state
      setForgot({ email: "", otp: "", newPassword: "", confirmNewPassword: "" });
      setForgotOtpSent(false);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "Invalid OTP or request failed"));
    } finally {
      setLoading(false);
    }
  }

  async function onLoginSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await backendPost<AuthResponse>("/api/auth/login", {
        email: login.email, password: login.password,
      });
      localStorage.setItem("auth_token", data.token);
      toast.success("Signed in successfully!");
      window.location.replace(returnTo);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "Invalid credentials"));
    } finally {
      setLoading(false);
    }
  }

  async function onSignupSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!passwordPasses) { toast.error("Password does not meet requirements."); return; }
    if (!passwordsMatch) { toast.error("Passwords do not match."); return; }
    setLoading(true);
    try {
      const data = await backendPost<AuthResponse>("/api/auth/signup", {
        name: signup.name, email: signup.email,
        password: signup.password, code: signup.otp,
      });
      localStorage.setItem("auth_token", data.token);
      toast.success("Account created!");
      window.location.replace(returnTo);
    } catch (err: unknown) {
      const maybeError = err as { status?: number };
      // 409 Conflict = account already exists → switch to login
      if (maybeError?.status === 409) {
        toast.error("Account already exists. Redirecting to login…", { duration: 3000 });
        // Pre-fill the login email for convenience
        setLogin((s) => ({ ...s, email: signup.email }));
        setTab("login");
      } else {
        toast.error(getErrorMessage(err, "Invalid OTP"));
      }
    } finally {
      setLoading(false);
    }
  }

  /* ── render ──────────────────────────────────────── */
  return (
    <>
      {/* ── global styles injected inline so no extra CSS file needed ── */}
      <style>{`
        @keyframes float-a { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-18px)} }
        @keyframes float-b { 0%,100%{transform:translateY(0)} 50%{transform:translateY(14px)} }
        .orb-a { animation: float-a 7s ease-in-out infinite; }
        .orb-b { animation: float-b 9s ease-in-out infinite; }
        .auth-card { background: var(--card); }
        .tab-active { background: rgba(99,102,241,0.14); color: var(--foreground); border-bottom:2px solid rgba(99,102,241,0.8); }
        .tab-inactive { color: var(--muted-foreground); border-bottom:2px solid transparent; }
        .tab-inactive:hover { color: var(--foreground); }
        .glass-toast { 
          background: rgba(99, 102, 241, 0.18) !important;
          backdrop-filter: blur(12px) !important;
          -webkit-backdrop-filter: blur(12px) !important;
          border: 1px solid rgba(99, 102, 241, 0.25) !important;
          box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.15) !important;
          border-radius: 12px !important;
          color: var(--foreground) !important;
        }
      `}</style>

      <div className="relative w-full max-w-5xl">
        {/* ── ambient orbs ── */}
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-visible">
          <div className="orb-a absolute -top-32 -left-32 h-80 w-80 rounded-full bg-violet-600/12 dark:bg-violet-600/20 blur-3xl" />
          <div className="orb-b absolute -bottom-32 -right-20 h-96 w-96 rounded-full bg-cyan-500/12 dark:bg-indigo-600/15 blur-3xl" />
          <div className="orb-a absolute top-1/2 left-1/2 h-60 w-60 -translate-x-1/2 -translate-y-1/2 rounded-full bg-purple-500/10 blur-3xl" />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* ════════════ LEFT BRAND PANEL ════════════ */}
          <div className="auth-card hidden lg:flex flex-col justify-between rounded-2xl border border-border p-10 relative overflow-hidden">
            {/* decorative grid */}
            <div className="pointer-events-none absolute inset-0"
              style={{backgroundImage:"linear-gradient(rgba(139,92,246,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(139,92,246,0.04) 1px,transparent 1px)",backgroundSize:"40px 40px"}} />

            {/* logo */}
            <div className="relative">
              <div className="inline-flex items-center gap-3">
                <div className="h-11 w-11 rounded-xl bg-linear-to-br from-violet-600 to-indigo-600 grid place-items-center shadow-lg shadow-violet-900/40">
                  <ShieldCheck className="h-5 w-5 text-white" />
                </div>
                <div>
                  <div className="text-lg font-bold text-foreground tracking-tight">MockMind AI</div>
                  <div className="text-xs text-muted-foreground">Interview Coach</div>
                </div>
              </div>

              <h1 className="mt-12 text-4xl font-bold tracking-tight text-foreground leading-tight">
                Practice smarter.<br />
                <span className="bg-linear-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
                  Interview stronger.
                </span>
              </h1>
              <p className="mt-4 text-sm text-muted-foreground max-w-xs leading-relaxed">
                Structured feedback, real-time speech analysis, and actionable coaching after every session.
              </p>

              {/* feature pills */}
              <div className="mt-8 flex flex-wrap gap-2">
                {["AI Feedback", "Speech Analysis", "Skill Tracking", "Mock Interviews"].map((f) => (
                  <span key={f} className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs text-primary">
                    {f}
                  </span>
                ))}
              </div>
            </div>

            <div className="relative text-xs text-muted-foreground">
              Tip: switch themes anytime via the header toggle.
            </div>
          </div>

          {/* ════════════ RIGHT AUTH CARD ════════════ */}
          <div className="auth-card rounded-2xl border border-border p-8 relative overflow-hidden">
            {/* subtle inner glow */}
            <div className="pointer-events-none absolute inset-0 rounded-2xl"
              style={{background:"radial-gradient(600px circle at 50% 0%,rgba(99,102,241,0.08) 0%,transparent 70%)"}} />

            {/* mobile logo */}
            <div className="lg:hidden flex items-center gap-2 mb-6">
              <div className="h-8 w-8 rounded-lg bg-linear-to-br from-violet-600 to-indigo-600 grid place-items-center">
                <ShieldCheck className="h-4 w-4 text-white" />
              </div>
              <span className="font-bold text-foreground">MockMind AI</span>
            </div>

            <div className="relative">
              <h2 className="text-2xl font-bold text-foreground mb-1">
                {tab === "login" ? "Welcome back" : tab === "signup" ? "Create account" : "Reset password"}
              </h2>
              <p className="text-sm text-muted-foreground mb-6">
                {tab === "login"
                  ? "Sign in to continue to your dashboard."
                  : tab === "signup"
                  ? "Join MockMind AI and start practising today."
                  : "Enter your email to receive a password reset code."}
              </p>

              {/* ── tab switcher ── */}
              <div className="flex border-b border-border mb-6">
                {tab !== "forgot-password" ? (
                  (["login", "signup"] as AuthTab[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={`px-4 py-2.5 text-sm font-medium transition-all capitalize ${tab === t ? "tab-active" : "tab-inactive"}`}
                    >
                      {t === "login" ? "Log in" : "Sign up"}
                    </button>
                  ))
                ) : (
                  <button
                    onClick={() => {
                        setTab("login");
                        setForgotOtpSent(false);
                    }}
                    className="px-4 py-2.5 text-sm font-medium transition-all tab-active flex items-center gap-2"
                  >
                    ← Back to Log in
                  </button>
                )}
              </div>

              {/* ════ LOGIN FORM ════ */}
              {tab === "login" && (
                <form onSubmit={onLoginSubmit} className="space-y-4">
                  <div>
                    <FieldLabel htmlFor="login-email">Email</FieldLabel>
                    <BaseInput
                      id="login-email"
                      type="email"
                      autoComplete="email"
                      required
                      placeholder="you@example.com"
                      value={login.email}
                      onChange={(e) => setLogin((s) => ({ ...s, email: e.target.value }))}
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <FieldLabel htmlFor="login-password">Password</FieldLabel>
                      <button
                        type="button"
                        onClick={() => setTab("forgot-password")}
                        className="text-[11px] text-primary hover:text-primary/80 transition-colors"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <PasswordInput
                      inputId="login-password"
                      show={showLoginPw}
                      onToggle={() => setShowLoginPw((v) => !v)}
                      autoComplete="current-password"
                      required
                      placeholder="••••••••"
                      value={login.password}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLogin((s) => ({ ...s, password: e.target.value }))}
                    />
                  </div>

                  <SubmitButton loading={loading}>Sign in</SubmitButton>

                  <OrDivider />
                  <GoogleButton />

                  <p className="text-[11px] text-muted-foreground text-center mt-3">
                    By signing in you agree to our{" "}
                    <span className="text-primary cursor-pointer hover:underline">Terms of Service</span>.
                  </p>
                </form>
              )}

              {/* ════ SIGNUP FORM ════ */}
              {tab === "signup" && (
                <form onSubmit={onSignupSubmit} className="space-y-4">
                  <div>
                    <FieldLabel htmlFor="signup-name">Full name</FieldLabel>
                    <BaseInput
                      id="signup-name"
                      autoComplete="name"
                      required
                      disabled={otpSent}
                      placeholder="Jane Smith"
                      value={signup.name}
                      onChange={(e) => setSignup((s) => ({ ...s, name: e.target.value }))}
                    />
                  </div>

                  <div>
                    <FieldLabel htmlFor="signup-email">Email</FieldLabel>
                    <div className="flex gap-2 relative">
                      <BaseInput
                        id="signup-email"
                        type="email"
                        autoComplete="email"
                        required
                        disabled={otpSent}
                        placeholder="you@example.com"
                        value={signup.email}
                        onChange={(e) => setSignup((s) => ({ ...s, email: e.target.value }))}
                        className={emailExists ? "border-rose-500/50 bg-rose-500/5" : ""}
                      />
                      {checkingEmail && (
                        <div className="absolute right-28 top-1/2 -translate-y-1/2">
                          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                        </div>
                      )}
                      {!otpSent && (
                        <button
                          type="button"
                          onClick={handleSendOtp}
                          disabled={loading || !canSendOtp || emailExists}
                          title={emailExists ? "Email already exists" : !canSendOtp ? "Fill name, email and a valid matching password first" : "Send OTP"}
                          className="shrink-0 rounded-lg bg-primary/10 border border-primary/30 px-3 py-2 text-xs font-medium text-primary transition-all hover:bg-primary/20 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 whitespace-nowrap"
                        >
                          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                          Send OTP
                        </button>
                      )}
                    </div>
                    {emailExists && (
                      <p className="flex items-center gap-1 text-[11px] text-rose-400 mt-1">
                        <XCircle className="h-3 w-3" /> Account already exists. <button type="button" onClick={() => setTab("login")} className="underline hover:text-rose-300">Login?</button>
                      </p>
                    )}
                    {otpSent && (
                      <p className="flex items-center gap-1 text-[11px] text-emerald-400 mt-1">
                        <CheckCircle2 className="h-3 w-3" /> OTP sent — check your inbox
                      </p>
                    )}
                  </div>

                  <div>
                    <FieldLabel htmlFor="signup-password">Password</FieldLabel>
                    <PasswordInput
                      inputId="signup-password"
                      show={showSignupPw}
                      onToggle={() => setShowSignupPw((v) => !v)}
                      autoComplete="new-password"
                      required
                      disabled={otpSent}
                      placeholder="Min. 8 chars, uppercase, number, symbol"
                      value={signup.password}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        setSignup((s) => ({ ...s, password: e.target.value }));
                        setShowPolicy(true);
                      }}
                    />
                    <StrengthBar password={signup.password} />
                    {showPolicy && <PolicyChecklist password={signup.password} />}
                  </div>

                  <div>
                    <FieldLabel htmlFor="signup-confirm">Re-enter password</FieldLabel>
                    <PasswordInput
                      inputId="signup-confirm"
                      show={showConfirmPw}
                      onToggle={() => setShowConfirmPw((v) => !v)}
                      autoComplete="new-password"
                      required
                      disabled={otpSent}
                      placeholder="Repeat your password"
                      value={signup.confirmPassword}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setSignup((s) => ({ ...s, confirmPassword: e.target.value }))
                      }
                    />
                    {signup.confirmPassword && !passwordsMatch && (
                      <p className="text-[11px] text-rose-400 mt-1 flex items-center gap-1">
                        <XCircle className="h-3 w-3" /> Passwords do not match
                      </p>
                    )}
                    {signup.confirmPassword && passwordsMatch && (
                      <p className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Passwords match
                      </p>
                    )}
                  </div>

                  {otpSent && (
                    <div>
                      <FieldLabel htmlFor="signup-otp">OTP Code</FieldLabel>
                      <BaseInput
                        id="signup-otp"
                        type="text"
                        inputMode="numeric"
                        pattern="\d{6}"
                        maxLength={6}
                        required
                        placeholder="6-digit code"
                        value={signup.otp}
                        onChange={(e) => setSignup((s) => ({ ...s, otp: e.target.value }))}
                      />
                    </div>
                  )}

                  <SubmitButton loading={loading} disabled={!canSubmitSignup}>
                    {otpSent ? "Verify & Create Account" : "Sign up"}
                  </SubmitButton>

                  <OrDivider />
                  <GoogleButton />

                  <p className="text-[11px] text-muted-foreground text-center mt-3">
                    By signing up you agree to our{" "}
                    <span className="text-primary cursor-pointer hover:underline">Terms of Service</span>.
                  </p>
                </form>
              )}

              {/* ════ FORGOT PASSWORD FORM ════ */}
              {tab === "forgot-password" && (
                <form onSubmit={onResetSubmit} className="space-y-4">
                  <div>
                    <FieldLabel htmlFor="forgot-email">Email</FieldLabel>
                    <div className="flex gap-2">
                      <BaseInput
                        id="forgot-email"
                        type="email"
                        autoComplete="email"
                        required
                        disabled={forgotOtpSent}
                        placeholder="you@example.com"
                        value={forgot.email}
                        onChange={(e) => setForgot((s) => ({ ...s, email: e.target.value }))}
                      />
                      {!forgotOtpSent && (
                        <button
                          type="button"
                          onClick={handleSendForgotOtp}
                          disabled={loading || !canSendForgotOtp}
                          className="shrink-0 rounded-lg bg-primary/10 border border-primary/30 px-3 py-2 text-xs font-medium text-primary transition-all hover:bg-primary/20 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 whitespace-nowrap"
                        >
                          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                          Send OTP
                        </button>
                      )}
                    </div>
                    {forgotOtpSent && (
                      <p className="flex items-center gap-1 text-[11px] text-emerald-400 mt-1">
                        <CheckCircle2 className="h-3 w-3" /> OTP sent — check your inbox
                      </p>
                    )}
                  </div>

                  {forgotOtpSent && (
                    <>
                      <div>
                        <FieldLabel htmlFor="forgot-otp">OTP Code</FieldLabel>
                        <BaseInput
                          id="forgot-otp"
                          type="text"
                          inputMode="numeric"
                          pattern="\d{6}"
                          maxLength={6}
                          required
                          placeholder="6-digit code"
                          value={forgot.otp}
                          onChange={(e) => setForgot((s) => ({ ...s, otp: e.target.value }))}
                        />
                      </div>

                      <div>
                        <FieldLabel htmlFor="forgot-password">New Password</FieldLabel>
                        <PasswordInput
                          inputId="forgot-password"
                          show={showForgotPw}
                          onToggle={() => setShowForgotPw((v) => !v)}
                          autoComplete="new-password"
                          required
                          placeholder="Min. 8 chars, uppercase, number, symbol"
                          value={forgot.newPassword}
                          onChange={(e) => setForgot((s) => ({ ...s, newPassword: e.target.value }))}
                        />
                        <StrengthBar password={forgot.newPassword} />
                        <PolicyChecklist password={forgot.newPassword} />
                      </div>

                      <div>
                        <FieldLabel htmlFor="forgot-confirm">Confirm New Password</FieldLabel>
                        <PasswordInput
                          inputId="forgot-confirm"
                          show={showForgotConfirmPw}
                          onToggle={() => setShowForgotConfirmPw((v) => !v)}
                          autoComplete="new-password"
                          required
                          placeholder="Repeat your new password"
                          value={forgot.confirmNewPassword}
                          onChange={(e) => setForgot((s) => ({ ...s, confirmNewPassword: e.target.value }))}
                        />
                        {forgot.confirmNewPassword && !forgotPasswordsMatch && (
                          <p className="text-[11px] text-rose-400 mt-1 flex items-center gap-1">
                            <XCircle className="h-3 w-3" /> Passwords do not match
                          </p>
                        )}
                      </div>
                    </>
                  )}

                  <SubmitButton loading={loading} disabled={forgotOtpSent && !canSubmitReset}>
                    {forgotOtpSent ? "Reset Password" : "Send Reset Code"}
                  </SubmitButton>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
