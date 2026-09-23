import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Taximés · Delegados", description: "Flota, incidencias y coordinación de delegados de Taximés.", manifest: "/manifest.webmanifest", icons: {icon: "/favicon.svg", apple: "/icon-192.png"} };
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="es"><body>{children}</body></html>}
