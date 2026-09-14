import { redirect } from "next/navigation";
import { getCurrentUser } from "@/infra/auth/session";
import { getPlan } from "@/core/domain/plans";
import { toPublicUser } from "@/lib/serializers";
import { Sidebar } from "@/components/app/sidebar";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/dashboard");

  return (
    <div className="min-h-dvh">
      <Sidebar user={toPublicUser(user)} plan={getPlan(user.plan)} />
      <div className="lg:pl-[260px]">
        <main id="main" className="mx-auto max-w-[1400px] px-4 py-6 sm:px-7 sm:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
