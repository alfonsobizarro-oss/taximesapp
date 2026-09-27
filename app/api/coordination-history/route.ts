import {proxy} from '@/lib/supabase-proxy';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  const before = new URL(req.url).searchParams.get('before');
  if (before !== null && !/^\d{1,18}$/.test(before)) return Response.json({error: 'Página no válida.'}, {status: 400});
  return proxy(req, 'coordination-history' + (before ? '?before=' + encodeURIComponent(before) : ''));
}
