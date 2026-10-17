import { NextResponse } from "next/server";
import { getReconciliation } from "@/lib/db/queries";
import { guardRoute } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Legacy rows from before the retail / wholesale split. Admin only. */
export async function GET(request: Request) {
  const guard = await guardRoute(request);
  if (guard instanceof NextResponse) return guard;
  if (guard.session.role !== "admin") {
    return NextResponse.json({ error: "Only an admin can reconcile records." }, { status: 403 });
  }
  return NextResponse.json(await getReconciliation());
}
