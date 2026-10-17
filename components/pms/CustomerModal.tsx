"use client";

import React, { useMemo, useState } from "react";
import { Zap, Info, User, Phone, MapPin, Stethoscope, Printer, X, Search, Mail, Cake, FileText, UserCheck } from "lucide-react";
import type { Customer } from "@/lib/types";
import { useCustomers } from "./data";
import { Button, Select } from "./ui";

export type CustomerPayload = {
  id: string | null;
  name: string;
  phone: string;
  address: string;
  doctor: string;
  email: string;
  age: string;
  gender: string;
  quickBill: boolean;
  /** Bill-only details printed on the invoice header */
  prescriptionNo: string;
  billedBy: string;
};

export const CustomerModal = ({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (payload: CustomerPayload) => void;
}) => {
  // The dialog is keyed on `open` at the call site, so mounting gives a clean form.
  // Customers come from the Neon DB (via SWR); the parent already loaded this
  // endpoint, so it reads from cache with no extra request.
  const { data: customers = [] } = useCustomers();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [doctor, setDoctor] = useState("");
  const [email, setEmail] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [prescriptionNo, setPrescriptionNo] = useState("");
  const [billedBy, setBilledBy] = useState("");
  const [quickBill, setQuickBill] = useState(false);
  const [picked, setPicked] = useState<Customer | null>(null);
  const [picker, setPicker] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");

  /* An existing customer is derived from the phone number, not stored twice. */
  const matched = useMemo(() => {
    if (picked) return picked;
    const digits = phone.trim();
    if (digits.length < 6) return null;
    return customers.find((c) => c.phone === digits) || null;
  }, [picked, phone, customers]);

  /* Blank fields fall back to the matched customer's details. */
  const nameValue = name || matched?.name || "";
  const addressValue = address || matched?.address || "";
  const doctorValue = doctor || matched?.doctor_name || "";
  const emailValue = email || matched?.email || "";
  const ageValue = age || matched?.age || "";
  const genderValue = gender || matched?.gender || "";

  const pickerResults = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    const list = q
      ? customers.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.phone.includes(q) ||
            c.id.toLowerCase().includes(q),
        )
      : customers;
    return list.slice(0, 40);
  }, [pickerQuery, customers]);

  const applyCustomer = (customer: Customer) => {
    setPicked(customer);
    setName(customer.name);
    setPhone(customer.phone);
    setAddress(customer.address);
    setDoctor(customer.doctor_name);
    setEmail(customer.email);
    setAge(customer.age);
    setGender(customer.gender);
    setQuickBill(customer.quick_bill);
    setPicker(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-[2px] sm:p-8">
      <div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-[#eceff2] px-7 py-5">
          <div>
            <h3 className="text-[21px] font-bold text-gray-900">Customer Details</h3>
            <p className="mt-0.5 text-[13px] text-gray-500">
              Enter customer details before printing the bill
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="cursor-pointer rounded-lg p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-7 py-5">
          {/* Quick Bill */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e6efe9] bg-[#f5fbfa] px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#e2f2e7]">
                <Zap className="h-[18px] w-[18px] text-[var(--c-deep)]" />
              </span>
              <div>
                <p className="text-[13.5px] font-semibold text-gray-900">Quick Bill</p>
                <p className="text-[12px] text-gray-500">
                  Register customer for faster billing next time
                </p>
              </div>
            </div>
            <label className="flex cursor-pointer items-center gap-2.5 text-[13px] font-medium text-gray-800">
              <input
                type="checkbox"
                checked={quickBill}
                onChange={(e) => setQuickBill(e.target.checked)}
                className="h-4 w-4 cursor-pointer accent-[var(--c-deep)]"
              />
              Register for Quick Bill
            </label>
          </div>

          {/* Existing customer */}
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#dbe7f8] bg-[#f5f9ff] px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#e5eefc]">
                <Info className="h-[18px] w-[18px] text-[#1f6feb]" />
              </span>
              <div>
                <p className="text-[13.5px] font-semibold text-gray-900">
                  {matched ? "Existing Customer Found" : "New Customer"}
                </p>
                <p className="text-[12px] text-gray-600">
                  Customer ID:{" "}
                  <span className="font-semibold text-[#1f6feb]">
                    {matched ? matched.id : "will be generated on save"}
                  </span>
                </p>
              </div>
            </div>
            <button
              onClick={() => setPicker((v) => !v)}
              className="cursor-pointer rounded-lg border border-[#c9dcf7] bg-white px-3.5 py-2 text-[12.5px] font-semibold text-[#1f6feb] transition hover:bg-[#f0f6ff]"
            >
              View / Select Another
            </button>
          </div>

          {picker && (
            <div className="mb-5 overflow-hidden rounded-xl border border-[#e5e7eb]">
              <div className="relative border-b border-[#eef1f3]">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  autoFocus
                  value={pickerQuery}
                  onChange={(e) => setPickerQuery(e.target.value)}
                  placeholder="Search by customer ID, name or phone"
                  className="h-11 w-full pl-10 pr-3 text-[13.5px] outline-none placeholder:text-gray-400"
                />
              </div>
              <div className="max-h-[210px] overflow-y-auto">
                {pickerResults.map((customer) => (
                  <button
                    key={customer.id}
                    onClick={() => applyCustomer(customer)}
                    className="flex w-full cursor-pointer items-center justify-between gap-3 border-b border-[#f3f5f7] px-4 py-2.5 text-left transition last:border-0 hover:bg-gray-50"
                  >
                    <span>
                      <span className="block text-[13px] font-semibold text-gray-900">
                        {customer.name || "—"}
                      </span>
                      <span className="block text-[11.5px] text-gray-500">
                        {customer.id} · {customer.phone || "no phone"}
                      </span>
                    </span>
                    {customer.quick_bill && (
                      <span className="rounded-md bg-[var(--c-mint)] px-2 py-0.5 text-[10.5px] font-bold text-[var(--c-deep)]">
                        QUICK BILL
                      </span>
                    )}
                  </button>
                ))}
                {!pickerResults.length && (
                  <p className="px-4 py-8 text-center text-[13px] text-gray-400">
                    No customers found.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Fields */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <IconField
              label="Customer Name (Optional)"
              icon={<User className="h-4 w-4 text-gray-400" />}
              value={nameValue}
              onChange={setName}
              placeholder="Enter customer name"
            />
            <IconField
              label="Phone Number (Optional)"
              icon={<Phone className="h-4 w-4 text-gray-400" />}
              value={phone}
              onChange={(v) => {
                setPicked(null);
                setPhone(v.replace(/[^\d]/g, "").slice(0, 10));
              }}
              placeholder="Enter mobile number"
              inputMode="numeric"
            />
          </div>

          <div className="mt-4">
            <label className="field-label">Address (Optional)</label>
            <div className="relative">
              <MapPin className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-gray-400" />
              <textarea
                value={addressValue}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Enter address"
                rows={3}
                className="w-full resize-y rounded-lg border border-[#d8dde3] bg-white py-2.5 pl-10 pr-3 text-sm outline-none transition placeholder:text-gray-400 focus:border-[var(--c-primary)] focus:ring-2 focus:ring-[var(--c-primary)]/15"
              />
            </div>
          </div>

          <div className="mt-4">
            <IconField
              label="Doctor Name (Optional)"
              icon={<Stethoscope className="h-4 w-4 text-gray-400" />}
              value={doctorValue}
              onChange={setDoctor}
              placeholder="Enter doctor name"
            />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <IconField
              label="Email (Optional)"
              icon={<Mail className="h-4 w-4 text-gray-400" />}
              value={emailValue}
              onChange={setEmail}
              placeholder="Enter email"
            />
            <IconField
              label="Age (Optional)"
              icon={<Cake className="h-4 w-4 text-gray-400" />}
              value={ageValue}
              onChange={(v) => setAge(v.replace(/[^\d]/g, "").slice(0, 3))}
              placeholder="Enter age"
              inputMode="numeric"
            />
            <div>
              <label className="field-label">Gender (Optional)</label>
              <Select value={genderValue} onChange={(e) => setGender(e.target.value)} className="h-11">
                <option value="">Select</option>
                <option value="M">Male</option>
                <option value="F">Female</option>
                <option value="O">Other</option>
              </Select>
            </div>
          </div>

          {/* Bill-only details — printed on the invoice header */}
          <p className="mb-3 mt-6 border-t border-[#eceff2] pt-5 text-[13.5px] font-semibold text-gray-900">
            Bill Details
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <IconField
              label="Prescription No. (Optional)"
              icon={<FileText className="h-4 w-4 text-gray-400" />}
              value={prescriptionNo}
              onChange={setPrescriptionNo}
              placeholder="Enter prescription number"
            />
            <IconField
              label="Billed By (Optional)"
              icon={<UserCheck className="h-4 w-4 text-gray-400" />}
              value={billedBy}
              onChange={setBilledBy}
              placeholder="Enter staff name"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[#eceff2] px-7 py-4">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              onConfirm({
                id: matched?.id || null,
                name: nameValue,
                phone,
                address: addressValue,
                doctor: doctorValue,
                email: emailValue,
                age: ageValue,
                gender: genderValue,
                quickBill,
                prescriptionNo,
                billedBy,
              })
            }
          >
            <Printer className="h-4 w-4" /> Print Bill
          </Button>
        </div>
      </div>
    </div>
  );
};

const IconField = ({
  label,
  icon,
  value,
  onChange,
  placeholder,
  inputMode,
}: {
  label: string;
  icon: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  inputMode?: "numeric" | "text";
}) => (
  <div>
    <label className="field-label">{label}</label>
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2">{icon}</span>
      <input
        value={value}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-lg border border-[#d8dde3] bg-white pl-10 pr-3 text-sm outline-none transition placeholder:text-gray-400 focus:border-[var(--c-primary)] focus:ring-2 focus:ring-[var(--c-primary)]/15"
      />
    </div>
  </div>
);
