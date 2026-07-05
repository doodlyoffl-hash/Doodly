-- Address: structured last-mile delivery fields (all nullable → additive, non-destructive).
ALTER TABLE "Address"
  ADD COLUMN "contactName"  TEXT,
  ADD COLUMN "contactPhone" TEXT,
  ADD COLUMN "altPhone"     TEXT,
  ADD COLUMN "houseNo"      TEXT,
  ADD COLUMN "buildingName" TEXT,
  ADD COLUMN "floor"        TEXT,
  ADD COLUMN "street"       TEXT,
  ADD COLUMN "area"         TEXT,
  ADD COLUMN "state"        TEXT,
  ADD COLUMN "landmark"     TEXT,
  ADD COLUMN "block"        TEXT,
  ADD COLUMN "wing"         TEXT,
  ADD COLUMN "gateNumber"   TEXT,
  ADD COLUMN "doorColor"    TEXT;
