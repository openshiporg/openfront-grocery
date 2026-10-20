'use server';
import { revalidatePath } from 'next/cache';
import { keystoneClient } from '@/features/platform/lib/platformClient';

const STATUSES = ['new', 'in_progress', 'replied', 'closed'];

/** Staff follow-up on a customer message; only status and internal notes are writable. */
export async function updateContactMessage(input: { id: string; status: string; staffNotes: string }) {
  if (!STATUSES.includes(input.status)) return { ok: false as const, error: 'Choose a valid status' };
  const result = await keystoneClient('mutation($id:ID!,$data:ContactMessageUpdateInput!){updateContactMessage(where:{id:$id},data:$data){id status}}', { id: input.id, data: { status: input.status, staffNotes: input.staffNotes.slice(0, 5000) } });
  if (!result.success) return { ok: false as const, error: result.error || 'The message could not be updated' };
  revalidatePath('/dashboard/platform/messages');
  return { ok: true as const };
}
