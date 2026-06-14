"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/auth/guard";
import { dateAtUTC } from "@/lib/dates";

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

  try {
    await prisma.holiday.create({
      data: {
        companyId: session.companyId,
        date: dateAtUTC(parsed.data.date),
        name: parsed.data.name,
      },
    });
  } catch {
    return { error: "A holiday already exists on that date" };
  }
  revalidatePath(CAL);
  return { ok: true };
}

export async function deleteHoliday(id: string): Promise<CalendarState> {
  const session = await requireCapability("org:manage");
  await prisma.holiday.deleteMany({ where: { id, companyId: session.companyId } });
  revalidatePath(CAL);
  return { ok: true };
}

const AnnouncementSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(140),
  body: z.string().trim().max(1000).optional().or(z.literal("")),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
});

export async function createAnnouncement(
  _prev: CalendarState,
  formData: FormData,
): Promise<CalendarState> {
  const session = await requireCapability("org:manage");
  const parsed = AnnouncementSchema.safeParse({
    title: formData.get("title"),
    body: formData.get("body"),
    date: formData.get("date"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const d = parsed.data;

  await prisma.announcement.create({
    data: {
      companyId: session.companyId,
      title: d.title,
      body: d.body || null,
      date: dateAtUTC(d.date),
    },
  });
  revalidatePath(CAL);
  return { ok: true };
}

export async function deleteAnnouncement(id: string): Promise<CalendarState> {
  const session = await requireCapability("org:manage");
  await prisma.announcement.deleteMany({ where: { id, companyId: session.companyId } });
  revalidatePath(CAL);
  return { ok: true };
}
