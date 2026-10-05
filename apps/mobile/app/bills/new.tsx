import React, { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Share,
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
import { useAuth } from "@/contexts/AuthContext";
import {
  BILL_CONTACTS,
  formatBillMoney,
  saveBill,
  splitEvenly,
  type Bill,
  type BillCategory,
  type BillParticipant,
  type BillSplitMode,
} from "@/utils/bills";

const CATEGORIES: {
  id: BillCategory;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { id: "food", label: "Food", icon: "restaurant-outline" },
  { id: "transport", label: "Transport", icon: "car-outline" },
  { id: "home", label: "Home", icon: "home-outline" },
  { id: "travel", label: "Travel", icon: "airplane-outline" },
  { id: "shopping", label: "Shopping", icon: "bag-handle-outline" },
  { id: "other", label: "Other", icon: "receipt-outline" },
];

const DUE_OPTIONS = ["Today", "This week", "No rush"] as const;

export default function NewBillScreen() {
  const { theme } = useAppTheme();
  const { user, address } = useAuth();
  const router = useRouter();
  const owner = user?.id ?? address ?? "ferry-user";
  const [step, setStep] = useState<1 | 2 | 3 | "done">(1);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<BillCategory>("food");
  const [dueLabel, setDueLabel] =
    useState<(typeof DUE_OPTIONS)[number]>("This week");
  const [selectedIds, setSelectedIds] = useState<string[]>(["self", "bola"]);
  const [splitMode, setSplitMode] = useState<BillSplitMode>("even");
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>(
    {}
  );
  const [busy, setBusy] = useState(false);
  const [createdBill, setCreatedBill] = useState<Bill | null>(null);

  const totalCents = Math.round((Number(amount) || 0) * 100);
  const selectedContacts = BILL_CONTACTS.filter((contact) =>
    selectedIds.includes(contact.id)
  );
  const evenShares = useMemo(
    () => splitEvenly(totalCents, selectedContacts.length),
    [selectedContacts.length, totalCents]
  );
  const customTotal = selectedContacts.reduce(
    (total, contact) =>
      total + Math.round((Number(customAmounts[contact.id]) || 0) * 100),
    0
  );
  const stepValid =
    step === 1
      ? title.trim().length > 1 && totalCents > 0
      : step === 2
        ? selectedContacts.length > 1 &&
          (splitMode === "even" || customTotal === totalCents)
        : true;

  const goBack = () => {
    if (step === "done") {
      router.replace("/bills" as never);
      return;
    }
    if (step === 1) {
      router.back();
      return;
    }
    setStep((step - 1) as 1 | 2);
  };

  const selectSplitMode = (mode: BillSplitMode) => {
    setSplitMode(mode);
    if (mode === "custom") {
      setCustomAmounts(
        Object.fromEntries(
          selectedContacts.map((contact, index) => [
            contact.id,
            ((evenShares[index] ?? 0) / 100).toFixed(2),
          ])
        )
      );
    }
  };

  const participants: BillParticipant[] = selectedContacts.map(
    (contact, index) => ({
      ...contact,
      amountCents:
        splitMode === "even"
          ? (evenShares[index] ?? 0)
          : Math.round((Number(customAmounts[contact.id]) || 0) * 100),
      paid: Boolean(contact.self),
    })
  );

  const createBill = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const bill = await saveBill(owner, {
        title: title.trim(),
        note: note.trim(),
        totalCents,
        currency: "USD",
        category,
        splitMode,
        dueLabel,
        participants,
      });
      setCreatedBill(bill);
      setStep("done");
    } finally {
      setBusy(false);
    }
  };

  const shareBill = async () => {
    if (!createdBill) return;
    const shares = createdBill.participants
      .filter((person) => !person.self)
      .map((person) => `${person.name}: ${formatBillMoney(person.amountCents)}`)
      .join("\n");
    await Share.share({
      title: createdBill.title,
      message: `${createdBill.title} · ${formatBillMoney(createdBill.totalCents)}\n${shares}\n\nSplit with Ferry.`,
    });
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
            accessibilityRole="button"
            accessibilityLabel={step === 1 ? "Close new bill" : "Go back"}
            feedback="selection"
            disabled={busy}
            onPress={goBack}
            className="size-12 items-center justify-center rounded-full"
            style={{ backgroundColor: theme.card }}
          >
            <Ionicons
              name={step === 1 ? "close" : "chevron-back"}
              size={24}
              color={theme.text}
            />
          </HapticPressable>
          <Typography
            weight="700"
            className="text-[19px]"
            style={{ color: theme.text }}
          >
            {step === "done" ? "Bill ready" : "New bill"}
          </Typography>
          {step === "done" ? (
            <View className="size-12" />
          ) : (
            <Typography
              weight="700"
              className="w-12 text-right text-xs"
              style={{ color: theme.muted }}
            >
              {step}/3
            </Typography>
          )}
        </View>

        {step !== "done" ? <Progress step={step} /> : null}

        {step === 1 ? (
          <BillDetailsStep
            title={title}
            note={note}
            amount={amount}
            category={category}
            dueLabel={dueLabel}
            onTitle={setTitle}
            onNote={setNote}
            onAmount={setAmount}
            onCategory={setCategory}
            onDueLabel={setDueLabel}
          />
        ) : step === 2 ? (
          <PeopleStep
            amountCents={totalCents}
            selectedIds={selectedIds}
            splitMode={splitMode}
            customAmounts={customAmounts}
            customTotal={customTotal}
            onTogglePerson={(id) =>
              setSelectedIds((current) =>
                current.includes(id)
                  ? current.filter((value) => value !== id)
                  : [...current, id]
              )
            }
            onSplitMode={selectSplitMode}
            onCustomAmount={(id, value) =>
              setCustomAmounts((current) => ({ ...current, [id]: value }))
            }
          />
        ) : step === 3 ? (
          <ReviewStep
            title={title}
            note={note}
            totalCents={totalCents}
            dueLabel={dueLabel}
            splitMode={splitMode}
            participants={participants}
          />
        ) : (
          <DoneStep bill={createdBill} />
        )}

        <View className="px-6 pb-3 pt-3">
          {step === "done" ? (
            <>
              <PremiumActionButton
                label="Share bill"
                tone="ink"
                onPress={() => void shareBill()}
              />
              <HapticPressable
                accessibilityRole="button"
                accessibilityLabel="Back to Bills"
                feedback="selection"
                onPress={() => router.replace("/bills" as never)}
                className="items-center py-4"
              >
                <Typography weight="700" style={{ color: theme.muted }}>
                  Back to Bills
                </Typography>
              </HapticPressable>
            </>
          ) : (
            <PremiumActionButton
              label={step === 3 ? "Create bill" : "Continue"}
              tone="ink"
              disabled={!stepValid || busy}
              onPress={() =>
                step === 3 ? void createBill() : setStep((step + 1) as 2 | 3)
              }
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </ScreenLayout>
  );
}

function Progress({ step }: { step: 1 | 2 | 3 }) {
  const { theme } = useAppTheme();
  return (
    <View className="mx-6 mb-2 flex-row gap-2">
      {[1, 2, 3].map((number) => (
        <View
          key={number}
          className="h-1 flex-1 rounded-full"
          style={{
            backgroundColor: number <= step ? theme.text : theme.border,
          }}
        />
      ))}
    </View>
  );
}

function BillDetailsStep({
  title,
  note,
  amount,
  category,
  dueLabel,
  onTitle,
  onNote,
  onAmount,
  onCategory,
  onDueLabel,
}: {
  title: string;
  note: string;
  amount: string;
  category: BillCategory;
  dueLabel: string;
  onTitle: (value: string) => void;
  onNote: (value: string) => void;
  onAmount: (value: string) => void;
  onCategory: (value: BillCategory) => void;
  onDueLabel: (value: (typeof DUE_OPTIONS)[number]) => void;
}) {
  const { theme } = useAppTheme();
  return (
    <ScrollView
      className="flex-1"
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="px-6 pb-6 pt-5"
      showsVerticalScrollIndicator={false}
    >
      <Typography
        weight="800"
        className="text-[10px] uppercase tracking-[2px]"
        style={{ color: theme.muted }}
      >
        The moment
      </Typography>
      <Typography
        weight="700"
        className="mt-3 text-[34px] leading-10 tracking-[-1.2px]"
        style={{ color: theme.text }}
      >
        What are we splitting?
      </Typography>

      <View className="my-8 items-center">
        <Typography
          weight="600"
          className="text-xs"
          style={{ color: theme.muted }}
        >
          Total amount
        </Typography>
        <View className="mt-2 flex-row items-baseline justify-center">
          <Typography
            weight="700"
            className="mr-1 text-[35px]"
            style={{ color: theme.text }}
          >
            $
          </Typography>
          <TextInput
            accessibilityLabel="Bill total amount"
            value={amount}
            onChangeText={(value) => onAmount(value.replace(/[^0-9.]/g, ""))}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={theme.faint}
            className="min-w-[150px] font-inter-bold text-[54px] tracking-[-2px]"
            style={{ color: theme.text }}
          />
        </View>
      </View>

      <BillInput
        label="Bill name"
        value={title}
        placeholder="Sunday dinner"
        onChange={onTitle}
      />
      <BillInput
        label="Note"
        value={note}
        placeholder="What was it for?"
        onChange={onNote}
      />

      <Typography
        weight="700"
        className="mb-3 mt-6 text-sm"
        style={{ color: theme.text }}
      >
        Category
      </Typography>
      <View className="flex-row flex-wrap gap-2">
        {CATEGORIES.map((item) => {
          const active = category === item.id;
          return (
            <HapticPressable
              key={item.id}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              feedback="selection"
              onPress={() => onCategory(item.id)}
              className="flex-row items-center gap-2 rounded-full border px-4 py-3"
              style={{
                borderColor: active ? theme.accent : theme.border,
                backgroundColor: active ? theme.accentSoft : theme.card,
              }}
            >
              <Ionicons name={item.icon} size={16} color={theme.text} />
              <Typography
                weight="600"
                className="text-xs"
                style={{ color: theme.text }}
              >
                {item.label}
              </Typography>
            </HapticPressable>
          );
        })}
      </View>

      <Typography
        weight="700"
        className="mb-3 mt-6 text-sm"
        style={{ color: theme.text }}
      >
        Settle by
      </Typography>
      <View className="flex-row gap-2">
        {DUE_OPTIONS.map((option) => {
          const active = dueLabel === option;
          return (
            <HapticPressable
              key={option}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              feedback="selection"
              onPress={() => onDueLabel(option)}
              className="flex-1 items-center rounded-full border py-3"
              style={{
                borderColor: active ? theme.accent : theme.border,
                backgroundColor: active ? theme.accentSoft : theme.card,
              }}
            >
              <Typography
                weight="600"
                className="text-xs"
                style={{ color: theme.text }}
              >
                {option}
              </Typography>
            </HapticPressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

function BillInput({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const { theme } = useAppTheme();
  return (
    <View className="mt-4">
      <Typography
        weight="600"
        className="mb-2 text-xs"
        style={{ color: theme.muted }}
      >
        {label}
      </Typography>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.faint}
        className="h-14 rounded-full px-5 font-inter-semibold text-[15px]"
        style={{ backgroundColor: theme.card, color: theme.text }}
      />
    </View>
  );
}

function PeopleStep({
  amountCents,
  selectedIds,
  splitMode,
  customAmounts,
  customTotal,
  onTogglePerson,
  onSplitMode,
  onCustomAmount,
}: {
  amountCents: number;
  selectedIds: string[];
  splitMode: BillSplitMode;
  customAmounts: Record<string, string>;
  customTotal: number;
  onTogglePerson: (id: string) => void;
  onSplitMode: (mode: BillSplitMode) => void;
  onCustomAmount: (id: string, value: string) => void;
}) {
  const { theme } = useAppTheme();
  const selected = BILL_CONTACTS.filter((contact) =>
    selectedIds.includes(contact.id)
  );
  return (
    <ScrollView
      className="flex-1"
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="px-6 pb-6 pt-5"
      showsVerticalScrollIndicator={false}
    >
      <Typography
        weight="800"
        className="text-[10px] uppercase tracking-[2px]"
        style={{ color: theme.muted }}
      >
        The people
      </Typography>
      <Typography
        weight="700"
        className="mt-3 text-[34px] leading-10 tracking-[-1.2px]"
        style={{ color: theme.text }}
      >
        Who was there?
      </Typography>
      <Typography
        weight="500"
        className="mt-3 text-sm"
        style={{ color: theme.muted }}
      >
        Tap a person to add or remove them.
      </Typography>

      <View className="mt-8 flex-row justify-between">
        {BILL_CONTACTS.map((contact) => {
          const active = selectedIds.includes(contact.id);
          return (
            <HapticPressable
              key={contact.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: active, disabled: contact.self }}
              disabled={contact.self}
              feedback="selection"
              onPress={() => onTogglePerson(contact.id)}
              className="w-[72px] items-center"
            >
              <View
                className="size-14 items-center justify-center rounded-full border-2"
                style={{
                  backgroundColor: active ? theme.accentSoft : theme.card,
                  borderColor: active ? theme.accent : "transparent",
                }}
              >
                <Typography
                  weight="700"
                  className="text-lg"
                  style={{ color: theme.text }}
                >
                  {contact.initials}
                </Typography>
              </View>
              <Typography
                weight={active ? "700" : "500"}
                className="mt-2 text-xs"
                style={{ color: active ? theme.text : theme.muted }}
              >
                {contact.name}
              </Typography>
            </HapticPressable>
          );
        })}
      </View>

      <Typography
        weight="700"
        className="mb-3 mt-10 text-sm"
        style={{ color: theme.text }}
      >
        How should we split it?
      </Typography>
      <View
        className="flex-row rounded-full p-1"
        style={{ backgroundColor: theme.cardStrong }}
      >
        {(["even", "custom"] as const).map((mode) => {
          const active = splitMode === mode;
          return (
            <HapticPressable
              key={mode}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              feedback="selection"
              onPress={() => onSplitMode(mode)}
              className="flex-1 items-center rounded-full py-3"
              style={{ backgroundColor: active ? theme.card : "transparent" }}
            >
              <Typography
                weight={active ? "700" : "600"}
                className="text-sm"
                style={{ color: active ? theme.text : theme.muted }}
              >
                {mode === "even" ? "Split evenly" : "Custom split"}
              </Typography>
            </HapticPressable>
          );
        })}
      </View>

      {splitMode === "even" ? (
        <View className="mt-8 items-center">
          <Typography
            weight="600"
            className="text-xs"
            style={{ color: theme.muted }}
          >
            Each person pays
          </Typography>
          <Typography
            weight="700"
            className="mt-2 text-[32px]"
            style={{ color: theme.text }}
          >
            {formatBillMoney(splitEvenly(amountCents, selected.length)[0] ?? 0)}
          </Typography>
        </View>
      ) : (
        <View className="mt-6">
          {selected.map((contact) => (
            <View
              key={contact.id}
              className="flex-row items-center border-b py-4"
              style={{ borderColor: theme.border }}
            >
              <View
                className="size-10 items-center justify-center rounded-full"
                style={{ backgroundColor: theme.accentSoft }}
              >
                <Typography weight="700" style={{ color: theme.text }}>
                  {contact.initials}
                </Typography>
              </View>
              <Typography
                weight="600"
                className="ml-3 flex-1 text-sm"
                style={{ color: theme.text }}
              >
                {contact.name}
              </Typography>
              <Typography
                weight="700"
                className="mr-1 text-lg"
                style={{ color: theme.text }}
              >
                $
              </Typography>
              <TextInput
                accessibilityLabel={`${contact.name} share`}
                keyboardType="decimal-pad"
                value={customAmounts[contact.id] ?? ""}
                onChangeText={(value) =>
                  onCustomAmount(contact.id, value.replace(/[^0-9.]/g, ""))
                }
                className="w-20 text-right font-inter-bold text-lg"
                style={{ color: theme.text }}
              />
            </View>
          ))}
          <Typography
            weight="600"
            className="mt-3 text-right text-xs"
            style={{
              color: customTotal === amountCents ? theme.muted : theme.accent,
            }}
          >
            {formatBillMoney(customTotal)} of {formatBillMoney(amountCents)}{" "}
            assigned
          </Typography>
        </View>
      )}
    </ScrollView>
  );
}

function ReviewStep({
  title,
  note,
  totalCents,
  dueLabel,
  splitMode,
  participants,
}: {
  title: string;
  note: string;
  totalCents: number;
  dueLabel: string;
  splitMode: BillSplitMode;
  participants: BillParticipant[];
}) {
  const { theme } = useAppTheme();
  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="px-6 pb-6 pt-5"
      showsVerticalScrollIndicator={false}
    >
      <Typography
        weight="800"
        className="text-[10px] uppercase tracking-[2px]"
        style={{ color: theme.muted }}
      >
        One last look
      </Typography>
      <Typography
        weight="700"
        className="mt-3 text-[34px] leading-10 tracking-[-1.2px]"
        style={{ color: theme.text }}
      >
        {title}
      </Typography>
      {note ? (
        <Typography
          weight="500"
          className="mt-2 text-sm"
          style={{ color: theme.muted }}
        >
          {note}
        </Typography>
      ) : null}

      <Typography
        weight="700"
        className="mt-8 text-[48px] tracking-[-1.8px]"
        style={{ color: theme.text }}
      >
        {formatBillMoney(totalCents)}
      </Typography>
      <Typography
        weight="600"
        className="mt-1 text-xs"
        style={{ color: theme.muted }}
      >
        {splitMode === "even" ? "Split evenly" : "Custom split"} · {dueLabel}
      </Typography>

      <View className="mt-8">
        {participants.map((person) => (
          <View
            key={person.id}
            className="flex-row items-center border-b py-4"
            style={{ borderColor: theme.border }}
          >
            <View
              className="size-10 items-center justify-center rounded-full"
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
                style={{ color: theme.muted }}
              >
                {person.self ? "You" : `@${person.handle}`}
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
    </ScrollView>
  );
}

function DoneStep({ bill }: { bill: Bill | null }) {
  const { theme } = useAppTheme();
  return (
    <View className="flex-1 items-center justify-center px-8">
      <View
        className="size-32 items-center justify-center rounded-full"
        style={{ backgroundColor: theme.accentSoft }}
      >
        <Ionicons name="checkmark" size={52} color={theme.text} />
      </View>
      <Typography
        weight="700"
        className="mt-8 text-center text-[34px] tracking-[-1.2px]"
        style={{ color: theme.text }}
      >
        Ready to share.
      </Typography>
      <Typography
        weight="500"
        className="mt-3 max-w-[300px] text-center text-sm leading-5"
        style={{ color: theme.muted }}
      >
        {bill
          ? `${bill.title} is saved. Share everyone’s amount in one tap.`
          : "Your bill is saved and ready to share."}
      </Typography>
    </View>
  );
}
