import React, { useEffect, useMemo, useRef, useState } from "react";
import { Image, Modal, Pressable, ScrollView, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgLinearGradient,
  Path,
  Rect,
  Stop,
} from "react-native-svg";

import BalanceView from "@/components/BalanceView";
import HapticPressable from "@/components/ui/atoms/HapticPressable";
import { TokenMark } from "@/components/ui/atoms/TokenMark";
import { Typography } from "@/components/ui/atoms/Typography";
import { ScreenLayout } from "@/components/ui/layout";
import { PremiumActionButton } from "@/components/ui/molecules/PremiumActionButton";
import { ActivityItem } from "@/components/ui/organisms/ActivityItem";
import { QRCodeModal } from "@/components/ui/organisms/modals/QRCodeModal";
import { ReceiveModal } from "@/components/ui/organisms/modals/ReceiveModal";
import { SendModal } from "@/components/ui/organisms/modals/SendModal";
import { TransactionDetailModal } from "@/components/ui/organisms/modals/TransactionDetailModal";
import { SendFlowModal } from "@/components/ui/organisms/send/SendFlowModal";
import { useAuth } from "@/contexts/AuthContext";
import { useModalFlow } from "@/contexts/ModalFlowContext";
import { useToast } from "@/contexts/ToastContext";
import { useBalances } from "@/hooks/useBalances";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import { useTransfersInfinite } from "@/hooks/useTransfers";
import { useWalletAddress } from "@/hooks/useWalletAddress";
import { monad } from "@/lib/chain";
import {
  mapTransferRowToActivityEntry,
  type ActivityEntry,
} from "@/utils/activity";
import { cn } from "@/utils/cn";
import { StorageService } from "@/utils/storage";

const HOME_CHROME_SPACE = 140;
const NETWORK_PREFERENCE_KEY = "ferry.network-preference";

type NetworkPreference = "mainnet" | "testnet";

function HomeScreenContent() {
  const router = useRouter();
  const { compact } = useResponsiveLayout();
  const {
    showReceiveModal,
    isReceiveModalVisible,
    hideAllModals,
    isSendModalVisible,
  } = useModalFlow();
  const { showToast } = useToast();
  const { user } = useAuth();
  const {
    totalDisplay,
    isError: isBalanceError,
    isLoading: isBalanceLoading,
    refetch: refetchBalances,
  } = useBalances();
  const { data: transferPages } = useTransfersInfinite();
  const address = useWalletAddress();
  const sendFlowModalRef = useRef<BottomSheetModal>(null);
  const qrCodeModalRef = useRef<BottomSheetModal>(null);
  const [selectedActivity, setSelectedActivity] =
    useState<ActivityEntry | null>(null);
  const [isNetworkPickerVisible, setIsNetworkPickerVisible] = useState(false);
  const testnet = monad.id !== 143;
  const configuredNetwork: NetworkPreference = testnet ? "testnet" : "mainnet";
  const [selectedNetwork, setSelectedNetwork] =
    useState<NetworkPreference>(configuredNetwork);
  const isSelectedNetworkConnected = selectedNetwork === configuredNetwork;

  useEffect(() => {
    let mounted = true;

    void StorageService.getItem<NetworkPreference>(NETWORK_PREFERENCE_KEY).then(
      (storedNetwork) => {
        if (
          mounted &&
          (storedNetwork === "mainnet" || storedNetwork === "testnet")
        ) {
          setSelectedNetwork(storedNetwork);
        }
      }
    );

    return () => {
      mounted = false;
    };
  }, []);

  const recentActivity = useMemo(
    () =>
      (transferPages?.pages.flatMap((page) => page.items) ?? [])
        .slice(0, compact ? 1 : 2)
        .map((row) => mapTransferRowToActivityEntry(row, address ?? "")),
    [address, compact, transferPages]
  );

  const initial = (
    user?.displayName?.trim()[0] ??
    user?.handle?.trim()[0] ??
    "F"
  ).toUpperCase();
  const homeCurrency = user?.homeCurrency ?? "USD";

  const selectNetwork = (network: NetworkPreference) => {
    setSelectedNetwork(network);
    setIsNetworkPickerVisible(false);
    void StorageService.setItem(NETWORK_PREFERENCE_KEY, network);

    if (network !== configuredNetwork) {
      showToast(
        `${network === "mainnet" ? "Mainnet" : "Testnet"} preview selected`
      );
    }
  };

  const runOnConnectedNetwork = (action: () => void) => {
    if (!isSelectedNetworkConnected) {
      showToast(
        `${selectedNetwork === "mainnet" ? "Mainnet" : "Testnet"} transactions are not connected yet`
      );
      return;
    }

    action();
  };

  return (
    <ScreenLayout
      className="bg-[#F7F7F4] p-0"
      lightColor="#F7F7F4"
      darkColor="#F7F7F4"
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingBottom: HOME_CHROME_SPACE,
          paddingHorizontal: 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-row items-center justify-between py-2">
          <HapticPressable
            feedback="selection"
            accessibilityLabel="Open settings"
            onPress={() => router.push("/(tabs)/settings" as never)}
            className="size-12 items-center justify-center rounded-full bg-white"
          >
            <Typography weight="700" className="text-base text-[#111111]">
              {initial}
            </Typography>
          </HapticPressable>

          <HapticPressable
            feedback="selection"
            accessibilityLabel="Receive money"
            onPress={() => runOnConnectedNetwork(showReceiveModal)}
            className="size-12 items-center justify-center rounded-full bg-white"
          >
            <Ionicons name="qr-code-outline" size={20} color="#111111" />
          </HapticPressable>
        </View>

        <View className="items-center pb-12 pt-11">
          <Typography weight="700" className="text-[16px] text-black/45">
            Spendable
          </Typography>
          {!isSelectedNetworkConnected ? (
            <BalanceView
              amount="—"
              weight="700"
              className="w-full text-center text-[54px] leading-[64px] tracking-[-2.7px] text-[#111111]"
            />
          ) : isBalanceError ? (
            <HapticPressable
              feedback="selection"
              onPress={() => void refetchBalances()}
              className="items-center py-2"
            >
              <Typography
                weight="700"
                className="text-[52px] leading-[62px] tracking-[-2.4px] text-[#111111]"
              >
                —
              </Typography>
              <Typography weight="500" className="text-xs text-black/40">
                Tap to retry
              </Typography>
            </HapticPressable>
          ) : (
            <BalanceView
              amount={isBalanceLoading ? "…" : totalDisplay}
              weight="700"
              className="w-full text-center text-[54px] leading-[64px] tracking-[-2.7px] text-[#111111]"
            />
          )}
          <HapticPressable
            accessible
            feedback="selection"
            accessibilityLabel={`Change network. ${selectedNetwork} selected`}
            accessibilityHint="Opens mainnet and testnet options"
            accessibilityRole="button"
            onPress={() => setIsNetworkPickerVisible(true)}
            className="mt-3 flex-row items-center gap-2 rounded-full border border-black/[0.04] bg-black/[0.04] py-2.5 pl-2.5 pr-3"
          >
            <TokenMark token="AUSD" size={22} />
            <Typography weight="700" className="text-sm text-black/55">
              AUSD · {selectedNetwork === "mainnet" ? "Mainnet" : "Testnet"}
            </Typography>
            <Ionicons
              name="chevron-down"
              size={14}
              color="rgba(0,0,0,0.42)"
              style={{ width: 14 }}
            />
          </HapticPressable>
        </View>

        <View className="mb-10 flex-row gap-3">
          <PremiumActionButton
            label="Add funds"
            tone="ink"
            style={{ flex: 1 }}
            onPress={() =>
              runOnConnectedNetwork(() => router.push("/add-funds" as never))
            }
          />
          <PremiumActionButton
            label="Send"
            tone="pearl"
            style={{ flex: 1 }}
            onPress={() =>
              runOnConnectedNetwork(() => sendFlowModalRef.current?.present())
            }
          />
        </View>

        <FerryDirectCard
          compact={compact}
          currency={homeCurrency}
          onPress={() =>
            runOnConnectedNetwork(() => router.push("/cashout" as never))
          }
        />

        <View className="mb-2 flex-row items-center justify-between">
          <Typography weight="700" className="text-xl text-[#111111]">
            Recent activity
          </Typography>
          <HapticPressable
            feedback="selection"
            onPress={() =>
              runOnConnectedNetwork(() =>
                router.push("/(tabs)/history" as never)
              )
            }
            style={{ paddingHorizontal: 2, paddingVertical: 8 }}
          >
            <Typography weight="600" className="text-sm text-black/40">
              See all
            </Typography>
          </HapticPressable>
        </View>

        {isSelectedNetworkConnected && recentActivity.length ? (
          <View>
            {recentActivity.map((entry, index) => (
              <View
                key={entry.id}
                className={
                  index === recentActivity.length - 1
                    ? undefined
                    : "border-b border-black/[0.06]"
                }
              >
                <ActivityItem
                  {...entry}
                  onPress={() => setSelectedActivity(entry)}
                />
              </View>
            ))}
          </View>
        ) : (
          <View className="items-center rounded-[22px] border border-black/[0.06] bg-white py-6">
            <Typography weight="500" className="text-sm text-black/35">
              {isSelectedNetworkConnected
                ? "No activity yet"
                : `No ${selectedNetwork} activity in this build`}
            </Typography>
          </View>
        )}
      </ScrollView>

      <SendModal
        visible={isSendModalVisible}
        onClose={hideAllModals}
        onSendToWallet={() => {
          hideAllModals();
          sendFlowModalRef.current?.present();
        }}
      />
      <SendFlowModal ref={sendFlowModalRef} onClose={() => {}} />
      <ReceiveModal
        visible={isReceiveModalVisible}
        onClose={hideAllModals}
        onOpenQRCode={() => qrCodeModalRef.current?.present()}
      />
      <QRCodeModal ref={qrCodeModalRef} walletAddress={address ?? ""} />
      <TransactionDetailModal
        visible={selectedActivity !== null}
        onClose={() => setSelectedActivity(null)}
        item={selectedActivity}
      />
      <NetworkPicker
        visible={isNetworkPickerVisible}
        selected={selectedNetwork}
        configured={configuredNetwork}
        onClose={() => setIsNetworkPickerVisible(false)}
        onSelect={selectNetwork}
      />
    </ScreenLayout>
  );
}

function NetworkPicker({
  visible,
  selected,
  configured,
  onClose,
  onSelect,
}: {
  visible: boolean;
  selected: NetworkPreference;
  configured: NetworkPreference;
  onClose: () => void;
  onSelect: (network: NetworkPreference) => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        accessible={false}
        onPress={onClose}
        className="flex-1 justify-end bg-black/25"
      >
        <Pressable
          accessible={false}
          onPress={(event) => event.stopPropagation()}
          className="rounded-t-[32px] bg-[#F7F7F4] px-5 pb-8 pt-3"
          style={{
            shadowColor: "#000000",
            shadowOffset: { width: 0, height: -8 },
            shadowOpacity: 0.1,
            shadowRadius: 24,
            elevation: 18,
          }}
        >
          <View className="mb-5 items-center">
            <View className="h-1.5 w-10 rounded-full bg-black/15" />
          </View>
          <View className="mb-4 flex-row items-center justify-between px-1">
            <View>
              <Typography
                weight="700"
                className="text-[22px] tracking-[-0.5px] text-[#111111]"
              >
                Choose network
              </Typography>
              <Typography weight="500" className="mt-1 text-sm text-black/45">
                Your balance and activity follow this network.
              </Typography>
            </View>
            <HapticPressable
              feedback="selection"
              accessibilityLabel="Close"
              onPress={onClose}
              className="size-10 items-center justify-center rounded-full bg-black/[0.05]"
            >
              <Ionicons name="close" size={21} color="#111111" />
            </HapticPressable>
          </View>

          <View className="overflow-hidden rounded-[24px] border border-black/[0.06] bg-white">
            <NetworkOption
              label="Mainnet"
              description={
                configured === "mainnet"
                  ? "Live AUSD on Monad"
                  : "Requires the production connection"
              }
              selected={selected === "mainnet"}
              connected={configured === "mainnet"}
              onPress={() => onSelect("mainnet")}
            />
            <View className="ml-[68px] h-px bg-black/[0.06]" />
            <NetworkOption
              label="Testnet"
              description={
                configured === "testnet"
                  ? "Demo AUSD on Monad Testnet"
                  : "Requires the test build"
              }
              selected={selected === "testnet"}
              connected={configured === "testnet"}
              onPress={() => onSelect("testnet")}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function NetworkOption({
  label,
  description,
  selected,
  connected,
  onPress,
}: {
  label: string;
  description: string;
  selected: boolean;
  connected: boolean;
  onPress: () => void;
}) {
  return (
    <HapticPressable
      accessible
      feedback="selection"
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      className="flex-row items-center gap-3 px-4 py-4"
    >
      <View
        className={cn(
          "size-10 items-center justify-center rounded-full",
          selected ? "bg-[#111111]" : "bg-black/[0.04]"
        )}
      >
        <View
          className={cn(
            "size-2.5 rounded-full",
            selected ? "bg-[#D9D097]" : "bg-black/20"
          )}
        />
      </View>
      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          <Typography weight="700" className="text-base text-[#111111]">
            {label}
          </Typography>
          <View
            className={cn(
              "rounded-full px-2 py-1",
              connected ? "bg-[#EEF0E8]" : "bg-black/[0.04]"
            )}
          >
            <Typography
              weight="700"
              className={cn(
                "text-[10px] uppercase tracking-[0.7px]",
                connected ? "text-[#6D704D]" : "text-black/35"
              )}
            >
              {connected ? "Connected" : "Preview"}
            </Typography>
          </View>
        </View>
        <Typography weight="500" className="mt-1 text-[13px] text-black/40">
          {description}
        </Typography>
      </View>
      <View
        className={cn(
          "size-6 items-center justify-center rounded-full border-2",
          selected ? "border-[#111111]" : "border-black/15"
        )}
      >
        {selected ? (
          <View className="size-3 rounded-full bg-[#111111]" />
        ) : null}
      </View>
    </HapticPressable>
  );
}

function FerryDirectCard({
  currency,
  compact,
  onPress,
}: {
  currency: string;
  compact: boolean;
  onPress: () => void;
}) {
  return (
    <View
      className="mb-10 rounded-[32px]"
      style={{
        shadowColor: "#1A1B18",
        shadowOffset: { width: 0, height: 11 },
        shadowOpacity: 0.09,
        shadowRadius: 24,
        elevation: 5,
      }}
    >
      <HapticPressable
        accessible
        accessibilityRole="button"
        accessibilityLabel={`Cash out AUSD to ${currency} with Ferry Direct`}
        onPress={onPress}
        pressedScale={0.99}
        pressInDuration={75}
        pressOutDuration={180}
        className="overflow-hidden rounded-[32px] border border-white/80 bg-[#EFF0EB]"
        style={{ height: compact ? 184 : 200 }}
      >
        <Svg
          pointerEvents="none"
          width="100%"
          height="100%"
          viewBox="0 0 390 200"
          preserveAspectRatio="xMidYMid slice"
          style={{
            bottom: 0,
            left: 0,
            position: "absolute",
            right: 0,
            top: 0,
          }}
        >
          <Defs>
            <SvgLinearGradient
              id="ferryDirectSurface"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
            >
              <Stop offset="0%" stopColor="#FAFAF7" />
              <Stop offset="56%" stopColor="#EEEFE9" />
              <Stop offset="100%" stopColor="#DADDD4" />
            </SvgLinearGradient>
            <SvgLinearGradient
              id="ferryDirectRoute"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="0%"
            >
              <Stop offset="0%" stopColor="#B6AC64" stopOpacity="0" />
              <Stop offset="48%" stopColor="#B6AC64" stopOpacity="0.68" />
              <Stop offset="100%" stopColor="#11120F" stopOpacity="0.78" />
            </SvgLinearGradient>
          </Defs>
          <Rect
            x="0"
            y="0"
            width="390"
            height="200"
            rx="32"
            fill="url(#ferryDirectSurface)"
          />
          <Circle cx="347" cy="-5" r="94" fill="#FFFFFF" opacity="0.5" />
          <Circle
            cx="347"
            cy="-5"
            r="72"
            fill="none"
            stroke="#B9B076"
            strokeOpacity="0.2"
            strokeWidth="1"
          />
          <Path
            d="M 170 93 C 220 48 272 142 347 76"
            fill="none"
            stroke="#FFFFFF"
            strokeOpacity="0.7"
            strokeWidth="13"
            strokeLinecap="round"
          />
          <Path
            d="M 170 93 C 220 48 272 142 347 76"
            fill="none"
            stroke="url(#ferryDirectRoute)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <Circle cx="170" cy="93" r="4.5" fill="#B6AC64" />
          <Circle cx="347" cy="76" r="4.5" fill="#11120F" />
          <Path
            d="M -36 194 C 52 132 101 224 190 166"
            fill="none"
            stroke="#B6AC64"
            strokeOpacity="0.12"
            strokeWidth="34"
            strokeLinecap="round"
          />
        </Svg>

        <View
          pointerEvents="none"
          className="absolute -right-8 -top-3 size-40 opacity-[0.035]"
          style={{ transform: [{ rotate: "-10deg" }] }}
        >
          <Image
            source={require("@/assets/images/logo/ferry-mark-black-2048.png")}
            resizeMode="contain"
            className="size-full"
          />
        </View>

        <View className="pt-4.5 flex-1 px-5 pb-5">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <Image
                source={require("@/assets/images/logo/ferry-mark-black-2048.png")}
                resizeMode="contain"
                className="size-5"
              />
              <Typography
                weight="700"
                className="text-[11px] uppercase tracking-[1.6px] text-black/55"
              >
                Ferry Direct
              </Typography>
            </View>
            <View className="flex-row items-center gap-1.5 rounded-full border border-white/70 bg-white/55 px-2.5 py-1.5">
              <View className="size-1.5 rounded-full bg-[#AAA052]" />
              <Typography weight="700" className="text-[10px] text-black/50">
                Under 1 min
              </Typography>
            </View>
          </View>

          <View className="mt-5 flex-row items-center self-end pr-2">
            <TokenMark token="AUSD" size={30} />
            <View className="mx-2 h-px w-7 bg-black/15" />
            <Typography
              weight="700"
              className="text-[17px] tracking-[-0.3px] text-[#111111]"
            >
              {currency}
            </Typography>
          </View>

          <View className="mt-auto flex-row items-end justify-between">
            <View>
              <Typography
                weight="700"
                className="text-[27px] tracking-[-0.9px] text-[#111111]"
              >
                Cash out to {currency}
              </Typography>
              <Typography weight="600" className="mt-1 text-xs text-black/40">
                AUSD to your bank, without the crypto steps
              </Typography>
            </View>
            <View
              pointerEvents="none"
              className="size-11 items-center justify-center rounded-full bg-[#111210]"
              style={{
                shadowColor: "#111210",
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.16,
                shadowRadius: 10,
                elevation: 5,
              }}
            >
              <Ionicons name="arrow-forward" size={19} color="#FFFFFF" />
            </View>
          </View>
        </View>
      </HapticPressable>
    </View>
  );
}

export default function HomeScreen() {
  return <HomeScreenContent />;
}
