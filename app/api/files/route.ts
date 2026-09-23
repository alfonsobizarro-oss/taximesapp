import {proxy} from '@/lib/supabase-proxy';
export const dynamic='force-dynamic';
export async function POST(req:Request){return proxy(req,'files')}
