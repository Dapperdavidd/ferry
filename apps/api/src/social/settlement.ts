export interface BalanceInput {
  userId: string;
  amountRaw: bigint;
}

export interface SettlementPlanLeg {
  fromUserId: string;
  toUserId: string;
  amountRaw: string;
}

/** Produces an exact plan with at most members - 1 legs and no rounding. */
export function minimizeSettlement(
  balances: BalanceInput[],
): SettlementPlanLeg[] {
  const debtors = balances
    .filter((entry) => entry.amountRaw < 0n)
    .map((entry) => ({ ...entry, amountRaw: -entry.amountRaw }))
    .sort(compareLargest);
  const creditors = balances
    .filter((entry) => entry.amountRaw > 0n)
    .map((entry) => ({ ...entry }))
    .sort(compareLargest);
  const legs: SettlementPlanLeg[] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amount =
      debtor.amountRaw < creditor.amountRaw
        ? debtor.amountRaw
        : creditor.amountRaw;
    if (amount > 0n) {
      legs.push({
        fromUserId: debtor.userId,
        toUserId: creditor.userId,
        amountRaw: amount.toString(),
      });
      debtor.amountRaw -= amount;
      creditor.amountRaw -= amount;
    }
    if (debtor.amountRaw === 0n) debtorIndex += 1;
    if (creditor.amountRaw === 0n) creditorIndex += 1;
  }

  if (
    debtors.some((entry) => entry.amountRaw !== 0n) ||
    creditors.some((entry) => entry.amountRaw !== 0n)
  ) {
    throw new Error("Settlement balances do not net to zero");
  }
  return legs;
}

function compareLargest(
  left: { userId: string; amountRaw: bigint },
  right: { userId: string; amountRaw: bigint },
) {
  if (left.amountRaw === right.amountRaw)
    return left.userId.localeCompare(right.userId);
  return left.amountRaw > right.amountRaw ? -1 : 1;
}
