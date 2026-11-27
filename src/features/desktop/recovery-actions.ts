"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guard";
import { isDesktop } from "@/lib/desktop";
import { dismissRecoveryNote } from "@/lib/local-db/pg";

export async function dismissRecoveryAction(): Promise<void> {
  const auth = await requireUser();
  if (!isDesktop() || !auth.ok) return;
  dismissRecoveryNote(auth.user.id);
  revalidatePath("/");
}
