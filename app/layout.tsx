import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Staff Taximés", description: "Coordinación, comunicación e incidencias del equipo de Taximés.", manifest: "/manifest.webmanifest", applicationName: "Staff Taximés", appleWebApp: {title: "Staff Taximés"}, icons: {icon: "/favicon.svg", apple: "/icon-192.png"} };
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="es"><body>{children}</body></html>}
