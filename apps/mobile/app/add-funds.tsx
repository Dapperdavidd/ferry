import React, { useRef, useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { Image } from "expo-image";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import HapticPressable from "@/components/ui/atoms/HapticPressable";
import { TokenMark } from "@/components/ui/atoms/TokenMark";
import { Typography } from "@/components/ui/atoms/Typography";
import { ScreenLayout } from "@/components/ui/layout";
import { QRCodeModal } from "@/components/ui/organisms/modals/QRCodeModal";
import { ReceiveModal } from "@/components/ui/organisms/modals/ReceiveModal";
import { useToast } from "@/contexts/ToastContext";
import { useWalletAddress } from "@/hooks/useWalletAddress";
import { apiClient, apiErrorMessage } from "@/utils/apiClient";
import { useAppTheme } from "@/contexts/AppThemeContext";
import { useNetwork } from "@/contexts/NetworkContext";

export default function AddFundsScreen() {
  const { theme } = useAppTheme();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const address = useWalletAddress();
  const qrCodeModalRef = useRef<BottomSheetModal>(null);
  const [funding, setFunding] = useState(false);
  const [receiveVisible, setReceiveVisible] = useState(false);
  const { network } = useNetwork();
  const testnet = network === "testnet";
  const { data: networkStatus } = useQuery({
    queryKey: ["network-status", network],
    queryFn: () => apiClient.network(),
    staleTime: 30_000,
  });

  const addTestFunds = async () => {
    if (funding) return;

    setFunding(true);
    try {
      await apiClient.fundFromFaucet();
      showToast("10,000 test AUSD is on its way.");
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

  return (
    <ScreenLayout
      className="p-0"
      lightColor={theme.background}
      darkColor={theme.background}
    >
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-6 pb-12 pt-2"
        showsVerticalScrollIndicator={false}
      >
        <View className="relative h-16 flex-row items-center justify-between">
          <HapticPressable
            accessibilityLabel="Go back"
            feedback="selection"
            onPress={() => router.back()}
            className="z-10 size-12 items-center justify-center rounded-full"
            style={{
              backgroundColor: theme.card,
              shadowColor: theme.text,
              shadowOffset: { width: 0, height: 7 },
              shadowOpacity: theme.dark ? 0.16 : 0.06,
              shadowRadius: 14,
              elevation: 4,
            }}
          >
            <Ionicons name="chevron-back" size={25} color={theme.text} />
          </HapticPressable>

          <View
            pointerEvents="none"
            className="absolute inset-x-0 items-center"
          >
            <Typography
              weight="700"
              className="text-[20px] tracking-[-0.3px]"
              style={{ color: theme.text }}
            >
              Add funds
            </Typography>
          </View>
          <View className="size-12" />
        </View>

        <View className="mt-10">
          <SectionTitle>Stablecoins</SectionTitle>
          <FundingGroup>
            {testnet ? (
              <FundingRow
                icon={<TokenMark token="AUSD" size={42} />}
                title="Test AUSD"
                badge="Free"
                tags={["Monad", "Testnet"]}
                onPress={() => void addTestFunds()}
                trailing={
                  funding ? (
                    <ActivityIndicator color={theme.text} />
                  ) : (
                    <Ionicons name="add" size={26} color={theme.text} />
                  )
                }
                trailingSurface
                disabled={funding}
              />
            ) : null}

            <FundingRow
              icon={<TokenMark token="AUSD" size={42} />}
              title="AUSD"
              tags={["Handle", "QR", "Wallet"]}
              onPress={() => setReceiveVisible(true)}
              trailing={
                <Ionicons
                  name="chevron-forward"
                  size={22}
                  color={theme.faint}
                />
              }
              bordered={testnet}
            />
            <FundingRow
              icon={
                <Image
                  source={require("@/assets/icons/usdc.png")}
                  style={{ width: 42, height: 42 }}
                  contentFit="contain"
                />
              }
              title="USDC"
              tags={
                networkStatus?.capabilities.usdcDeposit
                  ? ["Base", "Arbitrum", "Ethereum"]
                  : ["Coming soon"]
              }
              onPress={() =>
                networkStatus?.capabilities.usdcDeposit
                  ? router.push("/deposit-usdc")
                  : showToast("USDC deposits are coming soon on Mainnet.")
              }
              trailing={
                <Ionicons
                  name="chevron-forward"
                  size={22}
                  color={theme.faint}
                />
              }
              bordered
            />
          </FundingGroup>
        </View>

        <View className="mt-9">
          <SectionTitle>Cash deposit</SectionTitle>
          <FundingGroup>
            <FundingRow
              icon={
                <Image
                  source={require("@/assets/images/us-flag-round.png")}
                  style={{ width: 42, height: 42 }}
                  contentFit="contain"
                />
              }
              title="USD"
              tags={["ACH", "Wire", "Coming soon"]}
              onPress={() => showToast("Bank transfer funding is coming soon.")}
              trailing={<Ionicons name="add" size={26} color={theme.text} />}
              trailingSurface
            />
          </FundingGroup>
        </View>
      </ScrollView>

      <ReceiveModal
        visible={receiveVisible}
        onClose={() => setReceiveVisible(false)}
        onOpenQRCode={() => {
          setReceiveVisible(false);
          qrCodeModalRef.current?.present();
        }}
      />
      <QRCodeModal ref={qrCodeModalRef} walletAddress={address ?? ""} />
    </ScreenLayout>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  const { theme } = useAppTheme();
  return (
    <Typography
      weight="600"
      className="text-[20px] tracking-[-0.3px]"
      style={{ color: theme.muted }}
    >
      {children}
    </Typography>
  );
}

function FundingGroup({ children }: { children: React.ReactNode }) {
  const { theme } = useAppTheme();

  return (
    <View
      className="mt-4 rounded-[28px]"
      style={{
        shadowColor: theme.text,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: theme.dark ? 0.14 : 0.045,
        shadowRadius: 18,
        elevation: 3,
      }}
    >
      <View
        className="overflow-hidden rounded-[28px] border"
        style={{ backgroundColor: theme.card, borderColor: theme.border }}
      >
        {children}
      </View>
    </View>
  );
}

function FundingRow({
  icon,
  title,
  tags,
  badge,
  trailing,
  bordered = false,
  trailingSurface = false,
  disabled = false,
  onPress,
}: {
  icon: React.ReactNode;
  title: string;
  tags: string[];
  badge?: string;
  trailing: React.ReactNode;
  bordered?: boolean;
  trailingSurface?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { theme } = useAppTheme();
  return (
    <HapticPressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${tags.join(", ")}`}
      disabled={disabled}
      onPress={onPress}
      className={
        bordered
          ? "min-h-[96px] flex-row items-center gap-4 border-t px-4 py-4"
          : "min-h-[96px] flex-row items-center gap-4 px-4 py-4"
      }
      style={bordered ? { borderColor: theme.border } : undefined}
    >
      <View className="w-[46px] items-center justify-center">{icon}</View>
      <View className="min-w-0 flex-1">
        <View className="flex-row items-center gap-2">
          <Typography
            weight="700"
            className="text-[18px] tracking-[-0.3px]"
            style={{ color: theme.text }}
          >
            {title}
          </Typography>
          {badge ? (
            <View className="rounded-full bg-[#168CFF]/10 px-2.5 py-1">
              <Typography weight="700" className="text-[12px] text-[#168CFF]">
                {badge}
              </Typography>
            </View>
          ) : null}
        </View>
        <View className="mt-1.5 flex-row flex-wrap gap-1.5">
          {tags.map((tag) => (
            <View
              key={tag}
              className="rounded-full px-2 py-1"
              style={{ backgroundColor: theme.cardStrong }}
            >
              <Typography
                weight="500"
                className="text-[12px] leading-[14px]"
                style={{ color: theme.muted }}
              >
                {tag}
              </Typography>
            </View>
          ))}
        </View>
      </View>
      <View
        className="size-11 items-center justify-center rounded-full"
        style={
          trailingSurface ? { backgroundColor: theme.cardStrong } : undefined
        }
      >
        {trailing}
      </View>
    </HapticPressable>
  );
}
