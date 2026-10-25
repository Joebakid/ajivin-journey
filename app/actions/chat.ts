'use server';

import { insertMessage, listMessages } from '@/src/lib/messagesDb';

// The chat screen now uses the /api/chat/* routes (they run in parallel instead of queueing
// behind other Server Actions). These two actions are kept so any other code that still imports
// them keeps working.

export async function sendMessage(formData: FormData) {
  try {
    const senderId = parseInt(formData.get('senderId') as string, 10);
    const receiverId = parseInt(formData.get('receiverId') as string, 10) || 0;
    const parentIdRaw = formData.get('parentId');
    const media = formData.get('media');

    const result = await insertMessage({
      senderId,
      receiverId,
      text: (formData.get('text') as string) || '',
      parentId: parentIdRaw ? parseInt(parentIdRaw as string, 10) : null,
      parentText: (formData.get('parentText') as string) || null,
      media: media instanceof File ? media : null,
    });

    if (!result.ok) return { error: result.error };
    return { success: true };
  } catch (error) {
    console.error('Failed to send message:', error);
    throw new Error('Failed to send message');
  }
}

/**
 * - userId2 === 0: company fleet broadcast.
 * - userId2 > 0: strict 1-on-1 messages between userId1 and userId2 only.
 */
export async function getMessages(userId1: number, userId2: number) {
  try {
    return await listMessages(userId1, userId2);
  } catch (error) {
    console.error('Failed to fetch messages:', error);
    return [];
  }
}
