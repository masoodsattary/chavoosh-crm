"use client";

import {
  Archive,
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Home,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  LockKeyhole,
  Mail,
  Menu,
  MessageSquareText,
  Paperclip,
  Pencil,
  Phone,
  Plus,
  Search,
  Settings,
  Target,
  Trash2,
  Upload,
  UserPlus,
  Users,
  Video,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { jalaaliMonthLength, toGregorian, toJalaali } from "jalaali-js";

type UserRole = "admin" | "sales_manager" | "sales" | "viewer";
type View =
  | "dashboard"
  | "customers"
  | "contacts"
  | "activities"
  | "opportunities"
  | "documents"
  | "search"
  | "reports"
  | "settings";
type CustomerTab =
  | "summary"
  | "timeline"
  | "contacts"
  | "opportunities"
  | "documents"
  | "manager";
type ModalKind =
  | "customer"
  | "contact"
  | "activity"
  | "opportunity"
  | "document"
  | "user"
  | "tag"
  | "managerNote"
  | "contactDetail"
  | "activityDetail"
  | null;

type AppUser = {
  id: number;
  email: string;
  fullName: string;
  mobile: string;
  role: UserRole;
  timezone: string;
  isActive: number;
  hasPassword: number;
  inviteExpiresAt?: string | null;
};
type Tag = { id: number; name: string; color: string };
type Customer = {
  id: number;
  name: string;
  shortName: string;
  organizationType: string;
  industry: string;
  relationshipStatus: string;
  importance: string;
  phone: string;
  fax: string;
  email: string;
  city: string;
  address: string;
  visibility: "public" | "private";
  ownerUserId: number;
  ownerName: string;
  lastInteractionAt: string | null;
  nextAction: string | null;
  nextActionAt: string | null;
  nextActionAssigneeName: string | null;
  contactCount: number;
  openOpportunityCount: number;
  tags: string[];
  isWatcher: number;
};
type Activity = {
  id: number;
  customerId: number;
  customerName: string;
  opportunityId?: number | null;
  title: string;
  type: string;
  status: "planned" | "completed" | "cancelled";
  startsAt: string;
  durationMinutes: number;
  description: string;
  result: string;
  nextAction: string;
  nextActionAt: string | null;
  assigneeUserId: number;
  assigneeName: string;
  isManagerPrivate: number;
  contacts: Array<{ id: number; name: string }>;
  freeContactNames: string[];
};
type Opportunity = {
  id: number;
  customerId: number;
  customerName: string;
  title: string;
  description: string;
  solutionText: string;
  status: "open" | "won" | "lost" | "paused" | "archived";
  currentStage: string;
  amount: number;
  currency: "IRR" | "USD" | "EUR";
  probability: number;
  forecastAt: string | null;
  latestStatus: string;
  nextAction: string;
  nextActionAt: string | null;
  ownerUserId: number;
  ownerName: string;
};
type Notification = {
  id: number;
  customerId: number | null;
  kind: "event" | "assignment" | "due" | "overdue";
  entityType: string;
  entityId: number | null;
  title: string;
  body: string;
  isRead: number;
  createdAt: string;
};
type SearchGroup =
  | "customers"
  | "contacts"
  | "activities"
  | "opportunities"
  | "documents";
type SearchItem = {
  id: number;
  customerId: number;
  title: string;
  subtitle: string;
  meta: string;
  score: number;
};
type SearchResponse = {
  query: string;
  groups: Record<SearchGroup, SearchItem[]>;
  counts: Record<SearchGroup, number>;
};
type Bootstrap = {
  user: AppUser;
  users: AppUser[];
  tags: Tag[];
  customers: Customer[];
  contacts: Contact[];
  activities: Activity[];
  opportunities: Opportunity[];
  notifications: Notification[];
  stats: {
    todayActivities: number;
    overdueActivities: number;
    openOpportunities: number;
    customers: number;
  };
  emailConfigured: boolean;
};
type Contact = {
  id: number;
  customerId: number;
  firstName: string;
  lastName: string;
  prefix: string;
  jobTitle: string;
  department: string;
  decisionRoles: string[];
  directPhone: string;
  extension: string;
  mobile: string;
  email: string;
  address: string;
  notes: string;
  status: string;
  customerName: string;
  activityCount?: number;
  lastActivityAt?: string | null;
};
type ContactDetail = { contact: Contact; activities: Activity[] };
type DocumentRow = {
  id: number;
  title: string;
  documentType: string;
  version: string;
  fileName: string;
  contentType: string;
  size: number;
  createdAt: string;
};
type TimelineEvent = {
  id: number;
  eventType: string;
  title: string;
  summary: string;
  entityType: string;
  entityId: number | null;
  isManagerPrivate: number;
  createdAt: string;
  createdByName: string;
  createdByEmail: string;
};
type Step = {
  id?: number;
  opportunityId?: number;
  title: string;
  status: string;
  dueAt?: string | null;
  assigneeUserId?: number;
  notes?: string;
  probability?: number | null;
};
type CustomerDetail = {
  customer: Record<string, unknown>;
  watchers: AppUser[];
  tags: Tag[];
  contacts: Contact[];
  activities: Activity[];
  opportunities: Opportunity[];
  steps: Step[];
  documents: DocumentRow[];
  timeline: TimelineEvent[];
  managerNotes: Array<{
    id: number;
    body: string;
    createdAt: string;
    createdByName: string;
  }>;
};

const activityTypes = [
  ["call", "تماس تلفنی"],
  ["meeting_in_person", "جلسه حضوری"],
  ["meeting_online", "جلسه آنلاین"],
  ["email", "ایمیل"],
  ["letter", "نامه"],
  ["message", "پیام"],
  ["technical_proposal", "ارسال پیشنهاد فنی"],
  ["financial_proposal", "ارسال پیشنهاد فنی‌مالی"],
  ["demo", "ارائه یا دمو"],
  ["follow_up", "پیگیری"],
  ["note", "یادداشت"],
] as const;

export default function CRMApp({
  identity,
}: {
  identity: { email: string; displayName: string };
}) {
  const [data, setData] = useState<Bootstrap | null>(null);
  const [view, setView] = useState<View>("dashboard");
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);
  const [contactDetail, setContactDetail] = useState<ContactDetail | null>(null);
  const [customerTab, setCustomerTab] = useState<CustomerTab>("summary");
  const [modal, setModal] = useState<ModalKind>(null);
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResponse | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [inviteUrl, setInviteUrl] = useState("");

  const loadBootstrap = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api<Bootstrap>("/api/bootstrap");
      setData(result);
      setError("");
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCustomer = useCallback(async (id: number) => {
    setSelectedContactId(null);
    setContactDetail(null);
    setSelectedCustomerId(id);
    setDetail(null);
    try {
      const loaded = await api<CustomerDetail>(`/api/customers/${id}`);
      setDetail(loaded);
      return loaded;
    } catch (cause) {
      setError(messageOf(cause));
      return null;
    }
  }, []);

  const loadContact = useCallback(async (id: number) => {
    setSelectedCustomerId(null);
    setDetail(null);
    setSelectedContactId(id);
    setContactDetail(null);
    try {
      setContactDetail(await api<ContactDetail>(`/api/contacts/${id}`));
      setView("contacts");
    } catch (cause) {
      setError(messageOf(cause));
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadBootstrap(), 0);
    return () => window.clearTimeout(timer);
  }, [loadBootstrap]);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const id = Number(params.get("customer"));
      if (id) {
        void loadCustomer(id);
        setView("customers");
        if (params.get("tab") === "timeline") setCustomerTab("timeline");
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadCustomer]);

  useEffect(() => {
    const query = normalize(search);
    if (query.length < 2) return;
    const timer = window.setTimeout(() => {
      setSearchLoading(true);
      void api<SearchResponse>(`/api/search?q=${encodeURIComponent(search)}&limit=5`)
        .then((result) => {
          setSearchResults(result);
          setSearchOpen(true);
        })
        .catch((cause) => setError(messageOf(cause)))
        .finally(() => setSearchLoading(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const refresh = async (customerId?: number | null) => {
    await loadBootstrap();
    if (customerId) await loadCustomer(customerId);
    else if (selectedContactId) await loadContact(selectedContactId);
  };
  const showToast = (value: string) => {
    setToast(value);
    window.setTimeout(() => setToast(""), 3500);
  };
  const navigate = (next: View) => {
    setView(next);
    setSelectedCustomerId(null);
    setDetail(null);
    setSelectedContactId(null);
    setContactDetail(null);
    setNotificationsOpen(false);
    setSearch("");
    setSearchOpen(false);
  };
  const openModal = (kind: ModalKind, value?: Record<string, unknown> | null) => {
    setEditing(value ?? null);
    setModal(kind);
  };
  const openSearchItem = async (group: SearchGroup, item: SearchItem) => {
    setSearchOpen(false);
    if (group === "contacts") {
      await loadContact(item.id);
      return;
    }
    const loaded = await loadCustomer(item.customerId);
    setView("customers");
    if (!loaded) return;
    if (group === "activities") {
      const activity = loaded.activities.find((value) => value.id === item.id);
      if (activity) {
        openModal("activityDetail", activity as unknown as Record<string, unknown>);
      } else {
        setCustomerTab("timeline");
      }
    } else if (group === "opportunities") {
      setCustomerTab("opportunities");
    } else if (group === "documents") {
      setCustomerTab("documents");
    } else {
      setCustomerTab("summary");
    }
  };
  const showAllSearchResults = async () => {
    if (normalize(search).length < 2) return;
    setSearchLoading(true);
    try {
      setSearchResults(
        await api<SearchResponse>(
          `/api/search?q=${encodeURIComponent(search)}&limit=50`,
        ),
      );
      setSelectedCustomerId(null);
      setSelectedContactId(null);
      setDetail(null);
      setContactDetail(null);
      setView("search");
      setSearchOpen(false);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setSearchLoading(false);
    }
  };
  const closeModal = () => {
    if (!busy) {
      setModal(null);
      setEditing(null);
      setInviteUrl("");
    }
  };
  const perform = async (
    fn: () => Promise<unknown>,
    success: string,
    customerId?: number | null,
  ) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      setModal(null);
      setEditing(null);
      showToast(success);
      await refresh(customerId);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  };
  const inviteExistingUser = async (target: AppUser) => {
    setEditing(target as unknown as Record<string, unknown>);
    setInviteUrl("");
    setModal("user");
    setBusy(true);
    setError("");
    try {
      const result = await api<{ inviteUrl: string }>("/api/admin", {
        method: "POST",
        body: { action: "user_invite", id: target.id },
      });
      setInviteUrl(result.inviteUrl);
      showToast("لینک جدید صادر شد و لینک قبلی باطل شد.");
      await refresh();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="app-loading" dir="rtl">
        <LoaderCircle className="spin" size={30} />
        <strong>در حال آماده‌سازی CRM…</strong>
        <span>{identity.email}</span>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="app-loading error-screen" dir="rtl">
        <LockKeyhole size={32} />
        <strong>دسترسی به CRM ممکن نیست</strong>
        <span>{error}</span>
        <button className="primary-button" onClick={() => void loadBootstrap()}>
          تلاش دوباره
        </button>
      </div>
    );
  }

  const unread = data.notifications.filter((item) => !item.isRead).length;
  const customer = data.customers.find((item) => item.id === selectedCustomerId);
  const canWrite = data.user.role !== "viewer";
  const manager = data.user.role === "admin" || data.user.role === "sales_manager";

  return (
    <div className="crm-shell" dir="rtl">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo-crop">
            <img src="/chavoosh-crm-horizontal.png" alt="چاووش CRM" />
          </div>
        </div>
        <nav className="side-nav">
          <SideItem icon={LayoutDashboard} label="داشبورد" active={view === "dashboard" && !selectedCustomerId} onClick={() => navigate("dashboard")} />
          <SideItem icon={Building2} label="مشتریان" active={view === "customers"} onClick={() => navigate("customers")} />
          <SideItem icon={Users} label="افراد" active={view === "contacts"} onClick={() => navigate("contacts")} />
          <SideItem icon={CalendarDays} label="فعالیت‌ها" badge={data.stats.overdueActivities} active={view === "activities"} onClick={() => navigate("activities")} />
          <SideItem icon={Target} label="فرصت‌های فروش" active={view === "opportunities"} onClick={() => navigate("opportunities")} />
          <SideItem icon={FileText} label="اسناد" active={view === "documents"} onClick={() => navigate("documents")} />
          <SideItem icon={BarChart3} label="گزارش‌ها" active={view === "reports"} onClick={() => navigate("reports")} />
        </nav>
        <div className="side-bottom">
          <SideItem icon={Settings} label="تنظیمات" active={view === "settings"} onClick={() => navigate("settings")} />
          <div className="profile-mini">
            <div className="avatar avatar-primary">{initials(data.user.fullName || data.user.email)}</div>
            <div><strong>{data.user.fullName || data.user.email}</strong><span>{roleLabel(data.user.role)}</span></div>
            <a className="row-more" href="/api/auth/logout" title="خروج"><LogOut size={18} /></a>
          </div>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <button
            className="icon-button menu-button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="باز کردن منوی بیشتر"
          ><Menu size={21} /></button>
          <div className={`global-search ${searchOpen ? "open" : ""}`} role="combobox" aria-expanded={searchOpen} aria-controls="global-search-results" aria-haspopup="listbox">
            <Search size={19} />
            <input
              value={search}
              onFocus={() => normalize(search).length >= 2 && setSearchOpen(true)}
              onBlur={() => window.setTimeout(() => setSearchOpen(false), 180)}
              onChange={(event) => {
                const value = event.target.value;
                setSearch(value);
                if (normalize(value).length < 2) {
                  setSearchResults(null);
                  setSearchOpen(false);
                  setSearchLoading(false);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void showAllSearchResults();
                } else if (event.key === "Escape") {
                  setSearchOpen(false);
                }
              }}
              placeholder="جستجو در همه اطلاعات CRM…"
              aria-label="جستجوی سراسری"
            />
            {searchLoading && <LoaderCircle className="spin search-spinner" size={16} />}
            {search && <button className="search-clear" onMouseDown={(event) => event.preventDefault()} onClick={() => { setSearch(""); setSearchResults(null); setSearchOpen(false); }} aria-label="پاک کردن جستجو"><X size={15} /></button>}
            {searchOpen && normalize(search).length >= 2 && (
              <QuickSearchPanel
                query={search}
                result={searchResults}
                loading={searchLoading}
                onOpen={(group, item) => void openSearchItem(group, item)}
                onAll={() => void showAllSearchResults()}
              />
            )}
          </div>
          <div className="top-actions">
            {canWrite && <button className="primary-button top-add" onClick={() => openModal("activity")}><Plus size={18} /> ثبت سریع</button>}
            <div className="notification-wrap">
              <button className={`icon-button ${unread ? "has-dot" : ""}`} onClick={() => setNotificationsOpen((value) => !value)} aria-label="اعلان‌ها"><Bell size={20} /></button>
              {notificationsOpen && (
                <NotificationPanel
                  items={data.notifications}
                  onClose={() => setNotificationsOpen(false)}
                  onRead={async (item) => {
                    await api("/api/notifications", { method: "PATCH", body: { id: item.id } });
                    setNotificationsOpen(false);
                    if (item.entityType === "contact" && item.entityId) {
                      await loadContact(item.entityId);
                    } else if (item.customerId) {
                      const loaded = await loadCustomer(item.customerId);
                      setView("customers");
                      if (item.entityType === "activity" && item.entityId && loaded) {
                        const activity = loaded.activities.find((value) => value.id === item.entityId);
                        if (activity) openModal("activityDetail", activity as unknown as Record<string, unknown>);
                        else setCustomerTab("timeline");
                      } else if (item.entityType === "opportunity") {
                        setCustomerTab("opportunities");
                      } else if (item.entityType === "document") {
                        setCustomerTab("documents");
                      } else {
                        setCustomerTab("timeline");
                      }
                    }
                    await loadBootstrap();
                  }}
                />
              )}
            </div>
          </div>
        </header>

        <div className="content">
          {error && <div className="alert error-alert"><span>{error}</span><button onClick={() => setError("")}><X size={17} /></button></div>}
          {!data.emailConfigured && data.user.role === "admin" && (
            <div className="alert info-alert">
              <Mail size={18} />
              <span>اعلان‌های داخلی فعال‌اند؛ برای ارسال ایمیل، سرویس ایمیل باید در مرحله نهایی متصل شود.</span>
            </div>
          )}

          {selectedContactId ? (
            <ContactPage
              detail={contactDetail}
              timezone={data.user.timezone}
              canWrite={canWrite}
              onBack={() => { setSelectedContactId(null); setContactDetail(null); }}
              onCustomer={(id) => void loadCustomer(id)}
              onActivity={(activity) => openModal("activityDetail", activity as unknown as Record<string, unknown>)}
              onContact={(id) => void loadContact(id)}
              onEdit={(contact) => openModal("contact", contact as unknown as Record<string, unknown>)}
              onArchive={(contact) =>
                window.confirm("این فرد بایگانی شود؟") &&
                void perform(
                  () => api("/api/contacts", { method: "DELETE", body: { id: contact.id } }),
                  "فرد بایگانی شد.",
                ).then(() => { setSelectedContactId(null); setContactDetail(null); })
              }
            />
          ) : selectedCustomerId && customer ? (
            <CustomerPage
              customer={customer}
              detail={detail}
              tab={customerTab}
              setTab={setCustomerTab}
              timezone={data.user.timezone}
              manager={manager}
              canWrite={canWrite}
              onBack={() => setSelectedCustomerId(null)}
              onEdit={() => openModal("customer", mapCustomerToForm(detail?.customer, detail))}
              onAdd={(kind) => openModal(kind)}
              onEditOpportunity={(value) => openModal("opportunity", value as unknown as Record<string, unknown>)}
              onArchiveOpportunity={(value) =>
                window.confirm("این فرصت فروش بایگانی شود؟") &&
                void perform(
                  () => api("/api/opportunities", { method: "DELETE", body: { id: value.id } }),
                  "فرصت فروش بایگانی شد.",
                  customer.id,
                )
              }
              onArchiveDocument={(value) =>
                window.confirm("این سند بایگانی شود؟ فایل فیزیکی حذف نخواهد شد.") &&
                void perform(
                  () => api("/api/files", { method: "DELETE", body: { id: value.id } }),
                  "سند بایگانی شد.",
                  customer.id,
                )
              }
              onEditManagerNote={(value) => {
                const body = window.prompt("متن یادداشت خصوصی را ویرایش کنید:", value.body);
                if (body !== null && body.trim()) {
                  void perform(
                    () => api("/api/notes", { method: "PATCH", body: { id: value.id, body } }),
                    "یادداشت مدیر ویرایش شد.",
                    customer.id,
                  );
                }
              }}
              onArchiveManagerNote={(value) =>
                window.confirm("این یادداشت خصوصی بایگانی شود؟") &&
                void perform(
                  () => api("/api/notes", { method: "DELETE", body: { id: value.id } }),
                  "یادداشت مدیر بایگانی شد.",
                  customer.id,
                )
              }
              onContact={(id) => void loadContact(id)}
              onActivity={(activity) => openModal("activityDetail", activity as unknown as Record<string, unknown>)}
              onCompleteActivity={(activity) =>
                void perform(
                  () => api("/api/activities", { method: "PATCH", body: { id: activity.id, status: "completed", title: activity.title, result: activity.result || "انجام شد" } }),
                  "فعالیت انجام شد.",
                  customer.id,
                )
              }
              onArchive={() =>
                window.confirm("این مشتری بایگانی شود؟") &&
                void perform(
                  () => api(`/api/customers/${customer.id}`, { method: "DELETE" }),
                  "مشتری بایگانی شد.",
                  null,
                )
              }
            />
          ) : view === "search" ? (
            <SearchResultsPage
              query={search}
              result={searchResults}
              loading={searchLoading}
              onOpen={(group, item) => void openSearchItem(group, item)}
            />
          ) : view === "dashboard" ? (
            <Dashboard
              data={data}
              onCustomer={(id) => void loadCustomer(id)}
              onActivity={(activity) => openModal("activityDetail", activity as unknown as Record<string, unknown>)}
              onContact={(id) => void loadContact(id)}
              onComplete={(activity) =>
                void perform(
                  () => api("/api/activities", { method: "PATCH", body: { id: activity.id, status: "completed", title: activity.title, result: "انجام شد" } }),
                  "فعالیت تکمیل شد.",
                )
              }
              timezone={data.user.timezone}
            />
          ) : view === "customers" ? (
            <CustomersView
              customers={data.customers}
              tags={data.tags}
              canWrite={canWrite}
              onNew={() => openModal("customer")}
              onCustomer={(id) => void loadCustomer(id)}
              timezone={data.user.timezone}
            />
          ) : view === "contacts" ? (
            <ContactsPage
              contacts={data.contacts}
              timezone={data.user.timezone}
              canWrite={canWrite}
              onNew={() => openModal("contact")}
              onContact={(id) => void loadContact(id)}
              onCustomer={(id) => void loadCustomer(id)}
            />
          ) : view === "activities" ? (
            <ActivitiesView
              activities={data.activities}
              canWrite={canWrite}
              timezone={data.user.timezone}
              onNew={() => openModal("activity")}
              onActivity={(activity) => openModal("activityDetail", activity as unknown as Record<string, unknown>)}
              onContact={(id) => void loadContact(id)}
              onComplete={(activity) =>
                void perform(
                  () => api("/api/activities", { method: "PATCH", body: { id: activity.id, status: "completed", title: activity.title, result: "انجام شد" } }),
                  "فعالیت انجام شد.",
                )
              }
            />
          ) : view === "opportunities" ? (
            <OpportunitiesView
              opportunities={data.opportunities}
              canWrite={canWrite}
              timezone={data.user.timezone}
              onNew={() => openModal("opportunity")}
              onEdit={(value) => openModal("opportunity", value as unknown as Record<string, unknown>)}
              onArchive={(value) =>
                window.confirm("این فرصت فروش بایگانی شود؟") &&
                void perform(
                  () => api("/api/opportunities", { method: "DELETE", body: { id: value.id } }),
                  "فرصت فروش بایگانی شد.",
                )
              }
              onCustomer={(id) => void loadCustomer(id)}
            />
          ) : view === "documents" ? (
            <DocumentsView canWrite={canWrite} onNew={() => openModal("document")} onCustomer={(id) => void loadCustomer(id)} customers={data.customers} />
          ) : view === "reports" ? (
            <ReportsView data={data} timezone={data.user.timezone} />
          ) : (
            <SettingsView
              data={data}
              manager={manager}
              onUser={(target) => openModal("user", target as unknown as Record<string, unknown>)}
              onInvite={(target) => void inviteExistingUser(target)}
              onTag={() => openModal("tag")}
              onRefresh={() => void refresh()}
              perform={perform}
            />
          )}
        </div>
      </main>

      {mobileMenuOpen && (
        <div className="mobile-menu-backdrop" onClick={() => setMobileMenuOpen(false)}>
          <aside className="mobile-more-menu" onClick={(event) => event.stopPropagation()} aria-label="منوی بیشتر">
            <header><strong>دسترسی سریع</strong><button onClick={() => setMobileMenuOpen(false)} aria-label="بستن"><X size={20} /></button></header>
            {[
              [Users, "افراد", "contacts"],
              [FileText, "اسناد", "documents"],
              [BarChart3, "گزارش‌ها", "reports"],
              [Settings, "تنظیمات", "settings"],
            ].map(([Icon, label, target]) => (
              <button key={String(target)} onClick={() => { navigate(target as View); setMobileMenuOpen(false); }}>
                <Icon size={20} /><span>{String(label)}</span><ChevronLeft size={17} />
              </button>
            ))}
            <a href="/api/auth/logout"><LogOut size={20} /><span>خروج از حساب</span><ChevronLeft size={17} /></a>
          </aside>
        </div>
      )}

      <nav className="mobile-nav">
        <MobileItem icon={Home} label="خانه" active={view === "dashboard"} onClick={() => navigate("dashboard")} />
        <MobileItem icon={Building2} label="مشتریان" active={view === "customers"} onClick={() => navigate("customers")} />
        <button className="mobile-fab" onClick={() => canWrite && openModal("activity")} disabled={!canWrite}><Plus size={26} /></button>
        <MobileItem icon={CalendarDays} label="فعالیت‌ها" active={view === "activities"} onClick={() => navigate("activities")} />
        <MobileItem icon={Target} label="فرصت‌ها" active={view === "opportunities"} onClick={() => navigate("opportunities")} />
      </nav>

      {modal === "customer" && (
        <CustomerForm data={data} initial={editing} busy={busy} onClose={closeModal} onSubmit={(body) =>
          perform(
            () =>
              editing?.id
                ? api(`/api/customers/${editing.id}`, { method: "PATCH", body })
                : api("/api/customers", { method: "POST", body }),
            editing?.id ? "اطلاعات مشتری به‌روزرسانی شد." : "مشتری جدید ثبت شد.",
            editing?.id ? Number(editing.id) : null,
          )
        } />
      )}
      {modal === "contact" && (
        <ContactForm data={data} customerId={selectedCustomerId || Number(editing?.customerId) || 0} initial={editing} busy={busy} onClose={closeModal} onSubmit={(body) =>
          perform(
            () => editing?.id
              ? api("/api/contacts", { method: "PATCH", body: { ...body, id: editing.id } })
              : api("/api/contacts", { method: "POST", body }),
            editing?.id ? "اطلاعات فرد به‌روزرسانی شد." : "فرد جدید اضافه شد.",
            selectedCustomerId,
          )
        } />
      )}
      {modal === "activity" && (
        <ActivityForm data={data} initial={editing} selectedCustomerId={selectedCustomerId} timezone={data.user.timezone} busy={busy} manager={manager} onClose={closeModal} onSubmit={(body) =>
          perform(
            () => editing?.id
              ? api("/api/activities", { method: "PATCH", body: { ...body, id: editing.id } })
              : api("/api/activities", { method: "POST", body }),
            editing?.id ? "فعالیت به‌روزرسانی شد." : "فعالیت ثبت شد و اعلان‌ها ایجاد شدند.",
            selectedContactId ? null : Number(body.customerId),
          )
        } />
      )}
      {modal === "contactDetail" && editing && (
        <ContactDetailModal contact={editing as unknown as Contact} canWrite={canWrite} onClose={closeModal} onOpen={() => void loadContact(Number(editing.id))} onEdit={() => openModal("contact", editing)} />
      )}
      {modal === "activityDetail" && editing && (
        <ActivityDetailModal
          activity={editing as unknown as Activity}
          timezone={data.user.timezone}
          canWrite={canWrite}
          onClose={closeModal}
          onContact={(id) => { closeModal(); void loadContact(id); }}
          onEdit={() => openModal("activity", editing)}
          onArchive={() =>
            window.confirm("این فعالیت بایگانی شود؟") &&
            void perform(
              () => api("/api/activities", { method: "DELETE", body: { id: editing.id } }),
              "فعالیت بایگانی شد.",
              selectedContactId ? null : Number(editing.customerId),
            )
          }
        />
      )}
      {modal === "opportunity" && (
        <OpportunityForm data={data} selectedCustomerId={selectedCustomerId} initial={editing} timezone={data.user.timezone} busy={busy} onClose={closeModal} onSubmit={(body) =>
          perform(
            () => editing?.id ? api("/api/opportunities", { method: "PATCH", body: { ...body, id: editing.id } }) : api("/api/opportunities", { method: "POST", body }),
            editing?.id ? "فرصت به‌روزرسانی شد." : "فرصت فروش ایجاد شد.",
            Number(body.customerId),
          )
        } />
      )}
      {modal === "document" && (
        <DocumentForm data={data} selectedCustomerId={selectedCustomerId} detail={detail} busy={busy} onClose={closeModal} onSubmit={(form) =>
          perform(() => apiForm("/api/files", form), "سند بارگذاری شد.", Number(form.get("customerId")))
        } />
      )}
      {modal === "managerNote" && selectedCustomerId && (
        <ManagerNoteForm busy={busy} onClose={closeModal} onSubmit={(body) =>
          perform(() => api("/api/notes", { method: "POST", body: { ...body, customerId: selectedCustomerId } }), "یادداشت خصوصی ثبت شد.", selectedCustomerId)
        } />
      )}
      {modal === "user" && (
        <UserForm initial={editing as unknown as AppUser | null} busy={busy} inviteUrl={inviteUrl} emailConfigured={data.emailConfigured} onClose={() => { closeModal(); void refresh(); }} onSubmit={async (body) => {
          if (editing?.id) {
            await perform(
              () => api("/api/admin", { method: "POST", body: { action: "user_update", id: editing.id, ...body } }),
              "اطلاعات کاربر به‌روزرسانی شد.",
            );
            return;
          }
          setBusy(true);
          setError("");
          try {
            const result = await api<{ inviteUrl: string }>("/api/admin", { method: "POST", body: { action: "user_create", ...body } });
            setInviteUrl(result.inviteUrl);
            showToast("کاربر ایجاد و لینک دعوت آماده شد.");
          } catch (cause) {
            setError(messageOf(cause));
          } finally {
            setBusy(false);
          }
        }} />
      )}
      {modal === "tag" && (
        <TagForm busy={busy} onClose={closeModal} onSubmit={(body) =>
          perform(() => api("/api/admin", { method: "POST", body: { action: "tag_create", ...body } }), "تگ ایجاد شد.")
        } />
      )}
      {toast && <div className="toast"><Check size={18} />{toast}</div>}
    </div>
  );
}

function Dashboard({ data, onCustomer, onActivity, onContact, onComplete, timezone }: { data: Bootstrap; onCustomer: (id: number) => void; onActivity: (activity: Activity) => void; onContact: (id: number) => void; onComplete: (activity: Activity) => void; timezone: string }) {
  const now = new Date();
  const tasks = data.activities.filter((item) => item.status === "planned").sort((a, b) => a.startsAt.localeCompare(b.startsAt)).slice(0, 6);
  const weighted = data.opportunities.filter((item) => item.status === "open").reduce<Record<string, number>>((sum, item) => {
    sum[item.currency] = (sum[item.currency] || 0) + item.amount * item.probability / 100;
    return sum;
  }, {});
  return (
    <>
      <PageHeading eyebrow={persianDate(now.toISOString(), timezone, true)} title={`سلام، ${data.user.fullName || data.user.email}`} description={`${data.stats.todayActivities} فعالیت امروز و ${data.stats.overdueActivities} مورد عقب‌افتاده دارید.`} />
      <section className="metric-grid">
        <Metric icon={CalendarDays} label="فعالیت‌های امروز" value={fa(data.stats.todayActivities)} tone="teal" sub="برنامه امروز شما" />
        <Metric icon={Archive} label="عقب‌افتاده" value={fa(data.stats.overdueActivities)} tone="red" sub="نیازمند رسیدگی" />
        <Metric icon={Target} label="فرصت‌های باز" value={fa(data.stats.openOpportunities)} tone="blue" sub="کل فرصت‌های فعال" />
        <Metric icon={Building2} label="مشتریان" value={fa(data.stats.customers)} tone="gold" sub="حساب‌های فعال" />
      </section>
      <div className="dashboard-grid">
        <section className="panel task-panel">
          <PanelHeader title="برنامه و پیگیری‌ها" subtitle={`${fa(tasks.length)} فعالیت آینده`} />
          <div className="task-list">
            {tasks.length ? tasks.map((task) => (
              <article className={`task-row clickable ${new Date(task.startsAt) < now ? "late" : ""}`} key={task.id} onClick={() => onActivity(task)}>
                <button className="task-check" onClick={(event) => { event.stopPropagation(); onComplete(task); }}><Check size={15} /></button>
                <div className={`task-icon ${task.type.includes("meeting") ? "meeting" : task.type === "call" ? "phone" : "mail"}`}>{activityIcon(task.type)}</div>
                <div className="task-copy"><strong>{task.title}</strong><button onClick={(event) => { event.stopPropagation(); onCustomer(task.customerId); }}>{task.customerName}</button><ActivityPeople activity={task} onContact={onContact} /></div>
                <div className="task-time"><span>{persianDate(task.startsAt, timezone)}</span>{new Date(task.startsAt) < now && <em>عقب‌افتاده</em>}</div>
              </article>
            )) : <EmptyState title="فعالیت برنامه‌ریزی‌شده‌ای ندارید" text="از ثبت سریع برای ایجاد اقدام بعدی استفاده کنید." />}
          </div>
        </section>
        <section className="panel attention-panel">
          <PanelHeader title="ارزش وزنی فرصت‌ها" subtitle="به تفکیک ارز" />
          {(["USD", "EUR", "IRR"] as const).map((currency) => (
            <div className="currency-line" key={currency}><span>{currencyLabel(currency)}</span><strong>{money(weighted[currency] || 0, currency)}</strong></div>
          ))}
        </section>
        <section className="panel pipeline-panel">
          <PanelHeader title="فرصت‌های نزدیک" subtitle="براساس تاریخ پیش‌بینی" />
          <div className="mini-timeline">
            {data.opportunities.filter((item) => item.status === "open").slice(0, 5).map((item) => (
              <div className="mini-event" key={item.id}><span className="timeline-icon teal"><Target size={16} /></span><div><strong>{item.title}</strong><p>{item.customerName} · {item.currentStage || "بدون مرحله"}</p><small>{money(item.amount, item.currency)} · احتمال {fa(item.probability)}٪</small></div></div>
            ))}
          </div>
        </section>
        <section className="panel recent-panel">
          <PanelHeader title="مشتریان اخیر" subtitle="براساس آخرین تعامل" />
          <div className="mini-timeline">
            {data.customers.slice(0, 5).map((item) => (
              <button className="customer-mini" key={item.id} onClick={() => onCustomer(item.id)}><span className="company-avatar">{initials(item.shortName || item.name)}</span><span><strong>{item.name}</strong><small>{item.lastInteractionAt ? persianDate(item.lastInteractionAt, timezone) : "بدون تعامل"}</small></span><ChevronLeft size={17} /></button>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

function CustomersView({ customers, tags, canWrite, onNew, onCustomer, timezone }: { customers: Customer[]; tags: Tag[]; canWrite: boolean; onNew: () => void; onCustomer: (id: number) => void; timezone: string }) {
  const [localSearch, setLocalSearch] = useState("");
  const [group, setGroup] = useState("all");
  const [scope, setScope] = useState<"all" | "private" | "open">("all");
  const visible = customers.filter((customer) => {
    const matchesSearch = !normalize(localSearch) || normalize(
      `${customer.name} ${customer.shortName} ${customer.tags.join(" ")} ${customer.ownerName} ${customer.phone} ${customer.email}`,
    ).includes(normalize(localSearch));
    const inGroup = group === "all" || customer.tags.includes(group);
    const inScope =
      scope === "all" ||
      (scope === "private" && customer.visibility === "private") ||
      (scope === "open" && customer.openOpportunityCount > 0);
    return matchesSearch && inGroup && inScope;
  });
  return (
    <>
      <PageHeading title="مشتریان" description="حساب‌های مشتری، افراد و تاریخچه تعاملات." action={canWrite ? <button className="primary-button" onClick={onNew}><Plus size={18} /> مشتری جدید</button> : undefined} />
      <div className="list-toolbar">
        <div className="local-search"><Search size={18} /><input value={localSearch} onChange={(event) => setLocalSearch(event.target.value)} placeholder="نام، مسئول، تلفن یا تگ…" /></div>
        <div className="filter-chips">
          <button className={scope === "all" ? "selected" : ""} onClick={() => setScope("all")}>همه <span>{fa(customers.length)}</span></button>
          <button className={scope === "private" ? "selected" : ""} onClick={() => setScope("private")}>خصوصی</button>
          <button className={scope === "open" ? "selected" : ""} onClick={() => setScope("open")}>دارای فرصت باز</button>
        </div>
        <label className="group-filter"><Filter size={16} /><select value={group} onChange={(event) => setGroup(event.target.value)}><option value="all">همه گروه‌ها</option>{tags.map((tag) => <option key={tag.id} value={tag.name}>{tag.name}</option>)}</select></label>
      </div>
      <section className="customer-table panel">
        <div className="table-head"><span>نام مشتری</span><span>گروه‌ها</span><span>مسئول حساب</span><span>آخرین تعامل</span><span>اقدام بعدی</span><span>فرصت‌ها</span><span /></div>
        {visible.map((customer) => (
          <button className="customer-row" key={customer.id} onClick={() => onCustomer(customer.id)}>
            <span className="customer-name"><i className="company-avatar">{initials(customer.shortName || customer.name)}</i><span><strong>{customer.name}</strong>{customer.visibility === "private" && <small><LockKeyhole size={12} /> خصوصی</small>}</span></span>
            <span className="tag-list">{customer.tags.map((tag) => <em key={tag}>{tag}</em>)}</span>
            <span>{customer.ownerName || "—"}</span>
            <span>{customer.lastInteractionAt ? persianDate(customer.lastInteractionAt, timezone) : "بدون تعامل"}</span>
            <span><strong>{customer.nextAction || "تعیین نشده"}</strong><small>{customer.nextActionAt ? `${persianDate(customer.nextActionAt, timezone)}${customer.nextActionAssigneeName ? ` · ${customer.nextActionAssigneeName}` : ""}` : "—"}</small></span>
            <span><b className="opportunity-count">{fa(customer.openOpportunityCount)}</b></span>
            <span><ChevronLeft size={18} /></span>
          </button>
        ))}
        {!visible.length && <EmptyState title="مشتری پیدا نشد" text="گروه یا فیلتر را تغییر دهید." />}
      </section>
    </>
  );
}

function ContactsPage({ contacts, timezone, canWrite, onNew, onContact, onCustomer }: { contacts: Contact[]; timezone: string; canWrite: boolean; onNew: () => void; onContact: (id: number) => void; onCustomer: (id: number) => void }) {
  const [localSearch, setLocalSearch] = useState("");
  const visible = contacts.filter((contact) =>
    !normalize(localSearch) || normalize(
      `${contact.prefix} ${contact.firstName} ${contact.lastName} ${contact.customerName} ${contact.jobTitle} ${contact.department} ${contact.mobile} ${contact.email}`,
    ).includes(normalize(localSearch)),
  );
  return (
    <>
      <PageHeading title="افراد" description="مخاطبان مشتریان و سابقه تعامل با هر فرد." action={canWrite ? <button className="primary-button" onClick={onNew}><UserPlus size={17} /> فرد جدید</button> : undefined} />
      <div className="list-toolbar">
        <div className="local-search"><Search size={18} /><input value={localSearch} onChange={(event) => setLocalSearch(event.target.value)} placeholder="نام، شرکت، سمت، موبایل یا ایمیل…" /></div>
        <span className="result-count">{fa(visible.length)} فرد</span>
      </div>
      <section className="people-table panel">
        <div className="people-head"><span>نام فرد</span><span>مشتری</span><span>سمت و واحد</span><span>تماس</span><span>آخرین تعامل</span><span>تعاملات</span><span /></div>
        {visible.map((person) => (
          <div className="people-row" key={person.id}>
            <button className="customer-name" onClick={() => onContact(person.id)}><i className="avatar">{initials(`${person.firstName} ${person.lastName}`)}</i><span><strong>{person.prefix} {person.firstName} {person.lastName}</strong><small>{person.jobTitle || "سمت ثبت نشده"}</small></span></button>
            <button className="table-link" onClick={() => onCustomer(person.customerId)}>{person.customerName}</button>
            <span><strong>{person.jobTitle || "—"}</strong><small>{person.department || "—"}</small></span>
            <span className="table-contact-actions"><ContactActionValue type="phone" value={person.mobile || person.directPhone} /><ContactActionValue type="email" value={person.email} /></span>
            <span>{person.lastActivityAt ? persianDate(person.lastActivityAt, timezone) : "بدون تعامل"}</span>
            <span><b className="opportunity-count">{fa(person.activityCount || 0)}</b></span>
            <button className="row-more" onClick={() => onContact(person.id)}><ChevronLeft size={18} /></button>
          </div>
        ))}
        {!visible.length && <EmptyState title="فردی پیدا نشد" text="عبارت جستجو را تغییر دهید یا فردی را از پرونده مشتری اضافه کنید." />}
      </section>
    </>
  );
}

function ContactPage({ detail, timezone, canWrite, onBack, onCustomer, onContact, onActivity, onEdit, onArchive }: { detail: ContactDetail | null; timezone: string; canWrite: boolean; onBack: () => void; onCustomer: (id: number) => void; onContact: (id: number) => void; onActivity: (activity: Activity) => void; onEdit: (contact: Contact) => void; onArchive: (contact: Contact) => void }) {
  if (!detail) return <div className="inline-loading"><LoaderCircle className="spin" /><span>در حال بارگذاری پرونده فرد…</span></div>;
  const person = detail.contact;
  return (
    <>
      <button className="back-link" onClick={onBack}><ChevronLeft size={18} /> بازگشت به افراد</button>
      <section className="contact-hero panel">
        <i className="avatar contact-avatar">{initials(`${person.firstName} ${person.lastName}`)}</i>
        <div className="contact-title"><h1>{person.prefix} {person.firstName} {person.lastName}</h1><button onClick={() => onCustomer(person.customerId)}>{person.customerName}</button><p>{person.jobTitle || "سمت ثبت نشده"}{person.department ? ` · ${person.department}` : ""}</p><div className="tag-list">{person.decisionRoles?.map((role) => <em key={role}>{role}</em>)}</div></div>
        {canWrite && <div className="customer-quick-actions"><button className="secondary-button" onClick={() => onEdit(person)}><Pencil size={16} /> ویرایش</button><button className="danger-button" onClick={() => onArchive(person)}><Trash2 size={16} /> بایگانی</button></div>}
        <div className="contact-facts">
          <div><span>موبایل</span><ContactActionValue type="phone" value={person.mobile} /></div>
          <div><span>تلفن مستقیم</span><ContactActionValue type="phone" value={person.directPhone} /></div>
          <div><span>ایمیل</span><ContactActionValue type="email" value={person.email} /></div>
          <div><span>آدرس</span><ContactActionValue type="address" value={person.address} /></div>
          <div><span>تعداد تعامل</span><strong>{fa(detail.activities.length)}</strong></div>
        </div>
      </section>
      <section className="person-timeline">
        <PageHeading title="سابقه پیگیری و تماس‌ها" description="تمام فعالیت‌هایی که این فرد در آن‌ها به‌عنوان مخاطب ثبت شده است." />
        {detail.activities.map((activity) => <ActivityHistoryCard key={activity.id} activity={activity} timezone={timezone} onClick={() => onActivity(activity)} onContact={onContact} />)}
        {!detail.activities.length && <EmptyState title="تعامل ثبت‌شده‌ای وجود ندارد" text="در هنگام ثبت فعالیت، این فرد را به‌عنوان مخاطب انتخاب کنید." />}
      </section>
    </>
  );
}

function CustomerPage(props: {
  customer: Customer;
  detail: CustomerDetail | null;
  tab: CustomerTab;
  setTab: (tab: CustomerTab) => void;
  timezone: string;
  manager: boolean;
  canWrite: boolean;
  onBack: () => void;
  onEdit: () => void;
  onAdd: (kind: ModalKind) => void;
  onEditOpportunity: (value: Opportunity) => void;
  onArchiveOpportunity: (value: Opportunity) => void;
  onArchiveDocument: (value: DocumentRow) => void;
  onEditManagerNote: (value: CustomerDetail["managerNotes"][number]) => void;
  onArchiveManagerNote: (value: CustomerDetail["managerNotes"][number]) => void;
  onContact: (id: number) => void;
  onActivity: (value: Activity) => void;
  onCompleteActivity: (value: Activity) => void;
  onArchive: () => void;
}) {
  const { customer, detail, tab, setTab, timezone, manager, canWrite } = props;
  if (!detail) return <div className="inline-loading"><LoaderCircle className="spin" /><span>در حال بارگذاری پرونده مشتری…</span></div>;
  const tabs: Array<[CustomerTab, string, number?]> = [
    ["summary", "نمای کلی"],
    ["timeline", "تایم‌لاین", detail.timeline.length],
    ["contacts", "افراد", detail.contacts.length],
    ["opportunities", "فرصت‌ها", detail.opportunities.length],
    ["documents", "اسناد", detail.documents.length],
  ];
  if (manager) tabs.push(["manager", "یادداشت مدیران", detail.managerNotes.length]);
  return (
    <>
      <button className="back-link" onClick={props.onBack}><ChevronLeft size={18} /> بازگشت به مشتریان</button>
      <section className="customer-hero panel">
        <div className="customer-identity">
          <i className="company-avatar large">{initials(customer.shortName || customer.name)}</i>
          <div><div className="title-line"><h1>{customer.name}</h1>{customer.visibility === "private" ? <span className="private-badge"><LockKeyhole size={13} /> خصوصی</span> : <span className="public-badge">عمومی</span>}</div><div className="tag-list">{detail.tags.map((tag) => <em key={tag.id}>{tag.name}</em>)}</div></div>
        </div>
        {canWrite && <div className="customer-quick-actions"><button className="secondary-button" onClick={() => props.onAdd("contact")}><UserPlus size={17} /> افزودن فرد</button><button className="secondary-button" onClick={() => props.onAdd("opportunity")}><Target size={17} /> ایجاد فرصت</button><button className="primary-button" onClick={() => props.onAdd("activity")}><Plus size={18} /> ثبت فعالیت</button></div>}
        <div className="customer-facts">
          <div><span>مسئول حساب</span><strong>{customer.ownerName}</strong></div>
          <div><span>مشاهده‌کنندگان</span><strong>{fa(detail.watchers.length)} کاربر</strong></div>
          <div><span>آخرین تعامل</span><strong>{customer.lastInteractionAt ? persianDate(customer.lastInteractionAt, timezone) : "ثبت نشده"}</strong></div>
          <div><span>اقدام بعدی</span><strong className="accent-text">{customer.nextAction || "تعیین نشده"}</strong>{customer.nextActionAt && <small>{persianDate(customer.nextActionAt, timezone)}{customer.nextActionAssigneeName ? ` · ${customer.nextActionAssigneeName}` : ""}</small>}</div>
        </div>
        <div className="customer-contact-actions">
          <div><span>تلفن</span><ContactActionValue type="phone" value={customer.phone} /></div>
          <div><span>ایمیل</span><ContactActionValue type="email" value={customer.email} /></div>
          <div className="address-action"><span>آدرس</span><ContactActionValue type="address" value={customer.address || customer.city} /></div>
        </div>
      </section>
      <div className="customer-tabs">{tabs.map(([id, label, count]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}{count !== undefined && <span>{fa(count)}</span>}</button>)}</div>
      {tab === "summary" && <CustomerSummary detail={detail} timezone={timezone} onAdd={props.onAdd} onContact={props.onContact} onActivity={props.onActivity} />}
      {tab === "timeline" && <TimelineView items={detail.timeline} activities={detail.activities} timezone={timezone} onActivity={props.onActivity} onContact={props.onContact} />}
      {tab === "contacts" && <ContactsView items={detail.contacts} canWrite={canWrite} onAdd={() => props.onAdd("contact")} onContact={props.onContact} />}
      {tab === "opportunities" && <OpportunityCards opportunities={detail.opportunities} timezone={timezone} canWrite={canWrite} onEdit={props.onEditOpportunity} onArchive={props.onArchiveOpportunity} />}
      {tab === "documents" && <DocumentList items={detail.documents} canWrite={canWrite} onAdd={() => props.onAdd("document")} onArchive={props.onArchiveDocument} />}
      {tab === "manager" && <ManagerNotes items={detail.managerNotes} timezone={timezone} onAdd={() => props.onAdd("managerNote")} onEdit={props.onEditManagerNote} onArchive={props.onArchiveManagerNote} />}
      {canWrite && <div className="danger-zone"><button className="secondary-button" onClick={props.onEdit}><Pencil size={16} /> ویرایش مشتری</button><button className="danger-button" onClick={props.onArchive}><Trash2 size={16} /> بایگانی مشتری</button></div>}
    </>
  );
}

function CustomerSummary({ detail, timezone, onAdd, onContact, onActivity }: { detail: CustomerDetail; timezone: string; onAdd: (kind: ModalKind) => void; onContact: (id: number) => void; onActivity: (activity: Activity) => void }) {
  const planned = detail.activities.find((item) => item.status === "planned");
  return (
    <div className="customer-layout">
      <div className="customer-main">
        <section className="panel"><PanelHeader title="آخرین رویدادها" /><div className="mini-timeline roomy">{detail.timeline.slice(0, 5).map((item) => <MiniEvent key={item.id} item={item} activity={item.entityType === "activity" ? detail.activities.find((value) => value.id === item.entityId) : undefined} timezone={timezone} onClick={() => { if (item.entityType === "activity") { const activity = detail.activities.find((value) => value.id === item.entityId); if (activity) onActivity(activity); } else if (item.entityType === "contact" && item.entityId) onContact(item.entityId); }} />)}{!detail.timeline.length && <EmptyState title="هنوز رویدادی ثبت نشده" text="اولین تماس یا جلسه را ثبت کنید." />}</div></section>
        <section className="panel open-opportunity"><PanelHeader title="فرصت‌های باز" /><OpportunityCards opportunities={detail.opportunities.filter((item) => item.status === "open").slice(0, 3)} timezone={timezone} /></section>
      </div>
      <aside className="customer-aside">
        <section className="panel next-action-card"><span className="section-label">اقدام بعدی</span>{planned ? <><div className="big-date"><CalendarDays size={22} /><span>{persianDate(planned.startsAt, timezone, true)}</span></div><h3>{planned.title}</h3><p>مسئول: {planned.assigneeName}</p></> : <><div className="big-date"><Plus size={22} /></div><h3>اقدام بعدی تعیین نشده</h3><p>برای حفظ پیگیری، یک فعالیت آینده ایجاد کنید.</p></>}<button className="primary-button full" onClick={() => onAdd("activity")}><Plus size={17} /> ثبت اقدام</button></section>
        <section className="panel contact-card"><PanelHeader title="افراد کلیدی" /><div>{detail.contacts.slice(0, 4).map((person) => <PersonRow key={person.id} person={person} onClick={() => onContact(person.id)} />)}{!detail.contacts.length && <EmptyState title="فردی ثبت نشده" text="یک مخاطب به مشتری اضافه کنید." />}</div></section>
      </aside>
    </div>
  );
}

function TimelineView({ items, activities, timezone, onActivity, onContact }: { items: TimelineEvent[]; activities: Activity[]; timezone: string; onActivity: (activity: Activity) => void; onContact: (id: number) => void }) {
  const [filter, setFilter] = useState("all");
  const filtered = filter === "all" ? items : items.filter((item) => item.eventType.includes(filter));
  return (
    <section className="timeline-layout">
      <div className="timeline-toolbar"><div className="filter-chips">{[["all", "همه"], ["activity", "تعاملات"], ["opportunity", "فرصت‌ها"], ["document", "اسناد"], ["contact", "افراد"]].map(([id, label]) => <button key={id} className={filter === id ? "selected" : ""} onClick={() => setFilter(id)}>{label}</button>)}</div></div>
      {filtered.map((item) => { const activity = item.entityType === "activity" ? activities.find((value) => value.id === item.entityId) : undefined; return <article className="timeline-card panel timeline-button" key={item.id} onClick={() => { if (activity) onActivity(activity); else if (item.entityType === "contact" && item.entityId) onContact(item.entityId); }}><span className={`timeline-icon ${eventTone(item.eventType)}`}>{eventIcon(item.eventType)}</span><div className="timeline-card-body"><header><div><h3>{item.title}</h3><span>{persianDate(item.createdAt, timezone)} · {item.createdByName || item.createdByEmail}</span></div>{item.isManagerPrivate ? <span className="private-badge"><LockKeyhole size={12} /> مدیران</span> : null}</header>{item.summary && <p>{item.summary}</p>}{activity && <ActivityPeople activity={activity} onContact={onContact} />}</div></article>; })}
      {!filtered.length && <EmptyState title="رویدادی در این بخش نیست" text="فیلتر را تغییر دهید یا تعامل جدید ثبت کنید." />}
    </section>
  );
}

function ContactsView({ items, canWrite, onAdd, onContact }: { items: Contact[]; canWrite: boolean; onAdd: () => void; onContact: (id: number) => void }) {
  return <section className="panel simple-panel"><PanelHeader title="افراد مرتبط" subtitle={`${fa(items.length)} فرد`} action={canWrite ? "افزودن فرد" : undefined} onAction={onAdd} /><div className="contact-grid">{items.map((person) => <PersonRow key={person.id} person={person} onClick={() => onContact(person.id)} />)}</div>{!items.length && <EmptyState title="فردی ثبت نشده" text="افراد کلیدی و نقش آن‌ها در تصمیم‌گیری را ثبت کنید." />}</section>;
}

function PersonRow({ person, onClick }: { person: Contact; onClick?: () => void }) {
  return <div className="person-row"><i className="avatar">{initials(`${person.firstName} ${person.lastName}`)}</i><button className="person-link" onClick={onClick}><strong>{person.prefix} {person.firstName} {person.lastName}</strong><span>{person.jobTitle || "سمت ثبت نشده"}{person.department ? ` · ${person.department}` : ""}</span>{person.decisionRoles?.length ? <small>{person.decisionRoles.join("، ")}</small> : null}</button><span className="person-actions">{person.mobile && <a href={`tel:${person.mobile}`} title={`تماس با ${person.mobile}`} onClick={(event) => event.stopPropagation()}><Phone size={16} /></a>}{person.email && <a href={`mailto:${person.email}`} title={`ارسال ایمیل به ${person.email}`} onClick={(event) => event.stopPropagation()}><Mail size={16} /></a>}</span></div>;
}

function ContactActionValue({
  type,
  value,
}: {
  type: "phone" | "email" | "address";
  value?: string | null;
}) {
  const [copied, setCopied] = useState(false);
  if (!value) return <strong>—</strong>;
  if (type === "phone") {
    return <a className="contact-action-value" href={`tel:${value}`} dir="ltr" title="تماس"><Phone size={15} /><strong>{value}</strong></a>;
  }
  if (type === "email") {
    return <a className="contact-action-value" href={`mailto:${value}`} dir="ltr" title="ارسال ایمیل"><Mail size={15} /><strong>{value}</strong></a>;
  }
  return (
    <button
      type="button"
      className="contact-action-value copy-address"
      title="کپی آدرس"
      onClick={() => void navigator.clipboard.writeText(value).then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      })}
    >
      {copied ? <Check size={15} /> : <Copy size={15} />}
      <strong>{copied ? "آدرس کپی شد" : value}</strong>
    </button>
  );
}

function OpportunitiesView({ opportunities, canWrite, timezone, onNew, onEdit, onArchive, onCustomer }: { opportunities: Opportunity[]; canWrite: boolean; timezone: string; onNew: () => void; onEdit: (value: Opportunity) => void; onArchive: (value: Opportunity) => void; onCustomer: (id: number) => void }) {
  return <><PageHeading title="فرصت‌های فروش" description="پیش‌بینی، مبلغ، احتمال موفقیت و اقدام بعدی." action={canWrite ? <button className="primary-button" onClick={onNew}><Plus size={18} /> فرصت جدید</button> : undefined} /><section className="opportunity-metrics">{(["IRR", "USD", "EUR"] as const).map((currency) => <div key={currency}><span>مجموع {currencyLabel(currency)}</span><strong>{money(opportunities.filter((item) => item.status === "open" && item.currency === currency).reduce((sum, item) => sum + item.amount, 0), currency)}</strong></div>)}<div><span>فرصت‌های باز</span><strong>{fa(opportunities.filter((item) => item.status === "open").length)}</strong></div></section><OpportunityCards opportunities={opportunities} timezone={timezone} canWrite={canWrite} onEdit={onEdit} onArchive={onArchive} onCustomer={onCustomer} /></>;
}

function OpportunityCards({ opportunities, timezone, canWrite, onEdit, onArchive, onCustomer }: { opportunities: Opportunity[]; timezone: string; canWrite?: boolean; onEdit?: (value: Opportunity) => void; onArchive?: (value: Opportunity) => void; onCustomer?: (id: number) => void }) {
  return <div className="opportunity-list">{opportunities.map((item) => <article className="opportunity-card panel" key={item.id}><div className="opportunity-top"><span className="opportunity-logo"><Target size={20} /></span><div><h3>{item.title}</h3><button onClick={() => onCustomer?.(item.customerId)}>{item.customerName}</button></div><span className={`stage-badge status-${item.status}`}>{statusLabel(item.status)} · {item.currentStage || "بدون مرحله"}</span>{canWrite && <span className="card-actions"><button className="row-more" title="ویرایش" onClick={() => onEdit?.(item)}><Pencil size={17} /></button>{onArchive && <button className="row-more danger-icon" title="بایگانی" onClick={() => onArchive(item)}><Archive size={17} /></button>}</span>}</div><div className="opportunity-data"><div><span>مبلغ</span><strong>{money(item.amount, item.currency)}</strong></div><div><span>احتمال</span><strong>{fa(item.probability)}٪</strong></div><div><span>پیش‌بینی</span><strong>{item.forecastAt ? persianDate(item.forecastAt, timezone, true) : "—"}</strong></div><div><span>اقدام بعدی</span><strong>{item.nextAction || "تعیین نشده"}</strong></div></div><div className="probability-track"><i style={{ width: `${item.probability}%` }} /></div></article>)}{!opportunities.length && <EmptyState title="فرصتی ثبت نشده" text="مذاکرات جدی را به فرصت فروش تبدیل کنید." />}</div>;
}

function ActivitiesView({ activities, canWrite, timezone, onNew, onComplete, onActivity, onContact }: { activities: Activity[]; canWrite: boolean; timezone: string; onNew: () => void; onComplete: (value: Activity) => void; onActivity: (value: Activity) => void; onContact: (id: number) => void }) {
  const [filter, setFilter] = useState<"planned" | "completed" | "overdue">("planned");
  const now = new Date();
  const visible = activities.filter((item) => filter === "overdue" ? item.status === "planned" && new Date(item.startsAt) < now : item.status === filter);
  return <><PageHeading title="فعالیت‌ها" description="تماس‌ها، جلسات، مکاتبات و اقدامات آینده." action={canWrite ? <button className="primary-button" onClick={onNew}><Plus size={18} /> فعالیت جدید</button> : undefined} /><div className="segmented"><button className={filter === "planned" ? "active" : ""} onClick={() => setFilter("planned")}>برنامه‌ریزی‌شده</button><button className={filter === "overdue" ? "active" : ""} onClick={() => setFilter("overdue")}>عقب‌افتاده</button><button className={filter === "completed" ? "active" : ""} onClick={() => setFilter("completed")}>انجام‌شده</button></div><section className="panel activity-page"><div className="task-list">{visible.map((item) => <article className={`task-row expanded clickable ${item.status === "planned" && new Date(item.startsAt) < now ? "late" : ""}`} key={item.id} onClick={() => onActivity(item)}>{canWrite && item.status === "planned" && <button className="task-check" onClick={(event) => { event.stopPropagation(); onComplete(item); }}><Check size={15} /></button>}<div className={`task-icon ${item.type.includes("meeting") ? "meeting" : item.type === "call" ? "phone" : "mail"}`}>{activityIcon(item.type)}</div><div className="task-copy"><strong>{item.title}</strong><span>{item.customerName}</span><small>{item.assigneeName} · {activityTypeLabel(item.type)}</small><ActivityPeople activity={item} onContact={onContact} /></div><div className="task-time"><span>{persianDate(item.startsAt, timezone)}</span></div></article>)}{!visible.length && <EmptyState title="فعالیتی در این بخش نیست" text="فیلتر دیگری را انتخاب کنید یا فعالیت جدید بسازید." />}</div></section></>;
}

function ActivityPeople({ activity, onContact }: { activity: Activity; onContact?: (id: number) => void }) {
  if (!activity.contacts?.length && !activity.freeContactNames?.length) return null;
  return (
    <span className="activity-people">
      <Users size={13} />
      {activity.contacts?.map((person) => <button key={person.id} onClick={(event) => { event.stopPropagation(); onContact?.(person.id); }}>{person.name}</button>)}
      {activity.freeContactNames?.map((name) => <em key={name}>{name}</em>)}
    </span>
  );
}

function ActivityHistoryCard({ activity, timezone, onClick, onContact }: { activity: Activity; timezone: string; onClick: () => void; onContact?: (id: number) => void }) {
  return (
    <article className="timeline-card panel activity-history-card" onClick={onClick}>
      <span className={`timeline-icon ${activity.type.includes("meeting") ? "blue" : "teal"}`}>{activityIcon(activity.type)}</span>
      <div className="timeline-card-body">
        <header><div><h3>{activity.title}</h3><span>{persianDate(activity.startsAt, timezone)} · {activity.assigneeName}</span></div><span className={`stage-badge status-${activity.status}`}>{activityStatusLabel(activity.status)}</span></header>
        <p>{activity.description}</p>
        <ActivityPeople activity={activity} onContact={onContact} />
      </div>
    </article>
  );
}

function DocumentsView({ customers, canWrite, onNew, onCustomer }: { customers: Customer[]; canWrite: boolean; onNew: () => void; onCustomer: (id: number) => void }) {
  return <><PageHeading title="اسناد" description="اسناد در پرونده هر مشتری نگهداری می‌شوند." action={canWrite ? <button className="primary-button" onClick={onNew}><Upload size={18} /> بارگذاری سند</button> : undefined} /><section className="panel simple-panel"><PanelHeader title="پرونده‌های مشتریان" subtitle="برای مشاهده اسناد، پرونده مشتری را باز کنید." /><div className="document-customer-list">{customers.map((customer) => <button key={customer.id} onClick={() => onCustomer(customer.id)}><span className="company-avatar">{initials(customer.name)}</span><span><strong>{customer.name}</strong><small>{fa(customer.contactCount)} فرد · {fa(customer.openOpportunityCount)} فرصت باز</small></span><ChevronLeft size={18} /></button>)}</div></section></>;
}

function ReportsView({ data, timezone }: { data: Bootstrap; timezone: string }) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const open = data.opportunities.filter((item) => item.status === "open");
  const won = data.opportunities.filter((item) => item.status === "won");
  const lost = data.opportunities.filter((item) => item.status === "lost");
  const completed = data.activities.filter((item) => item.status === "completed");
  const byOwner = data.users
    .map((user) => ({
      user,
      activities: completed.filter((item) => item.assigneeUserId === user.id).length,
      opportunities: open.filter((item) => item.ownerUserId === user.id).length,
    }))
    .filter((row) => row.activities || row.opportunities);
  const exportReport = async () => {
    setExporting(true);
    setExportError("");
    try {
      const bundle = await api<{
        format: string;
        formatVersion: number;
        generatedAt: string;
        generatedBy: string;
        timezone: string;
        sheets: Array<{ name: string; description: string; rows: Array<Record<string, unknown>> }>;
        backupSheets: Array<{ name: string; table: string; keyColumns: string[]; rows: Array<Record<string, unknown>> }>;
      }>("/api/export");
      const XLSX = await import("xlsx");
      const workbook = XLSX.utils.book_new();
      const guide = XLSX.utils.aoa_to_sheet([
        ["خروجی جامع و پشتیبان چاووش CRM"],
        ["زمان تهیه", isoToJalaliInput(bundle.generatedAt, timezone)],
        ["تهیه‌کننده", bundle.generatedBy],
        ["نسخه قالب", bundle.formatVersion],
        ["کاربرد", "گزارش مدیریتی و دریافت مجدد اطلاعات در چاووش CRM"],
        ["راهنما", "شیت‌های فارسی برای مطالعه و گزارش هستند. شیت‌های فنی DB_ برای بازیابی خودکار استفاده می‌شوند و نباید حذف یا تغییر نام داده شوند."],
        ["ملاحظات امنیتی", "هش رمز عبور، توکن دعوت، نشست‌های فعال، محدودیت‌های ورود و بدنه ایمیل‌ها در فایل قرار نمی‌گیرند."],
        ["اسناد", "مشخصات و شناسه ذخیره‌سازی اسناد صادر می‌شود؛ محتوای فایل‌های بارگذاری‌شده داخل Excel نیست."],
      ]);
      guide["!cols"] = [{ wch: 24 }, { wch: 100 }];
      XLSX.utils.book_append_sheet(workbook, guide, "راهنما");
      appendExcelSheet(
        XLSX,
        workbook,
        "خلاصه",
        bundle.sheets.map((sheet) => ({
          "شیت گزارش": sheet.name,
          "شرح": sheet.description,
          "تعداد رکورد": sheet.rows.length,
        })),
      );
      for (const sheet of bundle.sheets) {
        appendExcelSheet(
          XLSX,
          workbook,
          sheet.name,
          sheet.rows.map((row) => readableExcelRow(row, timezone)),
        );
      }
      for (const sheet of bundle.backupSheets) {
        appendExcelSheet(XLSX, workbook, sheet.name, sheet.rows, false);
      }
      workbook.Workbook = {
        Sheets: workbook.SheetNames.map((name) => ({
          Hidden: name.startsWith("DB_") ? 2 : 0,
        })),
      };
      workbook.Props = {
        Title: "خروجی جامع و پشتیبان چاووش CRM",
        Subject: "گزارش و پشتیبان اطلاعات CRM",
        Author: bundle.generatedBy,
        CreatedDate: new Date(bundle.generatedAt),
      };
      XLSX.writeFile(
        workbook,
        `Chavoosh-CRM-Backup-${persianFileStamp(new Date(), timezone)}.xlsx`,
        { compression: true },
      );
    } catch (cause) {
      setExportError(messageOf(cause));
    } finally {
      setExporting(false);
    }
  };
  return (
    <>
      <PageHeading title="گزارش‌ها" description="نمای مدیریتی فروش و عملکرد؛ مبالغ هر ارز جداگانه محاسبه می‌شوند." action={data.user.role === "admin" ? <button className="primary-button" disabled={exporting} onClick={() => void exportReport()}>{exporting ? <LoaderCircle className="spin" size={18} /> : <Download size={18} />} {exporting ? "در حال تهیه…" : "خروجی کامل Excel"}</button> : undefined} />
      {exportError && <div className="alert error-alert">{exportError}</div>}
      <section className="metric-grid">
        <Metric icon={Target} label="فرصت‌های باز" value={fa(open.length)} tone="blue" sub="در جریان مذاکره" />
        <Metric icon={Check} label="موفق" value={fa(won.length)} tone="teal" sub="فروش‌های نهایی‌شده" />
        <Metric icon={X} label="ناموفق" value={fa(lost.length)} tone="red" sub="فرصت‌های ازدست‌رفته" />
        <Metric icon={CalendarDays} label="تعامل انجام‌شده" value={fa(completed.length)} tone="gold" sub="کل فعالیت‌های تکمیل‌شده" />
      </section>
      <div className="dashboard-grid reports-grid">
        <section className="panel">
          <PanelHeader title="قیف فروش به تفکیک ارز" subtitle="مبلغ اسمی و ارزش وزنی فرصت‌های باز" />
          {(["IRR", "USD", "EUR"] as const).map((currency) => {
            const rows = open.filter((item) => item.currency === currency);
            const total = rows.reduce((sum, item) => sum + item.amount, 0);
            const weighted = rows.reduce((sum, item) => sum + item.amount * item.probability / 100, 0);
            return <div className="report-line" key={currency}><span>{currencyLabel(currency)}<small>{fa(rows.length)} فرصت</small></span><strong>{money(total, currency)}<small>وزنی: {money(weighted, currency)}</small></strong></div>;
          })}
        </section>
        <section className="panel">
          <PanelHeader title="عملکرد کاربران" subtitle="فعالیت‌های انجام‌شده و فرصت‌های باز" />
          {byOwner.map((row) => <div className="report-line" key={row.user.id}><span>{row.user.fullName || row.user.email}<small>{roleLabel(row.user.role)}</small></span><strong>{fa(row.activities)} فعالیت<small>{fa(row.opportunities)} فرصت باز</small></strong></div>)}
          {!byOwner.length && <EmptyState title="داده کافی وجود ندارد" text="پس از ثبت فعالیت و فرصت، عملکرد در این بخش نمایش داده می‌شود." />}
        </section>
      </div>
    </>
  );
}

function DocumentList({ items, canWrite, onAdd, onArchive }: { items: DocumentRow[]; canWrite: boolean; onAdd: () => void; onArchive: (value: DocumentRow) => void }) {
  return <section className="panel simple-panel"><PanelHeader title="اسناد مشتری" subtitle={`${fa(items.length)} فایل`} action={canWrite ? "بارگذاری سند" : undefined} onAction={onAdd} /><div className="document-list">{items.map((doc) => <div key={doc.id}><span className="document-icon"><FileText size={19} /></span><div><strong>{doc.title}</strong><small>{doc.fileName} · نسخه {doc.version}</small></div><span>{fileSize(doc.size)}</span><a className="row-more" title="دانلود" href={`/api/files/${doc.id}`}><Download size={18} /></a>{canWrite && <button className="row-more danger-icon" title="بایگانی" onClick={() => onArchive(doc)}><Archive size={17} /></button>}</div>)}</div>{!items.length && <EmptyState title="سندی بارگذاری نشده" text="فایل‌های مرتبط را به پرونده مشتری متصل کنید." />}</section>;
}

function ManagerNotes({ items, timezone, onAdd, onEdit, onArchive }: { items: CustomerDetail["managerNotes"]; timezone: string; onAdd: () => void; onEdit: (value: CustomerDetail["managerNotes"][number]) => void; onArchive: (value: CustomerDetail["managerNotes"][number]) => void }) {
  return <section className="panel simple-panel"><PanelHeader title="یادداشت‌های خصوصی مدیران" subtitle="برای کاربران عادی نمایش داده نمی‌شود" action="یادداشت جدید" onAction={onAdd} /><div className="manager-note-list">{items.map((item) => <article key={item.id}><LockKeyhole size={17} /><div><p>{item.body}</p><small>{item.createdByName} · {persianDate(item.createdAt, timezone)}</small></div><span className="card-actions"><button className="row-more" title="ویرایش" onClick={() => onEdit(item)}><Pencil size={15} /></button><button className="row-more danger-icon" title="بایگانی" onClick={() => onArchive(item)}><Archive size={15} /></button></span></article>)}</div>{!items.length && <EmptyState title="یادداشت خصوصی وجود ندارد" text="این بخش فقط برای مدیران قابل مشاهده است." />}</section>;
}

function SettingsView({ data, manager, onUser, onInvite, onTag, onRefresh, perform }: { data: Bootstrap; manager: boolean; onUser: (user?: AppUser) => void; onInvite: (user: AppUser) => void; onTag: () => void; onRefresh: () => void; perform: (fn: () => Promise<unknown>, message: string) => Promise<void> }) {
  const [fullName, setFullName] = useState(data.user.fullName);
  const [mobile, setMobile] = useState(data.user.mobile || "");
  const [timezone, setTimezone] = useState(data.user.timezone);
  const admin = data.user.role === "admin";
  return <><PageHeading title="تنظیمات" description="پروفایل، امنیت حساب، کاربران، تگ‌ها، دریافت اطلاعات و وضعیت سرویس‌ها." /><div className="settings-grid"><section className="panel settings-card"><PanelHeader title="پروفایل من" /><div className="form-body compact-form"><Field label="نام و نام خانوادگی"><input value={fullName} onChange={(event) => setFullName(event.target.value)} /></Field><Field label="شماره موبایل"><input dir="ltr" inputMode="tel" value={mobile} onChange={(event) => setMobile(event.target.value)} placeholder="09xxxxxxxxx" /></Field><Field label="منطقه زمانی"><select value={timezone} onChange={(event) => setTimezone(event.target.value)}><option value="Asia/Tehran">تهران</option><option value="Europe/Berlin">برلین</option><option value="Asia/Dubai">دبی</option><option value="America/Toronto">تورنتو</option></select></Field><button className="primary-button" onClick={() => void perform(() => api("/api/admin", { method: "POST", body: { action: "profile_update", fullName, mobile, timezone } }), "پروفایل ذخیره شد.").then(onRefresh)}>ذخیره تنظیمات</button></div></section><PasswordSettings onRefresh={onRefresh} /><section className="panel settings-card"><PanelHeader title="سرویس ایمیل" /><div className="service-status"><span className={data.emailConfigured ? "status-ok" : "status-warn"}>{data.emailConfigured ? <Check size={18} /> : <Mail size={18} />}</span><div><strong>{data.emailConfigured ? "متصل و فعال" : "نیازمند اتصال"}</strong><p>{data.emailConfigured ? "اعلان‌ها، دعوت‌نامه‌ها و بازیابی رمز ایمیل می‌شوند." : "لینک‌های دعوت در بخش کاربران قابل کپی هستند؛ بازیابی عمومی رمز به فعال‌سازی ایمیل نیاز دارد."}</p></div></div></section></div>{manager && <><section className="panel simple-panel settings-section"><PanelHeader title="کاربران سیستم" subtitle={`${fa(data.users.length)} کاربر`} action={admin ? "کاربر جدید" : undefined} onAction={() => onUser()} /><div className="user-list">{data.users.map((user) => <div key={user.id}><i className="avatar">{initials(user.fullName || user.email)}</i><span><strong>{user.fullName || "بدون نام"}</strong><small>{user.email}{user.mobile ? ` · ${user.mobile}` : ""}</small></span><em>{roleLabel(user.role)}</em><b className={!user.isActive ? "pending-user" : user.hasPassword ? "active-user" : "pending-user"}>{!user.isActive ? "غیرفعال" : user.hasPassword ? "فعال" : "در انتظار دعوت"}</b>{admin && <span className="user-actions"><button type="button" title="ویرایش کاربر" onClick={() => onUser(user)}><Pencil size={15} /> ویرایش</button><button type="button" title="صدور مجدد لینک دعوت" onClick={() => onInvite(user)}><Mail size={15} /> لینک جدید</button></span>}</div>)}</div></section><section className="panel simple-panel settings-section"><PanelHeader title="تگ‌ها" subtitle={`${fa(data.tags.length)} تگ فعال`} action="تگ جدید" onAction={onTag} /><div className="settings-tags">{data.tags.map((tag) => <span key={tag.id}><i style={{ background: tag.color }} />{tag.name}</span>)}</div></section></>}{admin && <ImportView admin onImported={onRefresh} embedded />}</>;
}

function PasswordSettings({ onRefresh }: { onRefresh: () => void }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const save = async () => {
    setPasswordBusy(true);
    setPasswordError("");
    setPasswordSuccess("");
    try {
      if (newPassword !== confirmation) throw new Error("تکرار رمز عبور یکسان نیست.");
      await api("/api/auth/password", {
        method: "POST",
        body: { newPassword, confirmation },
      });
      setNewPassword("");
      setConfirmation("");
      setPasswordSuccess("رمز عبور با موفقیت تغییر کرد.");
      await onRefresh();
    } catch (cause) {
      setPasswordError(messageOf(cause));
    } finally {
      setPasswordBusy(false);
    }
  };
  return <section className="panel settings-card"><PanelHeader title="تغییر رمز عبور" /><div className="form-body compact-form"><Field label="رمز عبور جدید"><input dir="ltr" type="password" minLength={10} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></Field><Field label="تکرار رمز عبور"><input dir="ltr" type="password" minLength={10} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></Field><small className="password-hint">حداقل ۱۰ نویسه، شامل یک حرف انگلیسی و یک عدد</small>{passwordSuccess && <div className="auth-success">{passwordSuccess}</div>}{passwordError && <div className="auth-error">{passwordError}</div>}<button className="primary-button" disabled={passwordBusy || !newPassword || !confirmation} onClick={() => void save()}>{passwordBusy ? <LoaderCircle className="spin" size={15} /> : <LockKeyhole size={15} />} تغییر رمز</button></div></section>;
}

function ImportView({ admin, onImported, embedded = false }: { admin: boolean; onImported: () => void; embedded?: boolean }) {
  const [fileName, setFileName] = useState("");
  const [sheets, setSheets] = useState<Array<{ name: string; rows: Record<string, unknown>[] }>>([]);
  const [mode, setMode] = useState("skip");
  const [result, setResult] = useState<{
    total: number;
    inserted: number;
    updated: number;
    skipped: number;
    rejected: number;
    sheets: Array<{ sheet: string; total: number; rejected: number }>;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const readFile = async (file: File) => {
    try {
      setError("");
      setResult(null);
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
      const recognized = workbook.SheetNames
        .filter((name) => name.startsWith("DB_"))
        .map((name) => ({
          name,
          rows: XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[name], {
            defval: null,
            raw: true,
          }),
        }));
      if (!recognized.length) {
        throw new Error("این فایل ساختار خروجی جامع چاووش CRM را ندارد. فایل را از بخش گزارش‌ها تهیه کنید.");
      }
      setFileName(file.name);
      setSheets(recognized);
    } catch (cause) {
      setFileName("");
      setSheets([]);
      setError(messageOf(cause));
    }
  };

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const response = await api<NonNullable<typeof result>>("/api/import", {
        method: "POST",
        body: { fileName, mode, sheets },
      });
      setResult(response);
      onImported();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  };
  if (!admin) return embedded ? null : <><PageHeading title="دریافت اطلاعات از Excel" description="بازیابی جامع اطلاعات به دلیل دسترسی به داده‌های مدیریتی فقط برای مدیر سیستم فعال است." /><EmptyState title="دسترسی مدیر سیستم لازم است" text="فایل پشتیبان شامل تمام اطلاعات تجاری و یادداشت‌های خصوصی مدیران است." /></>;

  const totalRows = sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0);
  return (
    <>
      {!embedded && <PageHeading title="دریافت اطلاعات از Excel" description="همان فایل خروجی جامع چاووش CRM را انتخاب کنید؛ شیت‌ها به‌صورت خودکار تشخیص داده و در جداول مرتبط ثبت می‌شوند." />}
      <section className={`panel import-panel${embedded ? " settings-section" : ""}`}>
        {embedded && <PanelHeader title="دریافت اطلاعات از Excel" subtitle="بازیابی اطلاعات از فایل خروجی جامع چاووش CRM" />}
        <div className="import-controls">
          <Field label="رفتار با موارد تکراری">
            <select value={mode} onChange={(event) => setMode(event.target.value)}>
              <option value="skip">رد کردن رکورد تکراری</option>
              <option value="update">به‌روزرسانی رکورد موجود</option>
            </select>
          </Field>
          <label className="file-picker">
            <FileSpreadsheet size={22} />
            <span>{fileName || "انتخاب فایل خروجی XLSX یا XLS"}</span>
            <input type="file" accept=".xlsx,.xls" onChange={(event) => event.target.files?.[0] && void readFile(event.target.files[0])} />
          </label>
        </div>
        <div className="import-note">
          <LockKeyhole size={17} />
          <span>شیت‌های گزارش برای مطالعه‌اند؛ دریافت اطلاعات از شیت‌های فنی پنهان با پیشوند DB_ انجام می‌شود.</span>
        </div>
        {error && <div className="alert error-alert">{error}</div>}
        {sheets.length > 0 && (
          <>
            <h3 className="mapping-title">شیت‌های شناسایی‌شده</h3>
            <div className="workbook-sheet-grid">
              {sheets.map((sheet) => (
                <div key={sheet.name}>
                  <strong>{backupSheetLabel(sheet.name)}</strong>
                  <span>{fa(sheet.rows.length)} رکورد</span>
                </div>
              ))}
            </div>
            <button className="primary-button" disabled={busy || !totalRows} onClick={() => void submit()}>
              {busy ? <LoaderCircle className="spin" /> : <Upload size={17} />}
              دریافت {fa(totalRows)} رکورد
            </button>
          </>
        )}
        {result && (
          <div className="import-result">
            <Check size={22} />
            <strong>دریافت اطلاعات انجام شد</strong>
            <span>جدید: {fa(result.inserted)} · به‌روزرسانی: {fa(result.updated)} · تکراری: {fa(result.skipped)} · خطا: {fa(result.rejected)}</span>
          </div>
        )}
      </section>
    </>
  );
}

function CustomerForm({ data, initial, busy, onClose, onSubmit }: { data: Bootstrap; initial: Record<string, unknown> | null; busy: boolean; onClose: () => void; onSubmit: (body: Record<string, unknown>) => void }) {
  const [form, setForm] = useState<Record<string, unknown>>({
    name: "", shortName: "", organizationType: "", industry: "", phone: "",
    fax: "", email: "", secretariatNumber: "", province: "", city: "",
    address: "", description: "", visibility: "public", ownerUserId: data.user.id,
    watcherIds: [data.user.id], tagIds: [], ...initial,
  });
  const [newGroup, setNewGroup] = useState("");
  const [watcherQuery, setWatcherQuery] = useState("");
  const watcherIds = arr(form.watcherIds).map(Number);
  const activeUsers = data.users.filter((user) => user.isActive);
  const visibleUsers = activeUsers.filter((user) =>
    normalize(`${user.fullName} ${user.email}`).includes(normalize(watcherQuery)),
  );
  const addGroup = () => {
    const value = newGroup.trim();
    if (!value) return;
    setForm((current) => ({ ...current, newTagNames: [...new Set([...arr(current.newTagNames).map(String), value])] }));
    setNewGroup("");
  };
  const setWatcher = (userId: number, checked: boolean) =>
    setForm((current) => ({
      ...current,
      watcherIds: toggle(arr(current.watcherIds).map(Number), userId, checked),
    }));

  return (
    <FormModal
      title={initial?.id ? "ویرایش مشتری" : "مشتری جدید"}
      subtitle="اطلاعات پایه، دسترسی و کاربران مرتبط با مشتری را مدیریت کنید."
      busy={busy}
      onClose={onClose}
      onSubmit={() => onSubmit(form)}
    >
      <div className="form-grid">
        <Field label="نام رسمی سازمان *" wide><input required value={s(form.name)} onChange={bind(setForm, "name")} /></Field>
        <Field label="نام کوتاه"><input value={s(form.shortName)} onChange={bind(setForm, "shortName")} /></Field>
        <Field label="حوزه فعالیت"><input value={s(form.industry)} onChange={bind(setForm, "industry")} placeholder="بانکداری، ارتباطات، فناوری اطلاعات…" /></Field>
        <Field label="تلفن"><input dir="ltr" value={s(form.phone)} onChange={bind(setForm, "phone")} /></Field>
        <Field label="فکس"><input dir="ltr" value={s(form.fax)} onChange={bind(setForm, "fax")} /></Field>
        <Field label="ایمیل"><input dir="ltr" type="email" value={s(form.email)} onChange={bind(setForm, "email")} /></Field>
        <Field label="شماره دبیرخانه"><input value={s(form.secretariatNumber)} onChange={bind(setForm, "secretariatNumber")} /></Field>
        <Field label="استان"><input value={s(form.province)} onChange={bind(setForm, "province")} /></Field>
        <Field label="شهر"><input value={s(form.city)} onChange={bind(setForm, "city")} /></Field>
        <Field label="مسئول حساب *">
          <select value={n(form.ownerUserId) || data.user.id} onChange={(event) => setForm((current) => ({ ...current, ownerUserId: Number(event.target.value) }))}>
            {activeUsers.map((user) => <option key={user.id} value={user.id}>{user.fullName || user.email}</option>)}
          </select>
        </Field>
        <Field label="دسترسی">
          <select value={s(form.visibility) || "public"} onChange={bind(setForm, "visibility")}>
            <option value="public">عمومی</option>
            <option value="private">خصوصی</option>
          </select>
        </Field>
        <Field label="مشاهده‌کنندگان و دریافت‌کنندگان اعلان" wide>
          <div className="watcher-picker">
            <div className="watcher-picker-tools">
              <div className="contact-search-box">
                <Search size={16} />
                <input value={watcherQuery} onChange={(event) => setWatcherQuery(event.target.value)} placeholder="جستجوی نام یا ایمیل کاربر…" />
              </div>
              {!watcherIds.includes(data.user.id) && (
                <button type="button" className="secondary-button" onClick={() => setWatcher(data.user.id, true)}>
                  <Plus size={15} /> افزودن خودم
                </button>
              )}
            </div>
            {watcherIds.length > 0 && (
              <div className="watcher-chips">
                {activeUsers.filter((user) => watcherIds.includes(user.id)).map((user) => (
                  <button type="button" key={user.id} onClick={() => setWatcher(user.id, false)}>
                    {user.id === data.user.id ? "خودم" : user.fullName || user.email}<X size={13} />
                  </button>
                ))}
              </div>
            )}
            <div className="checkbox-grid watcher-list">
              {visibleUsers.map((user) => (
                <label key={user.id} className={watcherIds.includes(user.id) ? "checked" : ""}>
                  <input type="checkbox" checked={watcherIds.includes(user.id)} onChange={(event) => setWatcher(user.id, event.target.checked)} />
                  <span>{user.fullName || "بدون نام"}<small>{user.email}</small></span>
                </label>
              ))}
            </div>
            {!visibleUsers.length && <small>کاربری با این عبارت پیدا نشد.</small>}
            <small>مسئول حساب هنگام ذخیره همیشه به فهرست مشاهده‌کنندگان افزوده می‌شود. کاربران انتخاب‌شده اعلان تغییرات این مشتری را دریافت می‌کنند.</small>
          </div>
        </Field>
        <Field label="گروه‌های مشتری (تگ)" wide>
          <div className="group-picker">
            <div className="checkbox-grid">
              {data.tags.map((tag) => (
                <label key={tag.id} className={arr(form.tagIds).map(Number).includes(tag.id) ? "checked" : ""}>
                  <input type="checkbox" checked={arr(form.tagIds).map(Number).includes(tag.id)} onChange={(event) => setForm((current) => ({ ...current, tagIds: toggle(arr(current.tagIds).map(Number), tag.id, event.target.checked) }))} />
                  <i style={{ background: tag.color }} />{tag.name}
                </label>
              ))}
              {!data.tags.length && !arr(form.newTagNames).length && <span className="group-empty">هنوز گروهی تعریف نشده است؛ گروه اول را همین‌جا بسازید.</span>}
            </div>
            <div className="new-group-row">
              <input value={newGroup} onChange={(event) => setNewGroup(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addGroup(); } }} placeholder="نام گروه جدید؛ مانند بانک یا اپراتور" />
              <button type="button" className="secondary-button" onClick={addGroup}><Plus size={15} /> افزودن گروه</button>
            </div>
            {arr(form.newTagNames).length > 0 && (
              <div className="new-group-chips">
                {arr(form.newTagNames).map(String).map((name) => <button type="button" key={name} onClick={() => setForm((current) => ({ ...current, newTagNames: arr(current.newTagNames).map(String).filter((item) => item !== name) }))}>{name}<X size={13} /></button>)}
              </div>
            )}
            <small>هر مشتری می‌تواند عضو چند گروه باشد. این گروه‌ها در جستجو و فیلتر فهرست مشتریان استفاده می‌شوند.</small>
          </div>
        </Field>
        <Field label="آدرس" wide><textarea value={s(form.address)} onChange={bind(setForm, "address")} /></Field>
        <Field label="توضیحات" wide><textarea value={s(form.description)} onChange={bind(setForm, "description")} /></Field>
      </div>
    </FormModal>
  );
}

function ContactForm({ data, customerId, initial, busy, onClose, onSubmit }: { data: Bootstrap; customerId: number; initial: Record<string, unknown> | null; busy: boolean; onClose: () => void; onSubmit: (body: Record<string, unknown>) => void }) {
  const [form, setForm] = useState<Record<string, unknown>>({ customerId, firstName: "", lastName: "", prefix: "", jobTitle: "", department: "", mobile: "", directPhone: "", email: "", decisionRoles: [], ...initial, customerId });
  const roles = ["تصمیم‌گیرنده", "تأییدکننده فنی", "تأییدکننده مالی", "اثرگذار", "کاربر نهایی", "هماهنگ‌کننده"];
  return <FormModal title={initial?.id ? "ویرایش فرد" : "فرد جدید"} subtitle="اطلاعات فرد و نقش او در فرایند خرید." busy={busy} onClose={onClose} onSubmit={() => onSubmit(form)}><div className="form-grid"><Field label="مشتری *" wide><select required disabled={Boolean(initial?.id)} value={n(form.customerId)} onChange={(event) => setForm((current) => ({ ...current, customerId: Number(event.target.value) }))}><option value={0}>انتخاب مشتری</option>{data.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></Field><Field label="پیشوند"><select value={s(form.prefix)} onChange={bind(setForm, "prefix")}><option value="">—</option><option>آقای</option><option>خانم</option><option>دکتر</option><option>مهندس</option></select></Field><Field label="نام *"><input required value={s(form.firstName)} onChange={bind(setForm, "firstName")} /></Field><Field label="نام خانوادگی *"><input required value={s(form.lastName)} onChange={bind(setForm, "lastName")} /></Field><Field label="سمت"><input value={s(form.jobTitle)} onChange={bind(setForm, "jobTitle")} /></Field><Field label="واحد سازمانی"><input value={s(form.department)} onChange={bind(setForm, "department")} /></Field><Field label="موبایل"><input dir="ltr" value={s(form.mobile)} onChange={bind(setForm, "mobile")} /></Field><Field label="تلفن مستقیم"><input dir="ltr" value={s(form.directPhone)} onChange={bind(setForm, "directPhone")} /></Field><Field label="ایمیل"><input dir="ltr" type="email" value={s(form.email)} onChange={bind(setForm, "email")} /></Field><Field label="نقش در خرید" wide><div className="checkbox-grid">{roles.map((role) => <label key={role}><input type="checkbox" checked={arr(form.decisionRoles).includes(role)} onChange={(event) => setForm((current) => ({ ...current, decisionRoles: toggle(arr(current.decisionRoles), role, event.target.checked) }))} />{role}</label>)}</div></Field><Field label="یادداشت" wide><textarea value={s(form.notes)} onChange={bind(setForm, "notes")} /></Field></div></FormModal>;
}

function ActivityForm({ data, initial, selectedCustomerId, timezone, busy, manager, onClose, onSubmit }: { data: Bootstrap; initial: Record<string, unknown> | null; selectedCustomerId: number | null; timezone: string; busy: boolean; manager: boolean; onClose: () => void; onSubmit: (body: Record<string, unknown>) => void }) {
  const defaultDate = isoToJalaliInput(new Date().toISOString(), timezone);
  const initialContacts = Array.isArray(initial?.contacts) ? initial.contacts as Array<{ id: number }> : [];
  const [form, setForm] = useState<Record<string, unknown>>({ customerId: selectedCustomerId || "", type: "call", status: "completed", startsAtJalali: defaultDate, durationMinutes: 0, description: "", result: "", nextAction: "", nextActionAtJalali: "", assigneeUserId: data.user.id, nextActionAssigneeUserId: data.user.id, contactIds: [], freeContactNames: [], isManagerPrivate: false, ...initial, contactIds: initialContacts.map((contact) => contact.id), freeContactNames: Array.isArray(initial?.freeContactNames) ? initial.freeContactNames : [], startsAtJalali: initial?.startsAt ? isoToJalaliInput(s(initial.startsAt), timezone) : defaultDate, nextActionAtJalali: initial?.nextActionAt ? isoToJalaliInput(s(initial.nextActionAt), timezone) : "", nextActionAssigneeUserId: initial?.nextActionAssigneeUserId || initial?.assigneeUserId || data.user.id });
  const [contactQuery, setContactQuery] = useState("");
  const submit = () => onSubmit({ ...form, startsAt: jalaliToIso(s(form.startsAtJalali), timezone), nextActionAt: s(form.nextActionAtJalali) ? jalaliToIso(s(form.nextActionAtJalali), timezone) : null });
  const selectedId = n(form.customerId);
  const contacts = data.contacts.filter((contact) => contact.customerId === selectedId);
  const selectedContactIds = arr(form.contactIds).map(Number);
  const matches = contactQuery.trim()
    ? contacts.filter((contact) => normalize(`${contact.firstName} ${contact.lastName} ${contact.jobTitle}`).includes(normalize(contactQuery))).slice(0, 6)
    : contacts.filter((contact) => !selectedContactIds.includes(contact.id)).slice(0, 6);
  const addFreeName = () => {
    const name = contactQuery.trim();
    if (!name) return;
    setForm((current) => ({ ...current, freeContactNames: [...new Set([...arr(current.freeContactNames).map(String), name])] }));
    setContactQuery("");
  };
  return <FormModal title={initial?.id ? "ویرایش فعالیت" : "ثبت فعالیت"} subtitle="تماس، جلسه، مکاتبه یا اقدام آینده را ثبت کنید." busy={busy} onClose={onClose} onSubmit={submit}><div className="form-grid"><Field label="مشتری *" wide><select required disabled={Boolean(initial?.id)} value={s(form.customerId)} onChange={(event) => setForm((current) => ({ ...current, customerId: Number(event.target.value), contactIds: [], freeContactNames: [] }))}><option value="">انتخاب مشتری</option>{data.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></Field><Field label="نوع فعالیت *"><select value={s(form.type)} onChange={bind(setForm, "type")}>{activityTypes.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></Field><Field label="وضعیت"><select value={s(form.status)} onChange={bind(setForm, "status")}><option value="completed">انجام‌شده</option><option value="planned">برنامه‌ریزی‌شده</option><option value="cancelled">لغوشده</option></select></Field><PersianDateField label="تاریخ و ساعت شمسی *" value={s(form.startsAtJalali)} onChange={(value) => setForm((current) => ({ ...current, startsAtJalali: value }))} /><Field label="مدت، دقیقه"><input type="number" min="0" value={n(form.durationMinutes)} onChange={(event) => setForm((current) => ({ ...current, durationMinutes: Number(event.target.value) }))} /></Field><Field label="مسئول"><select value={n(form.assigneeUserId)} onChange={(event) => setForm((current) => ({ ...current, assigneeUserId: Number(event.target.value) }))}>{data.users.filter((user) => user.isActive).map((user) => <option key={user.id} value={user.id}>{user.fullName || user.email}</option>)}</select></Field><Field label="افراد حاضر یا مخاطب" wide><div className="contact-combobox"><div className="contact-token-list">{selectedContactIds.map((id) => { const contact = contacts.find((item) => item.id === id) || data.contacts.find((item) => item.id === id); return contact ? <button type="button" key={id} onClick={() => setForm((current) => ({ ...current, contactIds: arr(current.contactIds).map(Number).filter((value) => value !== id) }))}>{contact.firstName} {contact.lastName}<X size={13} /></button> : null; })}{arr(form.freeContactNames).map(String).map((name) => <button type="button" className="free-token" key={name} onClick={() => setForm((current) => ({ ...current, freeContactNames: arr(current.freeContactNames).map(String).filter((value) => value !== name) }))}>{name}<small>آزاد</small><X size={13} /></button>)}</div><div className="contact-search-box"><Search size={16} /><input value={contactQuery} onChange={(event) => setContactQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); const exact = matches.find((contact) => normalize(`${contact.firstName} ${contact.lastName}`) === normalize(contactQuery)); if (exact) { setForm((current) => ({ ...current, contactIds: [...new Set([...arr(current.contactIds).map(Number), exact.id])] })); setContactQuery(""); } else addFreeName(); } }} placeholder={selectedId ? "نام فرد را جستجو یا آزاد وارد کنید…" : "ابتدا مشتری را انتخاب کنید"} disabled={!selectedId} /></div>{selectedId && contactQuery && <div className="contact-suggestions">{matches.filter((contact) => !selectedContactIds.includes(contact.id)).map((contact) => <button type="button" key={contact.id} onClick={() => { setForm((current) => ({ ...current, contactIds: [...new Set([...arr(current.contactIds).map(Number), contact.id])] })); setContactQuery(""); }}><i className="avatar">{initials(`${contact.firstName} ${contact.lastName}`)}</i><span><strong>{contact.firstName} {contact.lastName}</strong><small>{contact.jobTitle || contact.customerName}</small></span><Plus size={15} /></button>)}<button type="button" className="free-name-option" onClick={addFreeName}><Plus size={15} /> افزودن «{contactQuery}» به‌صورت نام آزاد</button></div>}<small>نام‌های انتخاب‌شده به پرونده فرد متصل می‌شوند؛ نام آزاد فقط روی همین فعالیت ذخیره می‌شود.</small></div></Field><Field label="شرح مذاکره یا فعالیت *" wide><textarea required rows={5} value={s(form.description)} onChange={bind(setForm, "description")} /></Field><Field label="نتیجه" wide><textarea value={s(form.result)} onChange={bind(setForm, "result")} /></Field><Field label="اقدام بعدی" wide><input value={s(form.nextAction)} onChange={bind(setForm, "nextAction")} /></Field><PersianDateField label="موعد اقدام بعدی" value={s(form.nextActionAtJalali)} onChange={(value) => setForm((current) => ({ ...current, nextActionAtJalali: value }))} />{manager && <Field label="محرمانگی"><label className="switch-label"><input type="checkbox" checked={Boolean(form.isManagerPrivate)} onChange={(event) => setForm((current) => ({ ...current, isManagerPrivate: event.target.checked }))} />فقط مدیران</label></Field>}</div></FormModal>;
}

function OpportunityForm({ data, selectedCustomerId, initial, timezone, busy, onClose, onSubmit }: { data: Bootstrap; selectedCustomerId: number | null; initial: Record<string, unknown> | null; timezone: string; busy: boolean; onClose: () => void; onSubmit: (body: Record<string, unknown>) => void }) {
  const [form, setForm] = useState<Record<string, unknown>>({ customerId: selectedCustomerId || "", title: "", solutionText: "", status: "open", currentStage: "", amount: 0, currency: "IRR", probability: 10, forecastAtJalali: "", latestStatus: "", nextAction: "", nextActionAtJalali: "", ownerUserId: data.user.id, steps: [], ...initial, forecastAtJalali: initial?.forecastAt ? isoToJalaliInput(s(initial.forecastAt), timezone) : "", nextActionAtJalali: initial?.nextActionAt ? isoToJalaliInput(s(initial.nextActionAt), timezone) : "" });
  const steps = arr(form.steps) as unknown as Step[];
  const submit = () => onSubmit({ ...form, forecastAt: s(form.forecastAtJalali) ? jalaliToIso(s(form.forecastAtJalali), timezone) : null, nextActionAt: s(form.nextActionAtJalali) ? jalaliToIso(s(form.nextActionAtJalali), timezone) : null });
  return <FormModal title={initial?.id ? "ویرایش فرصت فروش" : "فرصت فروش جدید"} subtitle="مبلغ، احتمال، وضعیت و مراحل مخصوص این فرصت." busy={busy} onClose={onClose} onSubmit={submit}><div className="form-grid"><Field label="مشتری *" wide><select required value={s(form.customerId)} onChange={(event) => setForm((current) => ({ ...current, customerId: Number(event.target.value) }))}><option value="">انتخاب مشتری</option>{data.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></Field><Field label="عنوان فرصت *" wide><input required value={s(form.title)} onChange={bind(setForm, "title")} /></Field><Field label="راهکار یا محصول" wide><input value={s(form.solutionText)} onChange={bind(setForm, "solutionText")} /></Field><Field label="وضعیت"><select value={s(form.status)} onChange={bind(setForm, "status")}><option value="open">باز</option><option value="won">برنده</option><option value="lost">باخته</option><option value="paused">متوقف</option></select></Field><Field label="مرحله جاری"><input value={s(form.currentStage)} onChange={bind(setForm, "currentStage")} placeholder="مثلاً مذاکره تجاری" /></Field><Field label="مبلغ"><input type="number" min="0" value={n(form.amount)} onChange={(event) => setForm((current) => ({ ...current, amount: Number(event.target.value) }))} /></Field><Field label="ارز"><select value={s(form.currency)} onChange={bind(setForm, "currency")}><option value="IRR">ریال</option><option value="USD">دلار</option><option value="EUR">یورو</option></select></Field><Field label="احتمال موفقیت"><input type="number" min="0" max="100" value={n(form.probability)} onChange={(event) => setForm((current) => ({ ...current, probability: Number(event.target.value) }))} /></Field><PersianDateField label="تاریخ پیش‌بینی نتیجه" value={s(form.forecastAtJalali)} onChange={(value) => setForm((current) => ({ ...current, forecastAtJalali: value }))} /><Field label="آخرین وضعیت" wide><textarea value={s(form.latestStatus)} onChange={bind(setForm, "latestStatus")} /></Field><Field label="اقدام بعدی" wide><input value={s(form.nextAction)} onChange={bind(setForm, "nextAction")} /></Field><PersianDateField label="موعد اقدام بعدی" value={s(form.nextActionAtJalali)} onChange={(value) => setForm((current) => ({ ...current, nextActionAtJalali: value }))} /><Field label="مسئول فرصت"><select value={n(form.ownerUserId)} onChange={(event) => setForm((current) => ({ ...current, ownerUserId: Number(event.target.value) }))}>{data.users.filter((user) => user.isActive).map((user) => <option key={user.id} value={user.id}>{user.fullName || user.email}</option>)}</select></Field><Field label="مراحل اختصاصی فرصت" wide><div className="step-editor">{steps.map((step, index) => <div key={index}><input placeholder={`مرحله ${fa(index + 1)}`} value={step.title} onChange={(event) => setForm((current) => ({ ...current, steps: steps.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item) }))} /><select value={step.status} onChange={(event) => setForm((current) => ({ ...current, steps: steps.map((item, itemIndex) => itemIndex === index ? { ...item, status: event.target.value } : item) }))}><option value="pending">انجام‌نشده</option><option value="current">جاری</option><option value="completed">انجام‌شده</option></select><button type="button" onClick={() => setForm((current) => ({ ...current, steps: steps.filter((_, itemIndex) => itemIndex !== index) }))}><X size={16} /></button></div>)}<button type="button" className="secondary-button" onClick={() => setForm((current) => ({ ...current, steps: [...steps, { title: "", status: "pending", assigneeUserId: data.user.id }] }))}><Plus size={16} /> افزودن مرحله</button></div></Field><Field label="شرح نیاز" wide><textarea value={s(form.description)} onChange={bind(setForm, "description")} /></Field></div></FormModal>;
}

function DocumentForm({ data, selectedCustomerId, detail, busy, onClose, onSubmit }: { data: Bootstrap; selectedCustomerId: number | null; detail: CustomerDetail | null; busy: boolean; onClose: () => void; onSubmit: (form: FormData) => void }) {
  const [customerId, setCustomerId] = useState(selectedCustomerId || 0);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [documentType, setDocumentType] = useState("other");
  const [opportunityId, setOpportunityId] = useState(0);
  const submit = () => { if (!file || !customerId) return; const form = new FormData(); form.set("file", file); form.set("customerId", String(customerId)); form.set("title", title || file.name); form.set("documentType", documentType); if (opportunityId) form.set("opportunityId", String(opportunityId)); onSubmit(form); };
  return <FormModal title="بارگذاری سند" subtitle="فایل فقط یک‌بار ذخیره و در پرونده‌های مرتبط نمایش داده می‌شود." busy={busy} onClose={onClose} onSubmit={submit}><div className="form-grid"><Field label="مشتری *" wide><select required value={customerId} onChange={(event) => setCustomerId(Number(event.target.value))}><option value={0}>انتخاب مشتری</option>{data.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></Field><Field label="فایل *" wide><label className="file-picker"><Paperclip size={21} /><span>{file?.name || "انتخاب فایل تا ۲۵ مگابایت"}</span><input type="file" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label></Field><Field label="عنوان سند" wide><input value={title} onChange={(event) => setTitle(event.target.value)} /></Field><Field label="نوع سند"><select value={documentType} onChange={(event) => setDocumentType(event.target.value)}><option value="proposal_technical">پیشنهاد فنی</option><option value="proposal_financial">پیشنهاد فنی‌مالی</option><option value="letter_out">نامه ارسالی</option><option value="letter_in">نامه دریافتی</option><option value="rfp">RFP یا استعلام</option><option value="minutes">صورت‌جلسه</option><option value="contract">قرارداد</option><option value="other">سایر</option></select></Field>{selectedCustomerId === customerId && detail?.opportunities.length ? <Field label="فرصت مرتبط"><select value={opportunityId} onChange={(event) => setOpportunityId(Number(event.target.value))}><option value={0}>بدون فرصت</option>{detail.opportunities.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></Field> : null}</div></FormModal>;
}

function ManagerNoteForm({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (body: Record<string, unknown>) => void }) {
  const [body, setBody] = useState("");
  return <FormModal title="یادداشت خصوصی مدیران" subtitle="این متن فقط برای مدیر سیستم و مدیر فروش قابل مشاهده است." busy={busy} onClose={onClose} onSubmit={() => onSubmit({ body })}><Field label="متن یادداشت *"><textarea required rows={8} value={body} onChange={(event) => setBody(event.target.value)} /></Field></FormModal>;
}

function UserForm({ initial, busy, inviteUrl, emailConfigured, onClose, onSubmit }: { initial: AppUser | null; busy: boolean; inviteUrl: string; emailConfigured: boolean; onClose: () => void; onSubmit: (body: Record<string, unknown>) => void }) {
  const [form, setForm] = useState({
    email: initial?.email || "",
    fullName: initial?.fullName || "",
    mobile: initial?.mobile || "",
    role: initial?.role || "viewer",
    timezone: initial?.timezone || "Asia/Tehran",
    isActive: initial ? Boolean(initial.isActive) : true,
  });
  const [copied, setCopied] = useState(false);
  return <FormModal title={inviteUrl ? "لینک دعوت و تعیین رمز" : initial ? "ویرایش کاربر" : "دعوت کاربر جدید"} subtitle={inviteUrl ? "این لینک جایگزین لینک قبلی شده است." : initial ? "اطلاعات، نقش و وضعیت دسترسی کاربر را ویرایش کنید." : "کاربر با لینک دعوت رمز عبور مستقل خود را تعیین می‌کند."} busy={busy} onClose={onClose} onSubmit={() => inviteUrl ? onClose() : onSubmit(form)}>{inviteUrl ? <div className="invite-result"><span className="invite-success"><Check size={20} /></span><h3>لینک جدید آماده است</h3><p>{emailConfigured ? "لینک برای کاربر ایمیل شده است؛ می‌توانید آن را مستقیماً نیز کپی کنید." : "ارسال ایمیل هنوز فعال نیست. این لینک را کپی و مستقیماً برای کاربر ارسال کنید."}</p><div className="copy-link-row"><input readOnly dir="ltr" value={inviteUrl} /><button type="button" onClick={() => void navigator.clipboard.writeText(inviteUrl).then(() => setCopied(true))}><Copy size={16} /> {copied ? "کپی شد" : "کپی لینک"}</button></div><small>این لینک ۷ روز اعتبار دارد؛ با صدور لینک جدید، لینک قبلی باطل شده است.</small></div> : <div className="form-grid"><Field label="ایمیل *" wide><input required dir="ltr" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></Field><Field label="نام و نام خانوادگی"><input value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} /></Field><Field label="شماره موبایل"><input dir="ltr" inputMode="tel" value={form.mobile} onChange={(event) => setForm({ ...form, mobile: event.target.value })} placeholder="09xxxxxxxxx" /></Field><Field label="نقش"><select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as UserRole })}><option value="viewer">مشاهده‌گر</option><option value="sales">کارشناس فروش</option><option value="sales_manager">مدیر فروش</option><option value="admin">مدیر سیستم</option></select></Field><Field label="منطقه زمانی"><select value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })}><option value="Asia/Tehran">تهران</option><option value="Europe/Berlin">برلین</option><option value="Asia/Dubai">دبی</option><option value="America/Toronto">تورنتو</option></select></Field>{initial && <Field label="وضعیت حساب"><label className="switch-label"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} />{form.isActive ? "فعال" : "غیرفعال"}</label></Field>}</div>}</FormModal>;
}

function TagForm({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (body: Record<string, unknown>) => void }) {
  const [name, setName] = useState(""); const [color, setColor] = useState("#283980");
  return <FormModal title="تگ جدید" subtitle="تگ‌ها برای گروه‌بندی و جستجوی مشتریان استفاده می‌شوند." busy={busy} onClose={onClose} onSubmit={() => onSubmit({ name, color })}><div className="form-grid"><Field label="نام تگ *"><input required value={name} onChange={(event) => setName(event.target.value)} /></Field><Field label="رنگ"><input type="color" value={color} onChange={(event) => setColor(event.target.value)} /></Field></div></FormModal>;
}

function ActivityDetailModal({ activity, timezone, canWrite, onClose, onContact, onEdit, onArchive }: { activity: Activity; timezone: string; canWrite: boolean; onClose: () => void; onContact: (id: number) => void; onEdit: () => void; onArchive: () => void }) {
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="form-modal detail-modal" onMouseDown={(event) => event.stopPropagation()}><header><div><h2>{activity.title}</h2><p>{activity.customerName} · {activityTypeLabel(activity.type)}</p></div><button type="button" className="icon-button" onClick={onClose}><X size={20} /></button></header><div className="form-scroll"><div className="detail-grid"><div><span>وضعیت</span><strong>{activityStatusLabel(activity.status)}</strong></div><div><span>زمان</span><strong>{persianDate(activity.startsAt, timezone)}</strong></div><div><span>مدت</span><strong>{fa(activity.durationMinutes)} دقیقه</strong></div><div><span>مسئول</span><strong>{activity.assigneeName}</strong></div></div><section className="detail-section"><span>مخاطبان</span><ActivityPeople activity={activity} onContact={onContact} />{!activity.contacts?.length && !activity.freeContactNames?.length && <p>مخاطبی ثبت نشده است.</p>}</section><section className="detail-section"><span>شرح مذاکره یا فعالیت</span><p>{activity.description || "—"}</p></section>{activity.result && <section className="detail-section"><span>نتیجه</span><p>{activity.result}</p></section>}{activity.nextAction && <section className="detail-section"><span>اقدام بعدی</span><p>{activity.nextAction}{activity.nextActionAt ? ` — ${persianDate(activity.nextActionAt, timezone)}` : ""}</p></section>}</div>{canWrite && <footer><button type="button" className="danger-button" onClick={onArchive}><Trash2 size={16} /> بایگانی</button><button type="button" className="primary-button" onClick={onEdit}><Pencil size={16} /> ویرایش فعالیت</button></footer>}</section></div>;
}

function ContactDetailModal({ contact, canWrite, onClose, onOpen, onEdit }: { contact: Contact; canWrite: boolean; onClose: () => void; onOpen: () => void; onEdit: () => void }) {
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="form-modal detail-modal" onMouseDown={(event) => event.stopPropagation()}><header><div><h2>{contact.prefix} {contact.firstName} {contact.lastName}</h2><p>{contact.customerName}</p></div><button type="button" className="icon-button" onClick={onClose}><X size={20} /></button></header><div className="form-scroll"><div className="detail-grid"><div><span>سمت</span><strong>{contact.jobTitle || "—"}</strong></div><div><span>واحد</span><strong>{contact.department || "—"}</strong></div><div><span>موبایل</span><ContactActionValue type="phone" value={contact.mobile} /></div><div><span>ایمیل</span><ContactActionValue type="email" value={contact.email} /></div>{contact.address && <div><span>آدرس</span><ContactActionValue type="address" value={contact.address} /></div>}</div></div><footer><button type="button" className="secondary-button" onClick={onOpen}>پرونده کامل</button>{canWrite && <button type="button" className="primary-button" onClick={onEdit}><Pencil size={16} /> ویرایش</button>}</footer></section></div>;
}

function NotificationPanel({ items, onClose, onRead }: { items: Notification[]; onClose: () => void; onRead: (item: Notification) => void }) {
  return <div className="notification-panel"><header><strong>اعلان‌ها</strong><button onClick={onClose}><X size={17} /></button></header><div>{items.slice(0, 12).map((item) => <button className={item.isRead ? "" : "unread"} key={item.id} onClick={() => void onRead(item)}><Bell size={15} /><span><strong>{item.title}</strong><small>{item.body || "رویداد جدید در پرونده مشتری"}</small></span></button>)}{!items.length && <EmptyState title="اعلانی ندارید" text="رویدادهای مشتریان مرتبط اینجا نمایش داده می‌شوند." />}</div></div>;
}

const searchGroups: Array<[SearchGroup, string]> = [
  ["customers", "مشتریان"],
  ["contacts", "افراد"],
  ["activities", "فعالیت‌ها"],
  ["opportunities", "فرصت‌ها"],
  ["documents", "اسناد"],
];

function QuickSearchPanel({
  query,
  result,
  loading,
  onOpen,
  onAll,
}: {
  query: string;
  result: SearchResponse | null;
  loading: boolean;
  onOpen: (group: SearchGroup, item: SearchItem) => void;
  onAll: () => void;
}) {
  const total = result
    ? searchGroups.reduce((sum, [group]) => sum + result.groups[group].length, 0)
    : 0;
  return (
    <section id="global-search-results" role="listbox" className="quick-search-panel" onMouseDown={(event) => event.preventDefault()}>
      <header>
        <span>نتایج جستجو برای «{query}»</span>
        {total > 0 && <b>{fa(total)} نتیجه</b>}
      </header>
      <div className="quick-search-scroll">
        {searchGroups.map(([group, label]) => {
          const items = result?.groups[group] ?? [];
          if (!items.length) return null;
          return (
            <section className="quick-search-group" key={group}>
              <h3>{searchGroupIcon(group)}{label}<span>{fa(items.length)}</span></h3>
              {items.map((item) => (
                <SearchResultRow
                  key={`${group}-${item.id}`}
                  group={group}
                  item={item}
                  query={query}
                  onClick={() => onOpen(group, item)}
                />
              ))}
            </section>
          );
        })}
        {!loading && result && total === 0 && (
          <EmptyState title="نتیجه‌ای پیدا نشد" text="عبارت دیگری را امتحان کنید." />
        )}
        {loading && !result && <div className="search-loading"><LoaderCircle className="spin" /><span>در حال جستجو…</span></div>}
      </div>
      {total > 0 && <button className="search-all-button" onClick={onAll}>مشاهده همه نتایج <ChevronLeft size={16} /></button>}
    </section>
  );
}

function SearchResultsPage({
  query,
  result,
  loading,
  onOpen,
}: {
  query: string;
  result: SearchResponse | null;
  loading: boolean;
  onOpen: (group: SearchGroup, item: SearchItem) => void;
}) {
  const [tab, setTab] = useState<SearchGroup | "all">("all");
  const visibleGroups = tab === "all"
    ? searchGroups
    : searchGroups.filter(([group]) => group === tab);
  const total = result
    ? searchGroups.reduce((sum, [group]) => sum + result.groups[group].length, 0)
    : 0;
  return (
    <>
      <PageHeading
        title="نتایج جستجو"
        description={query ? `نتایج مرتبط با «${query}» در اطلاعات قابل دسترس شما` : "عبارت موردنظر را در کادر بالا وارد کنید."}
      />
      <div className="search-tabs">
        <button className={tab === "all" ? "active" : ""} onClick={() => setTab("all")}>همه <span>{fa(total)}</span></button>
        {searchGroups.map(([group, label]) => (
          <button className={tab === group ? "active" : ""} key={group} onClick={() => setTab(group)}>
            {label}<span>{fa(result?.groups[group].length ?? 0)}</span>
          </button>
        ))}
      </div>
      <section className="search-results-page">
        {visibleGroups.map(([group, label]) => {
          const items = result?.groups[group] ?? [];
          if (!items.length && tab === "all") return null;
          return (
            <section className="panel search-result-section" key={group}>
              <header><h2>{searchGroupIcon(group)}{label}</h2><span>{fa(items.length)} نتیجه</span></header>
              <div>
                {items.map((item) => (
                  <SearchResultRow
                    key={`${group}-${item.id}`}
                    group={group}
                    item={item}
                    query={query}
                    onClick={() => onOpen(group, item)}
                  />
                ))}
                {!items.length && <EmptyState title={`نتیجه‌ای در ${label} پیدا نشد`} text="عبارت دیگری را جستجو کنید." />}
              </div>
            </section>
          );
        })}
        {loading && <div className="search-loading panel"><LoaderCircle className="spin" /><span>در حال تکمیل نتایج…</span></div>}
        {!loading && result && total === 0 && <div className="panel"><EmptyState title="نتیجه‌ای پیدا نشد" text="املای عبارت را بررسی کنید یا عبارت کوتاه‌تری وارد کنید." /></div>}
      </section>
    </>
  );
}

function SearchResultRow({
  group,
  item,
  query,
  onClick,
}: {
  group: SearchGroup;
  item: SearchItem;
  query: string;
  onClick: () => void;
}) {
  return (
    <button className="search-result-row" onClick={onClick}>
      <i>{searchGroupIcon(group)}</i>
      <span>
        <strong><Highlight value={item.title} query={query} /></strong>
        <small><Highlight value={item.subtitle} query={query} /></small>
      </span>
      {item.meta && <em>{item.meta}</em>}
      <ChevronLeft size={16} />
    </button>
  );
}

function Highlight({ value, query }: { value: string; query: string }) {
  const normalizedValue = normalize(value);
  const normalizedQuery = normalize(query);
  const index = normalizedValue.indexOf(normalizedQuery);
  if (index < 0 || !normalizedQuery) return <>{value}</>;
  return <>{value.slice(0, index)}<mark>{value.slice(index, index + normalizedQuery.length)}</mark>{value.slice(index + normalizedQuery.length)}</>;
}

function searchGroupIcon(group: SearchGroup) {
  if (group === "customers") return <Building2 size={16} />;
  if (group === "contacts") return <Users size={16} />;
  if (group === "activities") return <CalendarDays size={16} />;
  if (group === "opportunities") return <Target size={16} />;
  return <FileText size={16} />;
}

function FormModal({ title, subtitle, busy, onClose, onSubmit, children }: { title: string; subtitle: string; busy: boolean; onClose: () => void; onSubmit: () => void; children: React.ReactNode }) {
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="form-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); onSubmit(); }}><header><div><h2>{title}</h2><p>{subtitle}</p></div><button type="button" className="icon-button" onClick={onClose}><X size={20} /></button></header><div className="form-scroll">{children}</div><footer><button type="button" className="secondary-button" onClick={onClose}>انصراف</button><button type="submit" className="primary-button" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />} ذخیره</button></footer></form></div>;
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={`field ${wide ? "wide" : ""}`}><span>{label}</span>{children}</label>;
}
function PersianDateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const parsed = parseJalaliInput(value);
  const today = toJalaali(new Date());
  const [open, setOpen] = useState(false);
  const [view, setView] = useState({ year: parsed?.year || today.jy, month: parsed?.month || today.jm });
  const [time, setTime] = useState(parsed?.time || "09:00");
  const days = calendarDays(view.year, view.month);

  const chooseDay = (day: number) => {
    onChange(`${view.year}/${pad(view.month)}/${pad(day)} ${time}`);
  };
  const changeTime = (nextTime: string) => {
    setTime(nextTime);
    if (parsed) onChange(`${parsed.year}/${pad(parsed.month)}/${pad(parsed.day)} ${nextTime}`);
  };
  const moveMonth = (amount: number) => {
    setView((current) => {
      const index = current.year * 12 + current.month - 1 + amount;
      return { year: Math.floor(index / 12), month: ((index % 12) + 12) % 12 + 1 };
    });
  };
  const chooseToday = () => {
    const now = new Date();
    const current = toJalaali(now);
    const currentTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    setView({ year: current.jy, month: current.jm });
    setTime(currentTime);
    onChange(`${current.jy}/${pad(current.jm)}/${pad(current.jd)} ${currentTime}`);
  };

  return <Field label={label}><div className={`persian-date-picker ${open ? "open" : ""}`}>
    <button type="button" className="persian-date-trigger" onClick={() => setOpen((current) => !current)} aria-expanded={open}>
      <CalendarDays size={17} />
      <span>{value ? fa(value) : "انتخاب تاریخ"}</span>
      <ChevronLeft size={15} />
    </button>
    {open && <div className="persian-calendar" role="dialog" aria-label={`انتخاب ${label}`}>
      <div className="calendar-heading">
        <button type="button" aria-label="ماه بعد" onClick={() => moveMonth(1)}><ChevronRight size={17} /></button>
        <div>
          <select aria-label="ماه" value={view.month} onChange={(event) => setView((current) => ({ ...current, month: Number(event.target.value) }))}>{jalaliMonths.map((month, index) => <option value={index + 1} key={month}>{month}</option>)}</select>
          <select aria-label="سال" value={view.year} onChange={(event) => setView((current) => ({ ...current, year: Number(event.target.value) }))}>{Array.from({ length: 21 }, (_, index) => today.jy - 10 + index).map((year) => <option value={year} key={year}>{fa(year)}</option>)}</select>
        </div>
        <button type="button" aria-label="ماه قبل" onClick={() => moveMonth(-1)}><ChevronLeft size={17} /></button>
      </div>
      <div className="calendar-weekdays">{jalaliWeekdays.map((day) => <span key={day}>{day}</span>)}</div>
      <div className="calendar-days">
        {days.map((day, index) => day ? <button type="button" key={`${view.year}-${view.month}-${day}`} className={`${parsed?.year === view.year && parsed.month === view.month && parsed.day === day ? "selected" : ""} ${today.jy === view.year && today.jm === view.month && today.jd === day ? "today" : ""}`} onClick={() => chooseDay(day)}>{fa(day)}</button> : <span key={`empty-${index}`} />)}
      </div>
      <div className="calendar-time"><span>ساعت</span><input type="time" dir="ltr" value={time} onChange={(event) => changeTime(event.target.value)} /></div>
      <div className="calendar-actions">
        <button type="button" onClick={() => { onChange(""); setOpen(false); }}>پاک‌کردن</button>
        <button type="button" onClick={chooseToday}>امروز</button>
        <button type="button" className="calendar-done" onClick={() => setOpen(false)}>تأیید</button>
      </div>
    </div>}
    <input className="persian-date-native-value" tabIndex={-1} aria-hidden="true" value={value} onChange={() => undefined} required={label.includes("*")} />
  </div></Field>;
}
function SideItem({ icon: Icon, label, active, badge, onClick }: { icon: typeof Home; label: string; active?: boolean; badge?: number; onClick: () => void }) {
  return <button className={`side-item ${active ? "active" : ""}`} onClick={onClick}><Icon size={20} /><span>{label}</span>{badge ? <em>{fa(badge)}</em> : null}</button>;
}
function MobileItem({ icon: Icon, label, active, onClick }: { icon: typeof Home; label: string; active?: boolean; onClick: () => void }) {
  return <button className={active ? "active" : ""} onClick={onClick}><Icon size={21} /><span>{label}</span></button>;
}
function PageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</div>;
}
function Metric({ icon: Icon, label, value, tone, sub }: { icon: typeof Home; label: string; value: string; tone: string; sub: string }) {
  return <article className="metric-card"><div className={`metric-icon ${tone}`}><Icon size={20} /></div><div><span>{label}</span><strong>{value}</strong><small>{sub}</small></div></article>;
}
function PanelHeader({ title, subtitle, action, onAction }: { title: string; subtitle?: string; action?: string; onAction?: () => void }) {
  return <header className="panel-header"><div><h2>{title}</h2>{subtitle && <span>{subtitle}</span>}</div>{action && <button onClick={onAction}>{action}<ChevronLeft size={16} /></button>}</header>;
}
function EmptyState({ title, text }: { title: string; text: string }) {
  return <div className="empty-state"><Check size={23} /><strong>{title}</strong><span>{text}</span></div>;
}
function MiniEvent({ item, activity, timezone, onClick }: { item: TimelineEvent; activity?: Activity; timezone: string; onClick?: () => void }) {
  return <article className="mini-event mini-event-button" onClick={onClick}><span className={`timeline-icon ${eventTone(item.eventType)}`}>{eventIcon(item.eventType)}</span><div><strong>{item.title}</strong><p>{item.summary}</p>{activity && <ActivityPeople activity={activity} />}<small>{persianDate(item.createdAt, timezone)} · {item.createdByName}</small></div></article>;
}

async function api<T = Record<string, unknown>>(url: string, options?: { method?: string; body?: unknown }): Promise<T> {
  const response = await fetch(url, {
    method: options?.method || "GET",
    headers: options?.body ? { "Content-Type": "application/json" } : undefined,
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });
  const result = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(result.error || "عملیات انجام نشد.");
  return result;
}
async function apiForm<T = Record<string, unknown>>(url: string, body: FormData): Promise<T> {
  const response = await fetch(url, { method: "POST", body });
  const result = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(result.error || "بارگذاری انجام نشد.");
  return result;
}
function messageOf(value: unknown) { return value instanceof Error ? value.message : "خطای پیش‌بینی‌نشده"; }
function normalize(value: string) { return toLatinDigits(value).replace(/\u064a/g, "ی").replace(/\u0643/g, "ک").replace(/\s+/g, " ").trim().toLowerCase(); }
function s(value: unknown) { return value == null ? "" : String(value); }
function n(value: unknown) { return Number(value) || 0; }
function arr(value: unknown): Array<string | number> { return Array.isArray(value) ? value : []; }
function bind(setter: React.Dispatch<React.SetStateAction<Record<string, unknown>>>, key: string) { return (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setter((current) => ({ ...current, [key]: event.target.value })); }
function toggle<T>(items: T[], item: T, checked: boolean) { return checked ? [...new Set([...items, item])] : items.filter((value) => value !== item); }
function initials(value: string) { const words = value.trim().split(/\s+/); return (words[0]?.[0] || "چ") + (words[1]?.[0] || ""); }
function fa(value: string | number) { return String(value).replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]); }
function toLatinDigits(value: string) { return value.replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit))).replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))); }
const jalaliMonths = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
const jalaliWeekdays = ["ش", "ی", "د", "س", "چ", "پ", "ج"];
function pad(value: number) { return String(value).padStart(2, "0"); }
function parseJalaliInput(value: string) {
  const match = toLatinDigits(value).match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]), time: `${pad(Number(match[4] || 0))}:${pad(Number(match[5] || 0))}` };
}
function calendarDays(year: number, month: number) {
  const first = toGregorian(year, month, 1);
  const start = (new Date(first.gy, first.gm - 1, first.gd).getDay() + 1) % 7;
  return [...Array.from({ length: start }, () => 0), ...Array.from({ length: jalaaliMonthLength(year, month) }, (_, index) => index + 1)];
}
function persianDate(value: string, timezone: string, dateOnly = false) { try { return new Intl.DateTimeFormat("fa-IR-u-ca-persian", { timeZone: timezone, year: "numeric", month: dateOnly ? "long" : "short", day: "numeric", ...(dateOnly ? {} : { hour: "2-digit", minute: "2-digit" }) }).format(new Date(value)); } catch { return "—"; } }
function isoToJalaliInput(value: string, timezone: string) { if (!value) return ""; const parts = new Intl.DateTimeFormat("en-US-u-ca-persian", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value)); const get = (type: string) => parts.find((part) => part.type === type)?.value || ""; return `${get("year")}/${get("month")}/${get("day")} ${get("hour")}:${get("minute")}`; }
function appendExcelSheet(XLSX: typeof import("xlsx"), workbook: import("xlsx").WorkBook, name: string, rows: Array<Record<string, unknown>>, readable = true) {
  const worksheet = rows.length ? XLSX.utils.json_to_sheet(rows) : XLSX.utils.aoa_to_sheet(readable ? [["وضعیت"], ["رکوردی موجود نیست"]] : []);
  if (rows.length) {
    const headers = Object.keys(rows[0]);
    worksheet["!cols"] = headers.map((header) => ({
      wch: Math.min(55, Math.max(12, header.length + 2, ...rows.slice(0, 100).map((row) => String(row[header] ?? "").length + 2))),
    }));
    if (readable && worksheet["!ref"]) worksheet["!autofilter"] = { ref: worksheet["!ref"] };
  }
  XLSX.utils.book_append_sheet(workbook, worksheet, name);
}
function readableExcelRow(row: Record<string, unknown>, timezone: string) {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === null || value === undefined) result[key] = "";
    else if (key.includes("تاریخ") && typeof value === "string") {
      const normalizedDate = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? `${value.replace(" ", "T")}Z` : value;
      result[key] = isoToJalaliInput(normalizedDate, timezone);
    } else if (typeof value === "string" && value.trim().startsWith("[")) {
      try {
        const parsed = JSON.parse(value);
        result[key] = Array.isArray(parsed) ? parsed.join("، ") : value;
      } catch {
        result[key] = value;
      }
    } else result[key] = typeof value === "object" ? JSON.stringify(value) : value;
  }
  return result;
}
function persianFileStamp(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("fa-IR-u-ca-persian-nu-latn", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "00";
  return `${value("year")}-${value("month")}-${value("day")}_${value("hour")}-${value("minute")}-${value("second")}`;
}
function backupSheetLabel(name: string) {
  return ({
    DB_users: "کاربران", DB_tags: "تگ‌ها", DB_customers: "مشتریان", DB_contacts: "افراد",
    DB_opportunities: "فرصت‌های فروش", DB_opportunity_steps: "مراحل فرصت", DB_activities: "فعالیت‌ها",
    DB_activity_contacts: "مخاطبان فعالیت", DB_documents: "اسناد", DB_customer_tags: "تگ‌های مشتری",
    DB_customer_watchers: "مشاهده‌کنندگان مشتری", DB_manager_notes: "یادداشت‌های مدیران",
    DB_timeline_events: "تایم‌لاین", DB_notifications: "اعلان‌ها", DB_audit_logs: "سوابق تغییرات",
    DB_import_batches: "سوابق دریافت Excel",
  } as Record<string, string>)[name] || name;
}
function jalaliToIso(value: string, timezone: string) { const match = toLatinDigits(value).match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?$/); if (!match) throw new Error("تاریخ شمسی معتبر نیست. نمونه: 1405/05/08 10:30"); const gregorian = toGregorian(Number(match[1]), Number(match[2]), Number(match[3])); const hour = Number(match[4] || 0); const minute = Number(match[5] || 0); const guess = new Date(Date.UTC(gregorian.gy, gregorian.gm - 1, gregorian.gd, hour, minute)); const offset = timezoneOffset(guess, timezone); return new Date(guess.getTime() - offset * 60000).toISOString(); }
function timezoneOffset(date: Date, timezone: string) { const part = new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "longOffset" }).formatToParts(date).find((item) => item.type === "timeZoneName")?.value || "GMT+00:00"; const match = part.match(/GMT([+-])(\d{2}):(\d{2})/); return match ? (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3])) : 0; }
function money(value: number, currency: Opportunity["currency"]) { const formatted = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 }).format(value || 0); return `${formatted} ${currencyLabel(currency)}`; }
function currencyLabel(currency: string) { return currency === "IRR" ? "ریال" : currency === "USD" ? "دلار" : "یورو"; }
function statusLabel(status: string) { return ({ open: "باز", won: "برنده", lost: "باخته", paused: "متوقف", archived: "بایگانی" } as Record<string, string>)[status] || status; }
function activityStatusLabel(status: string) { return ({ planned: "برنامه‌ریزی‌شده", completed: "انجام‌شده", cancelled: "لغوشده" } as Record<string, string>)[status] || status; }
function roleLabel(role: UserRole) { return ({ admin: "مدیر سیستم", sales_manager: "مدیر فروش", sales: "کارشناس فروش", viewer: "مشاهده‌گر" } as Record<UserRole, string>)[role]; }
function activityTypeLabel(type: string) { return activityTypes.find(([id]) => id === type)?.[1] || "فعالیت"; }
function activityIcon(type: string) { return type === "call" ? <Phone size={18} /> : type.includes("meeting") ? type === "meeting_online" ? <Video size={18} /> : <Users size={18} /> : type === "email" ? <Mail size={18} /> : <MessageSquareText size={18} />; }
function eventTone(type: string) { return type.includes("opportunity") ? "gold" : type.includes("document") ? "purple" : type.includes("contact") ? "blue" : "teal"; }
function eventIcon(type: string) { return type.includes("opportunity") ? <Target size={18} /> : type.includes("document") ? <FileText size={18} /> : type.includes("contact") ? <UserPlus size={18} /> : <MessageSquareText size={18} />; }
function fileSize(value: number) { return value > 1024 * 1024 ? `${fa((value / 1024 / 1024).toFixed(1))} مگابایت` : `${fa(Math.ceil(value / 1024))} کیلوبایت`; }
function mapCustomerToForm(value?: Record<string, unknown>, detail?: CustomerDetail | null) { if (!value) return null; const result: Record<string, unknown> = {}; for (const [key, item] of Object.entries(value)) result[key.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase())] = item; result.tagIds = detail?.tags.map((tag) => tag.id) ?? []; result.watcherIds = detail?.watchers.map((user) => user.id) ?? []; return result; }
