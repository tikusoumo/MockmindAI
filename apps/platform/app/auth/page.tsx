"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { backendPost } from "@/lib/backend";

type AuthTab = "login" | "signup";

interface AuthResponse {
  user: {
    name: string;
    role: string;
    avatar: string;
    level: string;
  };
  token: string;
}

export default function AuthPage() {
  const router = useRouter();
  const [tab, setTab] = React.useState<AuthTab>("login");
  const [loading, setLoading] = React.useState(false);

  const [login, setLogin] = React.useState({ email: "", password: "" });
  const [signup, setSignup] = React.useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  async function onLoginSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const data = await backendPost<AuthResponse>("/api/auth/login", login);
      localStorage.setItem("auth_token", data.token);
      toast.success("Signed in successfully");
      // Force reload to update context with new token
      window.location.href = "/";
    } catch (err: any) {
      toast.error(err.message || "Invalid credentials");
    } finally {
      setLoading(false);
    }
  }

  async function onSignupSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (signup.password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    if (signup.password !== signup.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setLoading(true);

    try {
      const data = await backendPost<AuthResponse>("/api/auth/signup", signup);
      localStorage.setItem("auth_token", data.token);
      toast.success("Account created successfully");
      window.location.href = "/";
    } catch (err: any) {
      toast.error(err.message || "Could not create account");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative w-full max-w-5xl">
      {/* Theme-safe animated background */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-primary/15 blur-3xl animate-pulse" />
        <div className="absolute -bottom-28 -right-28 h-80 w-80 rounded-full bg-accent/25 blur-3xl animate-pulse [animation-delay:700ms]" />
        <div className="absolute inset-0 bg-linear-to-b from-transparent via-transparent to-background/30" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: brand panel */}
        <div className="hidden lg:flex flex-col justify-between rounded-2xl border bg-card/40 p-10 overflow-hidden relative">
          <div className="absolute inset-0 opacity-70">
            <div className="absolute top-10 left-10 h-40 w-40 rounded-full bg-primary/10 blur-2xl" />
            <div className="absolute bottom-10 right-10 h-44 w-44 rounded-full bg-accent/10 blur-2xl" />
          </div>

          <div className="relative">
            <div className="inline-flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary text-primary-foreground grid place-items-center">
                <span className="text-base font-semibold">M</span>
              </div>
              <div>
                <div className="text-lg font-semibold leading-none">MockMind AI</div>
                <div className="text-sm text-muted-foreground">Interview Coach</div>
              </div>
            </div>

            <h1 className="mt-10 text-3xl font-semibold tracking-tight">
              Practice smarter.
              <br />
              Interview stronger.
            </h1>
            <p className="mt-4 text-sm text-muted-foreground max-w-sm">
              Get structured feedback, speech analysis, and actionable next steps after every session.
            </p>
          </div>

          <div className="relative text-xs text-muted-foreground">
            Tip: switch themes anytime using the toggle.
          </div>
        </div>

        {/* Right: auth card */}
        <Card className="rounded-2xl animate-in fade-in-0 zoom-in-95 duration-300">
          <CardHeader>
            <CardTitle className="text-2xl">Welcome back</CardTitle>
            <CardDescription>
              Sign in or create an account to continue.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={tab} onValueChange={(v) => setTab(v as AuthTab)}>
              <TabsList variant="default" className="w-full">
                <TabsTrigger value="login">Login</TabsTrigger>
                <TabsTrigger value="signup">Sign up</TabsTrigger>
              </TabsList>

              <TabsContent
                value="login"
                className="data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:slide-in-from-bottom-2 data-[state=active]:duration-250"
              >
                <form onSubmit={onLoginSubmit} className="mt-6 space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="login-email">Email</Label>
                    <Input
                      id="login-email"
                      type="email"
                      autoComplete="email"
                      required
                      value={login.email}
                      onChange={(e) =>
                        setLogin((s) => ({ ...s, email: e.target.value }))
                      }
                      placeholder="you@example.com"
                    />
                  </div>

                  <div className="grid gap-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="login-password">Password</Label>
                      <Link
                        href="#"
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Forgot?
                      </Link>
                    </div>
                    <Input
                      id="login-password"
                      type="password"
                      autoComplete="current-password"
                      required
                      value={login.password}
                      onChange={(e) =>
                        setLogin((s) => ({ ...s, password: e.target.value }))
                      }
                      placeholder="••••••••"
                    />
                  </div>

                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Signing in…" : "Sign in"}
                  </Button>

                  <p className="text-xs text-muted-foreground text-center">
                    By continuing, you agree to our terms.
                  </p>
                </form>
              </TabsContent>

              <TabsContent
                value="signup"
                className="data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:slide-in-from-bottom-2 data-[state=active]:duration-250"
              >
                <form onSubmit={onSignupSubmit} className="mt-6 space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="signup-name">Name</Label>
                    <Input
                      id="signup-name"
                      autoComplete="name"
                      required
                      value={signup.name}
                      onChange={(e) =>
                        setSignup((s) => ({ ...s, name: e.target.value }))
                      }
                      placeholder="Your name"
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="signup-email">Email</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      autoComplete="email"
                      required
                      value={signup.email}
                      onChange={(e) =>
                        setSignup((s) => ({ ...s, email: e.target.value }))
                      }
                      placeholder="you@example.com"
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="signup-password">Password</Label>
                    <Input
                      id="signup-password"
                      type="password"
                      autoComplete="new-password"
                      required
                      value={signup.password}
                      onChange={(e) =>
                        setSignup((s) => ({ ...s, password: e.target.value }))
                      }
                      placeholder="At least 8 characters"
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="signup-confirm">Confirm password</Label>
                    <Input
                      id="signup-confirm"
                      type="password"
                      autoComplete="new-password"
                      required
                      value={signup.confirmPassword}
                      onChange={(e) =>
                        setSignup((s) => ({
                          ...s,
                          confirmPassword: e.target.value,
                        }))
                      }
                      placeholder="Repeat password"
                    />
                  </div>

                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Creating…" : "Create account"}
                  </Button>

                  <p className="text-xs text-muted-foreground text-center">
                    Creating an account means you accept our terms.
                  </p>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
