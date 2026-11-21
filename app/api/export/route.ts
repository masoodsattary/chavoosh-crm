import {
  jsonError,
  requireApiUser,
  requireRole,
  runtime,
} from "@/lib/server";
import { workbookBackupTables } from "@/lib/workbook-backup";

export const dynamic = "force-dynamic";

type ExportSheet = {
  name: string;
  description: string;
  rows: Record<string, unknown>[];
};

async function rows(sql: string) {
  const result = await runtime().DB.prepare(sql).all<Record<string, unknown>>();
  return result.results;
}

export async function GET() {
  try {
    const user = await requireApiUser();
    requireRole(user, ["admin"]);

    const sheets: ExportSheet[] = await Promise.all([
      rows(
        `SELECT c.id AS "شناسه", c.name AS "نام مشتری",
                c.short_name AS "نام کوتاه", c.english_name AS "نام انگلیسی",
                c.organization_type AS "نوع سازمان", c.industry AS "صنعت",
                c.relationship_status AS "وضعیت ارتباط", c.importance AS "اهمیت",
                c.website AS "وب‌سایت", c.phone AS "تلفن",
                c.other_phones AS "سایر تلفن‌ها", c.fax AS "فکس",
                c.email AS "ایمیل", c.secretariat_number AS "شماره دبیرخانه",
                c.postal_code AS "کد پستی", c.province AS "استان",
                c.city AS "شهر", c.address AS "آدرس",
                c.description AS "شرح", c.source AS "منبع",
                c.visibility AS "سطح مشاهده", c.owner_user_id AS "شناسه مسئول حساب",
                owner.full_name AS "مسئول حساب",
                c.parent_customer_id AS "شناسه مشتری مادر",
                parent.name AS "مشتری مادر", c.created_by AS "شناسه ایجادکننده",
                creator.full_name AS "ایجادکننده", c.updated_by AS "شناسه آخرین ویرایشگر",
                editor.full_name AS "آخرین ویرایشگر",
                c.last_interaction_at AS "تاریخ آخرین تعامل",
                c.next_action_at AS "تاریخ اقدام بعدی",
                c.created_at AS "تاریخ ایجاد", c.updated_at AS "تاریخ ویرایش",
                c.archived_at AS "تاریخ بایگانی"
         FROM customers c
         LEFT JOIN users owner ON owner.id = c.owner_user_id
         LEFT JOIN users creator ON creator.id = c.created_by
         LEFT JOIN users editor ON editor.id = c.updated_by
         LEFT JOIN customers parent ON parent.id = c.parent_customer_id
         ORDER BY c.id`,
      ).then((data) => ({ name: "مشتریان", description: "تمام حساب‌های مشتری، شامل موارد بایگانی‌شده", rows: data })),
      rows(
        `SELECT co.id AS "شناسه", co.customer_id AS "شناسه مشتری",
                c.name AS "مشتری", co.first_name AS "نام",
                co.last_name AS "نام خانوادگی", co.prefix AS "پیشوند",
                co.job_title AS "سمت", co.department AS "واحد",
                co.decision_roles AS "نقش‌های تصمیم‌گیری",
                co.direct_phone AS "تلفن مستقیم", co.extension AS "داخلی",
                co.mobile AS "موبایل", co.email AS "ایمیل",
                co.secondary_email AS "ایمیل دوم", co.fax AS "فکس",
                co.address AS "آدرس", co.preferred_contact AS "روش تماس ترجیحی",
                co.notes AS "یادداشت", co.status AS "وضعیت",
                co.created_by AS "شناسه ایجادکننده", creator.full_name AS "ایجادکننده",
                co.updated_by AS "شناسه آخرین ویرایشگر", editor.full_name AS "آخرین ویرایشگر",
                co.created_at AS "تاریخ ایجاد", co.updated_at AS "تاریخ ویرایش",
                co.archived_at AS "تاریخ بایگانی"
         FROM contacts co
         LEFT JOIN customers c ON c.id = co.customer_id
         LEFT JOIN users creator ON creator.id = co.created_by
         LEFT JOIN users editor ON editor.id = co.updated_by
         ORDER BY co.id`,
      ).then((data) => ({ name: "افراد", description: "تمام مخاطبان مشتریان، شامل موارد بایگانی‌شده", rows: data })),
      rows(
        `SELECT a.id AS "شناسه", a.customer_id AS "شناسه مشتری",
                c.name AS "مشتری", a.opportunity_id AS "شناسه فرصت",
                o.title AS "فرصت", a.title AS "عنوان فعالیت",
                a.type AS "نوع", a.direction AS "جهت ارتباط",
                a.status AS "وضعیت", a.starts_at AS "تاریخ و زمان شروع",
                a.duration_minutes AS "مدت به دقیقه", a.description AS "شرح مذاکره",
                a.result AS "نتیجه", a.next_action AS "اقدام بعدی",
                a.next_action_at AS "تاریخ اقدام بعدی",
                a.source_activity_id AS "شناسه فعالیت مبدأ",
                source_activity.title AS "فعالیت مبدأ",
                a.free_contact_names AS "نام مخاطبان آزاد",
                a.assignee_user_id AS "شناسه مسئول", assignee.full_name AS "مسئول",
                a.is_manager_private AS "خصوصی مدیران",
                a.created_by AS "شناسه ایجادکننده", creator.full_name AS "ایجادکننده",
                a.updated_by AS "شناسه آخرین ویرایشگر", editor.full_name AS "آخرین ویرایشگر",
                a.completed_at AS "تاریخ تکمیل", a.created_at AS "تاریخ ایجاد",
                a.updated_at AS "تاریخ ویرایش", a.archived_at AS "تاریخ بایگانی"
         FROM activities a
         LEFT JOIN customers c ON c.id = a.customer_id
         LEFT JOIN opportunities o ON o.id = a.opportunity_id
         LEFT JOIN activities source_activity ON source_activity.id = a.source_activity_id
         LEFT JOIN users assignee ON assignee.id = a.assignee_user_id
         LEFT JOIN users creator ON creator.id = a.created_by
         LEFT JOIN users editor ON editor.id = a.updated_by
         ORDER BY a.id`,
      ).then((data) => ({ name: "فعالیت‌ها", description: "تماس‌ها، جلسات، مکاتبات و اقدامات", rows: data })),
      rows(
        `SELECT ac.activity_id AS "شناسه فعالیت", a.title AS "فعالیت",
                ac.contact_id AS "شناسه فرد",
                TRIM(COALESCE(co.first_name, '') || ' ' || COALESCE(co.last_name, '')) AS "فرد",
                co.customer_id AS "شناسه مشتری", c.name AS "مشتری"
         FROM activity_contacts ac
         LEFT JOIN activities a ON a.id = ac.activity_id
         LEFT JOIN contacts co ON co.id = ac.contact_id
         LEFT JOIN customers c ON c.id = co.customer_id
         ORDER BY ac.activity_id, ac.contact_id`,
      ).then((data) => ({ name: "مخاطبان فعالیت", description: "رابطه افراد با فعالیت‌ها", rows: data })),
      rows(
        `SELECT o.id AS "شناسه", o.customer_id AS "شناسه مشتری",
                c.name AS "مشتری", o.title AS "عنوان فرصت",
                o.description AS "شرح", o.solution_text AS "راهکار یا محصول",
                o.status AS "وضعیت", o.current_stage AS "مرحله فعلی",
                o.amount AS "مبلغ", o.currency AS "ارز",
                o.probability AS "احتمال موفقیت", o.forecast_at AS "تاریخ پیش‌بینی",
                o.latest_status AS "آخرین وضعیت", o.next_action AS "اقدام بعدی",
                o.next_action_at AS "تاریخ اقدام بعدی", o.source AS "منبع",
                o.competitors AS "رقبا", o.win_loss_reason AS "دلیل برد یا باخت",
                o.owner_user_id AS "شناسه مسئول", owner.full_name AS "مسئول",
                o.created_by AS "شناسه ایجادکننده", creator.full_name AS "ایجادکننده",
                o.updated_by AS "شناسه آخرین ویرایشگر", editor.full_name AS "آخرین ویرایشگر",
                o.created_at AS "تاریخ ایجاد", o.updated_at AS "تاریخ ویرایش",
                o.archived_at AS "تاریخ بایگانی"
         FROM opportunities o
         LEFT JOIN customers c ON c.id = o.customer_id
         LEFT JOIN users owner ON owner.id = o.owner_user_id
         LEFT JOIN users creator ON creator.id = o.created_by
         LEFT JOIN users editor ON editor.id = o.updated_by
         ORDER BY o.id`,
      ).then((data) => ({ name: "فرصت‌های فروش", description: "تمام فرصت‌های فروش و پیش‌بینی‌ها", rows: data })),
      rows(
        `SELECT s.id AS "شناسه", s.opportunity_id AS "شناسه فرصت",
                o.title AS "فرصت", s.title AS "عنوان مرحله",
                s.sort_order AS "ترتیب", s.status AS "وضعیت",
                s.due_at AS "تاریخ سررسید", s.completed_at AS "تاریخ تکمیل",
                s.assignee_user_id AS "شناسه مسئول", u.full_name AS "مسئول",
                s.notes AS "یادداشت", s.probability AS "احتمال",
                s.created_at AS "تاریخ ایجاد", s.updated_at AS "تاریخ ویرایش",
                s.archived_at AS "تاریخ بایگانی"
         FROM opportunity_steps s
         LEFT JOIN opportunities o ON o.id = s.opportunity_id
         LEFT JOIN users u ON u.id = s.assignee_user_id
         ORDER BY s.opportunity_id, s.sort_order, s.id`,
      ).then((data) => ({ name: "مراحل فرصت", description: "مراحل متغیر تعریف‌شده برای فرصت‌ها", rows: data })),
      rows(
        `SELECT d.id AS "شناسه", d.customer_id AS "شناسه مشتری",
                c.name AS "مشتری", d.activity_id AS "شناسه فعالیت",
                a.title AS "فعالیت", d.opportunity_id AS "شناسه فرصت",
                o.title AS "فرصت", d.title AS "عنوان سند",
                d.document_type AS "نوع سند", d.version AS "نسخه",
                d.visibility AS "کاربرد سند",
                d.document_date AS "تاریخ سند", d.reference_number AS "شماره مرجع",
                d.description AS "شرح", d.file_name AS "نام فایل",
                d.object_key AS "شناسه فایل ذخیره‌شده",
                d.content_type AS "نوع محتوا", d.size AS "اندازه بایت",
                d.status AS "وضعیت", d.uploaded_by AS "شناسه بارگذار",
                u.full_name AS "بارگذاری‌کننده", d.created_at AS "تاریخ ایجاد",
                d.updated_at AS "تاریخ ویرایش", d.archived_at AS "تاریخ بایگانی"
         FROM documents d
         LEFT JOIN customers c ON c.id = d.customer_id
         LEFT JOIN activities a ON a.id = d.activity_id
         LEFT JOIN opportunities o ON o.id = d.opportunity_id
         LEFT JOIN users u ON u.id = d.uploaded_by
         ORDER BY d.id`,
      ).then((data) => ({ name: "اسناد", description: "مشخصات و شناسه فایل‌ها؛ محتوای فایل‌ها داخل Excel قرار نمی‌گیرد", rows: data })),
      rows(
        `SELECT t.id AS "شناسه", t.name AS "نام تگ", t.color AS "رنگ",
                t.is_active AS "فعال", t.created_by AS "شناسه ایجادکننده",
                u.full_name AS "ایجادکننده", t.created_at AS "تاریخ ایجاد",
                t.updated_at AS "تاریخ ویرایش", t.archived_at AS "تاریخ بایگانی"
         FROM tags t LEFT JOIN users u ON u.id = t.created_by ORDER BY t.id`,
      ).then((data) => ({ name: "تگ‌ها", description: "تعاریف گروه‌بندی مشتریان", rows: data })),
      rows(
        `SELECT ct.customer_id AS "شناسه مشتری", c.name AS "مشتری",
                ct.tag_id AS "شناسه تگ", t.name AS "تگ"
         FROM customer_tags ct
         LEFT JOIN customers c ON c.id = ct.customer_id
         LEFT JOIN tags t ON t.id = ct.tag_id
         ORDER BY ct.customer_id, ct.tag_id`,
      ).then((data) => ({ name: "تگ‌های مشتری", description: "رابطه مشتریان و تگ‌ها", rows: data })),
      rows(
        `SELECT cw.customer_id AS "شناسه مشتری", c.name AS "مشتری",
                cw.user_id AS "شناسه مشاهده‌کننده", u.full_name AS "مشاهده‌کننده",
                u.email AS "ایمیل مشاهده‌کننده", cw.added_by AS "شناسه افزوده توسط",
                creator.full_name AS "افزوده توسط", cw.created_at AS "تاریخ ایجاد"
         FROM customer_watchers cw
         LEFT JOIN customers c ON c.id = cw.customer_id
         LEFT JOIN users u ON u.id = cw.user_id
         LEFT JOIN users creator ON creator.id = cw.added_by
         ORDER BY cw.customer_id, cw.user_id`,
      ).then((data) => ({ name: "مشاهده‌کنندگان", description: "کاربران مرتبط و مجاز هر مشتری", rows: data })),
      rows(
        `SELECT u.id AS "شناسه", u.email AS "ایمیل",
                u.full_name AS "نام و نام خانوادگی", u.mobile AS "موبایل",
                u.role AS "نقش", u.timezone AS "منطقه زمانی",
                u.is_active AS "فعال", u.last_login_at AS "آخرین ورود",
                u.password_changed_at AS "تاریخ آخرین تغییر رمز",
                u.invite_expires_at AS "انقضای دعوت", u.invited_at AS "تاریخ دعوت",
                u.invited_by AS "شناسه دعوت‌کننده", inviter.full_name AS "دعوت‌کننده",
                u.created_at AS "تاریخ ایجاد", u.updated_at AS "تاریخ ویرایش",
                u.archived_at AS "تاریخ بایگانی"
         FROM users u
         LEFT JOIN users inviter ON inviter.id = u.invited_by
         ORDER BY u.id`,
      ).then((data) => ({ name: "کاربران", description: "کاربران و نقش‌ها؛ رمزها، توکن‌ها و نشست‌ها عمداً حذف شده‌اند", rows: data })),
      rows(
        `SELECT n.id AS "شناسه", n.customer_id AS "شناسه مشتری",
                c.name AS "مشتری", n.contact_id AS "شناسه فرد",
                TRIM(COALESCE(co.first_name, '') || ' ' || COALESCE(co.last_name, '')) AS "فرد",
                n.opportunity_id AS "شناسه فرصت", o.title AS "فرصت",
                n.activity_id AS "شناسه فعالیت", a.title AS "فعالیت",
                n.body AS "متن یادداشت", n.created_by AS "شناسه ایجادکننده",
                u.full_name AS "ایجادکننده", n.created_at AS "تاریخ ایجاد",
                n.updated_at AS "تاریخ ویرایش", n.archived_at AS "تاریخ بایگانی"
         FROM manager_notes n
         LEFT JOIN customers c ON c.id = n.customer_id
         LEFT JOIN contacts co ON co.id = n.contact_id
         LEFT JOIN opportunities o ON o.id = n.opportunity_id
         LEFT JOIN activities a ON a.id = n.activity_id
         LEFT JOIN users u ON u.id = n.created_by
         ORDER BY n.id`,
      ).then((data) => ({ name: "یادداشت‌های مدیران", description: "یادداشت‌های خصوصی مدیران", rows: data })),
      rows(
        `SELECT e.id AS "شناسه", e.customer_id AS "شناسه مشتری",
                c.name AS "مشتری", e.event_type AS "نوع رویداد",
                e.title AS "عنوان", e.summary AS "خلاصه",
                e.entity_type AS "نوع موجودیت", e.entity_id AS "شناسه موجودیت",
                e.is_manager_private AS "خصوصی مدیران",
                e.created_by AS "شناسه ایجادکننده", u.full_name AS "ایجادکننده",
                e.created_at AS "تاریخ ایجاد"
         FROM timeline_events e
         LEFT JOIN customers c ON c.id = e.customer_id
         LEFT JOIN users u ON u.id = e.created_by
         ORDER BY e.id`,
      ).then((data) => ({ name: "تایم‌لاین", description: "تمام رویدادهای تاریخچه مشتریان", rows: data })),
      rows(
        `SELECT n.id AS "شناسه", n.user_id AS "شناسه کاربر",
                u.full_name AS "کاربر", u.email AS "ایمیل کاربر",
                n.customer_id AS "شناسه مشتری", c.name AS "مشتری",
                n.timeline_event_id AS "شناسه رویداد تایم‌لاین",
                n.kind AS "نوع اعلان", n.entity_type AS "نوع موجودیت",
                n.entity_id AS "شناسه موجودیت", n.title AS "عنوان",
                n.body AS "متن", n.is_read AS "خوانده‌شده",
                n.created_at AS "تاریخ ایجاد"
         FROM notifications n
         LEFT JOIN users u ON u.id = n.user_id
         LEFT JOIN customers c ON c.id = n.customer_id
         ORDER BY n.id`,
      ).then((data) => ({ name: "اعلان‌ها", description: "اعلان‌های داخلی کاربران", rows: data })),
      rows(
        `SELECT e.id AS "شناسه", e.user_id AS "شناسه کاربر",
                u.full_name AS "کاربر", e.timeline_event_id AS "شناسه رویداد",
                e.recipient_email AS "گیرنده", e.subject AS "موضوع",
                e.status AS "وضعیت", e.attempts AS "تعداد تلاش",
                e.last_error AS "آخرین خطا", e.sent_at AS "تاریخ ارسال",
                e.created_at AS "تاریخ ایجاد"
         FROM email_outbox e
         LEFT JOIN users u ON u.id = e.user_id
         ORDER BY e.id`,
      ).then((data) => ({ name: "ارسال ایمیل", description: "وضعیت ارسال‌ها؛ بدنه ایمیل و لینک‌های امنیتی حذف شده‌اند", rows: data })),
      rows(
        `SELECT b.id AS "شناسه", b.entity_type AS "نوع اطلاعات",
                b.file_name AS "نام فایل", b.total_rows AS "کل ردیف‌ها",
                b.inserted_rows AS "ردیف‌های جدید", b.updated_rows AS "ردیف‌های به‌روزشده",
                b.rejected_rows AS "ردیف‌های ردشده", b.result_json AS "جزئیات نتیجه",
                b.created_by AS "شناسه ایجادکننده", u.full_name AS "ایجادکننده",
                b.created_at AS "تاریخ ایجاد"
         FROM import_batches b
         LEFT JOIN users u ON u.id = b.created_by
         ORDER BY b.id`,
      ).then((data) => ({ name: "سوابق دریافت Excel", description: "سوابق دریافت گروهی اطلاعات", rows: data })),
      rows(
        `SELECT l.id AS "شناسه", l.user_id AS "شناسه کاربر",
                u.full_name AS "کاربر", u.email AS "ایمیل کاربر",
                l.entity_type AS "نوع موجودیت", l.entity_id AS "شناسه موجودیت",
                l.action AS "عملیات", l.before_json AS "اطلاعات قبل",
                l.after_json AS "اطلاعات بعد", l.created_at AS "تاریخ ایجاد"
         FROM audit_logs l
         LEFT JOIN users u ON u.id = l.user_id
         ORDER BY l.id`,
      ).then((data) => ({ name: "سوابق تغییرات", description: "لاگ ممیزی عملیات کاربران", rows: data })),
    ]);
    const backupSheets = await Promise.all(
      workbookBackupTables.map(async (definition) => {
        const columnList = definition.columns.map((column) => `"${column}"`).join(", ");
        return {
          name: definition.sheet,
          table: definition.table,
          keyColumns: definition.keyColumns,
          rows: await rows(
            `SELECT ${columnList} FROM "${definition.table}" ORDER BY rowid`,
          ),
        };
      }),
    );

    return Response.json({
      format: "chavoosh-crm-workbook",
      formatVersion: 1,
      generatedAt: new Date().toISOString(),
      generatedBy: user.fullName || user.email,
      timezone: user.timezone,
      sheets,
      backupSheets,
    });
  } catch (error) {
    return jsonError(error);
  }
}
