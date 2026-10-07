import React, { useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import HapticPressable from "@/components/ui/atoms/HapticPressable";
import { Typography } from "@/components/ui/atoms/Typography";
import { ScreenLayout } from "@/components/ui/layout";
import { useAppTheme } from "@/contexts/AppThemeContext";
import { useBills } from "@/hooks/useBills";
import {
  billPositionAmount,
  formatBillMoney,
  type Bill,
  type BillCategory,
} from "@/utils/bills";

const CATEGORY_ICON: Record<BillCategory, keyof typeof Ionicons.glyphMap> = {
  food: "restaurant-outline",
  transport: "car-outline",
  home: "home-outline",
  travel: "airplane-outline",
  shopping: "bag-handle-outline",
  other: "receipt-outline",
};

const BILL_FILTERS: { id: BillCategory | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "food", label: "Food" },
  { id: "transport", label: "Transport" },
  { id: "home", label: "Home" },
  { id: "travel", label: "Travel" },
  { id: "shopping", label: "Shopping" },
  { id: "other", label: "Other" },
];

export default function BillsScreen() {
  const { theme } = useAppTheme();
  const router = useRouter();
  const billsQuery = useBills();
  const bills = billsQuery.data ?? [];
  const [view, setView] = useState<"open" | "settled">("open");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<BillCategory | "all">("all");
  const [filtersVisible, setFiltersVisible] = useState(false);

  const openBills = bills.filter((bill) => bill.position !== "settled");
  const settledBills = bills.filter((bill) => bill.position === "settled");
  const visibleBills = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return (view === "open" ? openBills : settledBills).filter((bill) => {
      const matchesCategory = category === "all" || bill.category === category;
      if (!matchesCategory) return false;
      if (!normalizedQuery) return true;

      const searchableText = [
        bill.title,
        bill.note,
        bill.dueLabel,
        bill.category,
        ...bill.participants.flatMap((person) => [person.name, person.handle]),
      ]
        .join(" ")
        .toLowerCase();
      return searchableText.includes(normalizedQuery);
    });
  }, [category, openBills, query, settledBills, view]);
  const collecting = useMemo(
    () =>
      openBills
        .filter((bill) => bill.position === "collecting")
        .reduce((total, bill) => total + billPositionAmount(bill), 0),
    [openBills]
  );
  const owing = useMemo(
    () =>
      openBills
        .filter((bill) => bill.position === "owe")
        .reduce((total, bill) => total + billPositionAmount(bill), 0),
    [openBills]
  );

  return (
    <ScreenLayout
      className="p-0"
      lightColor={theme.background}
      darkColor={theme.background}
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40, paddingHorizontal: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="h-16 flex-row items-center justify-between">
          <HapticPressable
            accessible
            accessibilityRole="button"
            accessibilityLabel="Back to home"
            feedback="selection"
            onPress={() => router.back()}
            className="size-12 items-center justify-center rounded-full"
            style={{ backgroundColor: theme.card }}
          >
            <Ionicons name="chevron-back" size={24} color={theme.text} />
          </HapticPressable>
          <Typography
            weight="700"
            className="text-[19px] tracking-[-0.3px]"
            style={{ color: theme.text }}
          >
            Bills
          </Typography>
          <HapticPressable
            accessible
            accessibilityRole="button"
            accessibilityLabel="Create a new bill"
            feedback="impact"
            onPress={() => router.push("/bills/new" as never)}
            className="size-12 items-center justify-center rounded-full"
            style={{ backgroundColor: theme.primary }}
          >
            <Ionicons name="add" size={24} color={theme.primaryText} />
          </HapticPressable>
        </View>

        <View
          className="mt-6 flex-row items-center border-y py-5"
          style={{ borderColor: theme.border }}
        >
          <View className="flex-1">
            <Typography
              weight="600"
              className="text-xs"
              style={{ color: theme.muted }}
            >
              You&apos;re owed
            </Typography>
            <Typography
              weight="700"
              className="mt-1 text-[24px] tracking-[-0.7px]"
              style={{ color: theme.text }}
            >
              {formatBillMoney(collecting)}
            </Typography>
          </View>
          <View
            className="mx-5 h-11 w-px"
            style={{ backgroundColor: theme.border }}
          />
          <View className="flex-1">
            <Typography
              weight="600"
              className="text-xs"
              style={{ color: theme.muted }}
            >
              You owe
            </Typography>
            <Typography
              weight="700"
              className="mt-1 text-[24px] tracking-[-0.7px]"
              style={{ color: theme.text }}
            >
              {formatBillMoney(owing)}
            </Typography>
          </View>
        </View>

        <HapticPressable
          accessibilityRole="button"
          accessibilityLabel="Open bill groups"
          feedback="selection"
          onPress={() => router.push("/bills/groups" as never)}
          className="mt-5 flex-row items-center py-2"
        >
          <View
            className="size-10 items-center justify-center rounded-full"
            style={{ backgroundColor: theme.card }}
          >
            <Ionicons name="people-outline" size={20} color={theme.text} />
          </View>
          <View className="ml-3 flex-1">
            <Typography
              weight="700"
              className="text-sm"
              style={{ color: theme.text }}
            >
              Your groups
            </Typography>
            <Typography
              weight="500"
              className="mt-0.5 text-xs"
              style={{ color: theme.muted }}
            >
              Reuse the people you split with
            </Typography>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.muted} />
        </HapticPressable>

        <View
          className="mt-6 flex-row rounded-full p-1"
          style={{ backgroundColor: theme.cardStrong }}
        >
          <BillSegment
            label="Open"
            count={openBills.length}
            active={view === "open"}
            onPress={() => setView("open")}
          />
          <BillSegment
            label="Settled"
            count={settledBills.length}
            active={view === "settled"}
            onPress={() => setView("settled")}
          />
        </View>

        <View
          className="mt-5 flex-row items-center border-b pb-3"
          style={{ borderColor: theme.border }}
        >
          <Ionicons name="search-outline" size={20} color={theme.muted} />
          <TextInput
            accessibilityLabel="Search bills"
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setQuery}
            placeholder="Search bills"
            placeholderTextColor={theme.faint}
            returnKeyType="search"
            selectionColor={theme.accent}
            value={query}
            className="ml-3 flex-1 py-0 text-[15px]"
            style={{ color: theme.text }}
          />
          <HapticPressable
            accessibilityRole="button"
            accessibilityLabel={
              filtersVisible ? "Hide filters" : "Filter bills"
            }
            accessibilityState={{ expanded: filtersVisible }}
            feedback="selection"
            onPress={() => setFiltersVisible((visible) => !visible)}
            className="ml-3 flex-row items-center gap-2 py-1"
          >
            <Ionicons
              name="options-outline"
              size={19}
              color={category === "all" ? theme.muted : theme.text}
            />
            <Typography
              weight="700"
              className="text-xs"
              style={{ color: category === "all" ? theme.muted : theme.text }}
            >
              Filter
            </Typography>
          </HapticPressable>
        </View>

        {filtersVisible ? (
          <ScrollView
            horizontal
            className="-mx-6"
            contentContainerStyle={{ gap: 22, paddingHorizontal: 24 }}
            showsHorizontalScrollIndicator={false}
          >
            {BILL_FILTERS.map((filter) => (
              <HapticPressable
                key={filter.id}
                accessibilityRole="button"
                accessibilityState={{ selected: category === filter.id }}
                feedback="selection"
                onPress={() => setCategory(filter.id)}
                className="border-b-2 py-3"
                style={{
                  borderBottomColor:
                    category === filter.id ? theme.text : "transparent",
                }}
              >
                <Typography
                  weight={category === filter.id ? "700" : "600"}
                  className="text-xs"
                  style={{
                    color: category === filter.id ? theme.text : theme.muted,
                  }}
                >
                  {filter.label}
                </Typography>
              </HapticPressable>
            ))}
          </ScrollView>
        ) : null}

        <View className="mb-3 mt-7 flex-row items-center justify-between">
          <Typography
            weight="700"
            className="text-[18px]"
            style={{ color: theme.text }}
          >
            {view === "open" ? "Open bills" : "Settled bills"}
          </Typography>
          <Typography
            weight="600"
            className="text-xs"
            style={{ color: theme.muted }}
          >
            {visibleBills.length} {visibleBills.length === 1 ? "bill" : "bills"}
          </Typography>
        </View>

        {billsQuery.isLoading ? (
          <View className="items-center py-16">
            <ActivityIndicator color={theme.accent} />
          </View>
        ) : billsQuery.isError ? (
          <View className="items-center py-16">
            <Typography
              weight="700"
              className="text-base"
              style={{ color: theme.text }}
            >
              Bills couldn&apos;t sync
            </Typography>
            <HapticPressable
              onPress={() => void billsQuery.refetch()}
              className="mt-4 rounded-full px-5 py-3"
              style={{ backgroundColor: theme.card }}
            >
              <Typography
                weight="700"
                className="text-xs"
                style={{ color: theme.text }}
              >
                Try again
              </Typography>
            </HapticPressable>
          </View>
        ) : visibleBills.length ? (
          visibleBills.map((bill) => (
            <BillRow
              key={bill.id}
              bill={bill}
              onPress={() => router.push(`/bills/${bill.id}` as never)}
            />
          ))
        ) : (
          <View className="items-center py-16">
            <Ionicons
              name="checkmark-circle-outline"
              size={34}
              color={theme.faint}
            />
            <Typography
              weight="700"
              className="mt-4 text-base"
              style={{ color: theme.text }}
            >
              {query || category !== "all"
                ? "No matching bills"
                : "Nothing waiting"}
            </Typography>
          </View>
        )}
      </ScrollView>
    </ScreenLayout>
  );
}

function BillSegment({
  label,
  count,
  active,
  onPress,
}: {
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
}) {
  const { theme } = useAppTheme();
  return (
    <HapticPressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      feedback="selection"
      scaleOnPress={false}
      onPress={onPress}
      className="flex-1 flex-row items-center justify-center gap-2 rounded-full py-3"
      style={{ backgroundColor: active ? theme.card : "transparent" }}
    >
      <Typography
        weight={active ? "700" : "600"}
        className="text-sm"
        style={{ color: active ? theme.text : theme.muted }}
      >
        {label}
      </Typography>
      <Typography
        weight="700"
        className="text-[11px]"
        style={{ color: active ? theme.text : theme.faint }}
      >
        {count}
      </Typography>
    </HapticPressable>
  );
}

function BillRow({ bill, onPress }: { bill: Bill; onPress: () => void }) {
  const { theme } = useAppTheme();
  const amount = billPositionAmount(bill);
  const status =
    bill.position === "collecting"
      ? "You paid"
      : bill.position === "owe"
        ? "You owe"
        : "Settled";

  return (
    <HapticPressable
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${bill.title}, ${status}, ${formatBillMoney(amount)}`}
      feedback="selection"
      onPress={onPress}
      className="flex-row items-center border-b py-5"
      style={{ borderColor: theme.border }}
    >
      <Ionicons
        name={CATEGORY_ICON[bill.category]}
        size={24}
        color={bill.position === "settled" ? theme.faint : theme.text}
      />
      <View className="ml-4 flex-1">
        <Typography
          weight="700"
          className="text-[16px]"
          style={{ color: theme.text }}
        >
          {bill.title}
        </Typography>
        <Typography
          weight="500"
          className="mt-1 text-xs"
          style={{ color: theme.muted }}
        >
          {bill.dueLabel} · {bill.participants.length} people
        </Typography>
      </View>
      <View className="items-end">
        <Typography
          weight="700"
          className="text-[15px]"
          style={{ color: theme.text }}
        >
          {amount ? formatBillMoney(amount) : formatBillMoney(bill.totalCents)}
        </Typography>
        <Typography
          weight="600"
          className="mt-1 text-[11px]"
          style={{
            color: bill.position === "owe" ? theme.accent : theme.muted,
          }}
        >
          {status}
        </Typography>
      </View>
    </HapticPressable>
  );
}
