import { NextResponse } from "next/server";
import { getScopedSettings } from "@/lib/db/queries";
import { guardRoute } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Shared shop details merged with the requested dashboard's own settings. */
export async function GET(request: Request) {
  const guard = await guardRoute(request);
  if (guard instanceof NextResponse) return guard;
  return NextResponse.json(await getScopedSettings(guard.mode));
}
