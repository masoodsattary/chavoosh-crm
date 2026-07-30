"use client";

import { Eye, EyeOff, LoaderCircle, LockKeyhole, Mail } from "lucide-react";
import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      if (forgotMode) {
        const response = await fetch("/api/auth/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const result = await response.json() as { error?: string; emailConfigured?: boolean };
        if (!response.ok) throw new Error(result.error || "ثبت درخواست انجام نشد.");
        setSuccess(
          result.emailConfigured
            ? "اگر این ایمیل در سامانه فعال باشد، لینک ثبت رمز جدید برای آن ارسال شد."
            : "ارسال ایمیل هنوز فعال نیست. از مدیر سیستم بخواهید از بخش کاربران، لینک جدید برای شما صادر کند.",
        );
        return;
      }
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "ورود انجام نشد.");
      window.location.assign("/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ورود انجام نشد.");
    } finally {
      setBusy(false);
    }
  };

  return <main className="auth-page" dir="rtl">
    <section className="auth-brand">
      <div className="auth-logo-crop">
        <img src="/chavoosh-crm-mark.png" alt="چاووش CRM" />
      </div>
      <p>مدیریت یکپارچه ارتباط با مشتریان سازمانی</p>
    </section>
    <form className="auth-card" onSubmit={submit}>
      <div className="auth-title"><span><LockKeyhole size={22} /></span><div><h2>{forgotMode ? "بازیابی رمز عبور" : "ورود به سامانه"}</h2><p>{forgotMode ? "ایمیل حساب خود را وارد کنید" : "با حساب سازمانی خود وارد شوید"}</p></div></div>
      {error && <div className="auth-error">{error}</div>}
      {success && <div className="auth-success">{success}</div>}
      <label><span>ایمیل</span><div className="auth-input"><Mail size={17} /><input required dir="ltr" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" /></div></label>
      {!forgotMode && <label><span>رمز عبور</span><div className="auth-input"><LockKeyhole size={17} /><input required dir="ltr" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label="نمایش رمز عبور">{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>}
      <button className="primary-button auth-submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : <LockKeyhole size={18} />} {forgotMode ? "ارسال لینک بازیابی" : "ورود"}</button>
      <button className="text-action auth-mode-switch" type="button" onClick={() => { setForgotMode((value) => !value); setError(""); setSuccess(""); }}>{forgotMode ? "بازگشت به صفحه ورود" : "رمز عبور را فراموش کرده‌ام"}</button>
      {!forgotMode && <small>اگر هنوز رمز عبور ندارید، از مدیر سیستم لینک دعوت دریافت کنید.</small>}
    </form>
  </main>;
}
