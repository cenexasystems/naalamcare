import { MapPin, Clock, Phone, Mail } from "lucide-react";
import { getSettings } from "@/lib/db/queries";
import { APP_NAME } from "@/lib/mode";

export const dynamic = "force-dynamic";

/* Public store page. Every detail comes from Settings → Shop Details, so
   nothing is shown until the owner has filled it in. */
export default async function Home() {
  const shop = await getSettings().catch(() => null);
  const name = shop?.shop_name || APP_NAME;
  const phones = [shop?.phone, shop?.shop_contact_number].filter(Boolean);

  return (
    <div className="min-h-screen bg-[#FFFFFF] text-[#1A1A1A] font-sans flex flex-col justify-between selection:bg-[var(--c-deep)] selection:text-white">
      {/* Header */}
      <header className="border-b border-black/10 py-6 px-6 sm:px-12 flex justify-center items-center bg-white/90 backdrop-blur-md sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-xs p-1 border border-[var(--c-deep)]/30">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logos/nalam-care-medicals-logo.png" alt={`${name} Logo`} className="w-full h-full object-contain" />
          </div>
          <div>
            <span className="text-sm font-black text-[var(--c-deep)] tracking-wider uppercase block">{name}</span>
            <span className="text-[9px] text-[#1a1d21] font-bold tracking-widest block uppercase -mt-0.5">
              Retail &amp; Wholesale Pharmacy
            </span>
          </div>
        </div>
      </header>

      {/* Main Info */}
      <main className="flex-1 max-w-xl mx-auto w-full px-6 flex flex-col justify-center items-center py-16">
        <div className="bg-white border border-[var(--c-deep)]/30 rounded-2xl p-8 sm:p-12 shadow-md w-full text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-[var(--c-deep)] via-[#1a1d21] to-[var(--c-deep)]" />

          <span className="inline-block px-3 py-1 bg-[var(--c-deep)]/10 border border-[var(--c-deep)]/30 text-[var(--c-deep)] text-[10px] font-bold rounded-full tracking-wider uppercase mb-6">
            Store Directory & Contacts
          </span>

          <h1 className="text-3xl font-black text-[var(--c-deep)] leading-tight tracking-tight mb-2 uppercase">{name}</h1>
          <p className="text-xs text-[#1a1d21] font-black tracking-widest uppercase mb-8">
            All Medicines & Surgical Items Available
          </p>

          <div className="space-y-6 text-left max-w-md mx-auto text-sm font-semibold text-[#1A1A1A]/80 border-t border-black/10 pt-8">
            {shop?.address && (
              <div className="flex items-start gap-4">
                <MapPin className="w-5 h-5 text-[var(--c-deep)] shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] font-bold text-black/50 uppercase tracking-wider mb-0.5">Address</p>
                  <p className="text-[#1A1A1A] leading-relaxed">{shop.address}</p>
                </div>
              </div>
            )}

            {phones.length > 0 && (
              <div className="flex items-start gap-4">
                <Phone className="w-5 h-5 text-[var(--c-deep)] shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] font-bold text-black/50 uppercase tracking-wider mb-0.5">Phone Numbers</p>
                  <p className="text-[#1A1A1A]">{phones.join(" · ")}</p>
                </div>
              </div>
            )}

            {shop?.email && (
              <div className="flex items-start gap-4">
                <Mail className="w-5 h-5 text-[var(--c-deep)] shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] font-bold text-black/50 uppercase tracking-wider mb-0.5">Email</p>
                  <p className="text-[#1A1A1A]">{shop.email}</p>
                </div>
              </div>
            )}

            <div className="flex items-start gap-4">
              <Clock className="w-5 h-5 text-[var(--c-deep)] shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] font-bold text-black/50 uppercase tracking-wider mb-0.5">Business Hours</p>
                <p className="text-[#1A1A1A]">Open Daily</p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-black/10 py-6 text-center bg-white">
        <p className="text-[10px] font-bold text-[var(--c-deep)] tracking-widest uppercase">{name}</p>
        <p className="text-[9px] font-semibold text-black/40 uppercase tracking-wider mt-1">
          © {new Date().getFullYear()} All Rights Reserved • Powered by Cenexa Systems
        </p>
      </footer>
    </div>
  );
}
