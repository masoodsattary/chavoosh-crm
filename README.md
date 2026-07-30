# Chavoosh CRM

سامانه داخلی مدیریت ارتباط با مشتریان چاووش، با رابط فارسی و راست‌چین، تاریخ
شمسی و قابلیت نصب به‌صورت PWA.

نسخه فعال: <https://chavoosh-crm.masoodsattary.chatgpt.site>

## قابلیت‌های اصلی

- حساب مشتری، تگ‌های گروه‌بندی، مسئول حساب و مشاهده‌کنندگان
- افراد و اطلاعات تماس مرتبط با هر مشتری
- فعالیت‌ها، جلسات، مکاتبات، اقدامات آینده و تایم‌لاین
- فرصت‌های فروش با مبلغ، ارز، احتمال، پیش‌بینی و مراحل اختصاصی
- اسناد متصل به مشتری، فعالیت یا فرصت در Cloudflare R2
- مشتری خصوصی و یادداشت مخصوص مدیران
- اعلان داخلی، دعوت کاربر و بازیابی رمز با Resend
- جست‌وجوی سراسری
- خروجی جامع Excel و دریافت مجدد اطلاعات
- حذف نرم، ثبت رویداد و Audit Log
- طراحی Mobile First، PWA و پشتیبانی از منطقه زمانی کاربر

## فناوری‌ها

- Vinext / Next-compatible App Router
- React 19 و TypeScript
- Cloudflare Worker
- Cloudflare D1 و Drizzle ORM
- Cloudflare R2
- Resend
- jalaali-js

## پیش‌نیازها

- Node.js `>=22.13.0`
- npm
- محیط Linux یا WSL برای اجرای اسکریپت‌های build

## نصب و اجرای محلی

```bash
git clone https://github.com/masoodsattary/chavoosh-crm.git
cd chavoosh-crm
npm ci
cp .env.example .env.local
npm run dev
```

سرور توسعه توسط Vite اجرا می‌شود. تنظیمات محلی D1 و R2 در
`vite.config.ts` شبیه‌سازی می‌شوند.

## دستورات

```bash
npm run dev               # اجرای توسعه
npm run lint              # کنترل کیفیت کد
npm test                  # build، اعتبارسنجی artifact و تست
npm run build             # ساخت نسخه Cloudflare Worker
npm run validate:artifact # بررسی مجدد خروجی build
npm run db:generate       # تولید migration جدید از schema
```

## دیتابیس

ساختار دیتابیس در `db/schema.ts` و migrationهای قابل تکرار در پوشه
`drizzle/` قرار دارند. فایل‌های `drizzle/meta/` تاریخچه و snapshotهای Drizzle
را نگه می‌دارند.

در محیط جدید:

1. یک D1 database ایجاد کنید.
2. migrationها را به ترتیب شماره اجرا کنید.
3. binding آن را با نام `DB` در محیط Worker تنظیم کنید.
4. یک R2 bucket ایجاد و با نام `BUCKET` bind کنید.

فایل GitHub شامل داده زنده D1 یا محتوای bucket نیست. خروجی دیتابیس و R2 باید
جداگانه و رمزگذاری‌شده پشتیبان‌گیری شوند.

## متغیرهای محیطی

مقادیر موردنیاز در `.env.example` مستند شده‌اند:

```dotenv
RESEND_API_KEY=
CRM_FROM_EMAIL=crm@notify.example.com
```

مقادیر واقعی را فقط در Environment Variables سرویس استقرار یا GitHub Secrets
قرار دهید. فایل‌های `.env*` به‌جز `.env.example` در Git نادیده گرفته می‌شوند.

## استقرار با ChatGPT Sites

فایل `.openai/hosting.json` اتصال پروژه به Site فعلی و bindingهای D1/R2 را
تعریف می‌کند. انتشار عملیاتی همچنان باید از چرخه ChatGPT Sites انجام شود تا
منابع مدیریت‌شده و دسترسی‌ها حفظ شوند.

وجود این فایل به‌معنی وجود credential در repository نیست؛ شناسه پروژه و نام
bindingها secret محسوب نمی‌شوند.

## پشتیبان‌گیری

برای بازیابی کامل سه جزء لازم است:

1. این repository برای سورس، تنظیمات، assets و migrationها
2. خروجی D1 برای اطلاعات ساخت‌یافته
3. آرشیو R2 برای فایل‌های بارگذاری‌شده

خروجی Excel داخل CRM یک خروجی کامل اطلاعات تجاری و metadata اسناد است، اما
محتوای باینری فایل‌های R2 و اطلاعات امنیتی کاربران را شامل نمی‌شود.

## امنیت

- هیچ API key، رمز، session یا token نباید commit شود.
- کلیدهای افشاشده باید فوراً revoke و جایگزین شوند.
- repository باید Private باقی بماند.
- قبل از استقرار، متغیرهای محیطی مقصد و سیاست دسترسی Site را بازبینی کنید.

## CI

Workflow موجود در `.github/workflows/ci.yml` در هر push و pull request موارد
زیر را اجرا می‌کند:

- نصب دقیق dependencyها از lock file
- lint
- build و تست
