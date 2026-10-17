import { redirect } from "next/navigation";

/* The POS used to live here before the rename to Nalam Care Medicals. Keep the
   old address working for bookmarks and installed home-screen shortcuts. */
export default function LegacyPosRoute() {
  redirect("/pos/admin/secure/control-panel/nalam-care-medicals");
}
