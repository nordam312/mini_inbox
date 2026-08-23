'use server';

import { revalidatePath } from 'next/cache';

import { sendOperatorReply, takeOverConversation } from '@/lib/api';

export async function takeOverAction(formData: FormData): Promise<void> {
  const tenantId = String(formData.get('tenantId'));
  const conversationId = String(formData.get('conversationId'));

  await takeOverConversation(tenantId, conversationId);
  revalidatePath('/');
}

export async function replyAction(formData: FormData): Promise<void> {
  const tenantId = String(formData.get('tenantId'));
  const conversationId = String(formData.get('conversationId'));
  const text = String(formData.get('text') ?? '').trim();

  if (text.length === 0) {
    return;
  }

  await sendOperatorReply(tenantId, conversationId, text);
  revalidatePath('/');
}

/** The refresh button. No websockets, no polling - the operator asks. */
export async function refreshAction(): Promise<void> {
  revalidatePath('/');
}
