"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Save, Download, Upload, RotateCcw, Plus, Trash2, Pencil, Boxes } from "lucide-react";
import type { MedicineWithBatches, ScopedSettings, ShopSettings, Supplier } from "@/lib/types";
import {
  exportBackup,
  importBackup,
  resetStore,
} from "@/lib/store";
import { THEMES, THEME_KEYS, resolveTheme } from "@/lib/format";
import { deleteSupplier, saveSettings, saveSupplier } from "@/lib/actions";
import { act, useMode, useModeState } from "./mode-context";
import { InvoicePromoCard, LoginPasscodesCard, ProductTypesCard, ModeSettingsCard, ReconciliationCard, UsersCard } from "./SettingsExtras";
import { downloadBlob } from "@/lib/xlsx";
import { Button, Card, Field, Modal, PageTitle, TextInput } from "./ui";

export const SettingsPanel = ({
  settings: initialSettings,
  suppliers,
  medicines,
  onChanged,
}: {
  settings: ScopedSettings | null;
  suppliers: Supplier[];
  medicines: MedicineWithBatches[];
  onChanged: (message?: string) => void;
}) => {
  const mode = useMode();
  const isAdmin = useModeState()?.role === "admin";
  /* The low-stock field edits this mode's alert level for every medicine
     (0 = each medicine's own), so show the mode's raw value, not the merged one. */
  const toForm = (s: ScopedSettings | null): ShopSettings | null =>
    s && { ...s, low_stock_threshold: s.mode_settings.low_stock_threshold };
  const [settings, setSettings] = useState<ShopSettings | null>(() => toForm(initialSettings));
  const [supplierDraft, setSupplierDraft] = useState<Supplier | null>(null);
  const [addingSupplier, setAddingSupplier] = useState(false);

  /* Re-sync when the server row changes after a save, otherwise the panel
     keeps showing the pre-save draft. */
  useEffect(() => setSettings(toForm(initialSettings)), [initialSettings]);

  const set = (patch: Partial<ShopSettings>) => settings && setSettings({ ...settings, ...patch });

  /* Box mapping overview — where every product sits */
  const boxMap = useMemo(() => {
    const map = new Map<string, { medicine: string; brand: string; batch: string; qty: number }[]>();
    for (const medicine of medicines) {
      for (const batch of medicine.batches) {
        const key = batch.box || "Unassigned";
        const list = map.get(key) || [];
        list.push({
          medicine: medicine.generic_name,
          brand: batch.brand_name || medicine.brand_name,
          batch: batch.batch_no,
          qty: batch.stock_qty,
        });
        map.set(key, list);
      }
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [medicines]);

  const handleBackup = () => {
    downloadBlob(
      new Blob([exportBackup()], { type: "application/json" }),
      `nalam-care-medicals-backup-${new Date().toISOString().slice(0, 10)}.json`,
    );
  };

  const handleRestore = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const ok = importBackup(String(reader.result));
      onChanged(ok ? "Backup restored." : "That file is not a valid backup.");
    };
    reader.readAsText(file);
    event.target.value = "";
  };

  return (
    <div>
      <PageTitle
        title={mode === "wholesale" ? "Wholesale Settings" : "Settings"}
        subtitle="Shop details, GSTIN, licence, invoicing, payments, pricing and alerts are set separately for retail and wholesale"
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* Shop details */}
        <Card className="p-5">
          <h3 className="mb-1 text-[15px] font-bold text-gray-900">
            {mode === "wholesale" ? "Wholesale" : "Retail"} Shop Details
          </h3>
          <p className="mb-4 text-[12px] text-gray-500">
            These details print on every {mode} tax invoice; the other billing mode keeps its own. Leave a field
            blank and it stays off the bill.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Owner / Full Name">
              <TextInput
                value={settings?.full_name ?? ""}
                onChange={(e) => set({ full_name: e.target.value })}
                placeholder="Owner name"
              />
            </Field>
            <Field label="Shop name">
              <TextInput
                value={settings?.shop_name ?? ""}
                onChange={(e) => set({ shop_name: e.target.value })}
                placeholder="Nalam Care Medicals"
              />
            </Field>
            <Field label="Address" className="sm:col-span-2">
              <TextInput
                value={settings?.address ?? ""}
                onChange={(e) => set({ address: e.target.value })}
                placeholder="Shop address"
              />
            </Field>
            <Field label="Phone Number" hint="Printed as “Phone” on the invoice">
              <TextInput
                value={settings?.phone ?? ""}
                onChange={(e) => set({ phone: e.target.value })}
                placeholder="Leave blank until confirmed"
              />
            </Field>
            <Field label="Shop Contact Number" hint="Printed as “Mobile” on the invoice">
              <TextInput
                value={settings?.shop_contact_number ?? ""}
                onChange={(e) => set({ shop_contact_number: e.target.value })}
                placeholder="Leave blank until confirmed"
              />
            </Field>
            <Field label="Email" className="sm:col-span-2">
              <TextInput
                type="email"
                value={settings?.email ?? ""}
                onChange={(e) => set({ email: e.target.value })}
                placeholder="shop@example.com"
              />
            </Field>
            <Field label="GSTIN" hint="Printed top-right on the invoice">
              <TextInput
                value={settings?.gstin ?? ""}
                onChange={(e) => set({ gstin: e.target.value.toUpperCase().replace(/\s/g, "").slice(0, 15) })}
                placeholder="Leave blank until confirmed"
              />
            </Field>
            <Field label="Drug Licence No" hint="Printed top-right on the invoice">
              <TextInput
                value={settings?.dl_no ?? ""}
                onChange={(e) => set({ dl_no: e.target.value.toUpperCase() })}
                placeholder="Leave blank until confirmed"
              />
            </Field>
            <Field label="Instagram ID" className="sm:col-span-2" hint="Shared by retail and wholesale">
              <TextInput
                value={settings?.instagram_id ?? ""}
                onChange={(e) => set({ instagram_id: e.target.value })}
                placeholder="@yourinstagram"
              />
            </Field>
          </div>

          <h3 className="mb-4 mt-6 text-[15px] font-bold text-gray-900">
            Appearance <span className="text-[12px] font-medium text-gray-500">— shared by retail and wholesale</span>
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Colour Theme"
              className="sm:col-span-2"
              hint="Applied across the whole app. Takes effect after you save."
            >
              <div className="flex flex-wrap gap-2">
                {THEME_KEYS.map((key) => {
                  const tokens = THEMES[key].tokens;
                  const active = resolveTheme(settings?.colour_theme) === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => set({ colour_theme: key })}
                      aria-pressed={active}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border-2 px-3 py-2 text-[13px] font-semibold transition ${
                        active ? "border-[var(--c-primary)] bg-[var(--c-mint)]" : "border-[#e5e7eb] bg-white hover:border-[#c9d1d6]"
                      }`}
                    >
                      <span className="flex gap-0.5">
                        <span className="h-4 w-2 rounded-sm" style={{ background: tokens.primary }} />
                        <span className="h-4 w-2 rounded-sm" style={{ background: tokens.deep }} />
                        <span className="h-4 w-2 rounded-sm" style={{ background: tokens.mint }} />
                      </span>
                      {THEMES[key].label}
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field
              label="Logo"
              className="sm:col-span-2"
              hint="Shown in the sidebar. Use a path in /public (e.g. /logos/nalam-care-medicals-logo.png) or a full image URL."
            >
              {/* The toggle is off by default, so the logo currently in place stays
                  exactly as it is until the owner opts in. */}
              <label className="mb-3 flex cursor-pointer items-center gap-2.5 rounded-lg border border-[#e5e7eb] bg-white px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={Boolean(settings?.use_custom_logo)}
                  onChange={(e) => set({ use_custom_logo: e.target.checked })}
                  className="h-4 w-4 cursor-pointer accent-[var(--c-primary)]"
                />
                <span className="text-[13px] font-medium text-gray-800">
                  Use a custom logo
                </span>
                <span className="ml-auto text-[11.5px] text-gray-500">
                  {settings?.use_custom_logo ? "Enabled" : "Off — keeping the current logo"}
                </span>
              </label>

              <div className={`flex items-start gap-4 ${settings?.use_custom_logo ? "" : "opacity-45"}`}>
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-[#e5e7eb] bg-white p-1.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={settings?.logo || "/logos/nalam-care-medicals-logo.png"}
                    alt="Logo preview"
                    className="h-full w-full object-contain"
                    onError={(e) => {
                      e.currentTarget.style.opacity = "0.25";
                    }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <TextInput
                    value={settings?.logo ?? ""}
                    onChange={(e) => set({ logo: e.target.value })}
                    disabled={!settings?.use_custom_logo}
                    placeholder="/logos/nalam-care-medicals-logo.png"
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    {[
                      { label: "Logo", path: "/logos/nalam-care-medicals-logo.png" },
                      { label: "Banner", path: "/logos/nalam-care-medicals-banner.png" },
                    ].map((preset) => (
                      <button
                        key={preset.path}
                        type="button"
                        disabled={!settings?.use_custom_logo}
                        onClick={() => set({ logo: preset.path })}
                        className={`rounded-md border px-2.5 py-1 text-[12px] font-medium transition disabled:cursor-not-allowed ${
                          settings?.logo === preset.path
                            ? "border-[var(--c-primary)] bg-[var(--c-mint)] text-[var(--c-deep)]"
                            : "border-[#d8dde3] bg-white text-gray-600 enabled:hover:bg-gray-50"
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </Field>
          </div>

          <h3 className="mb-4 mt-6 text-[15px] font-bold text-gray-900">
            Defaults <span className="text-[12px] font-medium text-gray-500">— {mode} only</span>
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Default GST %" hint="GST is included in MRP and selling price">
              <TextInput
                type="number"
                value={settings?.default_gst}
                onChange={(e) => set({ default_gst: Number(e.target.value) || 0 })}
              />
            </Field>
            <Field label="Low stock threshold" hint="Alert level for every medicine here. 0 = each medicine's own">
              <TextInput
                type="number"
                value={settings?.low_stock_threshold}
                onChange={(e) => set({ low_stock_threshold: Number(e.target.value) || 0 })}
              />
            </Field>
            <Field label="Expiry alert (months)">
              <TextInput
                type="number"
                value={settings?.expiry_alert_months}
                onChange={(e) => set({ expiry_alert_months: Number(e.target.value) || 0 })}
              />
            </Field>
          </div>

          <div className="mt-5 flex justify-end">
            <Button
              onClick={async () => {
                if (settings) {
                  const res = await act(saveSettings(mode, settings));
                  if (res.ok) onChanged("Settings saved successfully.");
                }
              }}
            >
              <Save className="h-4 w-4" /> Save Settings
            </Button>
          </div>
        </Card>

        {/* Suppliers */}
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-[15px] font-bold text-gray-900">
              Suppliers <span className="text-[12px] font-medium text-gray-500">— shared directory</span>
            </h3>
            <Button variant="ghost" className="py-2 text-[13px]" onClick={() => setAddingSupplier(true)}>
              <Plus className="h-4 w-4" /> Add supplier
            </Button>
          </div>
          <div className="divide-y divide-[#f1f3f5]">
            {suppliers.map((supplier) => (
              <div key={supplier.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium text-gray-900">{supplier.name}</p>
                  <p className="truncate text-[11.5px] text-gray-500">
                    {supplier.phone || "no phone"} · {supplier.gstin || "no GSTIN"}
                  </p>
                </div>
                <button
                  onClick={() => setSupplierDraft(supplier)}
                  aria-label="Edit supplier"
                  className="cursor-pointer rounded-md p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-[var(--c-deep)]"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={async () => {
                    if (confirm(`Delete ${supplier.name}?`)) {
                      const res = await act(deleteSupplier(mode, supplier.id));
                      if (res.ok) onChanged("Supplier deleted.");
                    }
                  }}
                  aria-label="Delete supplier"
                  className="cursor-pointer rounded-md p-1.5 text-gray-500 transition hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            {!suppliers.length && (
              <p className="py-10 text-center text-[13px] text-gray-400">No suppliers yet.</p>
            )}
          </div>

          <h3 className="mb-3 mt-6 text-[15px] font-bold text-gray-900">Backup &amp; Restore</h3>
          <div className="flex flex-wrap gap-2.5">
            <Button variant="ghost" onClick={handleBackup}>
              <Download className="h-4 w-4" /> Download backup
            </Button>
            <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-[#d8dde3] bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50">
              <Upload className="h-4 w-4" /> Restore backup
              <input type="file" accept="application/json" onChange={handleRestore} className="hidden" />
            </label>
            <Button
              variant="danger"
              onClick={() => {
                if (
                  confirm(
                    "Reset all data back to the demo dataset? Every bill, medicine and customer will be replaced.",
                  )
                ) {
                  resetStore();
                  onChanged("Data reset to the starter dataset.");
                }
              }}
            >
              <RotateCcw className="h-4 w-4" /> Reset data
            </Button>
          </div>
        </Card>
      </div>

      {initialSettings && (
        <ModeSettingsCard key={mode} settings={initialSettings.mode_settings} onChanged={onChanged} />
      )}

      {isAdmin && initialSettings && <ProductTypesCard types={initialSettings.product_types} onChanged={onChanged} />}

      {isAdmin && initialSettings && (
        <InvoicePromoCard
          key={`promo-${mode}`}
          settings={initialSettings.mode_settings}
          shopName={initialSettings.shop_name}
          onChanged={onChanged}
        />
      )}

      {isAdmin && <LoginPasscodesCard onChanged={onChanged} />}

      {isAdmin && <UsersCard onChanged={onChanged} />}

      {isAdmin && <ReconciliationCard onChanged={onChanged} />}

      {/* Box mapping */}
      <Card className="mt-4 p-5">
        <div className="mb-4 flex items-center gap-2">
          <Boxes className="h-[18px] w-[18px] text-gray-500" />
          <h3 className="text-[15px] font-bold text-gray-900">Box Mapping</h3>
          <span className="text-[12.5px] text-gray-500">— where each product is located</span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {boxMap.map(([box, items]) => (
            <div key={box} className="rounded-xl border border-[#e5e7eb] p-3.5">
              <div className="mb-2 flex items-center justify-between">
                <span className="rounded-md bg-[#eaf1fe] px-2.5 py-1 text-[13px] font-bold text-[#1f6feb]">
                  {box}
                </span>
                <span className="text-[11.5px] text-gray-500">{items.length} batch(es)</span>
              </div>
              {items.map((item, index) => (
                <p key={index} className="truncate text-[12.5px] text-gray-700">
                  {item.medicine}{" "}
                  <span className="text-gray-400">
                    · {item.brand} · {item.qty}
                  </span>
                </p>
              ))}
            </div>
          ))}
          {!boxMap.length && (
            <p className="py-8 text-center text-[13px] text-gray-400">No box mapping recorded yet.</p>
          )}
        </div>
      </Card>

      <SupplierModal
        key={supplierDraft?.id || (addingSupplier ? "new" : "closed")}
        open={addingSupplier || Boolean(supplierDraft)}
        supplier={supplierDraft}
        onClose={() => {
          setAddingSupplier(false);
          setSupplierDraft(null);
        }}
        onSaved={(msg) => {
          setAddingSupplier(false);
          setSupplierDraft(null);
          onChanged(msg);
        }}
      />
    </div>
  );
};

export const SupplierModal = ({
  open,
  supplier,
  onClose,
  onSaved,
}: {
  open: boolean;
  supplier: Supplier | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) => {
  const mode = useMode();
  // Keyed at the call site, so the draft is seeded once on mount.
  const [draft, setDraft] = useState({
    name: supplier?.name || "",
    phone: supplier?.phone || "",
    gstin: supplier?.gstin || "",
    address: supplier?.address || "",
  });

  if (!open) return null;

  return (
    <Modal
      open
      onClose={onClose}
      title={supplier ? "Edit Supplier" : "Add Supplier"}
      width="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={async () => {
              if (!draft.name.trim()) return;
              const res = await act(saveSupplier(mode, { id: supplier?.id, ...draft }));
              if (res.ok) onSaved(supplier ? "Supplier updated." : "Supplier added.");
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Supplier name">
          <TextInput
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="Medicare Distributors"
          />
        </Field>
        <Field label="Phone">
          <TextInput
            value={draft.phone}
            onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
            placeholder="98420 11223"
          />
        </Field>
        <Field label="GSTIN">
          <TextInput
            value={draft.gstin}
            onChange={(e) => setDraft({ ...draft, gstin: e.target.value.toUpperCase() })}
            placeholder="33AACCM1234K1Z2"
          />
        </Field>
        <Field label="Address">
          <TextInput
            value={draft.address}
            onChange={(e) => setDraft({ ...draft, address: e.target.value })}
            placeholder="Optional"
          />
        </Field>
      </div>
    </Modal>
  );
};
