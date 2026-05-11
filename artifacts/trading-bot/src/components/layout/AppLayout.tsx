import { Sidebar } from "./Sidebar";
import { ReactNode } from "react";

export function AppLayout({ children, fullHeight }: { children: ReactNode; fullHeight?: boolean }) {
  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        {fullHeight ? (
          <div className="flex-1 flex flex-col min-h-0">
            {children}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 md:p-8">
            <div className="mx-auto max-w-7xl">
              {children}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
