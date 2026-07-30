import {
  cleanText,
  isManager,
  jsonError,
  requireApiUser,
  runtime,
} from "@/lib/server";

export const dynamic = "force-dynamic";

type SearchRow = {
  id: number;
  customerId: number;
  title: string;
  subtitle: string;
  meta: string;
  searchable: string;
};

export async function GET(request: Request) {
  try {
    const user = await requireApiUser();
    const url = new URL(request.url);
    const query = normalize(cleanText(url.searchParams.get("q"), 200));
    if (query.length < 2) return Response.json(emptyResult(query));

    const requestedLimit = Number(url.searchParams.get("limit")) || 5;
    const limit = Math.min(50, Math.max(1, Math.trunc(requestedLimit)));
    const db = runtime().DB;
    const manager = isManager(user) ? 1 : 0;
    const match = `%${query}%`;

    const access = `(
      ? = 1 OR c.visibility = 'public' OR c.owner_user_id = ?
      OR EXISTS(
        SELECT 1 FROM customer_watchers cw
        WHERE cw.customer_id = c.id AND cw.user_id = ?
      )
    )`;

    const [customers, contacts, activities, opportunities, documents] =
      await Promise.all([
        db
          .prepare(
            `SELECT c.id, c.id AS customerId, c.name AS title,
                    TRIM(COALESCE(c.city, '') || CASE WHEN c.phone != '' THEN ' · ' || c.phone ELSE '' END) AS subtitle,
                    COALESCE((
                      SELECT GROUP_CONCAT(t.name, '، ')
                      FROM customer_tags ct JOIN tags t ON t.id = ct.tag_id
                      WHERE ct.customer_id = c.id AND t.archived_at IS NULL
                    ), '') AS meta,
                    LOWER(c.name || ' ' || c.short_name || ' ' || c.english_name || ' ' ||
                      c.phone || ' ' || c.email || ' ' || c.city || ' ' || c.address || ' ' ||
                      COALESCE((SELECT GROUP_CONCAT(t2.name, ' ') FROM customer_tags ct2
                        JOIN tags t2 ON t2.id = ct2.tag_id WHERE ct2.customer_id = c.id), '')) AS searchable
             FROM customers c
             WHERE c.archived_at IS NULL AND ${access}
               AND LOWER(c.name || ' ' || c.short_name || ' ' || c.english_name || ' ' ||
                 c.phone || ' ' || c.email || ' ' || c.city || ' ' || c.address || ' ' ||
                 COALESCE((SELECT GROUP_CONCAT(t3.name, ' ') FROM customer_tags ct3
                   JOIN tags t3 ON t3.id = ct3.tag_id WHERE ct3.customer_id = c.id), '')) LIKE ?
             ORDER BY c.updated_at DESC LIMIT ?`,
          )
          .bind(manager, user.id, user.id, match, limit)
          .all<SearchRow>(),
        db
          .prepare(
            `SELECT co.id, co.customer_id AS customerId,
                    TRIM(co.prefix || ' ' || co.first_name || ' ' || co.last_name) AS title,
                    c.name || CASE WHEN co.job_title != '' THEN ' · ' || co.job_title ELSE '' END AS subtitle,
                    COALESCE(NULLIF(co.mobile, ''), NULLIF(co.direct_phone, ''), co.email, '') AS meta,
                    LOWER(co.prefix || ' ' || co.first_name || ' ' || co.last_name || ' ' ||
                      c.name || ' ' || co.job_title || ' ' || co.department || ' ' ||
                      co.mobile || ' ' || co.direct_phone || ' ' || co.email || ' ' || co.address) AS searchable
             FROM contacts co JOIN customers c ON c.id = co.customer_id
             WHERE co.archived_at IS NULL AND c.archived_at IS NULL AND ${access}
               AND LOWER(co.prefix || ' ' || co.first_name || ' ' || co.last_name || ' ' ||
                 c.name || ' ' || co.job_title || ' ' || co.department || ' ' ||
                 co.mobile || ' ' || co.direct_phone || ' ' || co.email || ' ' || co.address) LIKE ?
             ORDER BY co.updated_at DESC LIMIT ?`,
          )
          .bind(manager, user.id, user.id, match, limit)
          .all<SearchRow>(),
        db
          .prepare(
            `SELECT a.id, a.customer_id AS customerId, a.title,
                    c.name || ' · ' || CASE a.status
                      WHEN 'planned' THEN 'برنامه‌ریزی‌شده'
                      WHEN 'completed' THEN 'انجام‌شده'
                      ELSE 'لغوشده' END AS subtitle,
                    a.starts_at AS meta,
                    LOWER(a.title || ' ' || a.description || ' ' || a.result || ' ' ||
                      a.next_action || ' ' || a.free_contact_names || ' ' || c.name) AS searchable
             FROM activities a JOIN customers c ON c.id = a.customer_id
             WHERE a.archived_at IS NULL AND c.archived_at IS NULL
               AND (? = 1 OR a.is_manager_private = 0) AND ${access}
               AND LOWER(a.title || ' ' || a.description || ' ' || a.result || ' ' ||
                 a.next_action || ' ' || a.free_contact_names || ' ' || c.name) LIKE ?
             ORDER BY a.starts_at DESC LIMIT ?`,
          )
          .bind(manager, manager, user.id, user.id, match, limit)
          .all<SearchRow>(),
        db
          .prepare(
            `SELECT o.id, o.customer_id AS customerId, o.title,
                    c.name || CASE WHEN o.current_stage != '' THEN ' · ' || o.current_stage ELSE '' END AS subtitle,
                    CASE o.status WHEN 'open' THEN 'باز' WHEN 'won' THEN 'موفق'
                      WHEN 'lost' THEN 'ناموفق' ELSE 'متوقف' END AS meta,
                    LOWER(o.title || ' ' || o.description || ' ' || o.solution_text || ' ' ||
                      o.current_stage || ' ' || o.latest_status || ' ' || o.next_action || ' ' || c.name) AS searchable
             FROM opportunities o JOIN customers c ON c.id = o.customer_id
             WHERE o.archived_at IS NULL AND c.archived_at IS NULL AND ${access}
               AND LOWER(o.title || ' ' || o.description || ' ' || o.solution_text || ' ' ||
                 o.current_stage || ' ' || o.latest_status || ' ' || o.next_action || ' ' || c.name) LIKE ?
             ORDER BY o.updated_at DESC LIMIT ?`,
          )
          .bind(manager, user.id, user.id, match, limit)
          .all<SearchRow>(),
        db
          .prepare(
            `SELECT d.id, d.customer_id AS customerId, d.title,
                    c.name || ' · ' || d.file_name AS subtitle,
                    d.document_type AS meta,
                    LOWER(d.title || ' ' || d.file_name || ' ' || d.document_type || ' ' ||
                      d.reference_number || ' ' || d.description || ' ' || c.name) AS searchable
             FROM documents d JOIN customers c ON c.id = d.customer_id
             WHERE d.archived_at IS NULL AND c.archived_at IS NULL AND ${access}
               AND LOWER(d.title || ' ' || d.file_name || ' ' || d.document_type || ' ' ||
                 d.reference_number || ' ' || d.description || ' ' || c.name) LIKE ?
             ORDER BY d.updated_at DESC LIMIT ?`,
          )
          .bind(manager, user.id, user.id, match, limit)
          .all<SearchRow>(),
      ]);

    return Response.json({
      query,
      groups: {
        customers: rank(customers.results, query),
        contacts: rank(contacts.results, query),
        activities: rank(activities.results, query),
        opportunities: rank(opportunities.results, query),
        documents: rank(documents.results, query),
      },
      counts: {
        customers: customers.results.length,
        contacts: contacts.results.length,
        activities: activities.results.length,
        opportunities: opportunities.results.length,
        documents: documents.results.length,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

function normalize(value: string) {
  return value
    .replace(/\u064a/g, "ی")
    .replace(/\u0643/g, "ک")
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function rank(rows: SearchRow[], query: string) {
  return rows
    .map(({ searchable, ...row }) => ({
      ...row,
      score: score(normalize(searchable), normalize(row.title), query),
    }))
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "fa"));
}

function score(searchable: string, title: string, query: string) {
  if (title === query) return 100;
  if (title.startsWith(query)) return 80;
  if (title.includes(query)) return 60;
  if (searchable.startsWith(query)) return 40;
  return 20;
}

function emptyResult(query: string) {
  return {
    query,
    groups: {
      customers: [],
      contacts: [],
      activities: [],
      opportunities: [],
      documents: [],
    },
    counts: {
      customers: 0,
      contacts: 0,
      activities: 0,
      opportunities: 0,
      documents: 0,
    },
  };
}
