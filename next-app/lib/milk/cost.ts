/* =============================================================
   DOODLY — Milk tanker cost formula (PURE).
   No DB, no server-only: this is the arithmetic heart of the profit engine
   and is unit-tested in isolation. Every money value is integer paise.

   Given a KG entry + FAT% + the (snapshotted) seasonal rates:
     litres   = quantityKg / conversionFactor
     kgFat    = quantityKg × fatPct / 100
     milkCost = litres × milkRatePaise          (per-LITRE MAINTENANCE charge —
                                                 the field is UI-labelled "Maintenance";
                                                 the milk itself is priced by fat below)
     fatCost  = kgFat  × fatRatePaise            (per KG-FAT — the actual milk cost)
     transport= entered per tanker (default from config)
     total    = milkCost + fatCost + transport   (maintenance + milk + transport)
     /litre   = total / litres
     /kg      = total / quantityKg
   NB: the DB/field name `milkRatePaise` is kept for compatibility; it holds the
   per-litre maintenance charge. Rename to maintenanceRatePaise needs a migration.
   ============================================================= */

export interface CostRates {
  conversionFactor: number; // litres per kg divisor (e.g. 1.03)
  milkRatePaise: number;    // paise per litre
  fatRatePaise: number;     // paise per kg-fat
  transportPaise: number;   // paise per tanker
}

export interface CostInput {
  quantityKg: number;
  fatPct: number;
  rates: CostRates;
}

export interface TankerCost {
  quantityKg: number;
  fatPct: number;
  litres: number;            // rounded to 3 dp for display; full precision kept in math
  kgFat: number;             // rounded to 3 dp
  milkCostPaise: number;
  fatCostPaise: number;
  transportPaise: number;
  totalCostPaise: number;
  costPerLitrePaise: number;
  costPerKgPaise: number;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Compute a tanker's full cost breakdown. Guards against a zero/negative
 *  conversion factor or quantity so a bad config can never divide-by-zero. */
export function computeTankerCost(input: CostInput): TankerCost {
  const kg = Math.max(0, Number(input.quantityKg) || 0);
  const fat = Math.max(0, Number(input.fatPct) || 0);
  const factor = Number(input.rates.conversionFactor) > 0 ? Number(input.rates.conversionFactor) : 1;
  const milkRate = Math.max(0, Math.round(Number(input.rates.milkRatePaise) || 0));
  const fatRate = Math.max(0, Math.round(Number(input.rates.fatRatePaise) || 0));
  const transportPaise = Math.max(0, Math.round(Number(input.rates.transportPaise) || 0));

  const litres = kg / factor;
  const kgFat = (kg * fat) / 100;

  // Round each cost component to paise once; the total is the sum of rounded
  // components so the displayed lines always reconcile to the displayed total.
  const milkCostPaise = Math.round(litres * milkRate);
  const fatCostPaise = Math.round(kgFat * fatRate);
  const totalCostPaise = milkCostPaise + fatCostPaise + transportPaise;

  const costPerLitrePaise = litres > 0 ? Math.round(totalCostPaise / litres) : 0;
  const costPerKgPaise = kg > 0 ? Math.round(totalCostPaise / kg) : 0;

  return {
    quantityKg: round3(kg),
    fatPct: fat,
    litres: round3(litres),
    kgFat: round3(kgFat),
    milkCostPaise,
    fatCostPaise,
    transportPaise,
    totalCostPaise,
    costPerLitrePaise,
    costPerKgPaise,
  };
}

/** Full-precision litres for a kg quantity — used by the FIFO ledger so a lot's
 *  remaining volume is exact, not the 3dp display rounding. */
export function litresOf(quantityKg: number, conversionFactor: number): number {
  const factor = conversionFactor > 0 ? conversionFactor : 1;
  return (Math.max(0, quantityKg) || 0) / factor;
}
