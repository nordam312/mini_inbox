'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import {
  handBackConversation,
  sendOperatorReply,
  takeOverConversation,
} from '@/lib/api';
import { actionErrorCode, ActionErrorCode, dashboardHref } from '@/lib/utils';

interface ActionTarget {
  tenantId: string;
  conversationId: string;
}

function readTarget(formData: FormData): ActionTarget {
  return {
    tenantId: String(formData.get('tenantId')),
    conversationId: String(formData.get('conversationId')),
  };
}

/**
 * Runs an action and always ends on the dashboard, carrying any failure in the
 * URL. Without this a write against a dead API throws out of the server action
 * and the operator sees a framework error page instead of what went wrong.
 *
 * redirect() signals by throwing, so it is called outside the try block.
 */
async function runAction(
  target: ActionTarget,
  action: () => Promise<unknown>,
): Promise<never> {
  let failure: ActionErrorCode | undefined;

  try {
    await action();
  } catch (error) {
    failure = actionErrorCode(error);
  }

  revalidatePath('/');
  redirect(dashboardHref(target.tenantId, target.conversationId, failure));
}

export async function takeOverAction(formData: FormData): Promise<void> {
  const target = readTarget(formData);

  await runAction(target, () =>
    takeOverConversation(target.tenantId, target.conversationId),
  );
}

export async function handBackAction(formData: FormData): Promise<void> {
  const target = readTarget(formData);

  await runAction(target, () =>
    handBackConversation(target.tenantId, target.conversationId),
  );
}

export async function replyAction(formData: FormData): Promise<void> {
  const target = readTarget(formData);
  const text = String(formData.get('text') ?? '').trim();

  // An empty box is a slip, not a failure worth reporting.
  if (text.length === 0) {
    redirect(dashboardHref(target.tenantId, target.conversationId));
  }

  await runAction(target, () =>
    sendOperatorReply(target.tenantId, target.conversationId, text),
  );
}

/** The refresh button. No websockets, no polling - the operator asks. */
export async function refreshAction(): Promise<void> {
  revalidatePath('/');
}
