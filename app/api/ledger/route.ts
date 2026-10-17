import { NextResponse } from "next/server";
import { getLedger } from "@/lib/db/queries";
import { guardRoute } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Payments, returns and purchase orders for one dashboard. */
export async function GET(request: Request) {
  const guard = await guardRoute(request);
  if (guard instanceof NextResponse) return guard;
  return NextResponse.json(await getLedger(guard.mode));
}
