import Link from "next/link";
import { applyModeShopDetails, getBill, getBillReturns, getModeSettings, getSettings } from "@/lib/db/queries";
import { billShareToken, getSession, isValidBillShareToken } from "@/lib/auth";
import { APP_NAME } from "@/lib/mode";
import { amount, amountInWords, dateSlash, monthShort, money } from "@/lib/format";
import type { Bill, BillItem } from "@/lib/types";
import { InvoiceActions } from "./InvoiceActions";
import { InvoiceFit } from "./InvoiceFit";
import { InvoicePromoPopup } from "@/components/pms/InvoicePromoPopup";

/* ==========================================================================
   A4 GST Tax Invoice

   Layout mirrors the sample bill the shop handed us: a boxed header with the
   GST / Drug-licence numbers on the right, a "Tax Invoice" banner, the
   customer block, a wide item grid (pack, mfr, batch, exp, MRP, qty, free,
   rate, disc, GST%, amount, HSN), a totals block, the GST-rate breakup
   table, net amount in words and the authorised-signature footer.
   ========================================================================== */

const GST_SLABS = [0, 5, 12, 18, 28];

/** "15GM UNI" style pack descriptor — pack size + unit abbreviation. */
const packLabel = (item: BillItem): string => {
  const unit = item.purchase_unit_type === "Strip" ? "UNI" : item.purchase_unit_type.slice(0, 3).toUpperCase();
  return `${item.pack_size || 1}${unit}`;
};

/** Manufacturer shown as an initial-style short code, e.g. "UNI" / "MAC". */
const mfrLabel = (item: BillItem): string => {
  const maker = item.manufacturer?.trim();
  if (!maker) return "";
  return maker.replace(/[^A-Za-z ]/g, "").trim().slice(0, 10);
};

/** Share of the selling-price total actually charged after bill-level discounts (offers, counter discount). */
const chargedFactor = (bill: Bill): number => {
  const lines = linesTotal(bill);
  return lines > 0 ? bill.grand_total / lines : 1;
};

/** What this line actually cost the customer, after every discount. */
const netLineAmount = (bill: Bill, item: BillItem): number => (Number(item.line_amount) || 0) * chargedFactor(bill);

/** Total discount on the line as a % of its MRP: MRP-to-selling plus the bill's offers / counter discount. */
const discPercent = (bill: Bill, item: BillItem): number =>
  item.line_mrp > 0 ? Math.max(0, ((item.line_mrp - netLineAmount(bill, item)) / item.line_mrp) * 100) : 0;


/** Selling-price total of the lines, before any counter discount. */
const linesTotal = (bill: Bill): number =>
  bill.items.reduce((sum, i) => sum + (Number(i.line_amount) || 0), 0);

const totalQty = (bill: Bill): number => bill.items.reduce((sum, i) => sum + (Number(i.qty) || 0), 0);

/** Sales value + tax contained within them, bucketed per GST slab. */
const gstBreakup = (bill: Bill) =>
  GST_SLABS.map((slab) => {
    const lines = bill.items.filter((i) => Math.round(Number(i.gst_percent)) === slab);
    const sales = lines.reduce((s, i) => s + (Number(i.line_amount) || 0), 0);
    const tax = lines.reduce((s, i) => s + gstOf(i), 0);
    // Slabs with no items on this bill print blank rather than 0.00.
    return { slab, sales, tax, used: lines.length > 0 };
  });

/** GST is already contained in the selling price (MRP-inclusive). */
const gstOf = (item: BillItem): number => {
  const pct = Number(item.gst_percent) || 0;
  const amount = Number(item.line_amount) || 0;
  return amount - amount / (1 + pct / 100);
};

const DEFAULT_TERMS = [
  "Please check your bill, product expiry, quantity and batch before leaving.",
  "Product replacement within 7 days.",
];

export default async function InvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);
  const { t: shareToken } = await searchParams;
  const session = await getSession();
  // A customer opening the link we sent them (WhatsApp) carries a signed token for this bill only.
  const sharedView = !session && isValidBillShareToken(id, shareToken);
  const found = session || sharedView ? await getBill(id) : null;
  // Invoices are business records: only a signed-in user with access to the
  // bill's dashboard (or a valid share link) may open one. Anything else reads as "not found".
  const bill = found && found.mode && (sharedView || session?.modes.includes(found.mode)) ? found : null;
  const sharePath = bill ? `/invoice/${encodeURIComponent(bill.id)}?t=${billShareToken(bill.id)}` : "";
  const modeSettings = bill?.mode ? await getModeSettings(bill.mode) : null;
  // Retail and wholesale each print their own shop name, address, phones, GSTIN and licence.
  const shopWide = await getSettings();
  const shop = shopWide && modeSettings ? applyModeShopDetails(shopWide, modeSettings) : shopWide;
  const wholesale = bill?.mode === "wholesale";
  // Returns change what the customer finally paid: the invoice lists them and shows the revised total.
  const returns = bill && bill.returned_amount > 0 ? await getBillReturns(bill.id) : [];
  const revisedTotal = bill ? Math.max(0, bill.grand_total - bill.returned_amount) : 0;
  /** MRP value of everything on the bill minus what the customer paid: every discount together. */
  const savedAmount = bill ? Math.max(0, Math.round((bill.sub_total - bill.grand_total) * 100) / 100) : 0;
  const terms = (modeSettings?.invoice_terms || "")
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean);

  if (!session && !sharedView) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white px-4 text-center">
        <p className="text-xl font-bold text-[var(--c-deep)]">Please log in</p>
        <p className="max-w-sm text-[13px] text-gray-500">Invoices can be opened by signed-in staff only.</p>
        <Link
          href="/"
          className="rounded-lg border border-[#d8dde3] bg-white px-6 py-2.5 text-sm font-semibold text-gray-800 transition hover:bg-gray-50"
        >
          Go to login
        </Link>
      </div>
    );
  }

  if (!bill) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white px-4 text-center">
        <p className="text-xl font-bold text-[var(--c-deep)]">Bill Not Found</p>
        <p className="max-w-sm text-[13px] text-gray-500">
          Bill ID &quot;{id}&quot; was not found in the dashboards you can access.
        </p>
        <Link
          href="/"
          className="rounded-lg border border-[#d8dde3] bg-white px-6 py-2.5 text-sm font-semibold text-gray-800 transition hover:bg-gray-50"
        >
          Return home
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-[#f7f8fa] px-4 py-8 print:bg-white print:p-0">
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 8mm; }
          html, body {
            background: #fff !important;
            width: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            font-family: "Segoe UI", Arial, sans-serif !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .invoice-sheet { width: 100% !important; padding: 0 !important; box-shadow: none !important; }
          .inv-break { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>

      <div className="mb-5 flex w-full max-w-3xl justify-end no-print">
        <InvoiceActions
          sharePath={sharePath}
          canShare={!sharedView}
          phone={bill.customer_phone}
          message={`${shop?.shop_name || APP_NAME} — Invoice ${bill.id} dated ${dateSlash(bill.bill_date)}, amount ${money(revisedTotal)}.`}
        />
      </div>

      {/* Offer pop-up for customers opening the link we sent them — not for staff, never printed. */}
      {sharedView && modeSettings?.invoice_promo.enabled && (
        <InvoicePromoPopup promo={modeSettings.invoice_promo} shopName={shop?.shop_name || APP_NAME} />
      )}
      <InvoiceFit>
      {/* A full A4 page: at least 297mm tall on screen (281mm inside the 8mm print margins); the item grid stretches to fill it. */}
      <div className="invoice-sheet flex min-h-[297mm] w-full flex-col bg-white p-4 text-black shadow-sm print:min-h-[279mm] print:p-0">
        {/* ---------- Header: shop identity left, GST / DL numbers right ---------- */}
        <div className="flex items-start justify-between gap-6 border-b-2 border-black pb-2">
          <div className="text-[10.5px] leading-[1.35]">
            <h1 className="text-[20px] font-bold uppercase tracking-wide">{shop?.shop_name || APP_NAME}</h1>
            <p className="mt-0.5 max-w-[330px]">{shop?.address}</p>
            {shop?.shop_contact_number && <p>Mobile: {shop.shop_contact_number}</p>}
            {shop?.phone && <p>Phone: {shop.phone}</p>}
          </div>
          <div className="shrink-0 text-right text-[10px] font-bold leading-[1.5]">
            <p>GST No: {shop?.gstin}</p>
            <p>DL NO: {shop?.dl_no}</p>
          </div>
        </div>

        {/* ---------- Tax Invoice banner + invoice meta ---------- */}
        <div className="flex items-start justify-between gap-4 border-b border-black py-1.5 text-[10.5px]">
          <div className="w-[34%]">
            <p>{wholesale ? "Pharmacy Name" : "Customer Name"} : <span className="font-bold">{bill.customer_name || ""}</span></p>
            <p className="mt-3">Mob : {bill.customer_phone || ""}</p>
            <p>Cust. ID : {bill.customer_id || ""}</p>
            <p>Address : {bill.customer_address}</p>
          </div>

          <div className="flex-1 text-center">
            <h2 className="text-[17px] font-bold underline">Tax Invoice</h2>
            {wholesale && <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide">Wholesale</p>}
          </div>

          <div className="w-[34%] text-[10.5px] leading-[1.5]">
            <p>
              Inv No : <span className="font-bold">{bill.id}</span>
              <span className="float-right">Page No. : 1 / 1</span>
            </p>
            <p>Date : {dateSlash(bill.bill_date)}</p>
            <p>Payment Mode : {bill.payment_method}</p>
            {!wholesale && <p>Prescription No. : {bill.prescription_no}</p>}
            <p>Due Date : {dateSlash(bill.due_date || bill.bill_date)}</p>
            {!wholesale && <p>Doctor : {bill.doctor_name}</p>}
            <p>Billed By : {bill.billed_by}</p>
          </div>
        </div>

        {/* ---------- Wholesale only: the pharmacy's GSTIN and ship-to (retail shows the customer above) ---------- */}
        {wholesale && (
          <div className="border-b border-black py-1.5 text-[10.5px] leading-[1.45]">
            <p className="font-bold uppercase underline">{bill.customer_name}</p>
            {bill.customer_gstin && <p className="mt-1">GST No. : {bill.customer_gstin}</p>}
            {bill.shipping_address && bill.shipping_address !== bill.customer_address && (
              <p className="mt-1">
                <span className="font-bold">Ship to :</span> {bill.shipping_address}
              </p>
            )}
          </div>
        )}

        {/* ---------- Items grid (grows to fill the page, column lines run to the bottom) ---------- */}
        <div className="flex min-h-[60mm] flex-1 flex-col">
        <table className="h-full w-full flex-1 border-collapse text-[9.5px] leading-[1.3]">
          <thead>
            <tr className="bg-[#d9d9d9]">
              {["No", "Type", "Product Name", "Pack", "Mfr", "Batch", "Exp", "MRP", "Qty", "Rate", "Disc %", "GST%", "Amount", "HSN"].map((h) => (
                <th key={h} className="border border-black px-1 py-1 text-center font-bold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bill.items.map((item, index) => (
              <tr key={item.id} className="h-px align-top">
                <td className="border border-black px-1 py-0.5 text-center">{index + 1}</td>
                <td className="border border-black px-1 py-0.5 text-center">{item.product_type || item.purchase_unit_type}</td>
                <td className="border border-black px-1 py-0.5">
                  <p className="font-bold uppercase">{item.generic_name}</p>
                  {item.brand_name && <p>{item.brand_name}</p>}
                  {item.schedule && <p className="text-[8.5px]">[{item.schedule}]</p>}
                </td>
                <td className="border border-black px-1 py-0.5 text-center">{packLabel(item)}</td>
                <td className="border border-black px-1 py-0.5 text-center">{mfrLabel(item)}</td>
                <td className="border border-black px-1 py-0.5 text-center">{item.batch_no}</td>
                <td className="border border-black px-1 py-0.5 text-center">{monthShort(item.exp_date)}</td>
                <td className="border border-black px-1 py-0.5 text-right">{amount(item.mrp_per_unit)}</td>
                <td className="border border-black px-1 py-0.5 text-right">{item.qty}</td>
                <td className="border border-black px-1 py-0.5 text-right">{amount(item.per_unit_price)}</td>
                <td className="border border-black px-1 py-0.5 text-center">{discPercent(bill, item).toFixed(2)}%</td>
                <td className="border border-black px-1 py-0.5 text-center">{amount(item.gst_percent)}</td>
                <td className="border border-black px-1 py-0.5 text-right font-bold">{amount(netLineAmount(bill, item))}</td>
                <td className="border border-black px-1 py-0.5 text-center">{item.hsn_code}</td>
              </tr>
            ))}
            <tr className="h-full">
              {Array.from({ length: 14 }, (_, i) => (
                <td key={i} className="border-x border-b border-black" />
              ))}
            </tr>
          </tbody>
        </table>
        </div>

        {/* ---------- Returns against this bill ---------- */}
        {returns.length > 0 && (
          <div className="inv-break mt-1 border border-black text-[9.5px]">
            <p className="bg-[#d9d9d9] px-1 py-0.5 font-bold">Returns</p>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {["Date", "Product Name", "Batch", "Qty Returned", "Amount", "Refund"].map((h) => (
                    <th key={h} className="border border-black px-1 py-0.5 text-center font-bold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {returns.flatMap((r) =>
                  r.items.map((it, n) => (
                    <tr key={`${r.id}-${n}`}>
                      <td className="border border-black px-1 py-0.5 text-center">{dateSlash(r.created_at.slice(0, 10))}</td>
                      <td className="border border-black px-1 py-0.5 font-bold uppercase">{it.generic_name}</td>
                      <td className="border border-black px-1 py-0.5 text-center">{it.batch_no}</td>
                      <td className="border border-black px-1 py-0.5 text-right">{it.qty}</td>
                      <td className="border border-black px-1 py-0.5 text-right">{amount(it.amount)}</td>
                      <td className="border border-black px-1 py-0.5 text-center">
                        {n === 0 ? (r.refund_amount > 0 ? `${amount(r.refund_amount)} ${r.refund_method}` : "Adjusted in due") : ""}
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
            {!sharedView && (
              <p className="no-print border-t border-black px-1 py-1 print:hidden">
                Return bills:{" "}
                {returns.map((r) => (
                  <Link key={r.id} href={`/return/${r.id}`} className="mr-3 font-bold text-[#1f6feb] underline">
                    R-{r.id.replace(/-/g, "").slice(0, 8).toUpperCase()}
                  </Link>
                ))}
              </p>
            )}
          </div>
        )}

        {/* ---------- Totals + GST breakup ---------- */}
        <div className="inv-break mt-1 flex items-stretch text-[9.5px]">
          <div className="w-[38%] border border-black p-1">
            <p>Total Qty : {totalQty(bill)}</p>
            <p className="mt-6">Total Items : {bill.items.length}</p>
          </div>

          <div className="w-[62%]">
            <table className="w-full border-collapse">
              <tbody>
                <tr>
                  <td className="border border-black px-1 py-0.5">Sub Total (MRP)</td>
                  <td className="w-[70px] border border-black px-1 py-0.5 text-right">{amount(bill.sub_total)}</td>
                </tr>
                <tr>
                  <td className="border border-black px-1 py-0.5">
                    Discount{bill.sub_total > 0 && savedAmount > 0 ? ` (${((savedAmount / bill.sub_total) * 100).toFixed(2)}%)` : ""}
                  </td>
                  <td className="border border-black px-1 py-0.5 text-right">{amount(Math.max(0, bill.sub_total - bill.grand_total))}</td>
                </tr>
                <tr>
                  <td className="border border-black px-1 py-0.5">Tax Amount</td>
                  <td className="border border-black px-1 py-0.5 text-right">{amount(bill.gst_amount)}</td>
                </tr>
                <tr>
                  <td className="border border-black px-1 py-0.5">Taxable Amount</td>
                  <td className="border border-black px-1 py-0.5 text-right">{amount(bill.taxable_amount)}</td>
                </tr>
                <tr>
                  <td className="border border-black px-1 py-0.5">Amount Received</td>
                  <td className="border border-black px-1 py-0.5 text-right">{amount(bill.received_amount)}</td>
                </tr>
                <tr>
                  <td className="border border-black px-1 py-0.5">Change Returned</td>
                  <td className="border border-black px-1 py-0.5 text-right">{amount(Math.max(0, bill.change_amount))}</td>
                </tr>
                {!wholesale && savedAmount > 0 && (
                  <tr>
                    <td className="border border-black px-1 py-0.5 font-bold">You Saved (vs MRP)</td>
                    <td className="border border-black px-1 py-0.5 text-right font-bold">{amount(savedAmount)}</td>
                  </tr>
                )}
                {bill.returned_amount > 0 && (
                  <>
                    <tr>
                      <td className="border border-black px-1 py-0.5">Less: Returns</td>
                      <td className="border border-black px-1 py-0.5 text-right">−{amount(bill.returned_amount)}</td>
                    </tr>
                    <tr>
                      <td className="border border-black px-1 py-0.5 font-bold">Revised Net Amount</td>
                      <td className="border border-black px-1 py-0.5 text-right font-bold">{amount(revisedTotal)}</td>
                    </tr>
                  </>
                )}
                {bill.due_amount > 0 && (
                  <tr>
                    <td className="border border-black px-1 py-0.5 font-bold">Balance Due</td>
                    <td className="border border-black px-1 py-0.5 text-right font-bold">{amount(bill.due_amount)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="inv-break mt-1 border border-black text-[9.5px]">
          {/* GST-rate breakup: wholesale (B2B) invoices only */}
          {wholesale && (
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[#d9d9d9]">
                <th className="border border-black px-1 py-0.5" />
                {gstBreakup(bill).map(({ slab }) => (
                  <th key={slab} className="border border-black px-1 py-0.5 text-center">GST-{slab}%</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-black px-1 py-0.5">Sales</td>
                {gstBreakup(bill).map(({ slab, sales, used }) => (
                  <td key={`sales-${slab}`} className="border border-black px-1 py-0.5 text-right">{used ? amount(sales) : ""}</td>
                ))}
              </tr>
              <tr>
                <td className="border border-black px-1 py-0.5">GST/GST</td>
                {gstBreakup(bill).map(({ slab, tax, used }) => (
                  <td key={`tax-${slab}`} className="border border-black px-1 py-0.5 text-right">{used ? amount(tax) : ""}</td>
                ))}
              </tr>
              <tr>
                <td className="border border-black px-1 py-0.5">CGST</td>
                {gstBreakup(bill).map(({ slab, tax, used }) => (
                  <td key={`cgst-${slab}`} className="border border-black px-1 py-0.5 text-right">{used ? amount(tax / 2) : ""}</td>
                ))}
              </tr>
              <tr>
                <td className="border border-black px-1 py-0.5">SGST</td>
                {gstBreakup(bill).map(({ slab, tax, used }) => (
                  <td key={`sgst-${slab}`} className="border border-black px-1 py-0.5 text-right">{used ? amount(tax / 2) : ""}</td>
                ))}
              </tr>
            </tbody>
          </table>
          )}
          <div className="flex items-center justify-between border-t border-black px-1 py-0.5">
            <span>Due bills :</span>
            <span className="font-bold">{bill.returned_amount > 0 ? "Revised Net Amount" : "Net Amount"}</span>
          </div>
          <div className="flex items-center justify-end gap-3 px-1 py-1">
            {bill.returned_amount > 0 && (
              <span className="text-[10px] text-gray-700">
                {money(bill.grand_total)} − returns {money(bill.returned_amount)} =
              </span>
            )}
            <span className="text-[17px] font-bold">{money(revisedTotal)}</span>
          </div>
        </div>

        {!wholesale && savedAmount > 0 && (
          <p className="inv-break mt-1 rounded border border-black px-2 py-1 text-center text-[11px] font-bold">
            You saved {money(savedAmount)} on this bill (MRP {money(bill.sub_total)} − you paid {money(bill.grand_total)})
          </p>
        )}

        {/* ---------- Amount in words ---------- */}
        <p className="mt-1 text-[9.5px] uppercase">{amountInWords(revisedTotal)}</p>

        {/* ---------- Terms + signature ---------- */}
        <div className="inv-break mt-2 flex items-end justify-between gap-6 text-[9px] leading-[1.4]">
          <div>
            <p className="font-bold">Terms &amp; Conditions</p>
            {(terms.length ? terms : DEFAULT_TERMS).map((t, i) => (
              <p key={i}>
                {i + 1}. {t}
              </p>
            ))}
          </div>
          <div className="w-[46%] text-center">
            <p className="font-bold">For {shop?.shop_name || APP_NAME}</p>
            <div className="mt-10 border-b border-black" />
            <p>Authorised Signatory</p>
          </div>
        </div>
      </div>
      </InvoiceFit>
    </div>
  );
}
