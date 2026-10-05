import {
  addFlowDraft,
  balanceFlowDrafts,
  createDefaultFlowDrafts,
  createSpendableFlowDraft,
  draftsToDestinations,
  draftsToPreviewDestinations,
  flowToDrafts,
  removeFlowDraft,
  setDraftPercentage,
  validateFlowDrafts,
} from "@/utils/flows";

const address = "0x50B240678777451BEfd67B7e8c3b4366482ba8F9";

describe("Ferry Flows model", () => {
  it("keeps the demo preview to one simple 80/20 split", () => {
    const drafts = createDefaultFlowDrafts(address);

    expect(drafts.map((item) => [item.label, item.percentage])).toEqual([
      ["Spendable", "80"],
      ["@bola", "20"],
    ]);
    expect(validateFlowDrafts(drafts)).toMatchObject({
      valid: true,
      totalPercentage: 100,
    });
  });

  it("offers an immediately valid production starting point", () => {
    expect(validateFlowDrafts(createSpendableFlowDraft(address))).toMatchObject(
      {
        valid: true,
        totalPercentage: 100,
      }
    );
  });

  it("requires the allocation to total exactly 100%", () => {
    const drafts = setDraftPercentage(
      createDefaultFlowDrafts(address),
      "person-preview",
      25
    );

    expect(validateFlowDrafts(drafts)).toMatchObject({
      valid: false,
      totalPercentage: 105,
      message: "5% over the limit.",
    });
  });

  it("rejects empty labels and percentages with more than two decimals", () => {
    const drafts = createDefaultFlowDrafts(address);
    drafts[0] = { ...drafts[0], label: "" };
    drafts[1] = { ...drafts[1], percentage: "20.001" };

    const result = validateFlowDrafts(drafts, { allowUnavailableKinds: true });
    expect(result.valid).toBe(false);
    expect(result.errors.spendable).toBe("Add a name.");
    expect(result.errors["person-preview"]).toBe(
      "Use no more than two decimal places."
    );
  });

  it("moves ten percent from the largest destination when adding a person", () => {
    const drafts = addFlowDraft(createDefaultFlowDrafts(address), address);

    expect(drafts).toHaveLength(3);
    expect(drafts[0].percentage).toBe("70");
    expect(drafts[2].percentage).toBe("10");
    expect(drafts[2].kind).toBe("person");
    expect(validateFlowDrafts(drafts).valid).toBe(false);
  });

  it("returns a removed destination's percentage to Spendable", () => {
    const drafts = removeFlowDraft(
      createDefaultFlowDrafts(address),
      "person-preview"
    );

    expect(drafts).toHaveLength(1);
    expect(drafts[0].percentage).toBe("100");
    expect(validateFlowDrafts(drafts).valid).toBe(true);
  });

  it("converts percentages to basis points without exposing that unit to UI state", () => {
    const ready = createDefaultFlowDrafts(address).map((draft) => ({
      ...draft,
      kind: "spendable" as const,
      address,
    }));
    const destinations = draftsToDestinations(ready);
    expect(destinations.map((item) => item.basisPoints)).toEqual([8000, 2000]);
    expect(
      flowToDrafts({
        enabled: true,
        destinations,
        version: 1,
        updatedAt: "2026-10-05T00:00:00.000Z",
      }).map((item) => item.percentage)
    ).toEqual(["80", "20"]);
  });

  it("requires future pocket destinations to be replaced before activation", () => {
    const futurePocket = [
      {
        id: "spendable",
        label: "Spendable",
        kind: "spendable" as const,
        address,
        percentage: "80",
      },
      {
        id: "future-pocket",
        label: "Savings",
        kind: "pocket" as const,
        address: "",
        percentage: "20",
      },
    ];
    const result = validateFlowDrafts(futurePocket);
    expect(result.errors["future-pocket"]).toContain("Pockets are coming soon");
    expect(
      validateFlowDrafts(futurePocket, {
        allowUnavailableKinds: true,
      }).valid
    ).toBe(true);
    expect(draftsToPreviewDestinations(futurePocket, address)).toHaveLength(2);
  });

  it("can rebalance an edited allocation back to 100%", () => {
    const edited = setDraftPercentage(
      createDefaultFlowDrafts(address),
      "person-preview",
      25
    );
    const balanced = balanceFlowDrafts(edited);
    expect(balanced[0].percentage).toBe("75");
    expect(validateFlowDrafts(balanced).totalPercentage).toBe(100);
  });
});
