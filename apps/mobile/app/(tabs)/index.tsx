import React, { useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useQueryClient } from "@tanstack/react-query";

import BalanceView from "@/components/BalanceView";
import HapticPressable from "@/components/ui/atoms/HapticPressable";
import TabHeaderText from "@/components/ui/atoms/TabHeaderText";
import { Typography } from "@/components/ui/atoms/Typography";
import { ScreenLayout } from "@/components/ui/layout";
import { ActionCard } from "@/components/ui/molecules";
import { HomeBanners } from "@/components/ui/organisms/HomeBanners";
import { QRCodeModal } from "@/components/ui/organisms/modals/QRCodeModal";
import { ReceiveModal } from "@/components/ui/organisms/modals/ReceiveModal";
import { SendModal } from "@/components/ui/organisms/modals/SendModal";
import { SendFlowModal } from "@/components/ui/organisms/send/SendFlowModal";
import { useAuth } from "@/contexts/AuthContext";
import { useModalFlow } from "@/contexts/ModalFlowContext";
import { useToast } from "@/contexts/ToastContext";
import { useBalances } from "@/hooks/useBalances";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import { useTransfersInfinite } from "@/hooks/useTransfers";
import { useWalletAddress } from "@/hooks/useWalletAddress";
import { monad } from "@/lib/chain";
import { apiClient, apiErrorMessage } from "@/utils/apiClient";

const FLOATING_CHROME_HEIGHT = 8 + 50;
const CHROME_GAP = 4;
const SECTION_GAP = 21;

function HomeScreenContent() {
  const router = useRouter();
  const { size, typeSize, compact } = useResponsiveLayout();
  const {
    showReceiveModal,
    isReceiveModalVisible,
    hideAllModals,
    isSendModalVisible,
  } = useModalFlow();
  const { user } = useAuth();
  const {
    total,
    totalDisplay,
    isError: isBalanceError,
    isLoading: isBalanceLoading,
    refetch: refetchBalances,
  } = useBalances();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  useTransfersInfinite();
  const address = useWalletAddress();
  const sendFlowModalRef = useRef<BottomSheetModal>(null);
  const qrCodeModalRef = useRef<BottomSheetModal>(null);
  const [funding, setFunding] = useState(false);
  const testnet = monad.id !== 143;

  const addFunds = async () => {
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

  const actions = useMemo(
    () => [
      {
        title: "Send",
        subtitle: "To a @handle or address",
        amount: null,
        icon: require("@/assets/icons/send.png"),
        onPress: () => sendFlowModalRef.current?.present(),
        color: "#007AFF",
        funded: total > 0,
      },
      {
        title: "Cash out",
        subtitle:
          user?.homeCurrency && user.homeCurrency !== "USD"
            ? `To ${user.homeCurrency}, instantly`
            : "Through Agora, instantly",
        amount: null,
        icon: require("@/assets/icons/earn.png"),
        onPress: () => router.push("/cashout" as never),
        color: "#AF52DE",
        funded: total > 0,
      },
      {
        title: "Receive",
        subtitle: user?.handle ? `@${user.handle}` : "Your address",
        amount: null,
        icon: require("@/assets/icons/recieve.png"),
        onPress: showReceiveModal,
        color: "#34C759",
        funded: true,
      },
      {
        title: testnet ? "Add test funds" : "Add funds",
        subtitle: testnet
          ? funding
            ? "Asking the faucet…"
            : "10,000 test AUSD"
          : "From a bank or exchange",
        amount: null,
        icon: require("@/assets/images/tokens/ausd.png"),
        onPress: testnet ? addFunds : showReceiveModal,
        color: "#000000",
        funded: false,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      router,
      total,
      user?.handle,
      user?.homeCurrency,
      testnet,
      funding,
      showReceiveModal,
    ]
  );

  const hasBalance = total > 0;

  return (
    <ScreenLayout>
      <View
        className="flex-1"
        style={{ paddingBottom: FLOATING_CHROME_HEIGHT + CHROME_GAP }}
      >
        <View>
          <TabHeaderText>
            {user?.displayName ?? (user?.handle ? `@${user.handle}` : "Ferry")}
          </TabHeaderText>

          <View>
            <Typography weight="500" className="text-sm text-black/30">
              Balance
            </Typography>
            {isBalanceError ? (
              <HapticPressable
                className="flex-row items-center gap-1.5 self-start py-2"
                onPress={() => refetchBalances()}
              >
                <Typography
                  weight="700"
                  className="leading-[120%] tracking-[-1.1px]"
                  style={{ fontSize: size(40) }}
                >
                  ——
                </Typography>
                <View className="flex-row items-center gap-1 rounded-full bg-black/5 px-2.5 py-1">
                  <Ionicons name="refresh" size={14} color="#999" />
                  <Typography weight="500" className="text-sm text-black/40">
                    Couldn&apos;t load balance. Tap to retry
                  </Typography>
                </View>
              </HapticPressable>
            ) : (
              <BalanceView
                weight="700"
                className="leading-[120%] tracking-[-1.1px]"
                style={{ fontSize: size(40) }}
                amount={isBalanceLoading ? "…" : totalDisplay}
              />
            )}
          </View>
        </View>

        {!hasBalance && !isBalanceLoading ? (
          <View
            className="items-center"
            style={{
              paddingTop: size(20),
              paddingBottom: size(8),
              marginBottom: size(SECTION_GAP),
            }}
          >
            <Typography
              weight="600"
              className="text-center"
              style={{
                fontSize: typeSize(compact ? 17 : 19),
                marginBottom: compact ? 2 : size(6),
              }}
            >
              Nothing here yet
            </Typography>
            <Typography
              weight="500"
              className="max-w-[250px] text-center text-black/30"
              style={{
                fontSize: typeSize(14),
                marginBottom: compact ? 6 : size(14),
              }}
            >
              {testnet
                ? "Add test funds, or receive AUSD at your handle."
                : "Receive AUSD at your handle to get started."}
            </Typography>
            <HapticPressable
              className="flex-row items-center gap-0.5 rounded-full bg-black px-3"
              style={{ paddingVertical: size(compact ? 8 : 10) }}
              onPress={testnet ? addFunds : showReceiveModal}
            >
              <Ionicons
                name={testnet ? "add-circle" : "arrow-down-circle"}
                size={size(18)}
                color="white"
              />
              <Typography
                weight="500"
                className="text-white"
                style={{ fontSize: typeSize(16) }}
              >
                {testnet ? "Add test funds" : "Receive"}
              </Typography>
            </HapticPressable>
          </View>
        ) : (
          <View style={{ height: size(SECTION_GAP) }} />
        )}

        <View
          className="flex-row flex-wrap justify-between"
          style={{ marginBottom: size(SECTION_GAP) }}
        >
          {actions.map((action) => (
            <ActionCard
              key={action.title}
              title={action.title}
              subtitle={action.subtitle}
              amount={action.amount}
              icon={action.icon}
              onPress={action.onPress}
              iconBackgroundColor={action.color}
              funded={action.funded}
            />
          ))}
        </View>

        <HomeBanners />
        <View className="flex-1" />
      </View>

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
    </ScreenLayout>
  );
}

export default function HomeScreen() {
  return <HomeScreenContent />;
}
