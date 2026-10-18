import Link from "next/link";
import { applyModeShopDetails, getBill, getModeSettings, getSettings } from "@/lib/db/queries";
import { getSession } from "@/lib/auth";
import { APP_NAME } from "@/lib/mode";
import { amount, amountInWords, dateSlash, monthShort, money } from "@/lib/format";
import type { Bill, BillItem } from "@/lib/types";
import { InvoiceActions } from "./InvoiceActions";

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

const discPercent = (item: BillItem): number =>
  item.line_mrp > 0 ? (item.line_discount / item.line_mrp) * 100 : 0;

const GENDER: Record<string, string> = { M: "Male", F: "Female", O: "Other" };

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

const DEFAULT_TERMS = ["Goods once sold will not be taken back.", "Please check Batch No, Qty, Exp before taking delivery."];

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);
  const session = await getSession();
  const found = session ? await getBill(id) : null;
  // Invoices are business records: only a signed-in user with access to the
  // bill's dashboard may open one. Anything else reads as "not found".
  const bill = found && found.mode && session?.modes.includes(found.mode) ? found : null;
  const modeSettings = bill?.mode ? await getModeSettings(bill.mode) : null;
  // Retail and wholesale each print their own shop name, address, phones, GSTIN and licence.
  const shopWide = await getSettings();
  const shop = shopWide && modeSettings ? applyModeShopDetails(shopWide, modeSettings) : shopWide;
  const wholesale = bill?.mode === "wholesale";
  const terms = (modeSettings?.invoice_terms || "")
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean);

  if (!session) {
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
        <InvoiceActions />
      </div>

      <div className="invoice-sheet w-full max-w-[210mm] bg-white p-4 text-black shadow-sm print:p-0">
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
            <p>Customer Name : <span className="font-bold">{bill.customer_name || ""}</span></p>
            <p className="mt-3">Mob : {bill.customer_phone || ""}</p>
            <p>Cust. ID : {bill.customer_id || ""}</p>
            <p>Email : {bill.customer_email}</p>
            <p>
              Age / Gender : {[bill.customer_age, GENDER[bill.customer_gender] || bill.customer_gender].filter(Boolean).join(" / ")}
            </p>
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

        {/* ---------- Customer / invoice-to block ---------- */}
        <div className="border-b border-black py-1.5 text-[10.5px] leading-[1.45]">
          <p className="font-bold uppercase underline">{bill.customer_name || "Walk-in Customer"}</p>
          {bill.customer_address && <p>{bill.customer_address}</p>}
          {bill.doctor_name && <p>Ph: {bill.doctor_name}</p>}
          <p className="mt-1">Tin No. : &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; GST No. : {bill.customer_gstin}</p>
          {bill.shipping_address && bill.shipping_address !== bill.customer_address && (
            <p className="mt-1">
              <span className="font-bold">Ship to :</span> {bill.shipping_address}
            </p>
          )}
        </div>

        {/* ---------- Items grid ---------- */}
        <table className="w-full border-collapse text-[9.5px] leading-[1.3]">
          <thead>
            <tr className="bg-[#d9d9d9]">
              {["No", "Product Name", "Pack", "Mfr", "Batch", "Exp", "MRP", "Qty", "Free", "Rate", "Disc", "GST%", "Amount", "HSN"].map((h) => (
                <th key={h} className="border border-black px-1 py-1 text-center font-bold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bill.items.map((item, index) => (
              <tr key={item.id} className="align-top">
                <td className="border border-black px-1 py-0.5 text-center">{index + 1}</td>
                <td className="border border-black px-1 py-0.5">
                  <p className="font-bold uppercase">{item.generic_name}</p>
                  {item.brand_name && <p>{item.brand_name}</p>}
                  <p className="text-[8.5px]">{item.schedule ? `[${item.schedule}]` : ""} Exp: {monthShort(item.exp_date)}</p>
                </td>
                <td className="border border-black px-1 py-0.5 text-center">{packLabel(item)}</td>
                <td className="border border-black px-1 py-0.5 text-center">{mfrLabel(item)}</td>
                <td className="border border-black px-1 py-0.5 text-center">{item.batch_no}</td>
                <td className="border border-black px-1 py-0.5 text-center">{monthShort(item.exp_date)}</td>
                <td className="border border-black px-1 py-0.5 text-right">{amount(item.mrp_per_unit)}</td>
                <td className="border border-black px-1 py-0.5 text-right">{item.qty}</td>
                <td className="border border-black px-1 py-0.5 text-right">0</td>
                <td className="border border-black px-1 py-0.5 text-right">{amount(item.per_unit_price)}</td>
                <td className="border border-black px-1 py-0.5 text-center">{amount(discPercent(item))}</td>
                <td className="border border-black px-1 py-0.5 text-center">{amount(item.gst_percent)}</td>
                <td className="border border-black px-1 py-0.5 text-right font-bold">{amount(item.line_amount)}</td>
                <td className="border border-black px-1 py-0.5 text-center">{item.hsn_code}</td>
              </tr>
            ))}
            <tr>
              <td colSpan={13} className="border border-black px-1 py-1" />
              <td className="border border-black" />
            </tr>
          </tbody>
        </table>

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
                  <td className="border border-black px-1 py-0.5">Sub Total</td>
                  <td className="w-[70px] border border-black px-1 py-0.5 text-right">{amount(linesTotal(bill))}</td>
                </tr>
                <tr>
                  <td className="border border-black px-1 py-0.5">Discount</td>
                  <td className="border border-black px-1 py-0.5 text-right">{amount(Math.max(0, linesTotal(bill) - bill.grand_total))}</td>
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
                <tr>
                  <td className="border border-black px-1 py-0.5">Txn Ref No.</td>
                  <td className="border border-black px-1 py-0.5 text-right">{bill.txn_ref}</td>
                </tr>
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
          <div className="flex items-center justify-between border-t border-black px-1 py-0.5">
            <span>Due bills :</span>
            <span className="font-bold">Net Amount</span>
          </div>
          <div className="flex items-center justify-end px-1 py-1">
            <span className="text-[17px] font-bold">{money(bill.grand_total)}</span>
          </div>
        </div>

        {/* ---------- Amount in words ---------- */}
        <p className="mt-1 text-[9.5px] uppercase">{amountInWords(bill.grand_total)}</p>

        {/* ---------- Terms + signature ---------- */}
        <div className="inv-break mt-2 flex items-end justify-between gap-6 text-[9px] leading-[1.4]">
          <div>
            <p className="font-bold">Terms &amp; Conditions</p>
            {(terms.length ? terms : DEFAULT_TERMS).map((t, i) => (
              <p key={i}>
                {i + 1}. {t}
              </p>
            ))}
            <p>{(terms.length ? terms : DEFAULT_TERMS).length + 1}. E&amp;O.E</p>
          </div>
          <div className="w-[46%] text-center">
            <p className="font-bold">For {shop?.shop_name || APP_NAME}</p>
            <div className="mt-10 border-b border-black" />
            <p>Authorised Signatory</p>
          </div>
        </div>
      </div>
    </div>
  );
}
