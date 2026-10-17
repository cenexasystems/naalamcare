-- Clear the placeholder GSTIN / DL No. that the earlier seeds wrote, and pin the
-- owner's confirmed shop details. GSTIN, DL No., Instagram ID and Shop Contact
-- Number are deliberately left empty until the real values are supplied; the app
-- Settings screen is where they get filled in.
UPDATE "settings" SET
  "shop_name" = 'AK PHARMA',
  "full_name" = 'Aravinthan A',
  "phone" = '7259103278',
  "email" = 'akaravinthan2413@gmail.com',
  "address" = 'NO 2 , Venugopalapuram , kill nachipattu post , Tiruvannamalai 606 611',
  "gstin" = '',
  "dl_no" = '',
  "instagram_id" = '',
  "shop_contact_number" = ''
WHERE "id" = 1;