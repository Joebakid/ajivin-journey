import { sql } from '@/src/lib/db';

// Shared message storage code, used by the chat API routes and the sendMessage / getMessages actions.
// This file is a normal module (not a Server Action file) so it can export helpers freely.

let ready: Promise<void> | null = null;

export async function ensureMessagesTable(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS messages (
          id SERIAL PRIMARY KEY,
          sender_id INTEGER NOT NULL,
          receiver_id INTEGER NOT NULL DEFAULT 0,
          text TEXT,
          parent_id INTEGER,
          parent_text TEXT,
          media_url TEXT,
          media_type TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;

      // Unread tracking. Messages that already exist when this column is first added
      // count as read, so nobody opens the app to hundreds of "unread" messages.
      const col = await sql`
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'messages' AND column_name = 'read_at'
        LIMIT 1
      `;
      if (col.length === 0) {
        try {
          await sql`ALTER TABLE messages ADD COLUMN read_at TIMESTAMPTZ DEFAULT NOW()`;
          await sql`ALTER TABLE messages ALTER COLUMN read_at DROP DEFAULT`;
        } catch {
          /* another request added the column first */
        }
      }

      await sql`CREATE INDEX IF NOT EXISTS idx_messages_pair ON messages (sender_id, receiver_id, id)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages (receiver_id, read_at)`;
    })().catch((err) => {
      ready = null;
      throw err;
    });
  }
  await ready;
}

export interface ChatMessage {
  id: number;
  sender_id: number;
  receiver_id: number;
  text: string;
  created_at: string;
  parent_id: number | null;
  parent_text: string | null;
  media_type: 'image' | 'video' | 'audio' | null;
  media_url: string | null;
  read_at: string | null;
  sender_name: string;
}

/**
 * Messages for one conversation. Media is NOT included: it is served from /api/chat/media/:id,
 * so polling stays small even when the chat contains voice notes and images.
 * peerId 0 = fleet broadcast. afterId lets the client ask only for what is new.
 */
export async function listMessages(userId: number, peerId: number, afterId = 0, limit = 200): Promise<ChatMessage[]> {
  await ensureMessagesTable();
  if (!userId) return [];

  const rows =
    peerId === 0
      ? await sql`
          SELECT m.id, m.sender_id, m.receiver_id, m.text, m.created_at, m.parent_id, m.parent_text,
                 m.media_type, (m.media_url IS NOT NULL) AS has_media, m.read_at, u.name AS sender_name
          FROM messages m
          JOIN users u ON u.id = m.sender_id
          WHERE m.receiver_id = 0 AND m.id > ${afterId}
          ORDER BY m.id DESC
          LIMIT ${limit}
        `
      : await sql`
          SELECT m.id, m.sender_id, m.receiver_id, m.text, m.created_at, m.parent_id, m.parent_text,
                 m.media_type, (m.media_url IS NOT NULL) AS has_media, m.read_at, u.name AS sender_name
          FROM messages m
          JOIN users u ON u.id = m.sender_id
          WHERE ((m.sender_id = ${userId} AND m.receiver_id = ${peerId})
              OR (m.sender_id = ${peerId} AND m.receiver_id = ${userId}))
            AND m.id > ${afterId}
          ORDER BY m.id DESC
          LIMIT ${limit}
        `;

  return rows.reverse().map((r: any) => ({
    id: r.id,
    sender_id: r.sender_id,
    receiver_id: r.receiver_id,
    text: r.text ?? '',
    created_at: r.created_at,
    parent_id: r.parent_id ?? null,
    parent_text: r.parent_text ?? null,
    media_type: r.media_type ?? null,
    media_url: r.has_media ? `/api/chat/media/${r.id}` : null,
    read_at: r.read_at ?? null,
    sender_name: r.sender_name,
  }));
}

export async function insertMessage(input: {
  senderId: number;
  receiverId: number;
  text: string;
  parentId: number | null;
  parentText: string | null;
  media: File | null;
}): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  await ensureMessagesTable();

  const text = input.text ?? '';
  const media = input.media && input.media.size > 0 ? input.media : null;

  if (!input.senderId || (!text.trim() && !media)) {
    return { ok: false, error: 'Message cannot be empty' };
  }

  let mediaUrl: string | null = null;
  let mediaType: string | null = null;

  if (media) {
    const buffer = Buffer.from(await media.arrayBuffer());
    mediaUrl = `data:${media.type};base64,${buffer.toString('base64')}`;
    mediaType = media.type.startsWith('image/')
      ? 'image'
      : media.type.startsWith('video/')
      ? 'video'
      : media.type.startsWith('audio/')
      ? 'audio'
      : null;
  }

  const rows = await sql`
    INSERT INTO messages (sender_id, receiver_id, text, parent_id, parent_text, media_url, media_type, read_at)
    VALUES (${input.senderId}, ${input.receiverId}, ${text}, ${input.parentId}, ${input.parentText}, ${mediaUrl}, ${mediaType}, NULL)
    RETURNING id
  `;
  return { ok: true, id: rows[0].id as number };
}
