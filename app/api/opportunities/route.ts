import {
  ApiError,
  cleanMultiline,
  cleanText,
  jsonError,
  optionalInt,
  recordAudit,
  recordEvent,
  requiredInt,
  requireApiUser,
  requireCustomerAccess,
  runtime,
} from "@/lib/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await requireApiUser();
    const body = (await request.json()) as Record<string, unknown>;
    const customerId = requiredInt(body.customerId, "مشتری");
    await requireCustomerAccess(customerId, user, true);
    const title = cleanText(body.title, 300);
    if (!title) throw new ApiError(400, "عنوان فرصت الزامی است.");
    const currency = ["IRR", "USD", "EUR"].includes(String(body.currency))
      ? String(body.currency)
      : "IRR";
    const probability = Math.min(100, Math.max(0, Number(body.probability) || 0));
    const result = await runtime().DB
      .prepare(
        `INSERT INTO opportunities (
          customer_id, title, description, solution_text, status, current_stage,
          amount, currency, probability, forecast_at, latest_status,
          next_action, next_action_at, source, competitors, win_loss_reason,
          owner_user_id, created_by, updated_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        customerId,
        title,
        cleanMultiline(body.description, 8000),
        cleanMultiline(body.solutionText, 5000),
        cleanText(body.status, 30) || "open",
        cleanText(body.currentStage, 200),
        Math.max(0, Number(body.amount) || 0),
        currency,
        probability,
        cleanText(body.forecastAt, 60) || null,
        cleanMultiline(body.latestStatus, 3000),
        cleanText(body.nextAction, 1000),
        cleanText(body.nextActionAt, 60) || null,
        cleanText(body.source, 300),
        cleanMultiline(body.competitors, 2000),
        cleanMultiline(body.winLossReason, 3000),
        optionalInt(body.ownerUserId) ?? user.id,
        user.id,
        user.id,
      )
      .run();
    const id = Number(result.meta.last_row_id);
    await syncSteps(id, body.steps, user.id);
    await recordAudit(user, "opportunity", id, "create", "", body);
    await recordEvent({
      customerId,
      user,
      eventType: "opportunity_created",
      title: "فرصت فروش جدید ایجاد شد",
      summary: `${title} — ${formatAmount(Number(body.amount) || 0, currency)} — احتمال ${probability}٪`,
      entityType: "opportunity",
      entityId: id,
    });
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireApiUser();
    const body = (await request.json()) as Record<string, unknown>;
    const id = requiredInt(body.id, "شناسه فرصت");
    const before = await runtime().DB
      .prepare("SELECT * FROM opportunities WHERE id = ? AND archived_at IS NULL")
      .bind(id)
      .first<Record<string, unknown>>();
    if (!before) throw new ApiError(404, "فرصت فروش پیدا نشد.");
    const customerId = Number(before.customer_id);
    await requireCustomerAccess(customerId, user, true);
    const status = cleanText(body.status ?? before.status, 30);
    const stage = cleanText(body.currentStage ?? before.current_stage, 200);
    const probability = Math.min(
      100,
      Math.max(0, Number(body.probability ?? before.probability) || 0),
    );
    await runtime().DB
      .prepare(
        `UPDATE opportunities SET
          title = ?, description = ?, solution_text = ?, status = ?,
          current_stage = ?, amount = ?, currency = ?, probability = ?,
          forecast_at = ?, latest_status = ?, next_action = ?,
          next_action_at = ?, source = ?, competitors = ?, win_loss_reason = ?,
          owner_user_id = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(
        cleanText(body.title ?? before.title, 300),
        cleanMultiline(body.description ?? before.description, 8000),
        cleanMultiline(body.solutionText ?? before.solution_text, 5000),
        status,
        stage,
        Math.max(0, Number(body.amount ?? before.amount) || 0),
        ["IRR", "USD", "EUR"].includes(String(body.currency))
          ? body.currency
          : before.currency,
        probability,
        cleanText(body.forecastAt ?? before.forecast_at, 60) || null,
        cleanMultiline(body.latestStatus ?? before.latest_status, 3000),
        cleanText(body.nextAction ?? before.next_action, 1000),
        cleanText(body.nextActionAt ?? before.next_action_at, 60) || null,
        cleanText(body.source ?? before.source, 300),
        cleanMultiline(body.competitors ?? before.competitors, 2000),
        cleanMultiline(body.winLossReason ?? before.win_loss_reason, 3000),
        optionalInt(body.ownerUserId ?? before.owner_user_id) ?? user.id,
        user.id,
        id,
      )
      .run();
    if (Array.isArray(body.steps)) {
      await runtime().DB
        .prepare(
          "UPDATE opportunity_steps SET archived_at = CURRENT_TIMESTAMP WHERE opportunity_id = ?",
        )
        .bind(id)
        .run();
      await syncSteps(id, body.steps, user.id);
    }
    const statusChanged = status !== String(before.status);
    const stageChanged = stage !== String(before.current_stage);
    await recordAudit(user, "opportunity", id, "update", before, body);
    await recordEvent({
      customerId,
      user,
      eventType: statusChanged ? `opportunity_${status}` : "opportunity_updated",
      title: statusChanged
        ? status === "won"
          ? "فرصت فروش برنده شد"
          : status === "lost"
            ? "فرصت فروش باخته شد"
            : "وضعیت فرصت فروش تغییر کرد"
        : stageChanged
          ? "مرحله فرصت فروش تغییر کرد"
          : "فرصت فروش به‌روزرسانی شد",
      summary: stageChanged
        ? `${String(before.current_stage) || "بدون مرحله"} ← ${stage}`
        : cleanMultiline(body.latestStatus ?? "", 3000),
      entityType: "opportunity",
      entityId: id,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireApiUser();
    const body = (await request.json()) as Record<string, unknown>;
    const id = requiredInt(body.id, "شناسه فرصت");
    const before = await runtime().DB
      .prepare("SELECT * FROM opportunities WHERE id = ? AND archived_at IS NULL")
      .bind(id)
      .first<Record<string, unknown>>();
    if (!before) throw new ApiError(404, "فرصت فروش پیدا نشد.");
    await requireCustomerAccess(Number(before.customer_id), user, true);
    await runtime().DB
      .prepare(
        `UPDATE opportunities SET status = 'archived',
         archived_at = CURRENT_TIMESTAMP, updated_by = ?,
         updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      )
      .bind(user.id, id)
      .run();
    await recordAudit(user, "opportunity", id, "archive", before, "");
    await recordEvent({
      customerId: Number(before.customer_id),
      user,
      eventType: "opportunity_archived",
      title: "فرصت فروش بایگانی شد",
      summary: cleanText(before.title, 300),
      entityType: "opportunity",
      entityId: id,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}

async function syncSteps(opportunityId: number, raw: unknown, actorId: number) {
  if (!Array.isArray(raw)) return;
  for (let index = 0; index < raw.length; index += 1) {
    const step = raw[index] as Record<string, unknown>;
    const title = cleanText(step.title, 300);
    if (!title) continue;
    await runtime().DB
      .prepare(
        `INSERT INTO opportunity_steps (
          opportunity_id, title, sort_order, status, due_at, completed_at,
          assignee_user_id, notes, probability
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        opportunityId,
        title,
        index,
        cleanText(step.status, 30) || "pending",
        cleanText(step.dueAt, 60) || null,
        step.status === "completed" ? new Date().toISOString() : null,
        optionalInt(step.assigneeUserId) ?? actorId,
        cleanMultiline(step.notes, 2000),
        Number.isFinite(Number(step.probability)) ? Number(step.probability) : null,
      )
      .run();
  }
}

function formatAmount(value: number, currency: string) {
  return `${new Intl.NumberFormat("fa-IR").format(value)} ${currency}`;
}
