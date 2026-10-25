import { NextResponse } from 'next/server';
import { insertMessage } from '@/src/lib/messagesDb';

export const dynamic = 'force-dynamic';

// POST multipart/form-data: senderId, receiverId, text, parentId?, parentText?, media?
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const media = form.get('media');
    const parentId = form.get('parentId');

    const result = await insertMessage({
      senderId: parseInt(String(form.get('senderId') ?? ''), 10),
      receiverId: parseInt(String(form.get('receiverId') ?? '0'), 10) || 0,
      text: String(form.get('text') ?? ''),
      parentId: parentId ? parseInt(String(parentId), 10) : null,
      parentText: form.get('parentText') ? String(form.get('parentText')) : null,
      media: media instanceof File ? media : null,
    });

    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, id: result.id });
  } catch (error) {
    console.error('Failed to send message:', error);
    return NextResponse.json({ ok: false, error: 'Failed to send message' }, { status: 500 });
  }
}
