"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseAsiaSaigon } from "@/lib/time";

export type EventFormState = { error: string | null };

function readRequired(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing required field: ${key}`);
  }
  return value;
}

function readOptional(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (typeof value !== "string" || value.trim() === "") return null;
  return value;
}

export async function createEvent(
  _prevState: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be logged in." };
  }

  let start_at: string;
  try {
    const title = readRequired(formData, "title");
    start_at = parseAsiaSaigon(readRequired(formData, "start_at")).toISOString();
    const description = readOptional(formData, "description");
    const location = readOptional(formData, "location");
    const endAtRaw = readOptional(formData, "end_at");
    const end_at = endAtRaw ? parseAsiaSaigon(endAtRaw).toISOString() : null;
    const offsetRaw = readOptional(formData, "remind_offset_minutes");
    const remind_offset_minutes = offsetRaw ? Number(offsetRaw) : undefined;

    const { error } = await supabase.from("events").insert({
      title,
      description,
      location,
      start_at,
      end_at,
      created_by: user.id,
      ...(remind_offset_minutes !== undefined ? { remind_offset_minutes } : {}),
    });

    if (error) {
      return { error: error.message };
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Invalid form input." };
  }

  revalidatePath("/events");
  redirect("/events");
}

export async function deleteEvent(eventId: string): Promise<void> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("You must be logged in.");
  }

  const { error } = await supabase.from("events").delete().eq("id", eventId);
  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/events");
  redirect("/events");
}
