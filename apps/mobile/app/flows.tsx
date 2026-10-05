import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";

import HapticPressable from "@/components/ui/atoms/HapticPressable";
import { Typography } from "@/components/ui/atoms/Typography";
import { ScreenLayout } from "@/components/ui/layout";
import { useAppTheme } from "@/contexts/AppThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { FLOW_QUERY_KEY, useFlow } from "@/hooks/useFlow";
import { getFlowContractAddress, getMonadChain } from "@/lib/chain";
import { PasskeyFailure } from "@/lib/mera";
import { apiClient, apiErrorMessage, type Flow } from "@/utils/apiClient";
import { SEED_DEMO } from "@/utils/devSeed";
import {
  checkFlowConfiguration,
  checkFlowDisable,
} from "@/utils/flowAuthorization";
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
  type FlowDestinationDraft,
} from "@/utils/flows";
import { toSignable } from "@/utils/typedData";

type ScreenMode = "overview" | "edit" | "review" | "disable-review" | "done";
type Completion = "active" | "activating" | "disabled" | "disabling";

export default function FlowsScreen() {
  const { theme } = useAppTheme();
  const { height, width } = useWindowDimensions();
  const { address, authorize } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const flowQuery = useFlow();
  const hydrated = useRef(false);
  const [drafts, setDrafts] = useState<FlowDestinationDraft[]>([]);
  const [mode, setMode] = useState<ScreenMode>("overview");
  const [completion, setCompletion] = useState<Completion>("active");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const flowContractAddress = getFlowContractAddress();
  const chain = getMonadChain();
  const compact = height < 760 || width < 360;
  const productionAvailable = SEED_DEMO || Boolean(flowContractAddress);

  useEffect(() => {
    if (hydrated.current || flowQuery.isLoading || !address) return;
    const loaded = flowQuery.data;
    setDrafts(
      loaded?.enabled && loaded.destinations.length
        ? flowToDrafts(loaded)
        : SEED_DEMO
          ? createDefaultFlowDrafts(address)
          : createSpendableFlowDraft(address)
    );
    hydrated.current = true;
  }, [address, flowQuery.data, flowQuery.isLoading]);

  const validation = useMemo(
    () =>
      validateFlowDrafts(drafts, {
        allowUnavailableKinds: SEED_DEMO,
      }),
    [drafts]
  );

  const updateDraft = (
    id: string,
    update: (draft: FlowDestinationDraft) => FlowDestinationDraft
  ) => {
    setError(null);
    setDrafts((current) =>
      current.map((draft) => (draft.id === id ? update(draft) : draft))
    );
  };

  const resolvePeople = async (items: FlowDestinationDraft[]) => {
    const resolved = await Promise.all(
      items.map(async (draft) => {
        if (draft.kind !== "person") return draft;
        const handle = draft.label.trim().replace(/^@/, "");
        const person = await apiClient.resolveHandle(handle);
        if (!person) throw new Error(`We couldn't find @${handle} on Ferry.`);
        if (person.address.toLowerCase() === address?.toLowerCase())
          throw new Error("Choose someone other than yourself.");
        return {
          ...draft,
          label: `@${person.handle}`,
          address: person.address,
        };
      })
    );
    const addresses = resolved.map((draft) => draft.address.toLowerCase());
    if (new Set(addresses).size !== addresses.length)
      throw new Error("Each destination needs to be different.");
    return resolved;
  };

  const activate = async () => {
    if (!address || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (SEED_DEMO) {
        const destinations = draftsToPreviewDestinations(drafts, address);
        const preview = await apiClient.previewFlow(destinations);
        queryClient.setQueryData(FLOW_QUERY_KEY("seed-user"), preview);
        setMode("done");
        return;
      }

      const resolved = await resolvePeople(drafts);
      setDrafts(resolved);
      const destinations = draftsToDestinations(resolved);
      if (!flowContractAddress) {
        throw new Error(
          "Flows are not connected in this build yet. Nothing changed."
        );
      }
      const prepared = await apiClient.prepareFlow({ destinations });
      const mismatch = checkFlowConfiguration(prepared.typedData, {
        owner: address,
        destinations,
        chainId: chain.id,
        verifyingContract: flowContractAddress,
        expiresAt: prepared.expiresAt,
      });
      if (mismatch) {
        throw new Error(
          "This Flow did not match what you reviewed. Nothing changed."
        );
      }
      const signature = await authorize((signer) =>
        signer.signTypedData(toSignable(prepared.typedData) as never)
      );
      const saved = await apiClient.submitFlow({
        intentId: prepared.intentId,
        signature,
      });
      if (saved.status === "FAILED") {
        throw new Error(
          "Your Flow couldn't be activated. Nothing changed. Please try again."
        );
      }
      await queryClient.invalidateQueries({ queryKey: ["flow"] });
      await queryClient.invalidateQueries({ queryKey: ["rewards"] });
      setCompletion(saved.status === "CONFIRMED" ? "active" : "activating");
      setMode("done");
    } catch (reason) {
      if (reason instanceof PasskeyFailure && reason.kind === "cancelled") {
        setError("You cancelled the passkey check. Your Flow was not changed.");
      } else {
        setError(
          apiErrorMessage(reason) ??
            (reason instanceof Error
              ? reason.message
              : "Your Flow couldn't be activated. Nothing changed.")
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    if (!address || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (SEED_DEMO) {
        const preview = await apiClient.previewDisableFlow();
        queryClient.setQueryData(FLOW_QUERY_KEY("seed-user"), preview);
        setCompletion("disabled");
      } else {
        if (!flowContractAddress) {
          throw new Error(
            "Flows are not connected in this build yet. Your Flow is still active."
          );
        }
        const prepared = await apiClient.prepareFlow({
          enabled: false,
          destinations: [],
        });
        const mismatch = checkFlowDisable(prepared.typedData, {
          owner: address,
          chainId: chain.id,
          verifyingContract: flowContractAddress,
          expiresAt: prepared.expiresAt,
        });
        if (mismatch) {
          throw new Error(
            "This change did not match what you reviewed. Your Flow is still active."
          );
        }
        const signature = await authorize((signer) =>
          signer.signTypedData(toSignable(prepared.typedData) as never)
        );
        const saved = await apiClient.submitFlow({
          intentId: prepared.intentId,
          signature,
        });
        if (saved.status === "FAILED") {
          throw new Error(
            "Your Flow couldn't be turned off. It is still active. Please try again."
          );
        }
        await queryClient.invalidateQueries({ queryKey: ["flow"] });
        await queryClient.invalidateQueries({ queryKey: ["rewards"] });
        setCompletion(saved.status === "CONFIRMED" ? "disabled" : "disabling");
      }
      setMode("done");
    } catch (reason) {
      if (reason instanceof PasskeyFailure && reason.kind === "cancelled") {
        setError("You cancelled the passkey check. Your Flow is still active.");
      } else {
        setError(
          apiErrorMessage(reason) ??
            (reason instanceof Error
              ? reason.message
              : "Your Flow couldn't be turned off. It is still active.")
        );
      }
    } finally {
      setBusy(false);
    }
  };

  // A failed first request never hydrates drafts; do not let that masquerade
  // as an endless loading state or hide the retry affordance.
  const loading =
    flowQuery.isLoading || (!hydrated.current && !flowQuery.isError);

  return (
    <ScreenLayout
      className="p-0"
      lightColor={theme.background}
      darkColor={theme.background}
    >
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View className="h-16 flex-row items-center justify-between px-6">
          <HapticPressable
            accessible
            accessibilityRole="button"
            accessibilityLabel={
              mode === "overview" ? "Go back" : "Back to Flow"
            }
            accessibilityState={{ disabled: busy }}
            feedback="selection"
            disabled={busy}
            onPress={() =>
              mode !== "overview"
                ? setMode(mode === "review" ? "edit" : "overview")
                : router.back()
            }
            className="size-12 items-center justify-center rounded-full"
            style={{ backgroundColor: theme.card }}
          >
            <Ionicons name="chevron-back" size={24} color={theme.text} />
          </HapticPressable>
          <Typography
            weight="700"
            className="text-[20px] tracking-[-0.4px]"
            style={{ color: theme.text }}
          >
            Flow
          </Typography>
          <View className="size-12" />
        </View>

        {loading ? (
          <View
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel="Preparing your Flow"
            className="flex-1 items-center justify-center px-8"
          >
            <ActivityIndicator color={theme.accent} />
            <Typography
              weight="600"
              className="mt-4 text-sm"
              style={{ color: theme.muted }}
            >
              Preparing your Flow…
            </Typography>
          </View>
        ) : flowQuery.isError ? (
          <View className="flex-1 items-center justify-center px-8">
            <Ionicons
              name="cloud-offline-outline"
              size={32}
              color={theme.muted}
            />
            <Typography
              weight="700"
              className="mt-4 text-center text-lg"
              style={{ color: theme.text }}
            >
              We couldn&apos;t load your Flow
            </Typography>
            <HapticPressable
              accessible
              accessibilityRole="button"
              accessibilityLabel="Try loading Flow again"
              accessibilityState={{ busy: flowQuery.isRefetching }}
              feedback="selection"
              onPress={() => void flowQuery.refetch()}
              disabled={flowQuery.isRefetching}
              className="mt-5 rounded-full px-5 py-3"
              style={{ backgroundColor: theme.cardStrong }}
            >
              {flowQuery.isRefetching ? (
                <ActivityIndicator size="small" color={theme.text} />
              ) : (
                <Typography
                  weight="700"
                  className="text-sm"
                  style={{ color: theme.text }}
                >
                  Try again
                </Typography>
              )}
            </HapticPressable>
          </View>
        ) : mode === "done" ? (
          <FlowDone
            preview={SEED_DEMO}
            completion={completion}
            onDone={() => router.back()}
          />
        ) : mode === "overview" ? (
          <FlowOverview
            flow={flowQuery.data}
            drafts={drafts}
            preview={SEED_DEMO}
            available={productionAvailable}
            onEdit={() => {
              setError(null);
              setMode("edit");
            }}
            onDisable={() => {
              setError(null);
              setMode("disable-review");
            }}
          />
        ) : mode === "disable-review" ? (
          <FlowDisableReview
            busy={busy}
            error={error}
            preview={SEED_DEMO}
            available={productionAvailable}
            onDisable={() => void disable()}
            onKeep={() => setMode("edit")}
          />
        ) : mode === "review" ? (
          <FlowReview
            drafts={drafts}
            busy={busy}
            error={error}
            preview={SEED_DEMO}
            available={productionAvailable}
            onActivate={() => void activate()}
          />
        ) : (
          <ScrollView
            className="flex-1"
            keyboardShouldPersistTaps="handled"
            contentContainerClassName="px-6 pb-10 pt-3"
            showsVerticalScrollIndicator={false}
          >
            <FlowIntro
              preview={SEED_DEMO}
              available={productionAvailable}
              compact={compact}
            />

            <View className="mb-2 mt-8 flex-row items-end justify-between">
              <View>
                <Typography
                  weight="700"
                  className="text-[19px]"
                  style={{ color: theme.text }}
                >
                  Your split
                </Typography>
                <Typography
                  weight="500"
                  className="mt-0.5 text-xs"
                  style={{ color: theme.muted }}
                >
                  Keep some. Send some. Change it any time.
                </Typography>
              </View>
              <View className="items-end">
                <Typography
                  weight="800"
                  className="text-[18px]"
                  style={{ color: theme.text }}
                >
                  {validation.totalPercentage}%
                </Typography>
                <Typography
                  weight="600"
                  className="text-[10px] uppercase tracking-[1px]"
                  style={{ color: theme.muted }}
                >
                  assigned
                </Typography>
              </View>
            </View>

            {drafts.map((draft) => (
              <DestinationEditor
                key={draft.id}
                draft={draft}
                canRemove={draft.kind !== "spendable" && drafts.length > 1}
                error={validation.errors[draft.id]}
                onLabel={(label) =>
                  updateDraft(draft.id, (current) => ({
                    ...current,
                    label,
                    address: current.kind === "person" ? "" : current.address,
                  }))
                }
                onPercentage={(percentage) =>
                  updateDraft(draft.id, (current) => ({
                    ...current,
                    percentage,
                  }))
                }
                onStep={(amount) =>
                  setDrafts((current) =>
                    setDraftPercentage(
                      current,
                      draft.id,
                      Number(draft.percentage || 0) + amount
                    )
                  )
                }
                onRemove={() =>
                  setDrafts((current) => removeFlowDraft(current, draft.id))
                }
              />
            ))}

            <View className="mt-1 flex-row gap-3">
              {drafts.length < 5 ? (
                <HapticPressable
                  feedback="selection"
                  accessibilityRole="button"
                  accessibilityLabel="Add someone"
                  onPress={() =>
                    setDrafts((current) => addFlowDraft(current, address ?? ""))
                  }
                  className="flex-1 flex-row items-center justify-center gap-2 rounded-full border py-4"
                  style={{
                    borderColor: theme.border,
                    backgroundColor: theme.card,
                  }}
                >
                  <Ionicons name="add" size={18} color={theme.text} />
                  <Typography
                    weight="700"
                    className="text-sm"
                    style={{ color: theme.text }}
                  >
                    Add someone
                  </Typography>
                </HapticPressable>
              ) : null}
              {validation.totalPercentage !== 100 ? (
                <HapticPressable
                  feedback="selection"
                  accessibilityRole="button"
                  accessibilityLabel="Balance allocation to 100 percent"
                  onPress={() => setDrafts(balanceFlowDrafts(drafts))}
                  className="rounded-full px-5 py-3.5"
                  style={{ backgroundColor: theme.accentSoft }}
                >
                  <Typography
                    weight="700"
                    className="text-sm"
                    style={{ color: theme.text }}
                  >
                    Balance
                  </Typography>
                </HapticPressable>
              ) : null}
            </View>

            {validation.message ? (
              <Typography
                accessibilityLiveRegion="polite"
                weight="600"
                className="mt-4 text-center text-xs"
                style={{ color: theme.muted }}
              >
                {validation.message}
              </Typography>
            ) : null}

            <HapticPressable
              accessible
              accessibilityRole="button"
              accessibilityLabel="Continue to review"
              accessibilityState={{ disabled: !validation.valid }}
              disabled={!validation.valid}
              onPress={() => {
                setError(null);
                setMode("review");
              }}
              className="mt-6 items-center rounded-full py-5"
              style={{
                backgroundColor: theme.primary,
                opacity: validation.valid ? 1 : 0.34,
              }}
            >
              <Typography
                weight="700"
                className="text-[16px]"
                style={{ color: theme.primaryText }}
              >
                Continue
              </Typography>
            </HapticPressable>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </ScreenLayout>
  );
}

function FlowOverview({
  flow,
  drafts,
  preview,
  available,
  onEdit,
  onDisable,
}: {
  flow?: Flow;
  drafts: FlowDestinationDraft[];
  preview: boolean;
  available: boolean;
  onEdit: () => void;
  onDisable: () => void;
}) {
  const { theme } = useAppTheme();
  const enabled = Boolean(flow?.enabled && drafts.length);

  return (
    <ScrollView
      contentContainerClassName="flex-grow px-6 pb-8 pt-5"
      showsVerticalScrollIndicator={false}
    >
      <View className="items-center pt-3">
        <Typography
          weight="800"
          className="text-[10px] uppercase tracking-[2px]"
          style={{ color: theme.muted }}
        >
          {enabled ? "Flow is on" : "Automatic money"}
        </Typography>

        <View className="my-8 h-[190px] w-[190px] items-center justify-center">
          <View
            className="absolute h-[190px] w-[190px] rounded-full border"
            style={{ borderColor: theme.border }}
          />
          <View
            className="absolute h-[146px] w-[146px] rounded-full"
            style={{ backgroundColor: theme.accentSoft }}
          />
          <View
            className="absolute h-[106px] w-[106px] items-center justify-center rounded-full"
            style={{ backgroundColor: theme.cardStrong }}
          >
            <Ionicons
              name={enabled ? "checkmark" : "arrow-down"}
              size={38}
              color={theme.text}
            />
          </View>
        </View>

        <Typography
          weight="700"
          className="max-w-[330px] text-center text-[31px] leading-9 tracking-[-1.1px]"
          style={{ color: theme.text }}
        >
          {enabled
            ? "Every payment, already in place."
            : "Set it once. Let every payment arrive ready."}
        </Typography>
        <Typography
          weight="500"
          className="mt-3 max-w-[310px] text-center text-sm leading-5"
          style={{ color: theme.muted }}
        >
          {enabled
            ? "Ferry follows your split automatically. You stay in control."
            : "Keep what you need. Send a share to someone. Ferry handles the rest."}
        </Typography>
      </View>

      {enabled ? (
        <View className="mt-9">
          <View className="mb-4 h-2 flex-row overflow-hidden rounded-full">
            {drafts.map((draft, index) => (
              <View
                key={draft.id}
                className={index ? "ml-0.5" : undefined}
                style={{
                  flex: Number(draft.percentage),
                  backgroundColor:
                    index === 0
                      ? theme.text
                      : index === 1
                        ? theme.accent
                        : theme.muted,
                  opacity: index > 1 ? 0.58 : 1,
                }}
              />
            ))}
          </View>
          {drafts.map((draft, index) => (
            <View
              key={draft.id}
              className="flex-row items-center justify-between border-b py-4"
              style={{ borderColor: theme.border }}
            >
              <View className="flex-row items-center gap-3">
                <Ionicons
                  name={
                    draft.kind === "person"
                      ? "person-outline"
                      : "wallet-outline"
                  }
                  size={20}
                  color={index === 0 ? theme.text : theme.accent}
                />
                <Typography
                  weight="600"
                  className="text-[15px]"
                  style={{ color: theme.text }}
                >
                  {draft.label}
                </Typography>
              </View>
              <Typography
                weight="700"
                className="text-[16px]"
                style={{ color: theme.text }}
              >
                {draft.percentage}%
              </Typography>
            </View>
          ))}
        </View>
      ) : null}

      {preview ? (
        <Typography
          weight="600"
          className="mt-5 text-center text-[11px] uppercase tracking-[1px]"
          style={{ color: theme.muted }}
        >
          Preview only · no money moves
        </Typography>
      ) : !available ? (
        <Typography
          weight="600"
          className="mt-5 text-center text-xs"
          style={{ color: theme.muted }}
        >
          Available after this build connects to Ferry Flow.
        </Typography>
      ) : null}

      <View className="flex-1" />
      <HapticPressable
        accessible
        accessibilityRole="button"
        accessibilityLabel={enabled ? "Adjust Flow" : "Set up Flow"}
        feedback="selection"
        onPress={onEdit}
        className="mt-8 items-center rounded-full py-5"
        style={{ backgroundColor: theme.primary }}
      >
        <Typography
          weight="700"
          className="text-[16px]"
          style={{ color: theme.primaryText }}
        >
          {enabled ? "Adjust Flow" : "Set up Flow"}
        </Typography>
      </HapticPressable>
      {enabled ? (
        <HapticPressable
          accessible
          accessibilityRole="button"
          accessibilityLabel={preview ? "Remove Flow preview" : "Turn off Flow"}
          feedback="selection"
          onPress={onDisable}
          className="items-center py-4"
        >
          <Typography
            weight="600"
            className="text-xs"
            style={{ color: theme.muted }}
          >
            {preview ? "Remove preview" : "Turn off Flow"}
          </Typography>
        </HapticPressable>
      ) : null}
    </ScrollView>
  );
}

function FlowIntro({
  preview,
  available,
  compact,
}: {
  preview: boolean;
  available: boolean;
  compact: boolean;
}) {
  const { theme } = useAppTheme();
  return (
    <View className={compact ? "pb-3 pt-2" : "pb-5 pt-5"}>
      <Typography
        weight="800"
        className="text-[10px] uppercase tracking-[2px]"
        style={{ color: theme.muted }}
      >
        Every payment
      </Typography>
      <Typography
        weight="700"
        className={`${compact ? "text-[28px] leading-8" : "text-[34px] leading-10"} mt-4 max-w-[330px] tracking-[-1.2px]`}
        style={{ color: theme.text }}
      >
        Where should it go?
      </Typography>
      <Typography
        weight="500"
        className="mt-3 max-w-[315px] text-sm leading-5"
        style={{ color: theme.muted }}
      >
        Spendable stays with you. Add a Ferry person for anything you want to
        share.
      </Typography>
      {preview || !available ? (
        <Typography
          weight="600"
          className="mt-4 text-[11px]"
          style={{ color: theme.muted }}
        >
          {preview
            ? "Preview only — no money moves."
            : "You can explore this now. Activation is not connected in this build."}
        </Typography>
      ) : null}
    </View>
  );
}

function DestinationEditor({
  draft,
  canRemove,
  error,
  onLabel,
  onPercentage,
  onStep,
  onRemove,
}: {
  draft: FlowDestinationDraft;
  canRemove: boolean;
  error?: string;
  onLabel: (label: string) => void;
  onPercentage: (percentage: string) => void;
  onStep: (amount: number) => void;
  onRemove: () => void;
}) {
  const { theme } = useAppTheme();
  const numericPercentage = Number(draft.percentage || 0);
  const canDecrease = numericPercentage > 0.01;
  const canIncrease = numericPercentage < 100;
  const icon =
    draft.kind === "person"
      ? "person-outline"
      : draft.kind === "pocket"
        ? "bookmark-outline"
        : draft.kind === "bank"
          ? "business-outline"
          : "wallet-outline";

  return (
    <View
      className="border-b py-5"
      style={{ borderColor: error ? theme.accent : theme.border }}
    >
      <View className="flex-row items-center gap-3">
        <Ionicons name={icon} size={22} color={theme.text} />
        <TextInput
          accessibilityLabel={
            draft.kind === "person" ? "Ferry person" : `${draft.label} name`
          }
          accessibilityHint={
            draft.kind === "person"
              ? "Enter a Ferry handle beginning with at."
              : undefined
          }
          value={draft.label}
          editable={draft.kind !== "spendable"}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={draft.kind === "person" ? "@ferryname" : "Name"}
          placeholderTextColor={theme.faint}
          onChangeText={onLabel}
          className="h-11 flex-1 font-inter-semibold text-[17px]"
          style={{ color: theme.text }}
        />
        {canRemove ? (
          <HapticPressable
            feedback="selection"
            accessibilityRole="button"
            accessibilityLabel={`Remove ${draft.label || "person"}`}
            onPress={onRemove}
            className="size-9 items-center justify-center"
          >
            <Ionicons name="close" size={18} color={theme.muted} />
          </HapticPressable>
        ) : null}
      </View>

      <View className="mt-2 flex-row items-center justify-between pl-[34px]">
        <Typography
          weight="500"
          className="text-xs"
          style={{ color: theme.muted }}
        >
          of every payment
        </Typography>
        <View
          className="flex-row items-center rounded-full border p-1"
          style={{ borderColor: theme.border, backgroundColor: theme.card }}
        >
          <HapticPressable
            feedback="selection"
            accessibilityRole="button"
            accessibilityLabel={`Decrease ${draft.label} percentage`}
            accessibilityState={{ disabled: !canDecrease }}
            disabled={!canDecrease}
            onPress={() => onStep(-5)}
            className="size-9 items-center justify-center"
            style={{ opacity: canDecrease ? 1 : 0.3 }}
          >
            <Ionicons name="remove" size={17} color={theme.muted} />
          </HapticPressable>
          <View className="flex-row items-center">
            <TextInput
              accessibilityLabel={`${draft.label} percentage`}
              accessibilityValue={{ text: `${draft.percentage || 0} percent` }}
              keyboardType="decimal-pad"
              selectTextOnFocus
              value={draft.percentage}
              onChangeText={(value) =>
                onPercentage(value.replace(/[^0-9.]/g, ""))
              }
              className="h-9 w-12 text-right font-inter-bold text-[16px]"
              style={{ color: theme.text }}
            />
            <Typography
              weight="700"
              className="pr-1 text-sm"
              style={{ color: theme.text }}
            >
              %
            </Typography>
          </View>
          <HapticPressable
            feedback="selection"
            accessibilityRole="button"
            accessibilityLabel={`Increase ${draft.label} percentage`}
            accessibilityState={{ disabled: !canIncrease }}
            disabled={!canIncrease}
            onPress={() => onStep(5)}
            className="size-9 items-center justify-center"
            style={{ opacity: canIncrease ? 1 : 0.3 }}
          >
            <Ionicons name="add" size={17} color={theme.muted} />
          </HapticPressable>
        </View>
      </View>
      {error ? (
        <Typography
          accessibilityLiveRegion="polite"
          weight="600"
          className="mt-3 pl-[34px] text-[11px] leading-4"
          style={{ color: theme.muted }}
        >
          {error}
        </Typography>
      ) : null}
    </View>
  );
}

function FlowReview({
  drafts,
  busy,
  error,
  preview,
  available,
  onActivate,
}: {
  drafts: FlowDestinationDraft[];
  busy: boolean;
  error: string | null;
  preview: boolean;
  available: boolean;
  onActivate: () => void;
}) {
  const { theme } = useAppTheme();
  return (
    <ScrollView
      contentContainerClassName="flex-grow px-6 pb-8 pt-6"
      showsVerticalScrollIndicator={false}
    >
      <View className="pt-3">
        <Typography
          weight="800"
          className="text-[10px] uppercase tracking-[2px]"
          style={{ color: theme.muted }}
        >
          Automatic money
        </Typography>
        <Typography
          weight="700"
          className="mt-4 max-w-[330px] text-[34px] leading-10 tracking-[-1.3px]"
          style={{ color: theme.text }}
        >
          One last look.
        </Typography>
        <Typography
          weight="500"
          className="mt-3 max-w-[310px] text-sm leading-5"
          style={{ color: theme.muted }}
        >
          Every payment will arrive like this. Change it whenever you want.
        </Typography>
      </View>

      <View className="mt-12">
        <View className="mb-6 h-2.5 flex-row overflow-hidden rounded-full">
          {drafts.map((draft, index) => (
            <View
              key={draft.id}
              className={index ? "ml-0.5" : undefined}
              style={{
                flex: Number(draft.percentage),
                backgroundColor:
                  index === 0
                    ? theme.text
                    : index === 1
                      ? theme.accent
                      : theme.muted,
                opacity: index > 1 ? Math.max(0.36, 0.9 - index * 0.12) : 1,
              }}
            />
          ))}
        </View>
        {drafts.map((draft, index) => (
          <View
            key={draft.id}
            className="flex-row items-center justify-between border-b py-5"
            style={{ borderColor: theme.border }}
          >
            <View className="flex-row items-center gap-3">
              <Ionicons
                name={
                  draft.kind === "person" ? "person-outline" : "wallet-outline"
                }
                size={21}
                color={index === 0 ? theme.text : theme.accent}
              />
              <Typography
                weight="600"
                className="text-[16px]"
                style={{ color: theme.text }}
              >
                {draft.label}
              </Typography>
            </View>
            <Typography
              weight="800"
              className="text-[18px]"
              style={{ color: theme.text }}
            >
              {draft.percentage}%
            </Typography>
          </View>
        ))}
      </View>

      {preview ? (
        <Typography
          weight="600"
          className="mt-5 text-center text-[11px] uppercase tracking-[1px]"
          style={{ color: theme.muted }}
        >
          Preview only · no money moves
        </Typography>
      ) : !available ? (
        <Typography
          accessible
          accessibilityRole="alert"
          weight="600"
          className="mt-5 text-center text-xs leading-5"
          style={{ color: theme.muted }}
        >
          Activation is not connected in this build. Nothing will move.
        </Typography>
      ) : null}
      {error ? (
        <Typography
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
          weight="600"
          className="mt-4 text-center text-xs leading-5"
          style={{ color: theme.muted }}
        >
          {error}
        </Typography>
      ) : null}

      <View className="flex-1" />
      <HapticPressable
        accessible
        accessibilityRole="button"
        accessibilityLabel={
          preview
            ? "Save local Flow preview"
            : available
              ? "Confirm Flow with passkey"
              : "Flow activation unavailable in this build"
        }
        accessibilityState={{ busy, disabled: busy || !available }}
        disabled={busy || !available}
        onPress={onActivate}
        className="mt-7 flex-row items-center justify-center gap-3 rounded-full py-5"
        style={{
          backgroundColor: theme.primary,
          opacity: busy || !available ? 0.45 : 1,
        }}
      >
        {busy ? (
          <ActivityIndicator size="small" color={theme.primaryText} />
        ) : (
          <Ionicons
            name={preview ? "eye-outline" : "finger-print-outline"}
            size={20}
            color={theme.primaryText}
          />
        )}
        <Typography
          weight="700"
          className="text-[16px]"
          style={{ color: theme.primaryText }}
        >
          {busy
            ? "Confirming…"
            : preview
              ? "Save preview"
              : available
                ? "Confirm with passkey"
                : "Unavailable in this build"}
        </Typography>
      </HapticPressable>
      {!preview ? (
        <Typography
          weight="500"
          className="mt-3 text-center text-[11px]"
          style={{ color: theme.faint }}
        >
          You&apos;ll approve this change once. Ferry does the rest.
        </Typography>
      ) : null}
    </ScrollView>
  );
}

function FlowDisableReview({
  busy,
  error,
  preview,
  available,
  onDisable,
  onKeep,
}: {
  busy: boolean;
  error: string | null;
  preview: boolean;
  available: boolean;
  onDisable: () => void;
  onKeep: () => void;
}) {
  const { theme } = useAppTheme();
  return (
    <View className="flex-1 px-6 pb-8 pt-12">
      <View className="items-center">
        <View
          className="size-16 items-center justify-center rounded-full"
          style={{ backgroundColor: theme.cardStrong }}
        >
          <Ionicons name="pause-outline" size={29} color={theme.text} />
        </View>
        <Typography
          weight="700"
          className="mt-6 text-center text-[29px] tracking-[-1px]"
          style={{ color: theme.text }}
        >
          {preview ? "Remove this preview?" : "Turn off your Flow?"}
        </Typography>
        <Typography
          weight="500"
          className="mt-3 max-w-[315px] text-center text-sm leading-5"
          style={{ color: theme.muted }}
        >
          {preview
            ? "The demo allocation will disappear from Home. No money is affected."
            : "New payments will stay fully Spendable. You can create another Flow whenever you want."}
        </Typography>
      </View>

      {error ? (
        <Typography
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
          weight="600"
          className="mt-6 text-center text-xs leading-5"
          style={{ color: theme.muted }}
        >
          {error}
        </Typography>
      ) : null}

      {!preview && !available ? (
        <View
          accessible
          accessibilityRole="alert"
          className="mt-6 rounded-[20px] px-4 py-3"
          style={{ backgroundColor: theme.accentSoft }}
        >
          <Typography
            weight="700"
            className="text-center text-xs leading-5"
            style={{ color: theme.text }}
          >
            This build cannot change your Flow. Your current Flow remains
            active.
          </Typography>
        </View>
      ) : null}

      <View className="flex-1" />
      <HapticPressable
        accessible
        accessibilityRole="button"
        accessibilityLabel={
          preview
            ? "Remove preview"
            : available
              ? "Turn off Flow with passkey"
              : "Turning off Flow is unavailable in this build"
        }
        accessibilityState={{ busy, disabled: busy || !available }}
        disabled={busy || !available}
        onPress={onDisable}
        className="items-center rounded-full border py-5"
        style={{
          backgroundColor: theme.cardStrong,
          borderColor: theme.border,
          opacity: busy || !available ? 0.45 : 1,
        }}
      >
        {busy ? (
          <ActivityIndicator size="small" color={theme.text} />
        ) : (
          <Typography
            weight="700"
            className="text-[16px]"
            style={{ color: theme.text }}
          >
            {preview
              ? "Remove preview"
              : available
                ? "Turn off with passkey"
                : "Unavailable in this build"}
          </Typography>
        )}
      </HapticPressable>
      <HapticPressable
        feedback="selection"
        accessibilityRole="button"
        accessibilityLabel="Keep Flow active"
        disabled={busy}
        onPress={onKeep}
        className="mt-3 items-center rounded-full py-5"
        style={{ backgroundColor: theme.primary, opacity: busy ? 0.55 : 1 }}
      >
        <Typography
          weight="700"
          className="text-[16px]"
          style={{ color: theme.primaryText }}
        >
          Keep Flow
        </Typography>
      </HapticPressable>
    </View>
  );
}

function FlowDone({
  preview,
  completion,
  onDone,
}: {
  preview: boolean;
  completion: Completion;
  onDone: () => void;
}) {
  const { theme } = useAppTheme();
  const disabled = completion === "disabled" || completion === "disabling";
  const pending = completion === "activating" || completion === "disabling";
  return (
    <View className="flex-1 items-center justify-center px-7 pb-10">
      <View
        className="size-20 items-center justify-center rounded-full"
        style={{ backgroundColor: theme.accentSoft }}
      >
        <Ionicons
          name={
            pending
              ? "time-outline"
              : disabled
                ? "pause-outline"
                : preview
                  ? "eye-outline"
                  : "checkmark"
          }
          size={36}
          color={theme.text}
        />
      </View>
      <Typography
        weight="700"
        className="mt-6 text-center text-[30px] tracking-[-1px]"
        style={{ color: theme.text }}
      >
        {disabled
          ? completion === "disabling"
            ? "Your Flow is turning off"
            : preview
              ? "Preview removed"
              : "Your Flow is off"
          : completion === "activating"
            ? "Your Flow is activating"
            : preview
              ? "Your preview is ready"
              : "Your Flow is active"}
      </Typography>
      <Typography
        weight="500"
        className="mt-3 max-w-[310px] text-center text-sm leading-5"
        style={{ color: theme.muted }}
      >
        {disabled
          ? completion === "disabling"
            ? "Ferry is finishing this change. Until it confirms, your current Flow remains active."
            : preview
              ? "The local demo allocation is no longer shown."
              : "New payments will remain fully Spendable until you create another Flow."
          : completion === "activating"
            ? "Ferry is finishing this change. Payments will follow your percentages once it confirms."
            : preview
              ? "This demo shows how incoming money will be allocated. No money will move."
              : "When money lands, Ferry will move it using the percentages you chose."}
      </Typography>
      <HapticPressable
        feedback="selection"
        accessibilityRole="button"
        accessibilityLabel="Return home"
        onPress={onDone}
        className="mt-9 w-full items-center rounded-full py-5"
        style={{ backgroundColor: theme.primary }}
      >
        <Typography
          weight="700"
          className="text-[16px]"
          style={{ color: theme.primaryText }}
        >
          Done
        </Typography>
      </HapticPressable>
    </View>
  );
}
