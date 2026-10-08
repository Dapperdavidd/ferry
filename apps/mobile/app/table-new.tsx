import React, { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import HapticPressable from "@/components/ui/atoms/HapticPressable";
import { Typography } from "@/components/ui/atoms/Typography";
import { ScreenLayout } from "@/components/ui/layout";
import { PremiumActionButton } from "@/components/ui/molecules/PremiumActionButton";
import { useAppTheme } from "@/contexts/AppThemeContext";
import { useToast } from "@/contexts/ToastContext";
import { apiClient, apiErrorMessage } from "@/utils/apiClient";
import { centsToRaw, formatBillMoney } from "@/utils/bills";

type DraftItem = { id: string; name: string; price: string; quantity: number };

export default function NewTableScreen() {
  const { theme } = useAppTheme();
  const { showToast } = useToast();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [tip, setTip] = useState("");
  const [items, setItems] = useState<DraftItem[]>([
    { id: "first", name: "", price: "", quantity: 1 },
  ]);
  const [busy, setBusy] = useState(false);

  const totalCents = useMemo(
    () =>
      items.reduce(
        (total, item) =>
          total + Math.round((Number(item.price) || 0) * 100) * item.quantity,
        0
      ),
    [items]
  );
  const tipPercent = Math.min(50, Math.max(0, Number(tip) || 0));
  const valid =
    title.trim().length > 1 &&
    items.length > 0 &&
    items.every(
      (item) => item.name.trim().length > 0 && Number(item.price) > 0
    );

  const update = (id: string, patch: Partial<DraftItem>) =>
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );

  const create = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      const table = await apiClient.createFerryTable({
        title: title.trim(),
        tipBasisPoints: Math.round(tipPercent * 100),
        items: items.map((item) => ({
          name: item.name.trim(),
          priceRaw: centsToRaw(Math.round(Number(item.price) * 100)),
          quantity: item.quantity,
        })),
      });
      router.replace(`/tables/${table.id}` as never);
    } catch (error) {
      showToast(apiErrorMessage(error) ?? "We couldn't open the table");
    } finally {
      setBusy(false);
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
            onPress={() => router.back()}
            className="size-12 items-center justify-center rounded-full"
            style={{ backgroundColor: theme.card }}
          >
            <Ionicons name="close" size={24} color={theme.text} />
          </HapticPressable>
          <Typography
            weight="700"
            className="text-[19px]"
            style={{ color: theme.text }}
          >
            New table
          </Typography>
          <View className="size-12" />
        </View>
        <ScrollView
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="px-6 pb-8 pt-5"
          showsVerticalScrollIndicator={false}
        >
          <Typography
            weight="700"
            className="text-[34px] leading-10 tracking-[-1.2px]"
            style={{ color: theme.text }}
          >
            Put the receipt{"\n"}on the table.
          </Typography>
          <Typography
            weight="500"
            className="mt-3 text-sm"
            style={{ color: theme.muted }}
          >
            Everyone joins, claims their items, and watches the split update
            live.
          </Typography>

          <TextInput
            accessibilityLabel="Table name"
            value={title}
            onChangeText={setTitle}
            placeholder="Friday dinner"
            placeholderTextColor={theme.faint}
            className="mt-8 h-16 border-b font-inter-semibold text-lg"
            style={{ color: theme.text, borderColor: theme.border }}
          />

          <View className="mt-8 flex-row items-center justify-between">
            <Typography
              weight="700"
              className="text-lg"
              style={{ color: theme.text }}
            >
              Receipt items
            </Typography>
            <HapticPressable
              onPress={() =>
                setItems((current) => [
                  ...current,
                  {
                    id: `${Date.now()}-${current.length}`,
                    name: "",
                    price: "",
                    quantity: 1,
                  },
                ])
              }
              className="flex-row items-center py-2"
            >
              <Ionicons name="add" size={18} color={theme.text} />
              <Typography
                weight="700"
                className="ml-1 text-xs"
                style={{ color: theme.text }}
              >
                Add item
              </Typography>
            </HapticPressable>
          </View>

          <View className="mt-3 gap-3">
            {items.map((item, index) => (
              <View
                key={item.id}
                className="rounded-[24px] p-4"
                style={{ backgroundColor: theme.card }}
              >
                <View className="flex-row items-center">
                  <TextInput
                    accessibilityLabel={`Item ${index + 1} name`}
                    value={item.name}
                    onChangeText={(value) => update(item.id, { name: value })}
                    placeholder="Item name"
                    placeholderTextColor={theme.faint}
                    className="mr-3 flex-1 font-inter-semibold text-sm"
                    style={{ color: theme.text }}
                  />
                  <TextInput
                    accessibilityLabel={`Item ${index + 1} price`}
                    value={item.price}
                    onChangeText={(value) => update(item.id, { price: value })}
                    keyboardType="decimal-pad"
                    placeholder="$0.00"
                    placeholderTextColor={theme.faint}
                    className="w-24 text-right font-inter-bold text-sm"
                    style={{ color: theme.text }}
                  />
                </View>
                <View
                  className="mt-4 flex-row items-center justify-between border-t pt-3"
                  style={{ borderColor: theme.border }}
                >
                  <Typography
                    weight="600"
                    className="text-xs"
                    style={{ color: theme.muted }}
                  >
                    Quantity
                  </Typography>
                  <View className="flex-row items-center gap-4">
                    <HapticPressable
                      onPress={() =>
                        update(item.id, {
                          quantity: Math.max(1, item.quantity - 1),
                        })
                      }
                    >
                      <Ionicons
                        name="remove-circle-outline"
                        size={24}
                        color={theme.muted}
                      />
                    </HapticPressable>
                    <Typography weight="700" style={{ color: theme.text }}>
                      {item.quantity}
                    </Typography>
                    <HapticPressable
                      onPress={() =>
                        update(item.id, {
                          quantity: Math.min(50, item.quantity + 1),
                        })
                      }
                    >
                      <Ionicons
                        name="add-circle-outline"
                        size={24}
                        color={theme.text}
                      />
                    </HapticPressable>
                    {items.length > 1 ? (
                      <HapticPressable
                        onPress={() =>
                          setItems((current) =>
                            current.filter((entry) => entry.id !== item.id)
                          )
                        }
                      >
                        <Ionicons
                          name="trash-outline"
                          size={20}
                          color={theme.muted}
                        />
                      </HapticPressable>
                    ) : null}
                  </View>
                </View>
              </View>
            ))}
          </View>

          <View
            className="mt-6 flex-row items-center border-b pb-3"
            style={{ borderColor: theme.border }}
          >
            <Typography
              weight="600"
              className="flex-1 text-sm"
              style={{ color: theme.text }}
            >
              Tip
            </Typography>
            <TextInput
              accessibilityLabel="Tip percentage"
              value={tip}
              onChangeText={setTip}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={theme.faint}
              className="w-14 text-right font-inter-bold text-base"
              style={{ color: theme.text }}
            />
            <Typography
              weight="700"
              className="ml-1"
              style={{ color: theme.muted }}
            >
              %
            </Typography>
          </View>
          <View className="mt-5 flex-row items-center justify-between">
            <Typography
              weight="600"
              className="text-sm"
              style={{ color: theme.muted }}
            >
              Receipt total
            </Typography>
            <Typography
              weight="700"
              className="text-xl"
              style={{ color: theme.text }}
            >
              {formatBillMoney(Math.round(totalCents * (1 + tipPercent / 100)))}
            </Typography>
          </View>
        </ScrollView>
        <View className="px-6 pb-3 pt-3">
          <PremiumActionButton
            label={busy ? "Opening table…" : "Open live table"}
            tone="ink"
            disabled={!valid || busy}
            onPress={() => void create()}
          />
        </View>
      </KeyboardAvoidingView>
    </ScreenLayout>
  );
}
