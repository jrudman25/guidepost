import { AppSidebar } from "@/components/app-sidebar";

export default function AppLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex min-h-screen">
            <AppSidebar />
            <main className="flex-1 pl-64">
                <div className="mx-auto max-w-6xl px-8 py-8">{children}</div>
            </main>
        </div>
    );
}
