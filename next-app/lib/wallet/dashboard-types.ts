/* Client-safe wallet shapes (no server-only imports). Dates arrive as ISO strings. */

export interface WalletTxnView {
  id: string;
  type: "CREDIT" | "DEBIT";
  kind: string;
  amountPaise: number;
  balanceAfterPaise: number;
  reference: string;
  description: string | null;
  createdAt: string;
}

export interface WalletView {
  balancePaise: number;
  transactions: WalletTxnView[];
  summary: {
    cashbackEarnedPaise: number;
    referralRewardsPaise: number;
    promoCreditsPaise: number;
    usedPaise: number;
  };
}
