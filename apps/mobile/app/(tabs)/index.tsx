import React, { useMemo, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useQueryClient } from "@tanstack/react-query";

import BalanceView from "@/components/BalanceView";
import HapticPressable from "@/components/ui/atoms/HapticPressable";
import { TokenMark } from "@/components/ui/atoms/TokenMark";
import { Typography } from "@/components/ui/atoms/Typography";
import { ScreenLayout } from "@/components/ui/layout";
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
import { apiClient, apiErrorMessage } from "@/utils/apiClient";

const HOME_CHROME_SPACE = 88;

function HomeScreenContent() {
  const router = useRouter();
  const { size, compact } = useResponsiveLayout();
  const {
    showReceiveModal,
    isReceiveModalVisible,
    hideAllModals,
    isSendModalVisible,
  } = useModalFlow();
  const { user } = useAuth();
  const {
    totalDisplay,
    isError: isBalanceError,
    isLoading: isBalanceLoading,
    refetch: refetchBalances,
  } = useBalances();
  const { data: transferPages } = useTransfersInfinite();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const address = useWalletAddress();
  const sendFlowModalRef = useRef<BottomSheetModal>(null);
  const qrCodeModalRef = useRef<BottomSheetModal>(null);
  const [funding, setFunding] = useState(false);
  const [selectedActivity, setSelectedActivity] =
    useState<ActivityEntry | null>(null);
  const testnet = monad.id !== 143;

  const recentActivity = useMemo(
    () =>
      (transferPages?.pages.flatMap((page) => page.items) ?? [])
        .slice(0, compact ? 2 : 3)
        .map((row) => mapTransferRowToActivityEntry(row, address ?? "")),
    [address, compact, transferPages]
  );

  const addFunds = async () => {
    if (!testnet) {
      showReceiveModal();
      return;
    }
    if (funding) return;

    setFunding(true);
    try {
      await apiClient.fundFromFaucet();
      showToast("Test AUSD is on its way. It lands in a second.");
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["balances"] });
        queryClient.invalidateQueries({ queryKey: ["transfers"] });
      }, 1500);
    } catch (error) {
      showToast(apiErrorMessage(error) ?? "Couldn't add test funds right now.");
    } finally {
      setFunding(false);
    }
  };

  const initial = (
    user?.displayName?.trim()[0] ??
    user?.handle?.trim()[0] ??
    "F"
  ).toUpperCase();
  const homeCurrency = user?.homeCurrency ?? "USD";

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
          paddingHorizontal: 20,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-row items-center justify-between pb-4 pt-2">
          <HapticPressable
            feedback="selection"
            accessibilityLabel="Open settings"
            onPress={() => router.push("/(tabs)/settings" as never)}
            style={{
              alignItems: "center",
              backgroundColor: "#FFFFFF",
              borderRadius: 21,
              height: 42,
              justifyContent: "center",
              width: 42,
            }}
          >
            <Typography weight="600" className="text-base text-[#111111]">
              {initial}
            </Typography>
          </HapticPressable>

          <HapticPressable
            feedback="selection"
            accessibilityLabel="Receive money"
            onPress={showReceiveModal}
            style={{
              alignItems: "center",
              backgroundColor: "#FFFFFF",
              borderRadius: 21,
              height: 42,
              justifyContent: "center",
              width: 42,
            }}
          >
            <Ionicons name="qr-code-outline" size={19} color="#111111" />
          </HapticPressable>
        </View>

        <View className="items-center pb-5 pt-2">
          <Typography weight="500" className="text-sm text-black/45">
            Spendable
          </Typography>
          {isBalanceError ? (
            <HapticPressable
              feedback="selection"
              onPress={() => void refetchBalances()}
              style={{ alignItems: "center", paddingVertical: 8 }}
            >
              <Typography
                weight="700"
                className="tracking-[-1.8px] text-[#111111]"
                style={{ fontSize: size(44), lineHeight: size(53) }}
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
              weight="600"
              className="tracking-[-2px] text-[#111111]"
              style={{ fontSize: size(44), lineHeight: size(53) }}
            />
          )}
          <View className="mt-1 flex-row items-center gap-2 rounded-full bg-black/[0.04] py-2 pl-2 pr-3">
            <TokenMark token="AUSD" size={22} />
            <Typography weight="600" className="text-sm text-black/55">
              {testnet ? "AUSD · Testnet" : "AUSD"}
            </Typography>
          </View>
        </View>

        <View className="mb-4 flex-row gap-3">
          <HomeAction
            label={testnet ? "Add funds" : "Receive"}
            icon={funding ? undefined : testnet ? "add" : "arrow-down"}
            loading={funding}
            primary
            onPress={() => void addFunds()}
          />
          <HomeAction
            label="Send"
            icon="arrow-up"
            onPress={() => sendFlowModalRef.current?.present()}
          />
        </View>

        <HapticPressable
          onPress={() => router.push("/cashout" as never)}
          style={{
            backgroundColor: "#191A18",
            borderRadius: 28,
            height: compact ? 142 : 156,
            justifyContent: "space-between",
            marginBottom: 22,
            overflow: "hidden",
            padding: 20,
          }}
        >
          <View className="absolute -right-10 -top-12 size-36 rounded-full bg-white/[0.06]" />
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <View className="size-8 items-center justify-center rounded-full bg-white/10">
                <Ionicons name="globe-outline" size={17} color="#FFFFFF" />
              </View>
              <Typography weight="600" className="text-sm text-white/70">
                Cash out
              </Typography>
            </View>
            <View className="size-8 items-center justify-center rounded-full bg-white">
              <Ionicons name="arrow-forward" size={17} color="#111111" />
            </View>
          </View>
          <View>
            <Typography
              weight="600"
              className="text-[25px] tracking-[-0.8px] text-white"
            >
              Cash out to {homeCurrency}
            </Typography>
            <Typography weight="500" className="mt-1 text-xs text-white/45">
              AUSD settled instantly on Monad
            </Typography>
          </View>
        </HapticPressable>

        <View className="mb-1 flex-row items-center justify-between">
          <Typography weight="600" className="text-lg text-[#111111]">
            Recent activity
          </Typography>
          <HapticPressable
            feedback="selection"
            onPress={() => router.push("/(tabs)/history" as never)}
            style={{ paddingHorizontal: 2, paddingVertical: 8 }}
          >
            <Typography weight="600" className="text-sm text-black/40">
              See all
            </Typography>
          </HapticPressable>
        </View>

        {recentActivity.length ? (
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
              No activity yet
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
    </ScreenLayout>
  );
}

function HomeAction({
  label,
  icon,
  loading = false,
  primary = false,
  onPress,
}: {
  label: string;
  icon?: "add" | "arrow-down" | "arrow-up";
  loading?: boolean;
  primary?: boolean;
  onPress: () => void;
}) {
  return (
    <HapticPressable
      disabled={loading}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: primary ? "#111111" : "#FFFFFF",
        borderColor: primary ? "#111111" : "rgba(17,17,17,0.07)",
        borderRadius: 22,
        borderWidth: 1,
        flex: 1,
        flexDirection: "row",
        gap: 8,
        height: 58,
        justifyContent: "center",
      }}
    >
      {loading ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <>
          {icon ? (
            <Ionicons
              name={icon}
              size={18}
              color={primary ? "#FFFFFF" : "#111111"}
            />
          ) : null}
          <Typography
            weight="600"
            className={
              primary ? "text-base text-white" : "text-base text-[#111111]"
            }
          >
            {label}
          </Typography>
        </>
      )}
    </HapticPressable>
  );
}

export default function HomeScreen() {
  return <HomeScreenContent />;
}
