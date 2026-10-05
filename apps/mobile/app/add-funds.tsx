import React, { useRef, useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";

import HapticPressable from "@/components/ui/atoms/HapticPressable";
import { TokenMark } from "@/components/ui/atoms/TokenMark";
import { Typography } from "@/components/ui/atoms/Typography";
import { ScreenLayout } from "@/components/ui/layout";
import { QRCodeModal } from "@/components/ui/organisms/modals/QRCodeModal";
import { ReceiveModal } from "@/components/ui/organisms/modals/ReceiveModal";
import { useToast } from "@/contexts/ToastContext";
import { useWalletAddress } from "@/hooks/useWalletAddress";
import { monad } from "@/lib/chain";
import { apiClient, apiErrorMessage } from "@/utils/apiClient";
import { useAppTheme } from "@/contexts/AppThemeContext";

export default function AddFundsScreen() {
  const { theme } = useAppTheme();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const address = useWalletAddress();
  const qrCodeModalRef = useRef<BottomSheetModal>(null);
  const [funding, setFunding] = useState(false);
  const [receiveVisible, setReceiveVisible] = useState(false);
  const testnet = monad.id !== 143;

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
            style={{ backgroundColor: theme.card }}
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

        <View className="mt-12">
          <SectionTitle>Available now</SectionTitle>
          <View
            className="mt-5 overflow-hidden rounded-[28px] border"
            style={{ backgroundColor: theme.card, borderColor: theme.border }}
          >
            {testnet ? (
              <FundingRow
                icon={<TokenMark token="AUSD" size={48} />}
                title="Test AUSD"
                badge="Free"
                description="10,000 AUSD · Monad testnet"
                onPress={() => void addTestFunds()}
                trailing={
                  funding ? (
                    <ActivityIndicator color={theme.text} />
                  ) : (
                    <Ionicons name="add" size={26} color={theme.text} />
                  )
                }
                disabled={funding}
              />
            ) : null}

            <FundingRow
              icon={
                <View
                  className="size-12 items-center justify-center rounded-full"
                  style={{ backgroundColor: theme.accentSoft }}
                >
                  <Ionicons
                    name="qr-code-outline"
                    size={22}
                    color={theme.text}
                  />
                </View>
              }
              title="Receive AUSD"
              description="Handle, QR, or wallet address"
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
          </View>
        </View>

        <View className="mt-11">
          <SectionTitle>More ways to add</SectionTitle>
          <View
            className="mt-5 overflow-hidden rounded-[28px] border"
            style={{ backgroundColor: theme.card, borderColor: theme.border }}
          >
            <FundingRow
              icon={
                <View
                  className="size-12 items-center justify-center rounded-full"
                  style={{ backgroundColor: theme.accentSoft }}
                >
                  <Ionicons
                    name="business-outline"
                    size={23}
                    color={theme.text}
                  />
                </View>
              }
              title="USD bank transfer"
              description="USD → AUSD through Agora"
              onPress={() => showToast("Bank transfer funding is coming soon.")}
              trailing={<RouteBadge label="Coming soon" />}
              bareTrailing
            />
            <FundingRow
              icon={
                <View
                  className="size-12 items-center justify-center rounded-full"
                  style={{ backgroundColor: theme.accentSoft }}
                >
                  <Ionicons
                    name="swap-horizontal"
                    size={23}
                    color={theme.text}
                  />
                </View>
              }
              title="Deposit USDC"
              description="USDC → AUSD, delivered on Monad"
              onPress={() => router.push("/deposit-usdc")}
              trailing={
                <Ionicons
                  name="chevron-forward"
                  size={22}
                  color={theme.faint}
                />
              }
              bordered
            />
          </View>
          <Typography
            weight="500"
            className="mx-2 mt-4 text-[13px] leading-5"
            style={{ color: theme.muted }}
          >
            USDC deposits convert to AUSD through Agora. Bank transfers require
            additional verification and will follow later.
          </Typography>
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
      weight="700"
      className="text-[22px] tracking-[-0.4px]"
      style={{ color: theme.text }}
    >
      {children}
    </Typography>
  );
}

function FundingRow({
  icon,
  title,
  description,
  badge,
  trailing,
  bordered = false,
  bareTrailing = false,
  disabled = false,
  onPress,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  badge?: string;
  trailing: React.ReactNode;
  bordered?: boolean;
  bareTrailing?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { theme } = useAppTheme();
  return (
    <HapticPressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${description}`}
      disabled={disabled}
      onPress={onPress}
      className={
        bordered
          ? "min-h-[104px] flex-row items-center gap-4 border-t border-black/[0.06] px-5 py-5"
          : "min-h-[104px] flex-row items-center gap-4 px-5 py-5"
      }
    >
      {icon}
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
            <View className="rounded-full bg-info/10 px-2.5 py-1">
              <Typography weight="700" className="text-xs text-info">
                {badge}
              </Typography>
            </View>
          ) : null}
        </View>
        <Typography
          weight="500"
          className="mt-1 text-[13px]"
          style={{ color: theme.muted }}
        >
          {description}
        </Typography>
      </View>
      <View
        className={
          bareTrailing
            ? "items-center justify-center"
            : "size-11 items-center justify-center rounded-full bg-black/[0.035]"
        }
        style={
          !bareTrailing ? { backgroundColor: theme.cardStrong } : undefined
        }
      >
        {trailing}
      </View>
    </HapticPressable>
  );
}

function RouteBadge({ label }: { label: string }) {
  const { theme } = useAppTheme();
  return (
    <View
      className="rounded-full px-2.5 py-1.5"
      style={{ backgroundColor: theme.cardStrong }}
    >
      <Typography
        weight="700"
        className="text-[11px]"
        style={{ color: theme.muted }}
      >
        {label}
      </Typography>
    </View>
  );
}
