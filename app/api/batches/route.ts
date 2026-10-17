import { NextResponse } from "next/server";
import { listBatchRows } from "@/lib/db/queries";
import { guardRoute } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = await guardRoute(request);
  if (guard instanceof NextResponse) return guard;
  return NextResponse.json(await listBatchRows(guard.mode));
}
