"use client";
import {useEffect,useState} from 'react';
import {Paperclip} from 'lucide-react';
import {apiFetch} from '@/lib/supabase-client';
import type {Item} from '@/lib/model';
export default function PrivateFile({file}:{file:Item}){
  const [url,setUrl]=useState(''),[error,setError]=useState(false),[requested,setRequested]=useState(false);
  useEffect(()=>{if(!requested)return;let active=true,objectUrl='';
    apiFetch('/api/files/'+encodeURIComponent(file.id)).then(async r=>{if(!r.ok)throw Error();return r.blob()}).then(blob=>{if(active){objectUrl=URL.createObjectURL(blob);setUrl(objectUrl)}}).catch(()=>{if(active)setError(true)});
    return()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl)};
  },[file.id,requested]);
  return <div className="attachment">{url?(file.type?.startsWith('audio/')?<audio controls src={url}/>:<a href={url} download={file.name}><Paperclip size={15}/>{file.name}</a>):<button type="button" onClick={()=>setRequested(true)} disabled={requested}>{error?'No se ha podido cargar':requested?'Cargando…':file.name}</button>}</div>;
}
