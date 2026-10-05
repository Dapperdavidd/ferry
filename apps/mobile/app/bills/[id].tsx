import React, { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Share, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";

import HapticPressable from "@/components/ui/atoms/HapticPressable";
import { Typography } from "@/components/ui/atoms/Typography";
import { ScreenLayout } from "@/components/ui/layout";
import { PremiumActionButton } from "@/components/ui/molecules/PremiumActionButton";
import { useAppTheme } from "@/contexts/AppThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { useModalFlow } from "@/contexts/ModalFlowContext";
import {
  billPositionAmount,
  formatBillMoney,
  loadBills,
  type Bill,
} from "@/utils/bills";
import { SEED_DEMO } from "@/utils/devSeed";

export default function BillDetailScreen() {
  const { theme } = useAppTheme();
  const { user, address } = useAuth();
  const { showSendModal } = useModalFlow();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const owner = user?.id ?? address ?? "ferry-user";
  const [bill, setBill] = useState<Bill | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void loadBills(owner, SEED_DEMO).then((items) => {
      if (!active) return;
      setBill(items.find((item) => item.id === id) ?? null);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [id, owner]);

  const share = async () => {
    if (!bill) return;
    const waiting = bill.participants
      .filter((person) => !person.self && !person.paid)
      .map((person) => `${person.name}: ${formatBillMoney(person.amountCents)}`)
      .join("\n");
    await Share.share({
      title: bill.title,
      message: `${bill.title}\n${waiting || formatBillMoney(bill.totalCents)}\n\nSettle with Ferry.`,
    });
  };

  const primaryAction = () => {
    if (!bill) return;
    if (bill.position === "owe") {
      showSendModal();
      router.replace("/(tabs)" as never);
      return;
    }
    void share();
  };

  if (loading) {
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
        : bill.position === "draft"
          ? "Ready to share"
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
                  {person.paid ? "Settled" : "Waiting"}
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
              ? "Pay with Ferry"
              : bill.position === "settled"
                ? "Share receipt"
                : "Share reminder"
          }
          tone="ink"
          onPress={primaryAction}
          style={{ marginTop: 36 }}
        />
      </ScrollView>
    </ScreenLayout>
  );
}
