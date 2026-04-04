"use client";

import { useState, useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  CheckCircle2,
  Loader2,
  AlertCircle,
  Camera,
  Sun,
  Moon,
  Monitor,
  Shield,
  Key,
  Trash2,
  Eye,
  EyeOff,
  Smartphone,
  LogOut,
  Copy,
  Check,
} from "lucide-react";
import type { User } from "@/data/mockData";
import { useBackendData, backendPut } from "@/lib/backend";
import { fallbackCurrentUser } from "@/lib/fallback-data";

type SaveState = "idle" | "saving" | "saved" | "error";

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `${res.status}`);
  }
  return res.json();
}

// ─── Save Feedback Badge ───────────────────────────────────────────────────────
function SaveFeedback({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  return (
    <Badge
      variant="outline"
      className={
        state === "saved"
          ? "text-green-600 border-green-500/30 bg-green-500/10"
          : state === "error"
          ? "text-red-600 border-red-500/30 bg-red-500/10"
          : "text-muted-foreground border-border"
      }
    >
      {state === "saving" && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
      {state === "saved" && <CheckCircle2 className="mr-1.5 h-3 w-3" />}
      {state === "error" && <AlertCircle className="mr-1.5 h-3 w-3" />}
      {state === "saving" ? "Saving…" : state === "saved" ? "Saved!" : "Failed — try again"}
    </Badge>
  );
}

// ─── Profile Tab ──────────────────────────────────────────────────────────────
function ProfileTab({ currentUser }: { currentUser: User }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [level, setLevel] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarPreview, setAvatarPreview] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (currentUser) {
      setName(currentUser.name || "");
      setRole(currentUser.role || "");
      setEmail((currentUser as any).email || "");
      setLevel(currentUser.level || "");
      setAvatarUrl(currentUser.avatar || "");
      setAvatarPreview(currentUser.avatar || "");
    }
  }, [currentUser]);

  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Local preview
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setAvatarPreview(dataUrl);
      setAvatarUrl(dataUrl); // Will be sent as base64 or uploaded separately
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaveState("saving");
    try {
      await backendPut("/api/user", {
        name,
        role,
        email,
        level,
        avatar: avatarUrl,
      });
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 3000);
    } catch {
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 4000);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Profile Information</CardTitle>
          <CardDescription>Your public profile. Changes sync to your account instantly.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Avatar Upload */}
          <div className="flex items-center gap-6">
            <div className="relative group">
              <Avatar className="h-24 w-24 ring-2 ring-offset-2 ring-offset-background ring-border">
                <AvatarImage src={avatarPreview} />
                <AvatarFallback className="text-3xl font-semibold bg-primary/10 text-primary">
                  {name.charAt(0).toUpperCase() || "?"}
                </AvatarFallback>
              </Avatar>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                <Camera className="h-5 w-5 text-white" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarFileChange}
              />
            </div>
            <div className="space-y-2">
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                <Camera className="mr-2 h-4 w-4" /> Upload Photo
              </Button>
              <p className="text-xs text-muted-foreground">JPG, PNG or GIF · Max 2 MB</p>
              {avatarPreview !== currentUser.avatar && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground"
                  onClick={() => {
                    setAvatarPreview(currentUser.avatar || "");
                    setAvatarUrl(currentUser.avatar || "");
                  }}
                >
                  Reset to original
                </Button>
              )}
            </div>
          </div>

          <Separator />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Job Title / Role</Label>
              <Input id="role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Senior Engineer" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="level">Experience Level</Label>
              <Input id="level" value={level} onChange={(e) => setLevel(e.target.value)} placeholder="e.g. Senior, Mid-level" />
            </div>
          </div>
        </CardContent>
        <CardFooter className="gap-3">
          <Button onClick={handleSave} disabled={saveState === "saving"}>
            {saveState === "saving" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {saveState === "saved" && <CheckCircle2 className="mr-2 h-4 w-4" />}
            {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved!" : "Save Changes"}
          </Button>
          <SaveFeedback state={saveState} />
        </CardFooter>
      </Card>
    </div>
  );
}

// ─── Notifications Tab ────────────────────────────────────────────────────────
function NotificationsTab() {
  const [emailNotifs, setEmailNotifs] = useState(true);
  const [sessionReminders, setSessionReminders] = useState(true);
  const [communityUpdates, setCommunityUpdates] = useState(false);
  const [weeklyDigest, setWeeklyDigest] = useState(true);
  const [pushNotifs, setPushNotifs] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  useEffect(() => {
    const stored = localStorage.getItem("notification_prefs");
    if (stored) {
      try {
        const prefs = JSON.parse(stored);
        setEmailNotifs(prefs.emailNotifs ?? true);
        setSessionReminders(prefs.sessionReminders ?? true);
        setCommunityUpdates(prefs.communityUpdates ?? false);
        setWeeklyDigest(prefs.weeklyDigest ?? true);
        setPushNotifs(prefs.pushNotifs ?? false);
      } catch {}
    }
  }, []);

  const handleSave = () => {
    setSaveState("saving");
    localStorage.setItem(
      "notification_prefs",
      JSON.stringify({ emailNotifs, sessionReminders, communityUpdates, weeklyDigest, pushNotifs })
    );
    setTimeout(() => {
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 3000);
    }, 400);
  };

  const rows = [
    { label: "Email Notifications", desc: "Interview results, scores, and account alerts", value: emailNotifs, set: setEmailNotifs },
    { label: "Session Reminders", desc: "Receive a reminder 1 hour before scheduled sessions", value: sessionReminders, set: setSessionReminders },
    { label: "Weekly Digest", desc: "A weekly summary of your progress and upcoming sessions", value: weeklyDigest, set: setWeeklyDigest },
    { label: "Community Updates", desc: "Replies to your posts and featured discussions", value: communityUpdates, set: setCommunityUpdates },
    { label: "Push Notifications", desc: "Browser push notifications for real-time alerts", value: pushNotifs, set: setPushNotifs },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notification Preferences</CardTitle>
        <CardDescription>Control how and when we contact you.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between rounded-lg border px-4 py-3">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">{r.label}</Label>
              <p className="text-xs text-muted-foreground">{r.desc}</p>
            </div>
            <Switch checked={r.value} onCheckedChange={r.set} />
          </div>
        ))}
      </CardContent>
      <CardFooter className="gap-3">
        <Button onClick={handleSave} disabled={saveState === "saving"}>
          {saveState === "saving" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved!" : "Save Preferences"}
        </Button>
        <SaveFeedback state={saveState} />
      </CardFooter>
    </Card>
  );
}

// ─── Appearance Tab ───────────────────────────────────────────────────────────
function AppearanceTab() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const options = [
    { value: "light", label: "Light", icon: Sun, desc: "Clean and bright interface" },
    { value: "dark", label: "Dark", icon: Moon, desc: "Easy on the eyes at night" },
    { value: "system", label: "System", icon: Monitor, desc: "Follows your OS preference" },
  ] as const;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Choose how MockMind looks on your device.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {options.map(({ value, label, icon: Icon, desc }) => {
              const isActive = mounted && (theme === value || (!theme && value === "system"));
              return (
                <button
                  key={value}
                  onClick={() => setTheme(value)}
                  className={`relative flex flex-col items-start gap-3 rounded-xl border-2 p-4 text-left transition-all cursor-pointer hover:bg-muted/50 ${
                    isActive ? "border-primary bg-primary/5" : "border-border"
                  }`}
                >
                  {isActive && (
                    <span className="absolute top-3 right-3 h-2 w-2 rounded-full bg-primary" />
                  )}
                  {/* Preview box */}
                  <div
                    className={`w-full h-16 rounded-lg border flex items-end p-2 gap-1.5 overflow-hidden ${
                      value === "light"
                        ? "bg-white border-gray-200"
                        : value === "dark"
                        ? "bg-gray-950 border-gray-800"
                        : resolvedTheme === "dark"
                        ? "bg-gray-950 border-gray-800"
                        : "bg-white border-gray-200"
                    }`}
                  >
                    <div className={`h-2 flex-1 rounded ${value === "dark" || (value === "system" && resolvedTheme === "dark") ? "bg-gray-800" : "bg-gray-100"}`} />
                    <div className={`h-3 w-3 rounded-full ${value === "dark" || (value === "system" && resolvedTheme === "dark") ? "bg-indigo-500" : "bg-indigo-500"}`} />
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      <span className="font-semibold text-sm">{label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Account / Security Tab ───────────────────────────────────────────────────
function AccountTab({ currentUser }: { currentUser: User }) {
  // Password Change
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [pwState, setPwState] = useState<SaveState>("idle");
  const [pwError, setPwError] = useState("");

  const handleChangePassword = async () => {
    setPwError("");
    if (newPw.length < 8) { setPwError("Password must be at least 8 characters."); return; }
    if (newPw !== confirmPw) { setPwError("Passwords do not match."); return; }
    setPwState("saving");
    try {
      await apiFetch("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      setPwState("saved");
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
      setTimeout(() => setPwState("idle"), 4000);
    } catch (e: any) {
      setPwError(e.message || "Failed to change password.");
      setPwState("error");
      setTimeout(() => setPwState("idle"), 4000);
    }
  };

  // 2FA
  const [twoFaEnabled, setTwoFaEnabled] = useState(false);
  const [twoFaStep, setTwoFaStep] = useState<"idle" | "setup" | "verify">("idle");
  const [twoFaCode, setTwoFaCode] = useState("");
  const [twoFaSecret, setTwoFaSecret] = useState("JBSWY3DPEHPK3PXP"); // mock TOTP secret
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [twoFaState, setTwoFaState] = useState<SaveState>("idle");

  const handleEnable2FA = () => setTwoFaStep("setup");

  const handleVerify2FA = async () => {
    if (twoFaCode.length !== 6) return;
    setTwoFaState("saving");
    // Simulate verification (replace with real API call)
    await new Promise((r) => setTimeout(r, 1000));
    // Mock: any 6-digit code works in dev
    setTwoFaEnabled(true);
    setTwoFaStep("idle");
    setTwoFaCode("");
    setTwoFaState("saved");
    setTimeout(() => setTwoFaState("idle"), 3000);
  };

  const handleDisable2FA = async () => {
    setTwoFaEnabled(false);
    setTwoFaStep("idle");
  };

  const copySecret = () => {
    navigator.clipboard.writeText(twoFaSecret);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  // Delete Account
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteState, setDeleteState] = useState<SaveState>("idle");

  const handleDeleteAccount = async () => {
    setDeleteState("saving");
    try {
      await apiFetch("/api/user", { method: "DELETE" });
      localStorage.removeItem("auth_token");
      window.location.href = "/";
    } catch {
      setDeleteState("error");
      setTimeout(() => setDeleteState("idle"), 4000);
    }
  };

  return (
    <div className="space-y-4">
      {/* ── Change Password ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Key className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Change Password</CardTitle>
          </div>
          <CardDescription>Update your password. We recommend using a strong, unique password.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 max-w-md">
          <div className="space-y-2">
            <Label>Current Password</Label>
            <div className="relative">
              <Input
                type={showPw ? "text" : "password"}
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                placeholder="••••••••"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowPw((s) => !s)}
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>New Password</Label>
            <Input type={showPw ? "text" : "password"} value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="At least 8 characters" />
            {newPw && (
              <div className="flex gap-1">
                {["length", "upper", "number", "special"].map((c, i) => {
                  const checks = [newPw.length >= 8, /[A-Z]/.test(newPw), /\d/.test(newPw), /[^a-zA-Z0-9]/.test(newPw)];
                  return <div key={c} className={`h-1 flex-1 rounded-full ${checks[i] ? "bg-green-500" : "bg-muted"}`} />;
                })}
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label>Confirm New Password</Label>
            <Input type={showPw ? "text" : "password"} value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} placeholder="Repeat new password" />
          </div>
          {pwError && <p className="text-sm text-red-500 flex items-center gap-1"><AlertCircle className="h-3.5 w-3.5" />{pwError}</p>}
        </CardContent>
        <CardFooter className="gap-3">
          <Button onClick={handleChangePassword} disabled={pwState === "saving" || !currentPw || !newPw || !confirmPw}>
            {pwState === "saving" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {pwState === "saved" ? "Password Updated!" : "Update Password"}
          </Button>
          <SaveFeedback state={pwState} />
        </CardFooter>
      </Card>

      {/* ── Two-Factor Authentication ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Two-Factor Authentication</CardTitle>
          </div>
          <CardDescription>
            Add an extra layer of security using an authenticator app (Google Authenticator, Authy).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status */}
          <div className="flex items-center justify-between rounded-lg border px-4 py-3">
            <div className="flex items-center gap-3">
              <Smartphone className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Authenticator App</p>
                <p className="text-xs text-muted-foreground">
                  {twoFaEnabled ? "2FA is active — your account is secured" : "Not enabled"}
                </p>
              </div>
            </div>
            <Badge variant={twoFaEnabled ? "default" : "secondary"} className={twoFaEnabled ? "bg-green-500/10 text-green-600 border-green-500/20" : ""}>
              {twoFaEnabled ? "Active" : "Disabled"}
            </Badge>
          </div>

          {/* Setup flow */}
          {twoFaStep === "setup" && (
            <div className="rounded-lg border p-4 space-y-4 bg-muted/30">
              <p className="text-sm font-medium">Step 1 — Scan or copy your secret</p>
              <p className="text-xs text-muted-foreground">
                Open your authenticator app, add a new account, and enter the secret key below (or scan a QR code from your identity provider).
              </p>
              {/* Mock QR placeholder */}
              <div className="flex items-center gap-3">
                <div className="w-24 h-24 bg-foreground/5 border rounded-lg flex items-center justify-center text-muted-foreground text-[10px] text-center">
                  QR Code<br />(use secret)
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Secret Key</Label>
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-mono bg-muted px-3 py-1.5 rounded-md">{twoFaSecret}</code>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={copySecret}>
                      {copiedSecret ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>
              </div>
              <Separator />
              <p className="text-sm font-medium">Step 2 — Verify the 6-digit code</p>
              <div className="flex items-center gap-3">
                <Input
                  maxLength={6}
                  placeholder="000000"
                  value={twoFaCode}
                  onChange={(e) => setTwoFaCode(e.target.value.replace(/\D/g, ""))}
                  className="max-w-[140px] font-mono text-center text-lg tracking-widest"
                />
                <Button onClick={handleVerify2FA} disabled={twoFaCode.length !== 6 || twoFaState === "saving"}>
                  {twoFaState === "saving" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Verify &amp; Enable
                </Button>
                <Button variant="ghost" onClick={() => { setTwoFaStep("idle"); setTwoFaCode(""); }}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
        <CardFooter>
          {!twoFaEnabled ? (
            <Button onClick={handleEnable2FA} disabled={twoFaStep === "setup"} variant="outline">
              <Shield className="mr-2 h-4 w-4" /> Enable 2FA
            </Button>
          ) : (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="text-red-600 hover:text-red-600">
                  <Shield className="mr-2 h-4 w-4" /> Disable 2FA
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Disable 2FA?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will remove the extra layer of security from your account. You can re-enable it anytime.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep 2FA</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDisable2FA} className="bg-destructive text-destructive-foreground">
                    Disable
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {twoFaState === "saved" && <SaveFeedback state="saved" />}
        </CardFooter>
      </Card>

      {/* ── Active Sessions ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <LogOut className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Active Sessions</CardTitle>
          </div>
          <CardDescription>Devices currently logged in to your account.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { device: "Chrome on Windows", location: "Current session", time: "Now", current: true },
            { device: "Safari on iPhone", location: "Last seen 2 days ago", time: "2d ago", current: false },
          ].map((s) => (
            <div key={s.device} className="flex items-center justify-between rounded-lg border px-4 py-3">
              <div>
                <p className="text-sm font-medium flex items-center gap-2">
                  {s.device}
                  {s.current && <Badge variant="outline" className="text-green-600 border-green-500/30 bg-green-500/10 text-[10px]">Current</Badge>}
                </p>
                <p className="text-xs text-muted-foreground">{s.location}</p>
              </div>
              {!s.current && (
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-red-500">
                  Revoke
                </Button>
              )}
            </div>
          ))}
        </CardContent>
        <CardFooter>
          <Button variant="outline" onClick={() => { localStorage.removeItem("auth_token"); window.location.href = "/"; }}>
            <LogOut className="mr-2 h-4 w-4" /> Sign Out All Devices
          </Button>
        </CardFooter>
      </Card>

      {/* ── Danger Zone ── */}
      <Card className="border-red-500/30">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-red-500" />
            <CardTitle className="text-red-600">Delete Account</CardTitle>
          </div>
          <CardDescription>
            Permanently delete your account and all associated data. This cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-lg bg-red-500/5 border border-red-500/20 p-4 text-sm text-muted-foreground space-y-1">
            <p>⚠️ All your sessions, reports, templates, and profile data will be deleted.</p>
            <p>⚠️ Your account cannot be recovered after deletion.</p>
          </div>
          <div className="space-y-2 max-w-sm">
            <Label className="text-sm">Type <span className="font-mono font-semibold text-foreground">DELETE</span> to confirm</Label>
            <Input
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder="DELETE"
              className="border-red-500/30 focus-visible:ring-red-500/30"
            />
          </div>
        </CardContent>
        <CardFooter>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                disabled={deleteConfirm !== "DELETE" || deleteState === "saving"}
              >
                {deleteState === "saving" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Trash2 className="mr-2 h-4 w-4" /> Delete My Account
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action is permanent. Your account, all sessions, reports, and data will be deleted immediately and cannot be recovered.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={handleDeleteAccount}
                >
                  Yes, delete my account
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardFooter>
      </Card>
    </div>
  );
}

// ─── Main Settings Page ───────────────────────────────────────────────────────
export default function SettingsPage() {
  const currentUser = useBackendData<User>("/api/user", fallbackCurrentUser);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your account, appearance, and security.</p>
      </div>

      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 max-w-xl">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
          <TabsTrigger value="account">Security</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <ProfileTab currentUser={currentUser} />
        </TabsContent>

        <TabsContent value="notifications">
          <NotificationsTab />
        </TabsContent>

        <TabsContent value="appearance">
          <AppearanceTab />
        </TabsContent>

        <TabsContent value="account">
          <AccountTab currentUser={currentUser} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
