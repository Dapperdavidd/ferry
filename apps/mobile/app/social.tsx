import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Share,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";

import HapticPressable from "@/components/ui/atoms/HapticPressable";
import { Typography } from "@/components/ui/atoms/Typography";
import { ScreenLayout } from "@/components/ui/layout";
import { PremiumActionButton } from "@/components/ui/molecules/PremiumActionButton";
import { useAppTheme } from "@/contexts/AppThemeContext";
import { useToast } from "@/contexts/ToastContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  useCreatePaymentRequest,
  useFerryTables,
  useFerryDrops,
  usePaymentRequests,
  useRecurringBills,
} from "@/hooks/useSocial";
import { apiClient, apiErrorMessage } from "@/utils/apiClient";
import { centsToRaw, formatBillMoney, rawToCents } from "@/utils/bills";
import { getAusdAddress, getMonadChain } from "@/lib/chain";
import { PasskeyFailure } from "@/lib/mera";
import { checkAuthorization } from "@/utils/authorization";
import { toSignable } from "@/utils/typedData";

export default function SocialScreen() {
  const { theme } = useAppTheme();
  const { showToast } = useToast();
  const { address, authorize } = useAuth();
  const router = useRouter();
  const client = useQueryClient();
  const requests = usePaymentRequests();
  const tables = useFerryTables();
  const recurring = useRecurringBills();
  const drops = useFerryDrops();
  const createRequest = useCreatePaymentRequest();
  const [requestOpen, setRequestOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);
  const [dropAmount, setDropAmount] = useState("");
  const [dropMemo, setDropMemo] = useState("");
  const [dropping, setDropping] = useState(false);

  const submitRequest = async () => {
    const cents = Math.round((Number(amount) || 0) * 100);
    if (cents < 100 || !memo.trim()) return;
    try {
      const request = await createRequest.mutateAsync({
        amountRaw: centsToRaw(cents),
        memo: memo.trim(),
      });
      setAmount("");
      setMemo("");
      setRequestOpen(false);
      await Share.share({
        title: `Pay ${request.creator.name} with Ferry`,
        message: `${request.memo} · ${formatBillMoney(rawToCents(request.amountRaw))}\n\nPay securely: ferry://requests/${request.token}`,
      });
    } catch (error) {
      showToast(apiErrorMessage(error) ?? "We couldn't create that request");
    }
  };

  const joinTable = async () => {
    const token = joinCode.trim().replace(/^.*tables\//, "");
    if (!token || joining) return;
    setJoining(true);
    try {
      const table = await apiClient.joinFerryTable(token);
      await client.invalidateQueries({ queryKey: ["ferry-tables"] });
      setJoinCode("");
      router.push(`/tables/${table.id}` as never);
    } catch (error) {
      showToast(apiErrorMessage(error) ?? "That table couldn't be joined");
    } finally {
      setJoining(false);
    }
  };

  const createDrop = async () => {
    const cents = Math.round((Number(dropAmount) || 0) * 100);
    if (!address || cents < 100 || !dropMemo.trim() || dropping) return;
    setDropping(true);
    try {
      const [prepared, network] = await Promise.all([
        apiClient.prepareFerryDrop({
          amountRaw: centsToRaw(cents),
          memo: dropMemo.trim(),
          expiresInHours: 72,
        }),
        apiClient.network(),
      ]);
      if (!network.dropAddress)
        throw new Error("Ferry Drop is unavailable on this network.");
      const mismatch = checkAuthorization(prepared.typedData, {
        from: address,
        to: network.dropAddress,
        amountRaw: prepared.amountRaw,
        token: getAusdAddress(),
        chainId: getMonadChain().id,
        primaryType: "ReceiveWithAuthorization",
      });
      if (mismatch)
        throw new Error("This Drop changed before signing. Nothing was sent.");
      const signature = await authorize((signer) =>
        signer.signTypedData(toSignable(prepared.typedData) as never)
      );
      await apiClient.submitFerryDrop(prepared.id, {
        intentId: prepared.intentId,
        signature,
      });
      await client.invalidateQueries({ queryKey: ["ferry-drops"] });
      const link = `ferry://drops/${prepared.secret}`;
      await Share.share({
        title: "A Ferry Drop for you",
        message: `${prepared.memo}\n\nClaim ${formatBillMoney(rawToCents(prepared.amountRaw))} with a passkey: ${link}`,
      });
      setDropAmount("");
      setDropMemo("");
      setDropOpen(false);
    } catch (error) {
      if (error instanceof PasskeyFailure && error.kind === "cancelled") return;
      showToast(
        apiErrorMessage(error) ??
          (error as Error).message ??
          "The Drop didn't finish"
      );
    } finally {
      setDropping(false);
    }
  };

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
            accessibilityLabel="Back"
            onPress={() => router.back()}
            className="size-12 items-center justify-center rounded-full"
            style={{ backgroundColor: theme.card }}
          >
            <Ionicons name="chevron-back" size={24} color={theme.text} />
          </HapticPressable>
          <Typography
            weight="700"
            className="text-[19px]"
            style={{ color: theme.text }}
          >
            Together
          </Typography>
          <View className="size-12" />
        </View>

        <ScrollView
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="px-6 pb-12 pt-5"
          showsVerticalScrollIndicator={false}
        >
          <Typography
            weight="700"
            className="text-[36px] leading-10 tracking-[-1.4px]"
            style={{ color: theme.text }}
          >
            Money works better{"\n"}when everyone sees it.
          </Typography>
          <Typography
            weight="500"
            className="mt-3 text-sm leading-5"
            style={{ color: theme.muted }}
          >
            Request, split and settle together—live on every phone.
          </Typography>

          <View className="mt-8 flex-row gap-3">
            <FeatureButton
              icon="paper-plane-outline"
              title="Request"
              subtitle="Share a pay link"
              onPress={() => setRequestOpen((value) => !value)}
            />
            <FeatureButton
              icon="restaurant-outline"
              title="New table"
              subtitle="Claim the receipt"
              onPress={() => router.push("/table-new" as never)}
            />
          </View>

          <HapticPressable
            accessibilityRole="button"
            accessibilityLabel="Create Ferry Drop"
            feedback="impact"
            onPress={() => setDropOpen((value) => !value)}
            className="mt-3 flex-row items-center rounded-[28px] p-5"
            style={{ backgroundColor: theme.card }}
          >
            <View
              className="size-11 items-center justify-center rounded-full"
              style={{ backgroundColor: theme.cardStrong }}
            >
              <Ionicons name="gift-outline" size={22} color={theme.text} />
            </View>
            <View className="ml-3 flex-1">
              <Typography
                weight="700"
                className="text-base"
                style={{ color: theme.text }}
              >
                Ferry Drop
              </Typography>
              <Typography
                weight="500"
                className="mt-0.5 text-xs"
                style={{ color: theme.muted }}
              >
                Send before they join. They claim with a passkey.
              </Typography>
            </View>
            <Ionicons
              name={dropOpen ? "chevron-up" : "chevron-down"}
              size={18}
              color={theme.faint}
            />
          </HapticPressable>

          {dropOpen ? (
            <View
              className="mt-3 rounded-[28px] p-5"
              style={{ backgroundColor: theme.card }}
            >
              <TextInput
                accessibilityLabel="Drop amount"
                value={dropAmount}
                onChangeText={setDropAmount}
                keyboardType="decimal-pad"
                placeholder="$0.00"
                placeholderTextColor={theme.faint}
                className="h-16 border-b px-0 py-0 font-inter-bold text-[34px]"
                style={{
                  color: theme.text,
                  borderColor: theme.border,
                  lineHeight: 44,
                  textAlignVertical: "center",
                }}
              />
              <TextInput
                accessibilityLabel="Drop note"
                value={dropMemo}
                onChangeText={setDropMemo}
                placeholder="A gift, lunch, welcome money…"
                placeholderTextColor={theme.faint}
                className="mt-4 h-12 font-inter-medium text-sm"
                style={{ color: theme.text }}
              />
              <PremiumActionButton
                label={dropping ? "Opening Face ID…" : "Fund & share Drop"}
                tone="ink"
                disabled={
                  dropping || Number(dropAmount) < 1 || !dropMemo.trim()
                }
                onPress={() => void createDrop()}
                style={{ marginTop: 12 }}
              />
            </View>
          ) : null}

          {requestOpen ? (
            <View
              className="mt-4 rounded-[28px] p-5"
              style={{ backgroundColor: theme.card }}
            >
              <Typography
                weight="700"
                className="text-base"
                style={{ color: theme.text }}
              >
                Create a payment request
              </Typography>
              <TextInput
                accessibilityLabel="Request amount"
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                placeholder="$0.00"
                placeholderTextColor={theme.faint}
                className="mt-5 h-16 border-b px-0 py-0 font-inter-bold text-[34px]"
                style={{
                  color: theme.text,
                  borderColor: theme.border,
                  lineHeight: 44,
                  textAlignVertical: "center",
                }}
              />
              <TextInput
                accessibilityLabel="Request note"
                value={memo}
                onChangeText={setMemo}
                placeholder="Dinner, tickets, rent…"
                placeholderTextColor={theme.faint}
                className="mt-4 h-12 font-inter-medium text-sm"
                style={{ color: theme.text }}
              />
              <PremiumActionButton
                label={createRequest.isPending ? "Creating…" : "Create & share"}
                tone="ink"
                disabled={
                  createRequest.isPending || Number(amount) < 1 || !memo.trim()
                }
                onPress={() => void submitRequest()}
                style={{ marginTop: 12 }}
              />
            </View>
          ) : null}

          <View
            className="mt-7 rounded-[28px] p-5"
            style={{ backgroundColor: theme.card }}
          >
            <View className="flex-row items-center">
              <View
                className="size-11 items-center justify-center rounded-full"
                style={{ backgroundColor: theme.cardStrong }}
              >
                <Ionicons name="qr-code-outline" size={21} color={theme.text} />
              </View>
              <View className="ml-3 flex-1">
                <Typography
                  weight="700"
                  className="text-base"
                  style={{ color: theme.text }}
                >
                  Join a Ferry Table
                </Typography>
                <Typography
                  weight="500"
                  className="mt-0.5 text-xs"
                  style={{ color: theme.muted }}
                >
                  Paste the host&apos;s invite code
                </Typography>
              </View>
            </View>
            <View
              className="mt-4 flex-row items-center border-b pb-2"
              style={{ borderColor: theme.border }}
            >
              <TextInput
                accessibilityLabel="Ferry Table invite code"
                value={joinCode}
                onChangeText={setJoinCode}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Invite code or link"
                placeholderTextColor={theme.faint}
                className="flex-1 py-2 font-inter-medium text-sm"
                style={{ color: theme.text }}
              />
              <HapticPressable
                disabled={!joinCode.trim() || joining}
                onPress={() => void joinTable()}
                className="rounded-full px-4 py-2"
                style={{ backgroundColor: theme.primary }}
              >
                <Typography
                  weight="700"
                  className="text-xs"
                  style={{ color: theme.primaryText }}
                >
                  {joining ? "Joining…" : "Join"}
                </Typography>
              </HapticPressable>
            </View>
          </View>

          <SectionTitle
            title="Live tables"
            action="Create"
            onPress={() => router.push("/table-new" as never)}
          />
          {tables.isLoading ? (
            <ActivityIndicator className="mt-6" color={theme.accent} />
          ) : (tables.data ?? []).length ? (
            <View className="mt-3 gap-2">
              {tables.data?.map((table) => (
                <Row
                  key={table.id}
                  icon={
                    table.status === "OPEN"
                      ? "radio-outline"
                      : "checkmark-circle-outline"
                  }
                  title={table.title}
                  subtitle={`${table.members.length} joined · ${table.items.length} items`}
                  onPress={() => router.push(`/tables/${table.id}` as never)}
                />
              ))}
            </View>
          ) : (
            <EmptyCopy text="Create a table and let everyone claim what they ordered." />
          )}

          <SectionTitle title="Payment requests" />
          {(requests.data ?? []).length ? (
            <View className="mt-3 gap-2">
              {requests.data?.slice(0, 5).map((request) => (
                <Row
                  key={request.id}
                  icon="link-outline"
                  title={request.memo}
                  subtitle={`${formatBillMoney(rawToCents(request.amountRaw))} · ${request.status.toLowerCase().replace("_", " ")}`}
                  onPress={() =>
                    router.push(`/requests/${request.token}` as never)
                  }
                />
              ))}
            </View>
          ) : (
            <EmptyCopy text="Your shared payment links will appear here." />
          )}

          <SectionTitle title="Your Drops" />
          {(drops.data ?? []).length ? (
            <View className="mt-3 gap-2">
              {drops.data?.slice(0, 5).map((drop) => (
                <Row
                  key={drop.id}
                  icon="gift-outline"
                  title={drop.memo}
                  subtitle={`${formatBillMoney(rawToCents(drop.amountRaw))} · ${drop.status.toLowerCase().replace("_", " ")}`}
                  onPress={() => undefined}
                />
              ))}
            </View>
          ) : (
            <EmptyCopy text="Drops you fund for future Ferry friends appear here." />
          )}

          <SectionTitle
            title="Recurring circles"
            action="Manage"
            onPress={() => router.push("/bills/groups" as never)}
          />
          {(recurring.data ?? []).length ? (
            <View className="mt-3 gap-2">
              {recurring.data?.map((item) => (
                <Row
                  key={item.id}
                  icon="repeat-outline"
                  title={item.title}
                  subtitle={`${item.cadence} · ${item.active ? "active" : "paused"}`}
                  onPress={() => undefined}
                />
              ))}
            </View>
          ) : (
            <EmptyCopy text="Turn any group bill into a weekly or monthly circle." />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenLayout>
  );
}

function FeatureButton({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  const { theme } = useAppTheme();
  return (
    <HapticPressable
      accessibilityRole="button"
      accessibilityLabel={title}
      feedback="impact"
      onPress={onPress}
      className="min-h-32 flex-1 justify-between rounded-[28px] p-5"
      style={{ backgroundColor: theme.card }}
    >
      <Ionicons name={icon} size={24} color={theme.text} />
      <View className="mt-5">
        <Typography
          weight="700"
          className="text-base"
          style={{ color: theme.text }}
        >
          {title}
        </Typography>
        <Typography
          weight="500"
          className="mt-1 text-[11px]"
          style={{ color: theme.muted }}
        >
          {subtitle}
        </Typography>
      </View>
    </HapticPressable>
  );
}

function SectionTitle({
  title,
  action,
  onPress,
}: {
  title: string;
  action?: string;
  onPress?: () => void;
}) {
  const { theme } = useAppTheme();
  return (
    <View className="mt-9 flex-row items-center justify-between">
      <Typography
        weight="700"
        className="text-lg"
        style={{ color: theme.text }}
      >
        {title}
      </Typography>
      {action && onPress ? (
        <HapticPressable onPress={onPress} className="py-2 pl-4">
          <Typography
            weight="700"
            className="text-xs"
            style={{ color: theme.muted }}
          >
            {action}
          </Typography>
        </HapticPressable>
      ) : null}
    </View>
  );
}

function Row({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  const { theme } = useAppTheme();
  return (
    <HapticPressable
      onPress={onPress}
      className="flex-row items-center rounded-[22px] px-4 py-4"
      style={{ backgroundColor: theme.card }}
    >
      <Ionicons name={icon} size={20} color={theme.text} />
      <View className="ml-3 flex-1">
        <Typography
          weight="700"
          className="text-sm"
          style={{ color: theme.text }}
        >
          {title}
        </Typography>
        <Typography
          weight="500"
          className="mt-1 text-[11px] capitalize"
          style={{ color: theme.muted }}
        >
          {subtitle}
        </Typography>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.faint} />
    </HapticPressable>
  );
}

function EmptyCopy({ text }: { text: string }) {
  const { theme } = useAppTheme();
  return (
    <Typography
      weight="500"
      className="mt-3 text-sm leading-5"
      style={{ color: theme.muted }}
    >
      {text}
    </Typography>
  );
}
