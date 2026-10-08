import React, { memo, useCallback, useMemo, useRef, useState } from "react";
import { Keyboard, TouchableWithoutFeedback, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheetModal, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { TextInput } from "react-native-gesture-handler";
import { useQuery } from "@tanstack/react-query";

import HapticPressable from "@/components/ui/atoms/HapticPressable";
import { Typography } from "@/components/ui/atoms/Typography";
import { useAppTheme } from "@/contexts/AppThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { useContacts } from "@/hooks/useContacts";
import { useDebounce } from "@/hooks/useDebounce";
import { useRecentRecipients } from "@/hooks/useRecentRecipients";
import { apiClient, type DirectoryEntry } from "@/utils/apiClient";
import { truncateAddress } from "@/utils/helper";
import { parseRecipient } from "@/utils/recipientQr";
import { QRScannerModal } from "./QRScannerModal";

interface RecipientStepProps {
  onClose: () => void;
  onNext: (recipient: RecipientSelection) => void;
  recipient: string;
  setRecipient: (recipient: string) => void;
}

export interface RecipientSelection {
  value: string;
  address: string;
  handle: string | null;
  displayName: string | null;
  homeCurrency: string | null;
  country: string | null;
  payoutReady: boolean;
}

const selectionFromDirectory = (entry: DirectoryEntry): RecipientSelection => ({
  value: entry.handle,
  address: entry.address,
  handle: entry.handle,
  displayName: entry.displayName,
  homeCurrency: entry.homeCurrency,
  country: entry.country,
  payoutReady: entry.payoutReady,
});

const selectionFromAddress = (address: string): RecipientSelection => ({
  value: address,
  address,
  handle: null,
  displayName: null,
  homeCurrency: null,
  country: null,
  payoutReady: false,
});

export default memo(function RecipientStep({
  onClose,
  onNext,
  recipient,
  setRecipient,
}: RecipientStepProps) {
  const { theme } = useAppTheme();
  const inputRef = useRef<TextInput | null>(null);
  const scannerRef = useRef<BottomSheetModal>(null);
  const walletAddressRef = useRef<TextInput | null>(null);
  const [destinationMode, setDestinationMode] = useState<"list" | "wallet">(
    "list"
  );
  const [isEditingRecipient, setIsEditingRecipient] = useState(false);
  const [walletName, setWalletName] = useState("");
  const debouncedRecipient = useDebounce(recipient, 350);
  const { address } = useAuth();
  const { contacts, addContact } = useContacts();
  const savedAddresses = useMemo(
    () => contacts.map((contact) => contact.address),
    [contacts]
  );
  const { recipients } = useRecentRecipients({ exclude: savedAddresses });
  const sendsTo = useMemo(
    () =>
      new Map(
        recipients.map((entry) => [entry.address.toLowerCase(), entry.sends])
      ),
    [recipients]
  );

  const parsed = useMemo(() => parseRecipient(recipient), [recipient]);
  const debouncedParsed = useMemo(
    () => parseRecipient(debouncedRecipient),
    [debouncedRecipient]
  );
  const lookupMatchesCurrent =
    parsed?.kind === "handle" &&
    debouncedParsed?.kind === "handle" &&
    debouncedParsed.value === parsed.value;

  const { data: resolved, isLoading: isResolving } = useQuery({
    queryKey: ["resolve-handle", debouncedParsed?.value],
    queryFn: () => apiClient.resolveHandle(debouncedParsed!.value),
    enabled: debouncedParsed?.kind === "handle",
    retry: 1,
    staleTime: 60_000,
  });

  const currentResolved = lookupMatchesCurrent ? resolved : undefined;
  const target =
    parsed?.kind === "address" ? parsed.value : currentResolved?.address;
  const isSelf =
    target !== undefined &&
    address !== null &&
    target.toLowerCase() === address.toLowerCase();

  const matchingContacts = useMemo(() => {
    const query = recipient.trim().toLowerCase();
    if (!query || parsed) return [];
    return contacts
      .filter(
        (contact) =>
          contact.name.toLowerCase().includes(query) ||
          contact.address.toLowerCase().includes(query)
      )
      .slice(0, 3);
  }, [contacts, parsed, recipient]);

  const handleContinue = useCallback(() => {
    if (!parsed || isSelf) return;
    if (parsed.kind === "address") {
      onNext(selectionFromAddress(parsed.value));
      return;
    }
    if (currentResolved) onNext(selectionFromDirectory(currentResolved));
  }, [currentResolved, isSelf, onNext, parsed]);

  const handlePaste = async () => {
    const text = (await Clipboard.getStringAsync()).trim();
    if (!text) return;

    setRecipient(text);
    const pasted = parseRecipient(text);
    if (!pasted) {
      inputRef.current?.focus();
      return;
    }

    if (
      pasted.kind === "address" &&
      address?.toLowerCase() !== pasted.value.toLowerCase()
    ) {
      onNext(selectionFromAddress(pasted.value));
      return;
    }

    if (pasted.kind === "handle") {
      const found = await apiClient
        .resolveHandle(pasted.value)
        .catch(() => null);
      if (found && found.address.toLowerCase() !== address?.toLowerCase()) {
        onNext(selectionFromDirectory(found));
        return;
      }
    }

    inputRef.current?.focus();
  };

  const state = useMemo(() => {
    if (!recipient.trim()) return { label: "", valid: false };
    if (!parsed) {
      return {
        label:
          matchingContacts.length > 0
            ? "Choose a contact"
            : "Enter a Ferry username or wallet address",
        valid: false,
      };
    }
    if (isSelf) return { label: "That's your own Ferry account", valid: false };
    if (parsed.kind === "address") {
      const sends = sendsTo.get(parsed.value.toLowerCase()) ?? 0;
      return {
        label:
          sends > 0
            ? `Wallet · ${sends} previous send${sends === 1 ? "" : "s"}`
            : "Wallet ready",
        valid: true,
      };
    }
    if (!lookupMatchesCurrent || isResolving)
      return { label: "Finding that Ferry account…", valid: false };
    if (!currentResolved)
      return {
        label: `No Ferry account found for @${parsed.value}`,
        valid: false,
      };
    return { label: `@${currentResolved.handle} is ready`, valid: true };
  }, [
    currentResolved,
    isResolving,
    isSelf,
    lookupMatchesCurrent,
    matchingContacts.length,
    parsed,
    recipient,
    sendsTo,
  ]);

  const focusRecipient = () => {
    setDestinationMode("list");
    inputRef.current?.focus();
  };

  const openWallet = () => {
    Keyboard.dismiss();
    setRecipient("");
    setWalletName("");
    setDestinationMode("wallet");
  };

  const handleScan = (value: string) => {
    setDestinationMode("list");
    setRecipient(value);
  };

  const handleBack = () => {
    if (destinationMode === "wallet") {
      Keyboard.dismiss();
      setRecipient("");
      setWalletName("");
      setDestinationMode("list");
      return;
    }
    onClose();
  };

  const handleWalletPaste = async () => {
    const text = (await Clipboard.getStringAsync()).trim();
    if (!text) {
      walletAddressRef.current?.focus();
      return;
    }
    setRecipient(text);
  };

  const walletAddress =
    parsed?.kind === "address" && !isSelf ? parsed.value : null;

  const handleWalletContinue = () => {
    if (!walletAddress) return;
    const name = walletName.trim();
    if (
      name &&
      !contacts.some(
        (contact) =>
          contact.address.toLowerCase() === walletAddress.toLowerCase()
      )
    ) {
      addContact({ name, address: walletAddress });
    }
    onNext({
      ...selectionFromAddress(walletAddress),
      displayName: name || null,
    });
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View className="flex-1" style={{ backgroundColor: theme.background }}>
        <View className="flex-row items-center justify-between px-6 pb-12 pt-5">
          <HapticPressable
            accessibilityLabel={
              destinationMode === "wallet" ? "Back to send" : "Close send"
            }
            accessibilityRole="button"
            feedback="selection"
            onPress={handleBack}
            className="size-14 items-center justify-center rounded-full"
            style={{ backgroundColor: theme.card }}
          >
            <Ionicons name="chevron-back" size={27} color={theme.text} />
          </HapticPressable>
          <Typography
            weight="700"
            className="text-[20px] tracking-[-0.3px]"
            style={{ color: theme.text }}
          >
            {destinationMode === "wallet" ? "Add wallet" : "Send"}
          </Typography>
          <View className="size-14" />
        </View>

        {destinationMode === "wallet" ? (
          <View className="flex-1 px-6">
            <View
              className="min-h-[104px] flex-row items-center rounded-[30px] px-6"
              style={{ backgroundColor: theme.cardStrong }}
            >
              <BottomSheetTextInput
                ref={walletAddressRef}
                accessibilityLabel="Wallet address"
                value={recipient}
                onChangeText={setRecipient}
                autoCapitalize="none"
                autoCorrect={false}
                clearButtonMode="while-editing"
                placeholder="Wallet address"
                placeholderTextColor={theme.muted}
                returnKeyType="next"
                className="min-w-0 flex-1 text-[18px]"
                style={{ color: theme.text, fontFamily: "Inter_500Medium" }}
              />
              <HapticPressable
                accessibilityLabel="Paste wallet address"
                accessibilityRole="button"
                feedback="selection"
                onPress={handleWalletPaste}
                className="ml-3 items-center justify-center rounded-full px-5 py-3.5"
                style={{ backgroundColor: theme.text }}
              >
                <Typography
                  weight="600"
                  className="text-[16px]"
                  style={{ color: theme.background }}
                >
                  Paste
                </Typography>
              </HapticPressable>
            </View>

            <View
              className="mt-5 min-h-[78px] justify-center rounded-[30px] px-6"
              style={{ backgroundColor: theme.cardStrong }}
            >
              <BottomSheetTextInput
                accessibilityLabel="Wallet name, optional"
                value={walletName}
                onChangeText={setWalletName}
                autoCapitalize="words"
                autoCorrect
                placeholder="Wallet name (Optional)"
                placeholderTextColor={theme.muted}
                returnKeyType="done"
                onSubmitEditing={handleWalletContinue}
                className="text-[18px]"
                style={{ color: theme.text, fontFamily: "Inter_500Medium" }}
              />
            </View>

            <HapticPressable
              accessibilityLabel="Scan wallet QR code"
              accessibilityRole="button"
              feedback="selection"
              onPress={() => scannerRef.current?.present()}
              className="mt-4 flex-row items-center justify-center rounded-full border py-4"
              style={{ borderColor: theme.border, backgroundColor: theme.card }}
            >
              <Ionicons name="scan-outline" size={20} color={theme.text} />
              <Typography
                weight="600"
                className="ml-2"
                style={{ color: theme.text }}
              >
                Scan wallet QR
              </Typography>
            </HapticPressable>

            <HapticPressable
              accessibilityLabel="Continue with wallet"
              accessibilityRole="button"
              accessibilityState={{ disabled: !walletAddress }}
              disabled={!walletAddress}
              feedback="impact"
              onPress={handleWalletContinue}
              className="mb-7 mt-auto min-h-[68px] items-center justify-center rounded-full"
              style={{
                backgroundColor: walletAddress ? theme.text : theme.faint,
                opacity: walletAddress ? 1 : 0.82,
              }}
            >
              <Typography
                weight="600"
                className="text-[20px]"
                style={{ color: theme.background }}
              >
                Continue
              </Typography>
            </HapticPressable>
          </View>
        ) : (
          <>
            {!isEditingRecipient && (
              <View className="px-6">
                <DestinationRow
                  icon="business-outline"
                  title="Add a bank account"
                  subtitle="6 currencies"
                  flags={["🇺🇸", "🇪🇺", "🇬🇧", "🇧🇷", "🇨🇴"]}
                  badge="Coming soon"
                  disabled
                />
                <DestinationRow
                  icon="wallet-outline"
                  title="Wallet"
                  subtitle="Monad"
                  onPress={openWallet}
                />
                <DestinationRow
                  icon="at-outline"
                  title="Username"
                  subtitle="Instantly on Ferry"
                  onPress={focusRecipient}
                  last
                />
              </View>
            )}

            <View
              className="px-6 pb-7"
              style={{
                flexDirection: isEditingRecipient ? "column-reverse" : "column",
                marginTop: isEditingRecipient ? 0 : "auto",
              }}
            >
              {!isEditingRecipient && (
                <HapticPressable
                  accessibilityLabel="Scan recipient QR code"
                  accessibilityRole="button"
                  feedback="selection"
                  onPress={() => scannerRef.current?.present()}
                  className="mb-4 flex-row items-center justify-center rounded-full border py-4"
                  style={{
                    borderColor: theme.border,
                    backgroundColor: theme.card,
                  }}
                >
                  <Ionicons name="scan-outline" size={20} color={theme.text} />
                  <Typography
                    weight="600"
                    className="ml-2"
                    style={{ color: theme.text }}
                  >
                    Scan to send
                  </Typography>
                </HapticPressable>
              )}
              {matchingContacts.length > 0 ? (
                <View
                  className="mb-3 overflow-hidden rounded-[24px] border"
                  style={{
                    backgroundColor: theme.card,
                    borderColor: theme.border,
                  }}
                >
                  {matchingContacts.map((contact, index) => (
                    <HapticPressable
                      key={contact.address}
                      accessibilityLabel={`Send to ${contact.name}`}
                      feedback="selection"
                      onPress={() => {
                        setRecipient(contact.address);
                        onNext({
                          ...selectionFromAddress(contact.address),
                          displayName: contact.name,
                        });
                      }}
                      className="flex-row items-center px-5 py-3.5"
                      style={
                        index === matchingContacts.length - 1
                          ? undefined
                          : {
                              borderBottomColor: theme.border,
                              borderBottomWidth: 1,
                            }
                      }
                    >
                      <View className="min-w-0 flex-1">
                        <Typography weight="700" style={{ color: theme.text }}>
                          {contact.name}
                        </Typography>
                        <Typography
                          weight="500"
                          className="mt-0.5 text-xs"
                          style={{ color: theme.muted }}
                        >
                          {truncateAddress(contact.address)}
                        </Typography>
                      </View>
                      <Ionicons
                        name="arrow-forward"
                        size={18}
                        color={theme.muted}
                      />
                    </HapticPressable>
                  ))}
                </View>
              ) : null}

              {state.label ? (
                <Typography
                  weight="600"
                  className="mb-2.5 px-4 text-xs"
                  style={{ color: state.valid ? theme.muted : theme.faint }}
                >
                  {state.label}
                </Typography>
              ) : null}

              <HapticPressable
                accessibilityLabel="Search for a recipient"
                feedback="selection"
                onPress={focusRecipient}
                className="min-h-[72px] flex-row items-center rounded-full border px-3.5"
                style={{
                  backgroundColor: theme.card,
                  borderColor: theme.border,
                }}
              >
                <Ionicons name="search" size={24} color={theme.muted} />
                <BottomSheetTextInput
                  ref={inputRef}
                  accessibilityLabel="Name, username, or wallet address"
                  value={recipient}
                  onChangeText={setRecipient}
                  onFocus={() => setIsEditingRecipient(true)}
                  onBlur={() => setIsEditingRecipient(false)}
                  autoCapitalize="none"
                  autoCorrect={false}
                  clearButtonMode="while-editing"
                  placeholder="Name, @username, wallet"
                  placeholderTextColor={theme.faint}
                  returnKeyType="go"
                  submitBehavior="blurAndSubmit"
                  onSubmitEditing={handleContinue}
                  className="ml-2 min-w-0 flex-1 text-[15px]"
                  style={{ color: theme.text, fontFamily: "Inter_500Medium" }}
                />
                <HapticPressable
                  accessibilityLabel={
                    recipient ? "Continue" : "Paste recipient"
                  }
                  accessibilityRole="button"
                  disabled={recipient ? !state.valid : false}
                  feedback="selection"
                  onPress={recipient ? handleContinue : handlePaste}
                  className="ml-2 min-w-[68px] items-center justify-center rounded-full px-4 py-3"
                  style={{
                    backgroundColor: theme.text,
                    opacity: recipient && !state.valid ? 0.22 : 1,
                  }}
                >
                  <Typography
                    weight="700"
                    className="text-[15px]"
                    style={{ color: theme.background }}
                  >
                    {recipient ? "Next" : "Paste"}
                  </Typography>
                </HapticPressable>
              </HapticPressable>
            </View>
          </>
        )}
        <QRScannerModal ref={scannerRef} onScan={handleScan} />
      </View>
    </TouchableWithoutFeedback>
  );
});

function DestinationRow({
  icon,
  title,
  subtitle,
  flags,
  badge,
  disabled = false,
  last = false,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  flags?: string[];
  badge?: string;
  disabled?: boolean;
  last?: boolean;
  onPress?: () => void;
}) {
  const { theme } = useAppTheme();

  return (
    <HapticPressable
      accessibilityLabel={`${title}. ${subtitle}${badge ? `. ${badge}` : ""}`}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      feedback="selection"
      onPress={onPress}
      className="min-h-[96px] flex-row items-center"
      style={
        last
          ? undefined
          : { borderBottomColor: theme.border, borderBottomWidth: 1 }
      }
    >
      <View
        className="size-14 items-center justify-center rounded-full"
        style={{ backgroundColor: theme.card }}
      >
        <Ionicons name={icon} size={25} color={theme.text} />
      </View>
      <View className="ml-5 min-w-0 flex-1">
        <Typography
          weight="700"
          className="text-[18px] tracking-[-0.3px]"
          style={{ color: theme.text }}
        >
          {title}
        </Typography>
        <View className="mt-1 flex-row items-center">
          {flags ? (
            <View className="mr-2 flex-row items-center">
              {flags.map((flag, index) => (
                <Typography
                  key={flag}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  className={index === 0 ? "text-[15px]" : "-ml-1 text-[15px]"}
                >
                  {flag}
                </Typography>
              ))}
            </View>
          ) : null}
          <Typography
            weight="500"
            className="text-[14px]"
            style={{ color: theme.muted }}
          >
            {subtitle}
          </Typography>
          {badge ? (
            <View
              className="ml-2 rounded-full px-2.5 py-1"
              style={{ backgroundColor: theme.cardStrong }}
            >
              <Typography
                weight="700"
                className="text-[10px]"
                style={{ color: theme.muted }}
              >
                {badge}
              </Typography>
            </View>
          ) : null}
        </View>
      </View>
      {!badge ? (
        <Ionicons name="chevron-forward" size={24} color={theme.faint} />
      ) : null}
    </HapticPressable>
  );
}
