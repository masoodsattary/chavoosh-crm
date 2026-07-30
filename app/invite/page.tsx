"use client";

import { Check, LoaderCircle, LockKeyhole } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export default function InvitePage() {
  const [profile, setProfile] = useState<{ email: string; fullName: string } | null>(null);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const tokenRef = useRef("");

  useEffect(() => {
    const inviteToken = new URLSearchParams(window.location.search).get("token") || "";
    tokenRef.current = inviteToken;
    if (!inviteToken) {
      const timer = window.setTimeout(() => setError("لینک دعوت معتبر نیست."), 0);
      return () => window.clearTimeout(timer);
    }
    void fetch(`/api/auth/invite?token=${encodeURIComponent(inviteToken)}`)
      .then(async (response) => {
        const result = await response.json() as { email?: string; fullName?: string; error?: string };
        if (!response.ok) throw new Error(result.error || "دعوت‌نامه معتبر نیست.");
        setProfile({ email: result.email || "", fullName: result.fullName || "" });
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "دعوت‌نامه معتبر نیست."));
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tokenRef.current, password, confirmation }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "فعال‌سازی انجام نشد.");
      window.location.assign("/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "فعال‌سازی انجام نشد.");
    } finally {
      setBusy(false);
    }
  };

  return <main className="auth-page" dir="rtl"><form className="auth-card invite-card" onSubmit={submit}>
    <div className="auth-title"><span><Check size={22} /></span><div><h2>تعیین رمز عبور CRM</h2><p>{profile ? `${profile.fullName || "کاربر چاووش"} · ${profile.email}` : "در حال بررسی لینک امن…"}</p></div></div>
    {error && <div className="auth-error">{error}</div>}
    {profile && <><label><span>رمز عبور جدید</span><div className="auth-input"><LockKeyhole size={17} /><input required dir="ltr" type="password" minLength={10} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></div></label><label><span>تکرار رمز عبور</span><div className="auth-input"><LockKeyhole size={17} /><input required dir="ltr" type="password" minLength={10} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></div></label><p className="password-hint">حداقل ۱۰ نویسه، شامل یک حرف انگلیسی و یک عدد</p><button className="primary-button auth-submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : <Check size={18} />} فعال‌سازی و ورود</button></>}
  </form></main>;
}
