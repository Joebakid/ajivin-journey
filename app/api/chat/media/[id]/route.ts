import { sql } from '@/src/lib/db';

export const dynamic = 'force-dynamic';

// Serves an image / video / voice note that belongs to a message.
// Supports Range requests so audio and video can seek.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const messageId = parseInt(id, 10);
  if (!messageId) return new Response('Not found', { status: 404 });

  try {
    const rows = await sql`SELECT media_url FROM messages WHERE id = ${messageId} AND media_url IS NOT NULL`;
    const dataUrl: string | undefined = rows[0]?.media_url;
    const comma = dataUrl ? dataUrl.indexOf(',') : -1;
    if (!dataUrl || !dataUrl.startsWith('data:') || comma === -1) {
      return new Response('Not found', { status: 404 });
    }

    const mime = dataUrl.slice(5, comma).split(';')[0] || 'application/octet-stream';
    const buffer = Buffer.from(dataUrl.slice(comma + 1), 'base64');
    const total = buffer.length;

    const baseHeaders: Record<string, string> = {
      'Content-Type': mime,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=31536000, immutable',
    };

    const range = request.headers.get('range');
    const match = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
    if (match) {
      let start = match[1] ? parseInt(match[1], 10) : 0;
      let end = match[2] ? parseInt(match[2], 10) : total - 1;
      if (!match[1] && match[2]) {
        start = Math.max(0, total - parseInt(match[2], 10)); // "last N bytes"
        end = total - 1;
      }
      end = Math.min(end, total - 1);

      if (start > end || start >= total) {
        return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${total}` } });
      }
      const chunk = buffer.subarray(start, end + 1);
      return new Response(new Uint8Array(chunk), {
        status: 206,
        headers: { ...baseHeaders, 'Content-Range': `bytes ${start}-${end}/${total}`, 'Content-Length': String(chunk.length) },
      });
    }

    return new Response(new Uint8Array(buffer), { headers: { ...baseHeaders, 'Content-Length': String(total) } });
  } catch (error) {
    console.error('Failed to serve media:', error);
    return new Response('Failed to load media', { status: 500 });
  }
}
