import React from 'react';
import {createRoot} from 'react-dom/client';
import AuthGate from '../../app/auth-gate';
import '../../app/globals.css';
const root = createRoot(document.getElementById('root')!);
root.render(<><aside style={{padding:8,background:'#43301c',color:'white'}}>PRUEBA LOCAL · Sin correos ni conexión a producción. Admin: admin@example.test. OTP válido: 012345.</aside><AuthGate/></>);
const hot = (import.meta as ImportMeta & {hot?: {dispose(fn: () => void): void}}).hot;
hot?.dispose(() => root.unmount());
