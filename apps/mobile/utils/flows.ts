import type {
  Flow,
  FlowDestination,
  FlowDestinationKind,
} from "@/utils/apiClient";

export type FlowDestinationDraft = {
  id: string;
  label: string;
  kind: FlowDestinationKind;
  address: string;
  percentage: string;
};

export type FlowValidation = {
  valid: boolean;
  totalPercentage: number;
  message: string | null;
  errors: Record<string, string>;
};

const MAX_DESTINATIONS = 5;
const MIN_DESTINATIONS = 1;

const percentageOf = (draft: FlowDestinationDraft) => {
  const value = Number(draft.percentage);
  return Number.isFinite(value) ? value : 0;
};

const formatPercentage = (value: number) =>
  Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");

export function createDefaultFlowDrafts(
  address: string
): FlowDestinationDraft[] {
  return [
    {
      id: "spendable",
      label: "Spendable",
      kind: "spendable",
      address,
      percentage: "80",
    },
    {
      id: "person-preview",
      label: "@bola",
      kind: "person",
      address: "",
      percentage: "20",
    },
  ];
}

export function createSpendableFlowDraft(
  address: string
): FlowDestinationDraft[] {
  return [
    {
      id: "spendable",
      label: "Spendable",
      kind: "spendable",
      address,
      percentage: "100",
    },
  ];
}

export function flowToDrafts(flow: Flow): FlowDestinationDraft[] {
  return flow.destinations.map((destination, index) => ({
    id: `${destination.kind}-${index}-${destination.label}`,
    label: destination.label,
    kind: destination.kind,
    address: destination.address,
    percentage: formatPercentage(destination.basisPoints / 100),
  }));
}

export function validateFlowDrafts(
  drafts: FlowDestinationDraft[],
  options: { allowUnavailableKinds?: boolean } = {}
): FlowValidation {
  const errors: Record<string, string> = {};

  if (drafts.length < MIN_DESTINATIONS || drafts.length > MAX_DESTINATIONS) {
    return {
      valid: false,
      totalPercentage: drafts.reduce(
        (sum, item) => sum + percentageOf(item),
        0
      ),
      message: "Choose between one and five destinations.",
      errors,
    };
  }

  for (const draft of drafts) {
    const amount = Number(draft.percentage);
    if (!draft.label.trim()) errors[draft.id] = "Add a name.";
    else if (
      !options.allowUnavailableKinds &&
      (draft.kind === "pocket" || draft.kind === "bank")
    )
      errors[draft.id] =
        `${draft.kind === "pocket" ? "Pockets" : "Bank transfers"} are coming soon. Choose Person or Spendable to activate this Flow.`;
    else if (
      !draft.address.trim() &&
      draft.kind !== "person" &&
      !(
        options.allowUnavailableKinds &&
        (draft.kind === "pocket" || draft.kind === "bank")
      )
    )
      errors[draft.id] = "This destination is not ready.";
    else if (
      draft.kind === "person" &&
      !/^@[a-zA-Z0-9_.-]{2,}$/.test(draft.label.trim())
    )
      errors[draft.id] = "Enter a Ferry handle, starting with @.";
    else if (!Number.isFinite(amount) || amount <= 0 || amount > 100)
      errors[draft.id] = "Choose a percentage from 0.01 to 100.";
    else if (Math.round(amount * 100) !== amount * 100)
      errors[draft.id] = "Use no more than two decimal places.";
  }

  const totalPercentage = drafts.reduce(
    (sum, item) => sum + percentageOf(item),
    0
  );
  const roundedTotal = Math.round(totalPercentage * 100) / 100;
  const totalsCorrectly = roundedTotal === 100;

  return {
    valid: Object.keys(errors).length === 0 && totalsCorrectly,
    totalPercentage: roundedTotal,
    message: totalsCorrectly
      ? Object.keys(errors).length
        ? "Check the highlighted destination."
        : null
      : `${formatPercentage(Math.abs(100 - roundedTotal))}% ${roundedTotal < 100 ? "left to assign" : "over the limit"}.`,
    errors,
  };
}

export function draftsToDestinations(
  drafts: FlowDestinationDraft[]
): FlowDestination[] {
  const validation = validateFlowDrafts(drafts);
  if (!validation.valid)
    throw new Error(validation.message ?? "Flow is not valid.");
  if (drafts.some((draft) => !draft.address.trim()))
    throw new Error("Resolve every person before activating this Flow.");

  return drafts.map((draft) => ({
    label: draft.label.trim(),
    kind: draft.kind,
    address: draft.address,
    basisPoints: Math.round(Number(draft.percentage) * 100),
  }));
}

export function draftsToPreviewDestinations(
  drafts: FlowDestinationDraft[],
  previewAddress: string
): FlowDestination[] {
  const validation = validateFlowDrafts(drafts, {
    allowUnavailableKinds: true,
  });
  if (!validation.valid)
    throw new Error(validation.message ?? "Flow is not valid.");
  return drafts.map((draft) => ({
    label: draft.label.trim(),
    kind: draft.kind,
    address: draft.address || previewAddress,
    basisPoints: Math.round(Number(draft.percentage) * 100),
  }));
}

export function setDraftPercentage(
  drafts: FlowDestinationDraft[],
  id: string,
  percentage: number
): FlowDestinationDraft[] {
  const clamped = Math.max(0.01, Math.min(100, percentage));
  return drafts.map((draft) =>
    draft.id === id
      ? { ...draft, percentage: formatPercentage(clamped) }
      : draft
  );
}

export function addFlowDraft(
  drafts: FlowDestinationDraft[],
  address: string
): FlowDestinationDraft[] {
  if (drafts.length >= MAX_DESTINATIONS) return drafts;
  const donor = drafts.reduce(
    (best, item) => (percentageOf(item) > percentageOf(best) ? item : best),
    drafts[0]
  );
  if (!donor) return createDefaultFlowDrafts(address);
  const allocation = Math.min(10, Math.max(1, percentageOf(donor) - 0.01));
  const id = `person-${Date.now()}-${drafts.length}`;

  return [
    ...setDraftPercentage(drafts, donor.id, percentageOf(donor) - allocation),
    {
      id,
      label: "@",
      kind: "person",
      address: "",
      percentage: formatPercentage(allocation),
    },
  ];
}

export function balanceFlowDrafts(
  drafts: FlowDestinationDraft[]
): FlowDestinationDraft[] {
  if (!drafts.length) return drafts;
  const total = drafts.reduce((sum, draft) => sum + percentageOf(draft), 0);
  const recipient =
    drafts.find((draft) => draft.kind === "spendable") ?? drafts[0];
  return setDraftPercentage(
    drafts,
    recipient.id,
    percentageOf(recipient) + (100 - total)
  );
}

export function removeFlowDraft(
  drafts: FlowDestinationDraft[],
  id: string
): FlowDestinationDraft[] {
  if (drafts.length <= MIN_DESTINATIONS) return drafts;
  const removed = drafts.find((draft) => draft.id === id);
  const remaining = drafts.filter((draft) => draft.id !== id);
  if (!removed || !remaining[0]) return drafts;
  const recipient =
    remaining.find((draft) => draft.kind === "spendable") ?? remaining[0];
  return setDraftPercentage(
    remaining,
    recipient.id,
    percentageOf(recipient) + percentageOf(removed)
  );
}

export function flowSummary(destinations: FlowDestination[]) {
  return destinations
    .map(
      (destination) =>
        `${destination.label} ${formatPercentage(destination.basisPoints / 100)}%`
    )
    .join(", ");
}
