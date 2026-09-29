import {proxy} from '@/lib/supabase-proxy';
export const dynamic='force-dynamic';
export async function GET(req:Request){return proxy(req,'reservation-history'+new URL(req.url).search)}
