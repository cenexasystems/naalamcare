ALTER TABLE "settings" ADD COLUMN "full_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "shop_contact_number" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "colour_theme" text DEFAULT 'green' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "logo" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "instagram_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE "settings" SET
  "shop_name" = 'AK PHARMA',
  "full_name" = 'Aravinthan A',
  "phone" = '7259103278',
  "email" = 'akaravinthan2413@gmail.com',
  "address" = 'NO 2 , Venugopalapuram , kill nachipattu post , Tiruvannamalai 606 611',
  "colour_theme" = 'green',
  "logo" = '/logos/ak-pharma-logo-square.jpeg'
WHERE "id" = 1;
