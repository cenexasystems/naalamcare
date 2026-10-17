import { config } from "dotenv";
config({ path: ".env.local" });

import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "../lib/db/schema";
import { sql } from "drizzle-orm";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

const DEFAULT_SETTINGS = {
  id: 1,
  shopName: "Nalam Care Medicals",
  fullName: "",
  address: "No. 18A/2B, Ground Floor, Old Township Road, Venkatapuram, Ambattur (OT), Chennai - 600053",
  phone: "7305723203",
  shopContactNumber: "8122884066",
  email: "sselvathurai00@gmail.com",
  /* Blank until the owner supplies the real numbers. */
  gstin: "",
  dlNo: "",
  colourTheme: "nalam",
  logo: "/logos/nalam-care-medicals-logo.png",
  useCustomLogo: false,
  instagramId: "",
  defaultGst: "12",
  lowStockThreshold: 20,
  expiryAlertMonths: 6,
};

const SEED_SUPPLIERS = [
  { name: "Medicare Distributors", phone: "9842011223", gstin: "33AACCM1234K1Z2" },
  { name: "Sri Balaji Pharma Agencies", phone: "9843122334", gstin: "33AAFCS4567L1Z9" },
  { name: "Anaimalai Medical Supplies", phone: "9944556677", gstin: "33AAGCA7788M1Z4" },
];

const SEED_ROWS = [
  { generic: "Paracetamol 500mg", brand: "Paracip", maker: "Zydus Healthcare", salt: "Paracetamol 500 mg", schedule: "OTC", hsn: "30049099", gst: "12", unitType: "Strip", box: "A1", batchNo: "P500A2306", mfg: "2025-05", exp: "2028-05", packSize: 10, qtyPacks: 50, stockLeft: 477, rate: "20", mrp: "60", selling: "40" },
  { generic: "Amoxicillin 500mg", brand: "Moxikind", maker: "Mankind Pharma", salt: "Amoxicillin 500 mg", schedule: "H", hsn: "30042021", gst: "12", unitType: "Strip", box: "A2", batchNo: "AMX2405", mfg: "2025-04", exp: "2028-04", packSize: 10, qtyPacks: 10, stockLeft: 85, rate: "35", mrp: "80", selling: "60" },
  { generic: "Cetirizine 10mg", brand: "Cetzine", maker: "GSK Pharma", salt: "Cetirizine HCl 10 mg", schedule: "OTC", hsn: "30049091", gst: "12", unitType: "Strip", box: "B1", batchNo: "CTZ0624", mfg: "2025-06", exp: "2027-06", packSize: 10, qtyPacks: 5, stockLeft: 32, rate: "18", mrp: "45", selling: "30" },
  { generic: "Azithromycin 500mg", brand: "Azicip", maker: "Cipla Ltd", salt: "Azithromycin 500 mg", schedule: "H1", hsn: "30042021", gst: "12", unitType: "Strip", box: "B2", batchNo: "AZ5002403", mfg: "2024-03", exp: "2026-11", packSize: 3, qtyPacks: 8, stockLeft: 18, rate: "50", mrp: "120", selling: "90" },
  { generic: "Ibuprofen 400mg", brand: "Brufen", maker: "Abbott India", salt: "Ibuprofen 400 mg", schedule: "OTC", hsn: "30049011", gst: "12", unitType: "Strip", box: "C1", batchNo: "IB40006124", mfg: "2024-06", exp: "2026-09", packSize: 10, qtyPacks: 5, stockLeft: 28, rate: "15", mrp: "35", selling: "25" },
  { generic: "Omeprazole 20mg", brand: "Omez", maker: "Dr Reddys Labs", salt: "Omeprazole 20 mg", schedule: "OTC", hsn: "30049019", gst: "12", unitType: "Strip", box: "C2", batchNo: "OME2405", mfg: "2025-05", exp: "2027-05", packSize: 10, qtyPacks: 6, stockLeft: 40, rate: "22", mrp: "50", selling: "35" },
  { generic: "Metformin 500mg", brand: "Glycomet", maker: "USV Private Ltd", salt: "Metformin HCl 500 mg", schedule: "H", hsn: "30044030", gst: "12", unitType: "Strip", box: "D1", batchNo: "MF5002401", mfg: "2024-01", exp: "2026-10", packSize: 10, qtyPacks: 4, stockLeft: 10, rate: "12", mrp: "30", selling: "20" },
  { generic: "Vitamin D3 60K", brand: "Shelcal D3", maker: "Torrent Pharma", salt: "Cholecalciferol 60000 IU", schedule: "OTC", hsn: "21069099", gst: "18", unitType: "Strip", box: "D2", batchNo: "VITD602403", mfg: "2024-02", exp: "2026-06", packSize: 4, qtyPacks: 6, stockLeft: 5, rate: "25", mrp: "70", selling: "50" },
  { generic: "ORS Powder 21g", brand: "Electral", maker: "FDC Limited", salt: "Oral Rehydration Salts", schedule: "OTC", hsn: "30049099", gst: "12", unitType: "Piece", box: "E1", batchNo: "ORS2501", mfg: "2025-01", exp: "2027-01", packSize: 1, qtyPacks: 60, stockLeft: 58, rate: "12", mrp: "25", selling: "20" },
  { generic: "Cough Syrup 100ml", brand: "Benadryl", maker: "Johnson & Johnson", salt: "Diphenhydramine + Ammonium Cl", schedule: "NRX", hsn: "30049087", gst: "12", unitType: "Bottle", box: "E2", batchNo: "BEN2503", mfg: "2025-03", exp: "2027-03", packSize: 1, qtyPacks: 24, stockLeft: 24, rate: "60", mrp: "130", selling: "110" },
  { generic: "Amlodipine 5mg", brand: "Amlokind", maker: "Mankind Pharma", salt: "Amlodipine Besylate 5 mg", schedule: "H", hsn: "30049069", gst: "12", unitType: "Strip", box: "F1", batchNo: "AML5002502", mfg: "2025-02", exp: "2028-02", packSize: 10, qtyPacks: 10, stockLeft: 96, rate: "14", mrp: "40", selling: "28" },
  { generic: "Pantoprazole 40mg", brand: "Pantocid", maker: "Sun Pharma", salt: "Pantoprazole 40 mg", schedule: "H", hsn: "30049019", gst: "12", unitType: "Strip", box: "F2", batchNo: "PAN4002504", mfg: "2025-04", exp: "2027-10", packSize: 10, qtyPacks: 8, stockLeft: 74, rate: "30", mrp: "75", selling: "55" },
];

const SEED_CUSTOMERS = [
  { id: "NCM000001", name: "Karthik", phone: "7350179069", address: "Anaimalai, Coimbatore", doctorName: "Dr. R. Mohan", quickBill: true },
  { id: "NCM000002", name: "Priya S", phone: "9865321470", address: "Pollachi Main Road", doctorName: "Dr. S. Latha", quickBill: true },
  { id: "NCM000003", name: "Ramesh Kumar", phone: "9791234560", address: "Thirumurthy Nagar", doctorName: "", quickBill: false },
];

async function seed() {
  console.log("Checking database state...");
  const existingSettings = await db.select().from(schema.settings);

  if (existingSettings.length > 0) {
    console.log("Database already seeded. Skipping.");
    process.exit(0);
  }

  console.log("Seeding database...");

  // Settings
  await db.insert(schema.settings).values(DEFAULT_SETTINGS);

  // Suppliers
  const insertedSuppliers = await db
    .insert(schema.suppliers)
    .values(SEED_SUPPLIERS.map((s) => ({ ...s, mode: "retail" })))
    .returning();

  const firstSupplierId = insertedSuppliers[0].id;
  const todayDate = new Date().toISOString().slice(0, 10);

  // Medicines & Batches
  for (const row of SEED_ROWS) {
    const [med] = await db
      .insert(schema.medicines)
      .values({
        genericName: row.generic,
        brandName: row.brand,
        manufacturer: row.maker,
        salt: row.salt,
        schedule: row.schedule,
        hsnCode: row.hsn,
        gstPercent: row.gst,
        purchaseUnitType: row.unitType,
        lowStockThreshold: 20,
      })
      .returning();

    await db.insert(schema.batches).values({
      medicineId: med.id,
      supplierId: firstSupplierId,
      invoiceNo: "INV-2456",
      purchaseDate: todayDate,
      batchNo: row.batchNo,
      mfgDate: row.mfg,
      expDate: row.exp,
      box: row.box,
      purchaseUnitType: row.unitType,
      packSize: row.packSize,
      qtyPacks: row.qtyPacks,
      stockAdded: row.packSize * row.qtyPacks,
      stockQty: row.stockLeft,
      purchaseRate: row.rate,
      mrp: row.mrp,
      sellingPrice: row.selling,
      gstPercent: row.gst,
      mode: "retail",
    });
  }

  // Customers
  await db.insert(schema.customers).values(SEED_CUSTOMERS.map((c) => ({ ...c, mode: "retail" })));

  // Restart sequences

  await db.execute(sql`ALTER SEQUENCE customer_seq RESTART WITH 4`);

  console.log("Database seeded successfully!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
