CREATE SEQUENCE IF NOT EXISTS "public"."bill_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "email" text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE "settings" SET
  "phone"   = '7259103278',
  "email"   = 'akaravinthan2413@gmail.com',
  "address" = 'NO 2 , Venugopalapuram , kill nachipattu post , Tiruvannamalai 606 611',
  "dl_no"   = 'TN/KPW20/01877, TN/KPW21/01877'
WHERE "id" = 1;
