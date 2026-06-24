import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Vận hành Platform Dashboard", description: "Import Excel files and visualize data as interactive charts" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (<html lang="en"><body>{children}</body></html>);
}
