import Link from "next/link";
import { applyModeShopDetails, getBill, getModeSettings, getSalesReturn, getSettings } from "@/lib/db/queries";
import { getSession } from "@/lib/auth";
import { APP_NAME } from "@/lib/mode";
import { amount, amountInWords, dateSlash, money } from "@/lib/format";
import { InvoiceFit } from "../../invoice/[id]/InvoiceFit";
import { PrintButton } from "./PrintButton";

/* ==========================================================================
   Sales Return bill (credit note) — one per return saved from
   Invoices & Payments → Return. Shows what was bought on the original bill,
   what came back, its value, and how it was settled (refund / set off).
   ========================================================================== */

/** Short printable number for a return, e.g. "R-3F2A9C1B". */
const returnNo = (id: string) => `R-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;

export default async function ReturnBillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const found = session ? await getSalesReturn(id) : null;
  const ret = found && session?.modes.includes(found.mode) ? found : null;
  const bill = ret ? await getBill(ret.bill_id) : null;

  if (!session || !ret || !bill) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white px-4 text-center">
        <p className="text-xl font-bold text-[var(--c-deep)]">{session ? "Return Not Found" : "Please log in"}</p>
        <p className="max-w-sm text-[13px] text-gray-500">
          {session ? "This return isn't in the dashboards you can access." : "Return bills can be opened by signed-in staff only."}
        </p>
        <Link href="/" className="rounded-lg border border-[#d8dde3] bg-white px-6 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50">
          {session ? "Return home" : "Go to login"}
        </Link>
      </div>
    );
  }

  const [shopWide, modeSettings] = await Promise.all([getSettings(), getModeSettings(ret.mode)]);
  const shop = shopWide ? applyModeShopDetails(shopWide, modeSettings) : null;
  const wholesale = ret.mode === "wholesale";
  const itemOf = (billItemId: string) => bill.items.find((i) => i.id === billItemId);
  const totalQty = ret.items.reduce((s, i) => s + i.qty, 0);
  const revisedTotal = Math.max(0, bill.grand_total - bill.returned_amount);
  const cell = "border border-black px-1 py-0.5";

  return (
    <div className="flex min-h-screen flex-col items-center bg-[#f7f8fa] px-4 py-8 print:bg-white print:p-0">
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 8mm; }
          html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .invoice-sheet { width: 100% !important; padding: 0 !important; box-shadow: none !important; }
        }
      `}</style>

      <div className="no-print mb-5 flex w-full max-w-3xl flex-wrap justify-end gap-3">
        <Link
          href={`/invoice/${encodeURIComponent(bill.id)}`}
          className="flex items-center rounded-lg border border-[var(--c-deep)]/30 bg-white px-4 py-2 text-xs font-bold uppercase tracking-wider text-[#1a1d21] shadow-sm hover:bg-[#FAFAFA]"
        >
          View revised invoice {bill.id}
        </Link>
        <PrintButton />
      </div>

      <InvoiceFit>
        <div className="invoice-sheet w-full bg-white p-4 text-black shadow-sm print:p-0">
          {/* Header */}
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

          {/* Title + meta */}
          <div className="flex items-start justify-between gap-4 border-b border-black py-1.5 text-[10.5px]">
            <div className="w-[38%] leading-[1.5]">
              <p>
                {wholesale ? "Pharmacy Name" : "Customer Name"} : <span className="font-bold">{bill.customer_name}</span>
              </p>
              <p>Mob : {bill.customer_phone}</p>
              <p>Cust. ID : {bill.customer_id || ""}</p>
              <p>Address : {bill.customer_address}</p>
            </div>
            <div className="flex-1 text-center">
              <h2 className="text-[17px] font-bold underline">Sales Return</h2>
              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide">Credit Note</p>
            </div>
            <div className="w-[34%] leading-[1.5]">
              <p>
                Return No : <span className="font-bold">{returnNo(ret.id)}</span>
              </p>
              <p>Return Date : {dateSlash(ret.created_at.slice(0, 10))}</p>
              <p>
                Against Inv No : <span className="font-bold">{bill.id}</span>
              </p>
              <p>Invoice Date : {dateSlash(bill.bill_date)}</p>
              {ret.reason && <p>Reason : {ret.reason}</p>}
            </div>
          </div>

          {/* Items */}
          <table className="mt-1 w-full border-collapse text-[9.5px] leading-[1.3]">
            <thead>
              <tr className="bg-[#d9d9d9]">
                {["No", "Product Name", "Batch", "Qty Bought", "Amount Paid", "Qty Returned", "Rate", "Return Amount"].map((h) => (
                  <th key={h} className={`${cell} py-1 text-center font-bold`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ret.items.map((it, index) => {
                const item = itemOf(it.bill_item_id);
                return (
                  <tr key={`${it.bill_item_id}-${index}`} className="align-top">
                    <td className={`${cell} text-center`}>{index + 1}</td>
                    <td className={cell}>
                      <p className="font-bold uppercase">{it.generic_name}</p>
                      {item?.brand_name && <p>{item.brand_name}</p>}
                    </td>
                    <td className={`${cell} text-center`}>{it.batch_no}</td>
                    <td className={`${cell} text-right`}>{item?.qty ?? "—"}</td>
                    <td className={`${cell} text-right`}>{item ? amount(item.line_amount) : "—"}</td>
                    <td className={`${cell} text-right font-bold`}>{it.qty}</td>
                    <td className={`${cell} text-right`}>{amount(it.qty ? it.amount / it.qty : 0)}</td>
                    <td className={`${cell} text-right font-bold`}>{amount(it.amount)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Settlement */}
          <div className="mt-1 flex items-stretch text-[9.5px]">
            <div className="w-[45%] border border-black p-1">
              <p>Items Returned : {ret.items.length}</p>
              <p className="mt-1">Total Qty Returned : {totalQty}</p>
            </div>
            <table className="w-[55%] border-collapse">
              <tbody>
                <tr>
                  <td className={cell}>Original Invoice Amount</td>
                  <td className={`${cell} w-[80px] text-right`}>{amount(bill.grand_total)}</td>
                </tr>
                <tr>
                  <td className={`${cell} font-bold`}>Return Amount (this return)</td>
                  <td className={`${cell} text-right font-bold`}>{amount(ret.amount)}</td>
                </tr>
                {ret.adjusted_against_due > 0 && (
                  <tr>
                    <td className={cell}>Adjusted Against Balance Due</td>
                    <td className={`${cell} text-right`}>{amount(ret.adjusted_against_due)}</td>
                  </tr>
                )}
                <tr>
                  <td className={cell}>Refunded ({ret.refund_method})</td>
                  <td className={`${cell} text-right`}>{amount(ret.refund_amount)}</td>
                </tr>
                <tr>
                  <td className={`${cell} font-bold`}>Revised Invoice Amount</td>
                  <td className={`${cell} text-right font-bold`}>{amount(revisedTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-1 flex items-center justify-between border border-black px-2 py-1.5">
            <span className="text-[9.5px] uppercase">{amountInWords(ret.amount)}</span>
            <span className="text-[16px] font-bold">Return Value {money(ret.amount)}</span>
          </div>

          <div className="mt-3 flex items-end justify-between gap-6 text-[9.5px]">
            <div className="w-[46%]">
              <p className="font-bold">Received by (customer)</p>
              <div className="mt-8 border-b border-black" />
            </div>
            <div className="w-[46%] text-center">
              <p className="font-bold">For {shop?.shop_name || APP_NAME}</p>
              <div className="mt-8 border-b border-black" />
              <p>Authorised Signatory</p>
            </div>
          </div>
        </div>
      </InvoiceFit>
    </div>
  );
}
