export const apiFetch=async()=>Response.json({events:[],nextCursor:null});
export const supabase=()=>({auth:{signOut:async()=>{}}});
