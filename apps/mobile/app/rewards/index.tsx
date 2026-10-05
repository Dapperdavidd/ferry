import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetView,
} from "@gorhom/bottom-sheet";

import HapticPressable from "@/components/ui/atoms/HapticPressable";
import { Typography } from "@/components/ui/atoms/Typography";
import { ScreenLayout } from "@/components/ui/layout";
import { BlurBackdrop } from "@/components/ui/molecules/BlurBackdrop";
import { PremiumActionButton } from "@/components/ui/molecules/PremiumActionButton";
import { useAppTheme } from "@/contexts/AppThemeContext";
import { useModalFlow } from "@/contexts/ModalFlowContext";
import { useToast } from "@/contexts/ToastContext";
import { useApplyReferral, useRewards } from "@/hooks/useRewards";
import { apiErrorMessage, type RewardSummary } from "@/utils/apiClient";

export default function RewardsScreen() {
  const router = useRouter();
  const { theme } = useAppTheme();
  const { showSendModal } = useModalFlow();
  const { showToast } = useToast();
  const rewards = useRewards();
  const applyReferral = useApplyReferral();
  const levelsRef = useRef<BottomSheetModal>(null);
  const helpRef = useRef<BottomSheetModal>(null);
  const [showCodeEntry, setShowCodeEntry] = useState(false);
  const [code, setCode] = useState("");
  const summary = rewards.data;

  const openEarningRule = (ruleId: string) => {
    if (ruleId === "first-transfer") {
      router.replace("/(tabs)" as never);
      setTimeout(showSendModal, 150);
      return;
    }
    if (ruleId === "first-flow") {
      router.push("/flows" as never);
      return;
    }
    if (ruleId === "first-cashout") {
      router.push("/cashout" as never);
    }
  };

  const submitCode = async () => {
    const value = code.trim();
    if (!value) return;
    try {
      await applyReferral.mutateAsync(value);
      setShowCodeEntry(false);
      setCode("");
      showToast("Invite code linked");
    } catch (error) {
      showToast(apiErrorMessage(error) ?? "We couldn't link that invite code");
    }
  };

  return (
    <ScreenLayout
      className="p-0"
      decorated={false}
      lightColor={theme.background}
      darkColor={theme.background}
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 56, paddingHorizontal: 24 }}
        refreshControl={
          <RefreshControl
            refreshing={rewards.isRefetching}
            onRefresh={() => void rewards.refetch()}
            tintColor={theme.text}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View className="h-16 flex-row items-center justify-between">
          <CircleButton
            label="Back"
            icon="chevron-back"
            onPress={() => router.back()}
          />
          <CircleButton
            label="About Ferry Miles"
            icon="help-outline"
            onPress={() => helpRef.current?.present()}
          />
        </View>

        <View className="items-center pb-10 pt-10">
          <Typography
            weight="600"
            className="text-[17px]"
            style={{ color: theme.muted }}
          >
            {summary?.level.name ?? "Ferry Miles"}
          </Typography>
          <View className="mt-1 flex-row items-baseline">
            <Typography
              weight="600"
              className="text-[56px] tracking-[-3px]"
              style={{ color: theme.text }}
            >
              {summary ? formatPoints(summary.balance) : "—"}
            </Typography>
            <Typography
              weight="600"
              className="ml-2 text-[27px] tracking-[-1px]"
              style={{ color: theme.faint }}
            >
              Miles
            </Typography>
          </View>

          <View className="mt-5 w-full max-w-[330px]">
            <View
              className="h-1.5 overflow-hidden rounded-full"
              style={{ backgroundColor: theme.cardStrong }}
            >
              <View
                className="h-full rounded-full"
                style={{
                  backgroundColor: theme.accent,
                  width: `${Math.round((summary?.level.progress ?? 0) * 100)}%`,
                }}
              />
            </View>
            <Typography
              weight="500"
              className="mt-2 text-center text-[13px]"
              style={{ color: theme.muted }}
            >
              {nextLevelLabel(summary)}
            </Typography>
          </View>
        </View>

        <View className="mb-8 flex-row gap-3">
          <PremiumActionButton
            label="Invite friends"
            tone="ink"
            style={{ flex: 1 }}
            onPress={() => router.push("/rewards/invite" as never)}
          />
          <PremiumActionButton
            label="Member levels"
            tone="pearl"
            style={{ flex: 1 }}
            onPress={() => levelsRef.current?.present()}
          />
        </View>

        {summary?.referral.canApplyCode ? (
          <HapticPressable
            accessibilityRole="button"
            feedback="selection"
            onPress={() => setShowCodeEntry(true)}
            className="mb-9 flex-row items-center border-y py-4"
            style={{ borderColor: theme.border }}
          >
            <Ionicons name="ticket-outline" size={22} color={theme.text} />
            <Typography
              weight="600"
              className="ml-3 flex-1 text-[15px]"
              style={{ color: theme.text }}
            >
              Have an invite code?
            </Typography>
            <Ionicons name="chevron-forward" size={20} color={theme.faint} />
          </HapticPressable>
        ) : null}

        <SummaryPanel summary={summary} />

        <SectionHeader title="Ways to earn" />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 12, paddingRight: 24 }}
          style={{ marginHorizontal: -24, paddingHorizontal: 24 }}
        >
          {(summary?.earningRules ?? []).map((rule) => (
            <HapticPressable
              key={rule.id}
              accessibilityLabel={
                rule.earned ? `${rule.title}, earned` : `${rule.title}, start`
              }
              accessibilityRole="button"
              accessibilityState={{ disabled: rule.earned }}
              disabled={rule.earned}
              feedback="selection"
              onPress={() => openEarningRule(rule.id)}
              className="w-[255px] justify-between rounded-[28px] border p-5"
              style={{ backgroundColor: theme.card, borderColor: theme.border }}
            >
              <View className="mb-8 flex-row items-center justify-between">
                <View
                  className="size-10 items-center justify-center rounded-full"
                  style={{ backgroundColor: theme.cardStrong }}
                >
                  <Ionicons
                    name={rule.earned ? "checkmark" : "sparkles-outline"}
                    size={19}
                    color={theme.text}
                  />
                </View>
                <Typography
                  weight="700"
                  className="text-[13px]"
                  style={{ color: rule.earned ? theme.muted : theme.text }}
                >
                  {rule.earned ? "Earned" : `+${formatPoints(rule.points)}`}
                </Typography>
              </View>
              <Typography
                weight="700"
                className="text-[18px] leading-6"
                style={{ color: theme.text }}
              >
                {rule.title}
              </Typography>
              <Typography
                weight="500"
                className="mt-2 text-[13px] leading-5"
                style={{ color: theme.muted }}
              >
                {rule.detail}
              </Typography>
              {!rule.earned ? (
                <View className="mt-5 flex-row items-center">
                  <Typography
                    weight="700"
                    className="text-[13px]"
                    style={{ color: theme.text }}
                  >
                    Start
                  </Typography>
                  <Ionicons
                    name="arrow-forward"
                    size={15}
                    color={theme.text}
                    style={{ marginLeft: 6 }}
                  />
                </View>
              ) : null}
            </HapticPressable>
          ))}
        </ScrollView>

        <SectionHeader title="Miles activity" />
        {summary?.activity.length ? (
          <View>
            {summary.activity.map((event, index) => (
              <View
                key={event.id}
                className="flex-row items-center py-4"
                style={
                  index === summary.activity.length - 1
                    ? undefined
                    : { borderBottomColor: theme.border, borderBottomWidth: 1 }
                }
              >
                <View
                  className="size-11 items-center justify-center rounded-full"
                  style={{ backgroundColor: theme.cardStrong }}
                >
                  <Ionicons
                    name={eventIcon(event.kind)}
                    size={19}
                    color={theme.text}
                  />
                </View>
                <View className="ml-3 flex-1">
                  <Typography
                    weight="600"
                    className="text-[15px]"
                    style={{ color: theme.text }}
                  >
                    {event.description}
                  </Typography>
                  <Typography
                    weight="500"
                    className="mt-0.5 text-[12px]"
                    style={{ color: theme.muted }}
                  >
                    {formatDate(event.createdAt)}
                  </Typography>
                </View>
                <Typography
                  weight="700"
                  className="text-[14px]"
                  style={{ color: theme.text }}
                >
                  +{formatPoints(event.points)}
                </Typography>
              </View>
            ))}
          </View>
        ) : (
          <View className="items-center py-9">
            <Typography
              weight="600"
              className="text-[15px]"
              style={{ color: theme.text }}
            >
              No Miles yet
            </Typography>
            <Typography
              weight="500"
              className="mt-1 text-[13px]"
              style={{ color: theme.muted }}
            >
              Your verified Ferry milestones will appear here.
            </Typography>
          </View>
        )}
      </ScrollView>

      <MemberLevelsSheet ref={levelsRef} summary={summary} />
      <MilesHelpSheet ref={helpRef} summary={summary} />
      <ReferralCodeModal
        visible={showCodeEntry}
        code={code}
        isSaving={applyReferral.isPending}
        onChangeCode={setCode}
        onClose={() => setShowCodeEntry(false)}
        onSubmit={() => void submitCode()}
      />
    </ScreenLayout>
  );
}

function CircleButton({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  const { theme } = useAppTheme();
  return (
    <HapticPressable
      accessibilityLabel={label}
      accessibilityRole="button"
      feedback="selection"
      onPress={onPress}
      className="size-12 items-center justify-center rounded-full"
      style={{ backgroundColor: theme.card }}
    >
      <Ionicons name={icon} size={24} color={theme.text} />
    </HapticPressable>
  );
}

function SummaryPanel({ summary }: { summary?: RewardSummary }) {
  const { theme } = useAppTheme();
  return (
    <View
      className="rounded-[30px] border px-5 py-5"
      style={{ backgroundColor: theme.card, borderColor: theme.border }}
    >
      <Typography
        weight="600"
        className="text-[14px]"
        style={{ color: theme.muted }}
      >
        Lifetime Miles
      </Typography>
      <Typography
        weight="600"
        className="mt-1 text-[34px] tracking-[-1.5px]"
        style={{ color: theme.text }}
      >
        {formatPoints(summary?.lifetimeEarned ?? 0)}
      </Typography>
      <View className="my-5 h-px" style={{ backgroundColor: theme.border }} />
      <View className="flex-row">
        <Metric
          label="Ferry activity"
          value={summary?.breakdown.activity ?? 0}
        />
        <View className="mx-5 w-px" style={{ backgroundColor: theme.border }} />
        <Metric
          label="Friend referrals"
          value={summary?.breakdown.referrals ?? 0}
        />
      </View>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  const { theme } = useAppTheme();
  return (
    <View className="flex-1">
      <Typography
        weight="500"
        className="text-[12px]"
        style={{ color: theme.muted }}
      >
        {label}
      </Typography>
      <Typography
        weight="700"
        className="mt-1 text-[17px]"
        style={{ color: theme.text }}
      >
        {formatPoints(value)}
      </Typography>
    </View>
  );
}

function SectionHeader({ title }: { title: string }) {
  const { theme } = useAppTheme();
  return (
    <Typography
      weight="700"
      className="mb-4 mt-10 text-[21px] tracking-[-0.4px]"
      style={{ color: theme.text }}
    >
      {title}
    </Typography>
  );
}

const MemberLevelsSheet = React.forwardRef<
  BottomSheetModal,
  { summary?: RewardSummary }
>(({ summary }, ref) => {
  const { theme } = useAppTheme();
  const snapPoints = useMemo(() => ["65%"], []);
  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => <BlurBackdrop {...props} />,
    []
  );
  return (
    <BottomSheetModal
      ref={ref}
      snapPoints={snapPoints}
      backdropComponent={renderBackdrop}
      enablePanDownToClose
      backgroundStyle={{
        backgroundColor: theme.background,
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
      }}
      handleIndicatorStyle={{ backgroundColor: theme.faint }}
    >
      <BottomSheetScrollView contentContainerStyle={{ padding: 24 }}>
        <Typography
          weight="700"
          className="text-[26px] tracking-[-0.7px]"
          style={{ color: theme.text }}
        >
          Member levels
        </Typography>
        <Typography
          weight="500"
          className="mt-2 text-[14px] leading-5"
          style={{ color: theme.muted }}
        >
          Real Ferry milestones move you forward. Levels never change your
          wallet balance or the price of AUSD.
        </Typography>
        <View className="mt-7">
          {(summary?.levels ?? []).map((level, index) => (
            <View
              key={level.name}
              className="flex-row py-4"
              style={
                index === (summary?.levels.length ?? 0) - 1
                  ? undefined
                  : { borderBottomColor: theme.border, borderBottomWidth: 1 }
              }
            >
              <View
                className="size-11 items-center justify-center rounded-full"
                style={{ backgroundColor: theme.cardStrong }}
              >
                <Ionicons
                  name={level.unlocked ? "checkmark" : "lock-closed-outline"}
                  size={18}
                  color={theme.text}
                />
              </View>
              <View className="ml-3 flex-1">
                <View className="flex-row items-center justify-between">
                  <Typography
                    weight="700"
                    className="text-[16px]"
                    style={{ color: theme.text }}
                  >
                    {level.name}
                  </Typography>
                  <Typography
                    weight="600"
                    className="text-[12px]"
                    style={{ color: theme.muted }}
                  >
                    {formatPoints(level.minimumPoints)} Miles
                  </Typography>
                </View>
                <Typography
                  weight="500"
                  className="mt-1 text-[13px] leading-5"
                  style={{ color: theme.muted }}
                >
                  {level.unlock}
                </Typography>
              </View>
            </View>
          ))}
        </View>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
});
MemberLevelsSheet.displayName = "MemberLevelsSheet";

const MilesHelpSheet = React.forwardRef<
  BottomSheetModal,
  { summary?: RewardSummary }
>(({ summary }, ref) => {
  const { theme } = useAppTheme();
  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => <BlurBackdrop {...props} />,
    []
  );
  return (
    <BottomSheetModal
      ref={ref}
      snapPoints={["48%"]}
      backdropComponent={renderBackdrop}
      enablePanDownToClose
      backgroundStyle={{
        backgroundColor: theme.background,
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
      }}
      handleIndicatorStyle={{ backgroundColor: theme.faint }}
    >
      <BottomSheetView className="px-6 pb-8 pt-4">
        <View
          className="mb-5 size-14 items-center justify-center rounded-full"
          style={{ backgroundColor: theme.cardStrong }}
        >
          <Ionicons name="sparkles" size={24} color={theme.text} />
        </View>
        <Typography
          weight="700"
          className="text-[26px] tracking-[-0.7px]"
          style={{ color: theme.text }}
        >
          Ferry Miles
        </Typography>
        <Typography
          weight="500"
          className="mt-3 text-[15px] leading-6"
          style={{ color: theme.muted }}
        >
          {summary?.terms.summary ??
            "Ferry Miles recognize verified activity inside Ferry."}
        </Typography>
        <Typography
          weight="500"
          className="mt-3 text-[15px] leading-6"
          style={{ color: theme.muted }}
        >
          A referral only qualifies after your friend&apos;s first payment
          settles. Signups alone do not earn Miles.
        </Typography>
      </BottomSheetView>
    </BottomSheetModal>
  );
});
MilesHelpSheet.displayName = "MilesHelpSheet";

function ReferralCodeModal({
  visible,
  code,
  isSaving,
  onChangeCode,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  code: string;
  isSaving: boolean;
  onChangeCode: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const { theme } = useAppTheme();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 justify-end"
      >
        <Pressable
          accessibilityLabel="Close invite code entry"
          onPress={onClose}
          className="absolute inset-0 bg-black/30"
        />
        <View
          className="rounded-t-[34px] px-6 pb-10 pt-7"
          style={{ backgroundColor: theme.background }}
        >
          <View className="flex-row items-center justify-between">
            <Typography
              weight="700"
              className="text-[24px] tracking-[-0.5px]"
              style={{ color: theme.text }}
            >
              Enter invite code
            </Typography>
            <HapticPressable onPress={onClose} className="p-2">
              <Ionicons name="close" size={22} color={theme.muted} />
            </HapticPressable>
          </View>
          <TextInput
            autoFocus
            autoCapitalize="characters"
            autoCorrect={false}
            value={code}
            onChangeText={onChangeCode}
            onSubmitEditing={onSubmit}
            placeholder="FERRY CODE"
            placeholderTextColor={theme.faint}
            returnKeyType="done"
            className="mt-6 h-16 rounded-[22px] px-5 text-[18px]"
            style={{
              backgroundColor: theme.card,
              color: theme.text,
              fontFamily: "Inter_600SemiBold",
            }}
          />
          <HapticPressable
            accessibilityRole="button"
            disabled={!code.trim() || isSaving}
            feedback="impact"
            onPress={onSubmit}
            className="mt-4 h-16 items-center justify-center rounded-full"
            style={{
              backgroundColor: theme.primary,
              opacity: !code.trim() || isSaving ? 0.45 : 1,
            }}
          >
            <Typography
              weight="700"
              className="text-[16px]"
              style={{ color: theme.primaryText }}
            >
              {isSaving ? "Linking…" : "Link code"}
            </Typography>
          </HapticPressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function nextLevelLabel(summary?: RewardSummary) {
  if (!summary) return "Loading your verified milestones…";
  if (!summary.level.nextAt || !summary.level.nextName) {
    return "Top Ferry level reached";
  }
  return `${formatPoints(Math.max(0, summary.level.nextAt - summary.balance))} Miles to ${summary.level.nextName}`;
}

function eventIcon(
  kind: RewardSummary["activity"][number]["kind"]
): keyof typeof Ionicons.glyphMap {
  if (kind === "referral_inviter" || kind === "referral_invitee") {
    return "people-outline";
  }
  if (kind === "cashout_milestone") return "business-outline";
  if (kind === "flow_milestone") return "git-branch-outline";
  return "checkmark";
}

function formatPoints(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
    value
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(date);
}
