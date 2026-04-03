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
import { Eye, EyeOff } from "lucide-react";

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
    otp: ""
  });
  const [otpSent, setOtpSent] = React.useState(false);
  const [showLoginPassword, setShowLoginPassword] = React.useState(false);
  const [showSignupPassword, setShowSignupPassword] = React.useState(false);

  async function handleSendOtp(email: string) {
    if (!email) {
      toast.error("Please enter email first");
      return;
    }
    setLoading(true);
    try {
      await backendPost("/api/auth/send-otp", { email });
      setOtpSent(true);
      toast.success("OTP sent to your email!");
    } catch (err: any) {
      toast.error(err.message || "Could not send OTP");
    } finally {
      setLoading(false);
    }
  }

  async function onLoginSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const data = await backendPost<AuthResponse>("/api/auth/login", { email: login.email, password: login.password });   
      localStorage.setItem("auth_token", data.token);
      toast.success("Signed in successfully");
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
      const data = await backendPost<AuthResponse>("/api/auth/signup", { 
        name: signup.name,
        email: signup.email, 
        password: signup.password,
        code: signup.otp 
      }); 
      localStorage.setItem("auth_token", data.token);
      toast.success("Account created successfully");
      window.location.href = "/";
    } catch (err: any) {
      toast.error(err.message || "Invalid OTP");
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
                    <div className="relative">
                      <Input
                        id="login-password"
                        type={showLoginPassword ? "text" : "password"}
                        autoComplete="current-password"
                        required
                        value={login.password}
                        onChange={(e) =>
                          setLogin((s) => ({ ...s, password: e.target.value }))
                        }
                        placeholder="••••••••"
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full px-3 py-2 text-muted-foreground hover:text-foreground"
                        onClick={() => setShowLoginPassword(!showLoginPassword)}
                      >
                        {showLoginPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                        <span className="sr-only">Toggle password visibility</span>
                      </Button>
                    </div>
                  </div>

                  <Button type="submit" className="w-full" disabled={loading}>  
                    {loading ? "Signing in…" : "Sign in"}
                  </Button>

                  <div className="relative my-4">
                    <div className="absolute inset-0 flex items-center">        
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
                    </div>
                  </div>

                  <Button 
                    type="button" 
                    variant="outline" 
                    className="w-full gap-2"
                    onClick={() => { window.location.href = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/auth/google`; }}
                  >
                    <svg role="img" viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    Google
                  </Button>

                  <p className="text-xs text-muted-foreground text-center mt-4">
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
                        disabled={otpSent}
                        value={signup.name}
                        onChange={(e) =>
                          setSignup((s) => ({ ...s, name: e.target.value }))    
                        }
                        placeholder="Your name"
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="signup-email">Email</Label>
                      <div className="flex gap-2">
                        <Input
                          id="signup-email"
                          type="email"
                          autoComplete="email"
                          required
                          disabled={otpSent}
                          value={signup.email}
                          onChange={(e) =>
                            setSignup((s) => ({ ...s, email: e.target.value }))   
                          }
                          placeholder="you@example.com"
                        />
                        {!otpSent && (
                          <Button type="button" onClick={() => handleSendOtp(signup.email)} disabled={loading}>
                            Send OTP
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="signup-password">Password</Label>
                      <div className="relative">
                        <Input
                          id="signup-password"
                          type={showSignupPassword ? "text" : "password"}
                          autoComplete="new-password"
                          required
                          disabled={otpSent}
                          value={signup.password}
                          onChange={(e) =>
                            setSignup((s) => ({ ...s, password: e.target.value }))
                          }
                          placeholder="At least 8 characters"
                          className="pr-10"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 h-full px-3 py-2 text-muted-foreground hover:text-foreground"
                          onClick={() => setShowSignupPassword(!showSignupPassword)}
                          disabled={otpSent}
                        >
                          {showSignupPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                          <span className="sr-only">Toggle password visibility</span>
                        </Button>
                      </div>
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="signup-confirm">Confirm password</Label>  
                      <div className="relative">
                        <Input
                          id="signup-confirm"
                          type={showSignupPassword ? "text" : "password"}
                          autoComplete="new-password"
                          required
                          disabled={otpSent}
                          value={signup.confirmPassword}
                          onChange={(e) =>
                            setSignup((s) => ({
                              ...s,
                              confirmPassword: e.target.value,
                            }))
                          }
                          placeholder="Repeat password"
                          className="pr-10"
                        />
                      </div>
                    </div>
                  {otpSent && (
                    <div className="grid gap-2">
                      <Label htmlFor="signup-otp">OTP Code</Label>
                      <Input
                        id="signup-otp"
                        type="text"
                        required
                        value={signup.otp}
                        onChange={(e) =>
                          setSignup((s) => ({ ...s, otp: e.target.value }))   
                        }
                        placeholder="123456"
                      />
                    </div>
                  )}

                  <Button type="submit" className="w-full" disabled={loading || !otpSent}>
                    {loading ? "Verifying…" : "Sign up with OTP"}
                  </Button>

                  <div className="relative my-4">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
                    </div>
                  </div>

                  <Button 
                    type="button" 
                    variant="outline" 
                    className="w-full gap-2"
                    onClick={() => { window.location.href = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/auth/google`; }}
                  >
                    <svg role="img" viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    Google
                  </Button>

                  <p className="text-xs text-muted-foreground text-center mt-4">
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
