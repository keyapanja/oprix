"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/auth/guard";
import { dateAtUTC } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { notifyAllInternal } from "@/lib/calendar/reminders";

export type CalendarState = { error?: string; ok?: boolean };
const CAL = "/calendar";

const HolidaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  name: z.string().trim().min(1, "Name is required").max(100),
});

export async function createHoliday(
  _prev: CalendarState,
  formData: FormData,
): Promise<CalendarState> {
  const session = await requireCapability("org:manage");
  const parsed = HolidaySchema.safeParse({
    date: formData.get("date"),
    name: formData.get("name"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const date = dateAtUTC(parsed.data.date);
  // A soft-deleted holiday still occupies the (company, date) unique slot — revive
  // it (with the new name) instead of failing the unique constraint.
  const existing = await prisma.holiday.findFirst({
    where: { companyId: session.companyId, date },
    select: { id: true, deletedAt: true },
  });
  if (existing) {
    if (!existing.deletedAt) return { error: "A holiday already exists on that date" };
    await prisma.holiday.update({
      where: { id: existing.id },
      data: { name: parsed.data.name, deletedAt: null, deletedById: null },
    });
  } else {
    await prisma.holiday.create({
      data: { companyId: session.companyId, date, name: parsed.data.name },
    });
  }
  revalidatePath(CAL);
  return { ok: true };
}

export async function deleteHoliday(id: string): Promise<CalendarState> {
  const session = await requireCapability("org:manage");
  await prisma.holiday.updateMany({
    where: { id, companyId: session.companyId, deletedAt: null },
    data: { deletedAt: new Date(), deletedById: session.userId },
  });
  revalidatePath(CAL);
  return { ok: true };
}

export async function updateHoliday(id: string, formData: FormData): Promise<CalendarState> {
  const session = await requireCapability("org:manage");
  const parsed = HolidaySchema.safeParse({
    date: formData.get("date"),
    name: formData.get("name"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  // Tenant-scope: the holiday must belong to this company.
  const existing = await prisma.holiday.findFirst({
    where: { id, companyId: session.companyId, deletedAt: null },
    select: { id: true },
  });
  if (!existing) return { error: "Holiday not found" };

  try {
    await prisma.holiday.update({
      where: { id },
      data: { date: dateAtUTC(parsed.data.date), name: parsed.data.name },
    });
  } catch {
    return { error: "A holiday already exists on that date" };
  }
  revalidatePath(CAL);
  return { ok: true };
}

const AnnouncementSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(140),
  body: z.string().trim().max(5000).optional().or(z.literal("")),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
});

export async function createAnnouncement(
  _prev: CalendarState,
  formData: FormData,
): Promise<CalendarState & { id?: string }> {
  const session = await requireCapability("org:manage");
  const parsed = AnnouncementSchema.safeParse({
    title: formData.get("title"),
    body: formData.get("body"),
    date: formData.get("date"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const d = parsed.data;

  const ann = await prisma.announcement.create({
    data: {
      companyId: session.companyId,
      authorId: session.userId,
      title: d.title,
      body: d.body || null,
      date: dateAtUTC(d.date),
    },
  });

  // Surface the announcement in everyone's notifications.
  try {
    await notifyAllInternal(
      session.companyId,
      "ANNOUNCEMENT",
      d.title,
      d.body || `Announcement for ${formatDate(dateAtUTC(d.date))}.`,
      { announcementId: ann.id },
    );
  } catch (e) {
    console.error("[announcement] notify failed:", e);
  }

  revalidatePath(CAL);
  return { ok: true, id: ann.id };
}

/** Edit an announcement — only its author (a Super Admin can edit any). */
export async function updateAnnouncement(id: string, formData: FormData): Promise<CalendarState> {
  const session = await requireCapability("org:manage");
  const ann = await prisma.announcement.findFirst({
    where: { id, companyId: session.companyId, deletedAt: null },
    select: { authorId: true },
  });
  if (!ann) return { error: "Announcement not found" };
  // Author-scoped, but legacy rows (null author, pre-authorId) are ownerless —
  // any org:manage user (already required above) may manage those.
  if (ann.authorId && ann.authorId !== session.userId && session.role !== "SUPER_ADMIN") {
    return { error: "Only the author can edit this announcement." };
  }
  const parsed = AnnouncementSchema.safeParse({
    title: formData.get("title"),
    body: formData.get("body"),
    date: formData.get("date"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const d = parsed.data;
  await prisma.announcement.update({
    where: { id },
    data: { title: d.title, body: d.body || null, date: dateAtUTC(d.date) },
  });
  revalidatePath(CAL);
  return { ok: true };
}

/** Delete an announcement (to trash) — only its author (a Super Admin can delete any). */
export async function deleteAnnouncement(id: string): Promise<CalendarState> {
  const session = await requireCapability("org:manage");
  const ann = await prisma.announcement.findFirst({
    where: { id, companyId: session.companyId, deletedAt: null },
    select: { authorId: true },
  });
  if (!ann) return { error: "Announcement not found" };
  // Author-scoped, but legacy rows (null author, pre-authorId) are ownerless —
  // any org:manage user (already required above) may manage those.
  if (ann.authorId && ann.authorId !== session.userId && session.role !== "SUPER_ADMIN") {
    return { error: "Only the author can delete this announcement." };
  }
  // Soft-delete: attachments stay so a Super-Admin restore brings it back whole.
  await prisma.announcement.update({
    where: { id },
    data: { deletedAt: new Date(), deletedById: session.userId },
  });
  revalidatePath(CAL);
  return { ok: true };
}

// ---- Day-before reminder setting -----------------------------------------
const ReminderSchema = z.object({
  enabled: z.boolean(),
  time: z.string().regex(/^\d{2}:\d{2}$/),
});

export async function setEventReminder(input: { enabled: boolean; time: string }): Promise<CalendarState> {
  const session = await requireCapability("org:manage");
  const parsed = ReminderSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid input" };
  await prisma.company.update({
    where: { id: session.companyId },
    data: { eventReminderEnabled: parsed.data.enabled, eventReminderTime: parsed.data.time },
  });
  revalidatePath("/organization");
  return { ok: true };
}
