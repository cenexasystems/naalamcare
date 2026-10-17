import { NextResponse } from "next/server";
import { listMedicines } from "@/lib/db/queries";
import { guardRoute } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Shared catalogue, joined with the requested dashboard's batches only. */
export async function GET(request: Request) {
  const guard = await guardRoute(request);
  if (guard instanceof NextResponse) return guard;
  return NextResponse.json(await listMedicines(guard.mode));
}
