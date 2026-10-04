import React, { useRef, useEffect, useMemo, useCallback, memo } from "react";
import {
  Image,
  View,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Keyboard,
} from "react-native";
import { Typography } from "@/components/ui/atoms/Typography";
import * as Clipboard from "expo-clipboard";
import {
  Ionicons,
  FontAwesome5,
  MaterialCommunityIcons,
  MaterialIcons,
} from "@expo/vector-icons";
import HapticPressable from "@/components/ui/atoms/HapticPressable";
import TabHeaderText from "@/components/ui/atoms/TabHeaderText";
import {
  BottomSheetTextInput,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { truncateAddress } from "@/utils/helper";
import { TextInput } from "react-native-gesture-handler";
import { isAddress } from "viem";
import { cn } from "@/utils/cn";
import { useQuery } from "@tanstack/react-query";
import { useDebounce } from "@/hooks/useDebounce";
import { useContacts } from "@/hooks/useContacts";
import { useRecentRecipients } from "@/hooks/useRecentRecipients";
import { apiClient, type DirectoryEntry } from "@/utils/apiClient";
import { useAuth } from "@/contexts/AuthContext";

interface RecipientStepProps {
  onClose: () => void;
  onNext: (recipient: RecipientSelection) => void;
  onScanPress: () => void;
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

const HANDLE = /^@?[a-z0-9_]{3,20}$/i;

/** "@ada", "ada" and "ferry://pay?to=@ada" all mean the handle ada. */
export function parseRecipient(
  text: string
): { kind: "address" | "handle"; value: string } | null {
  let raw = text.trim();
  const link = raw.match(/^ferry:\/\/pay\?to=(.+)$/i);
  if (link) raw = decodeURIComponent(link[1]);
  if (isAddress(raw)) return { kind: "address", value: raw };
  if (HANDLE.test(raw))
    return { kind: "handle", value: raw.replace(/^@/, "").toLowerCase() };
  return null;
}

export default memo(function RecipientStep({
  onNext,
  onScanPress,
  recipient,
  setRecipient,
}: RecipientStepProps) {
  const inputRef = useRef<TextInput | null>(null);
  const debouncedRecipient = useDebounce(recipient, 400);
  const { address } = useAuth();
  const { contacts } = useContacts();
  const savedAddresses = useMemo(
    () => contacts.map((c) => c.address),
    [contacts]
  );
  const { recipients } = useRecentRecipients({ exclude: savedAddresses });
  const sendsTo = useMemo(
    () => new Map(recipients.map((r) => [r.address.toLowerCase(), r.sends])),
    [recipients]
  );

  const parsed = useMemo(() => parseRecipient(recipient), [recipient]);
  const debouncedParsed = useMemo(
    () => parseRecipient(debouncedRecipient),
    [debouncedRecipient]
  );
  const isHandle = parsed?.kind === "handle";
  const lookupMatchesCurrent =
    isHandle &&
    debouncedParsed?.kind === "handle" &&
    debouncedParsed.value === parsed.value;

  const { data: resolved, isLoading: isResolving } = useQuery({
    queryKey: ["resolve-handle", debouncedParsed?.value],
    queryFn: () => apiClient.resolveHandle(debouncedParsed!.value),
    enabled: debouncedParsed?.kind === "handle",
    retry: 1,
    staleTime: 60_000,
  });

  const handlePaste = async () => {
    const text = await Clipboard.getStringAsync();
    if (text && parseRecipient(text)) setRecipient(text.trim());
  };

  const currentResolved = lookupMatchesCurrent ? resolved : undefined;
  const target =
    parsed?.kind === "address" ? parsed.value : currentResolved?.address;
  const isSelf =
    target !== undefined &&
    address !== null &&
    target.toLowerCase() === address.toLowerCase();

  const handleContinue = useCallback(() => {
    if (!parsed || isSelf) return;
    if (parsed.kind === "address")
      onNext({
        value: parsed.value,
        address: parsed.value,
        handle: null,
        displayName: null,
        homeCurrency: null,
        country: null,
        payoutReady: false,
      });
    else if (currentResolved) onNext(selectionFromDirectory(currentResolved));
  }, [currentResolved, isSelf, onNext, parsed]);

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 300);
    return () => clearTimeout(timer);
  }, []);

  const { isValid, label, icon } = useMemo(() => {
    if (debouncedRecipient.length === 0)
      return { isValid: true, label: "Enter a @handle or a Monad address" };
    if (!parsed)
      return {
        isValid: false,
        label: "That isn't a handle or a Monad address",
      };

    if (isSelf)
      return {
        isValid: false,
        label: "That's your own Ferry account",
        icon: (
          <MaterialCommunityIcons name="alert-decagram" size={14} color="red" />
        ),
      };

    const sends = (target && sendsTo.get(target.toLowerCase())) ?? 0;
    const sendsLabel =
      sends === 0 ? "New recipient" : `${sends} send${sends === 1 ? "" : "s"}`;

    if (parsed.kind === "handle") {
      if (!lookupMatchesCurrent || isResolving) {
        return {
          isValid: true,
          label: "Looking up…",
          icon: <FontAwesome5 name="spinner" size={14} color="blue" />,
        };
      }
      if (currentResolved === null) {
        return {
          isValid: false,
          label: `No one on Ferry is @${parsed.value}`,
          icon: (
            <MaterialCommunityIcons
              name="alert-decagram"
              size={14}
              color="red"
            />
          ),
        };
      }
      if (currentResolved) {
        return {
          isValid: true,
          label: currentResolved.payoutReady
            ? `${currentResolved.payoutBank ?? `${currentResolved.homeCurrency} bank`} · •••• ${currentResolved.payoutAccountEnding ?? ""} · ${sendsLabel}`
            : `Ferry wallet · ${sendsLabel}`,
          icon: (
            <MaterialCommunityIcons
              name="check-decagram"
              size={14}
              color="green"
            />
          ),
        };
      }
      return { isValid: true, label: "Enter a @handle or a Monad address" };
    }

    return {
      isValid: true,
      label: sendsLabel,
      icon: (
        <MaterialCommunityIcons
          name="clock-time-nine"
          size={14}
          color="lightgrey"
        />
      ),
    };
  }, [
    currentResolved,
    debouncedRecipient,
    isResolving,
    isSelf,
    lookupMatchesCurrent,
    parsed,
    sendsTo,
    target,
  ]);

  const isContinueDisabled =
    !parsed ||
    !isValid ||
    isSelf ||
    (parsed.kind === "handle" && !currentResolved);

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View className="flex-1 bg-[#F7F7F4]">
        <View className="mb-7 flex-row items-center justify-between px-6">
          <View className="size-11" />
          <View className="items-center">
            <TabHeaderText className="pb-0 text-center font-bold">
              Send money
            </TabHeaderText>
            <Typography weight="500" className="mt-0.5 text-xs text-black/35">
              Ferry Direct or wallet address
            </Typography>
          </View>
          <TouchableOpacity
            onPress={onScanPress}
            accessibilityRole="button"
            accessibilityLabel="Scan a Ferry QR code"
            className="size-11 items-center justify-center rounded-full bg-white"
          >
            <Ionicons name="scan-outline" size={21} color="#111111" />
          </TouchableOpacity>
        </View>

        <View className="mx-6 mb-9 rounded-[28px] bg-white p-5">
          <Typography
            weight="700"
            className="mb-2 text-[10px] uppercase tracking-[1.5px] text-black/30"
          >
            Recipient
          </Typography>
          <TouchableOpacity
            className="relative bg-transparent"
            onPress={() => inputRef.current?.focus()}
          >
            <BottomSheetTextInput
              accessibilityLabel="Ferry handle or wallet address"
              className="-ml-1 mb-2 w-full py-0 pr-8 text-[22px] font-bold tracking-[-0.35px] text-black/90"
              placeholder="@handle or address"
              placeholderTextColor="#0000004D"
              value={recipient}
              onChangeText={setRecipient}
              autoCapitalize="none"
              autoCorrect={false}
              ref={inputRef}
              style={{ fontFamily: "Inter_700Bold" }}
              returnKeyType="go"
              onSubmitEditing={handleContinue}
              submitBehavior="blurAndSubmit"
            />
            <TouchableOpacity
              onPress={() => inputRef.current?.focus()}
              className="mb-4 flex-row items-center justify-start gap-1.5"
            >
              {icon}
              <Typography
                weight="600"
                className={cn(
                  "text-[12px] text-black/35",
                  !isValid && "text-red-500"
                )}
              >
                {label}
              </Typography>
            </TouchableOpacity>

            {recipient && (
              <HapticPressable
                className="absolute -right-5 -top-5 z-10 p-5"
                onPress={() => setRecipient("")}
              >
                <Ionicons name="close-circle" size={20} color="lightgrey" />
              </HapticPressable>
            )}
          </TouchableOpacity>

          <View className="flex-row gap-2.5">
            <HapticPressable
              accessibilityRole="button"
              accessibilityLabel="Continue to enter amount"
              className={cn(
                "h-12 flex-1 items-center justify-center rounded-full",
                !isContinueDisabled ? "bg-black" : "bg-black/20"
              )}
              onPress={handleContinue}
              disabled={isContinueDisabled}
            >
              <Typography weight="600" className="text-white">
                Continue
              </Typography>
            </HapticPressable>

            <HapticPressable
              accessibilityRole="button"
              accessibilityLabel="Paste recipient"
              className="size-12 items-center justify-center rounded-full bg-black/[0.055]"
              onPress={handlePaste}
            >
              <Ionicons name="document-outline" size={19} color="#111111" />
            </HapticPressable>
          </View>
        </View>

        <BottomSheetScrollView showsVerticalScrollIndicator={false}>
          {contacts.length > 0 && (
            <>
              <Typography
                weight="700"
                className="mb-4 ml-6 text-[21px] tracking-[-0.4px] text-black/55"
              >
                Address book
              </Typography>
              {contacts.map((contact) => (
                <RecipientRow
                  key={contact.address}
                  title={contact.name}
                  subtitle={truncateAddress(contact.address)}
                  direct={false}
                  onPress={() => {
                    setRecipient(contact.address);
                    onNext({
                      value: contact.address,
                      address: contact.address,
                      handle: null,
                      displayName: contact.name,
                      homeCurrency: null,
                      country: null,
                      payoutReady: false,
                    });
                  }}
                />
              ))}
            </>
          )}

          {recipients.length > 0 && (
            <>
              <Typography
                weight="700"
                className={cn(
                  "mb-4 ml-6 text-[21px] tracking-[-0.4px] text-black/55",
                  contacts.length > 0 && "mt-4"
                )}
              >
                Recent
              </Typography>
              {recipients.map((entry) => (
                <RecipientRow
                  key={entry.address}
                  title={
                    entry.handle
                      ? `@${entry.handle}`
                      : truncateAddress(entry.address)
                  }
                  subtitle={`${entry.sends} send${entry.sends === 1 ? "" : "s"}`}
                  direct={Boolean(entry.handle)}
                  onPress={async () => {
                    const value = entry.handle ?? entry.address;
                    setRecipient(value);
                    if (entry.handle) {
                      const found = await apiClient.resolveHandle(entry.handle);
                      if (found) onNext(selectionFromDirectory(found));
                      return;
                    }
                    onNext({
                      value,
                      address: entry.address,
                      handle: null,
                      displayName: null,
                      homeCurrency: null,
                      country: null,
                      payoutReady: false,
                    });
                  }}
                />
              ))}
            </>
          )}
        </BottomSheetScrollView>
      </View>
    </TouchableWithoutFeedback>
  );
});

function RecipientRow({
  title,
  subtitle,
  direct,
  onPress,
}: {
  title: string;
  subtitle: string;
  direct: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${direct ? "Ferry Direct" : "Wallet"}. ${subtitle}`}
      className="mx-6 mb-3 min-h-[82px] flex-row items-center rounded-[24px] bg-white px-4 py-3.5"
      onPress={onPress}
    >
      <View
        className={cn(
          "mr-3 size-12 items-center justify-center rounded-full",
          direct ? "bg-[#20211E]" : "bg-black/[0.045]"
        )}
      >
        {direct ? (
          <Image
            source={require("@/assets/images/logo/ferry-mark-white-2048.png")}
            resizeMode="contain"
            className="size-6"
          />
        ) : (
          <MaterialIcons name="wallet" size={21} color="#111111" />
        )}
      </View>
      <View className="min-w-0 flex-1">
        <Typography weight="700" className="text-[17px] tracking-[-0.25px]">
          {title}
        </Typography>
        <Typography weight="500" className="mt-0.5 text-[12px] text-black/35">
          {direct ? `Ferry Direct · ${subtitle}` : subtitle}
        </Typography>
      </View>
      <View className="size-9 items-center justify-center rounded-full bg-black/[0.035]">
        <Ionicons name="arrow-forward" size={18} color="#111111" />
      </View>
    </TouchableOpacity>
  );
}
