import {proxy} from '@/lib/supabase-proxy';
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){const {id}=await params;return proxy(req,'files/'+encodeURIComponent(id))}
