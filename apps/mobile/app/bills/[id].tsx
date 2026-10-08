import React, { useState } from "react";
import { ActivityIndicator, ScrollView, Share, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";

import HapticPressable from "@/components/ui/atoms/HapticPressable";
import { Typography } from "@/components/ui/atoms/Typography";
import { ScreenLayout } from "@/components/ui/layout";
import { PremiumActionButton } from "@/components/ui/molecules/PremiumActionButton";
import { useAppTheme } from "@/contexts/AppThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { useBill, useRemindBill } from "@/hooks/useBills";
import { getAusdAddress, getMonadChain } from "@/lib/chain";
import { PasskeyFailure } from "@/lib/mera";
import { checkAuthorization } from "@/utils/authorization";
import { apiClient, apiErrorMessage } from "@/utils/apiClient";
import { billPositionAmount, formatBillMoney } from "@/utils/bills";
import { toSignable } from "@/utils/typedData";

export default function BillDetailScreen() {
  const { theme } = useAppTheme();
  const { address, authorize } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const billQuery = useBill(id);
  const remind = useRemindBill();
  const [paying, setPaying] = useState(false);
  const [responding, setResponding] = useState(false);
  const bill = billQuery.data ?? null;

  const share = async () => {
    if (!bill) return;
    const waiting = bill.participants
      .filter((person) => !person.self && !person.paid)
      .map((person) => `${person.name}: ${formatBillMoney(person.amountCents)}`)
      .join("\n");
    await Share.share({
      title: bill.title,
      message: `${bill.title}\n${waiting || formatBillMoney(bill.totalCents)}\n\nOpen in Ferry: ferry://bills/${bill.id}`,
    });
  };

  const pay = async () => {
    if (!bill || !address || paying) return;
    const ownShare = bill.participants.find((participant) => participant.self);
    if (!ownShare) return;
    setPaying(true);
    try {
      const prepared = await apiClient.prepareBillPayment(bill.id);
      const mismatch = checkAuthorization(prepared.typedData, {
        from: address,
        to: prepared.recipient.address,
        amountRaw: ownShare.amountRaw,
        token: getAusdAddress(),
        chainId: getMonadChain().id,
      });
      if (mismatch) {
        throw new Error(
          "This bill payment didn't match what you approved. Nothing was sent."
        );
      }
      const signature = await authorize((signer) =>
        signer.signTypedData(toSignable(prepared.typedData) as never)
      );
      await apiClient.submitBillPayment(bill.id, {
        intentId: prepared.intentId,
        signature,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["bill", bill.id] }),
        queryClient.invalidateQueries({ queryKey: ["bills"] }),
        queryClient.invalidateQueries({ queryKey: ["transfers"] }),
        queryClient.invalidateQueries({ queryKey: ["balances"] }),
      ]);
      showToast("Payment sent · confirming onchain");
    } catch (error) {
      if (error instanceof PasskeyFailure && error.kind === "cancelled") return;
      showToast(
        apiErrorMessage(error) ??
          (error as Error).message ??
          "Payment didn't finish"
      );
    } finally {
      setPaying(false);
    }
  };

  const respond = async (accepted: boolean) => {
    if (!bill || responding) return;
    setResponding(true);
    try {
      await apiClient.respondToBill(bill.id, accepted);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["bill", bill.id] }),
        queryClient.invalidateQueries({ queryKey: ["bills"] }),
      ]);
      showToast(accepted ? "Bill accepted" : "Invitation declined");
    } catch (error) {
      showToast(apiErrorMessage(error) ?? "We couldn't update the invitation");
    } finally {
      setResponding(false);
    }
  };

  const primaryAction = async () => {
    if (!bill) return;
    if (bill.position === "owe") {
      await pay();
      return;
    }
    if (bill.position === "collecting") {
      try {
        const tone =
          bill.reminderCount >= 2
            ? "urgent"
            : bill.reminderCount === 1
              ? "playful"
              : "gentle";
        const result = await remind.mutateAsync({ id: bill.id, tone });
        showToast(
          result.reminded === 1
            ? "Reminder sent"
            : `Reminded ${result.reminded} people`
        );
      } catch (error) {
        showToast(apiErrorMessage(error) ?? "Reminder didn't send");
      }
      return;
    }
    await share();
  };

  if (billQuery.isLoading) {
    return (
      <ScreenLayout
        className="items-center justify-center"
        lightColor={theme.background}
        darkColor={theme.background}
      >
        <ActivityIndicator color={theme.accent} />
      </ScreenLayout>
    );
  }

  if (!bill) {
    return (
      <ScreenLayout
        className="items-center justify-center px-8"
        lightColor={theme.background}
        darkColor={theme.background}
      >
        <Typography
          weight="700"
          className="text-xl"
          style={{ color: theme.text }}
        >
          Bill not found
        </Typography>
        <HapticPressable
          onPress={() => router.back()}
          className="mt-6 rounded-full px-6 py-3"
          style={{ backgroundColor: theme.card }}
        >
          <Typography weight="700" style={{ color: theme.text }}>
            Go back
          </Typography>
        </HapticPressable>
      </ScreenLayout>
    );
  }

  const positionAmount = billPositionAmount(bill);
  const status =
    bill.position === "owe"
      ? `Your share is ${formatBillMoney(positionAmount)}`
      : bill.position === "collecting"
        ? `${formatBillMoney(positionAmount)} still coming back`
        : "Everyone is settled";

  return (
    <ScreenLayout
      className="p-0"
      lightColor={theme.background}
      darkColor={theme.background}
    >
      <View className="h-16 flex-row items-center justify-between px-6">
        <HapticPressable
          accessibilityRole="button"
          accessibilityLabel="Back to Bills"
          feedback="selection"
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
          Bill
        </Typography>
        <HapticPressable
          accessibilityRole="button"
          accessibilityLabel="Share bill"
          feedback="selection"
          onPress={() => void share()}
          className="size-12 items-center justify-center"
        >
          <Ionicons name="share-outline" size={22} color={theme.text} />
        </HapticPressable>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-6 pb-8 pt-6"
        showsVerticalScrollIndicator={false}
      >
        <Typography
          weight="800"
          className="text-[10px] uppercase tracking-[2px]"
          style={{ color: theme.muted }}
        >
          {bill.position === "settled" ? "Settled" : bill.dueLabel}
        </Typography>
        <Typography
          weight="700"
          className="mt-3 text-[36px] leading-10 tracking-[-1.3px]"
          style={{ color: theme.text }}
        >
          {bill.title}
        </Typography>
        {bill.note ? (
          <Typography
            weight="500"
            className="mt-2 text-sm"
            style={{ color: theme.muted }}
          >
            {bill.note}
          </Typography>
        ) : null}

        <Typography
          weight="700"
          className="mt-9 text-[50px] tracking-[-2px]"
          style={{ color: theme.text }}
        >
          {formatBillMoney(bill.totalCents)}
        </Typography>
        <Typography
          weight="600"
          className="mt-1 text-xs"
          style={{ color: theme.muted }}
        >
          {status}
        </Typography>

        <View className="mt-10">
          {bill.participants.find((participant) => participant.self)
            ?.invitationStatus === "PENDING" ? (
            <View
              className="mb-5 rounded-[24px] p-4"
              style={{ backgroundColor: theme.card }}
            >
              <Typography
                weight="700"
                className="text-sm"
                style={{ color: theme.text }}
              >
                You were invited to this split
              </Typography>
              <View className="mt-4 flex-row gap-3">
                <HapticPressable
                  disabled={responding}
                  onPress={() => void respond(false)}
                  className="flex-1 items-center rounded-full py-3"
                  style={{ backgroundColor: theme.cardStrong }}
                >
                  <Typography
                    weight="700"
                    className="text-xs"
                    style={{ color: theme.muted }}
                  >
                    Decline
                  </Typography>
                </HapticPressable>
                <HapticPressable
                  disabled={responding}
                  onPress={() => void respond(true)}
                  className="flex-1 items-center rounded-full py-3"
                  style={{ backgroundColor: theme.primary }}
                >
                  <Typography
                    weight="700"
                    className="text-xs"
                    style={{ color: theme.primaryText }}
                  >
                    Accept
                  </Typography>
                </HapticPressable>
              </View>
            </View>
          ) : null}
          {bill.participants.map((person) => (
            <View
              key={person.id}
              className="flex-row items-center border-b py-4"
              style={{ borderColor: theme.border }}
            >
              <View
                className="size-11 items-center justify-center rounded-full"
                style={{ backgroundColor: theme.accentSoft }}
              >
                <Typography weight="700" style={{ color: theme.text }}>
                  {person.initials}
                </Typography>
              </View>
              <View className="ml-3 flex-1">
                <Typography
                  weight="700"
                  className="text-sm"
                  style={{ color: theme.text }}
                >
                  {person.name}
                </Typography>
                <Typography
                  weight="500"
                  className="mt-0.5 text-[11px]"
                  style={{ color: person.paid ? theme.muted : theme.accent }}
                >
                  {person.paymentStatus === "PAYMENT_PENDING"
                    ? "Confirming"
                    : person.paid
                      ? "Settled"
                      : "Waiting"}
                </Typography>
              </View>
              <Typography
                weight="700"
                className="text-base"
                style={{ color: theme.text }}
              >
                {formatBillMoney(person.amountCents)}
              </Typography>
            </View>
          ))}
        </View>

        <PremiumActionButton
          label={
            bill.position === "owe"
              ? paying
                ? "Confirming…"
                : bill.participants.find((participant) => participant.self)
                      ?.paymentStatus === "PAYMENT_PENDING"
                  ? "Payment confirming"
                  : "Pay with Ferry"
              : bill.position === "settled"
                ? "Share receipt"
                : remind.isPending
                  ? "Sending reminder…"
                  : "Remind everyone"
          }
          tone="ink"
          disabled={
            paying ||
            remind.isPending ||
            bill.participants.find((participant) => participant.self)
              ?.paymentStatus === "PAYMENT_PENDING"
          }
          onPress={() => void primaryAction()}
          style={{ marginTop: 36 }}
        />
      </ScrollView>
    </ScreenLayout>
  );
}
