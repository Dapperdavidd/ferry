import React, { useMemo, useCallback, forwardRef, useState, memo } from "react";
import { View } from "react-native";
import {
  BottomSheetModal,
  BottomSheetView,
  BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { HIDE_MY_WALLET_ENABLED } from "@/constants/Features";
import { BlurBackdrop } from "@/components/ui/molecules/BlurBackdrop";
import QRCode from "react-native-qrcode-svg";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Typography } from "@/components/ui/atoms/Typography";
import HapticPressable from "@/components/ui/atoms/HapticPressable";
import TabHeaderText from "@/components/ui/atoms/TabHeaderText";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useToast } from "@/contexts/ToastContext";
import { cn } from "@/utils/cn";
import { Toggle } from "@/components/ui/atoms/Toggle";
import { useAppTheme } from "@/contexts/AppThemeContext";

interface QRCodeModalProps {
  walletAddress: string;
}

export const QRCodeModal = forwardRef<BottomSheetModal, QRCodeModalProps>(
  ({ walletAddress }, ref) => {
    const snapPoints = useMemo(() => ["94%"], []);
    const { showToast } = useToast();
    const { theme } = useAppTheme();
    const [isHideWalletEnabled, setIsHideWalletEnabled] = useState(false);

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => <BlurBackdrop {...props} />,
      []
    );

    const handleCopyAddress = async () => {
      await Clipboard.setStringAsync(walletAddress);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast(
        "Copied address",
        <Ionicons name="checkmark-circle" size={16} color={theme.text} />
      );
    };

    return (
      <BottomSheetModal
        ref={ref}
        snapPoints={snapPoints}
        enableDynamicSizing={false}
        backdropComponent={renderBackdrop}
        enablePanDownToClose
        handleIndicatorStyle={{ display: "none" }}
        backgroundStyle={{ backgroundColor: theme.background }}
        containerStyle={{ zIndex: 1 }}
      >
        <BottomSheetView
          className="h-full flex-1"
          style={{ backgroundColor: theme.background }}
        >
          <View className="mb-5 items-center px-4">
            <TabHeaderText
              className="text-center"
              style={{ color: theme.text }}
            >
              Receive
            </TabHeaderText>
            <Typography
              weight="500"
              className="mt-1 text-sm"
              style={{ color: theme.muted }}
            >
              Only send AUSD on Monad to this address
            </Typography>
          </View>

          <View
            className="z-[0] mx-auto mt-7 h-10 w-[72%] rounded-full"
            style={{ backgroundColor: theme.accentSoft }}
          />
          <HapticPressable
            onPress={handleCopyAddress}
            className={cn("mx-7 -mt-8 items-center rounded-[32px] border p-7", {
              "bg-[#3B82F6]": isHideWalletEnabled,
            })}
            style={{
              backgroundColor: isHideWalletEnabled ? "#3B82F6" : theme.card,
              borderColor: theme.border,
            }}
          >
            <View
              className="mb-5 flex-row items-center gap-2 self-start rounded-full px-3 py-2"
              style={{ backgroundColor: theme.accentSoft }}
            >
              <Ionicons
                name="shield-checkmark-outline"
                size={15}
                color={theme.text}
              />
              <Typography
                weight="700"
                className="text-[11px] uppercase tracking-[0.8px]"
                style={{ color: theme.text }}
              >
                Monad address
              </Typography>
            </View>
            <View className="relative w-full bg-transparent">
              <MemoizedQRCodeModal
                walletAddress={walletAddress}
                color={isHideWalletEnabled ? "white" : theme.text}
              />
            </View>
            <Typography
              weight="500"
              className={cn(
                "mx-auto mt-5 max-w-[240px] text-center text-sm leading-5",
                {
                  "text-white/40": isHideWalletEnabled,
                }
              )}
              style={{
                color: isHideWalletEnabled
                  ? "rgba(255,255,255,0.55)"
                  : theme.muted,
              }}
            >
              {walletAddress}
            </Typography>
          </HapticPressable>

          <View className="h-full flex-1" />

          {HIDE_MY_WALLET_ENABLED && (
            <View className="mx-6 mb-7 flex-row items-center justify-between">
              <View className="flex-row items-center px-2">
                <MaterialCommunityIcons
                  name="shield-half-full"
                  size={28}
                  color="#3B82F6"
                />
                <View className="ml-3">
                  <Typography weight="600" className="text-base">
                    Receive with <Typography>Hide My Wallet</Typography>
                  </Typography>
                  <View className="flex-row items-center">
                    <Typography
                      weight="600"
                      className="mr-1 text-sm text-black/30"
                    >
                      How it works?
                    </Typography>
                    <Ionicons
                      name="information-circle-outline"
                      size={16}
                      color="#0000004D"
                    />
                  </View>
                </View>
              </View>
              <Toggle
                value={isHideWalletEnabled}
                onValueChange={setIsHideWalletEnabled}
              />
            </View>
          )}

          <View className="mx-6 mb-8">
            <HapticPressable
              className="items-center rounded-full border-none py-4"
              style={{
                backgroundColor: isHideWalletEnabled
                  ? "#3B82F6"
                  : theme.primary,
              }}
              onPress={handleCopyAddress}
            >
              <Typography
                weight="700"
                className="text-base"
                style={{
                  color: isHideWalletEnabled ? "white" : theme.primaryText,
                }}
              >
                Copy address
              </Typography>
            </HapticPressable>
          </View>
        </BottomSheetView>
      </BottomSheetModal>
    );
  }
);

QRCodeModal.displayName = "QRCodeModal";

const MemoizedQRCodeModal = memo(
  ({
    walletAddress,
    color = "black",
    backgroundColor = "transparent",
  }: {
    walletAddress: string;
    color?: string;
    backgroundColor?: string;
  }) => {
    return (
      <QRCode
        value={walletAddress}
        size={280}
        color={color}
        backgroundColor={backgroundColor}
        ecl="L"
      />
    );
  }
);

MemoizedQRCodeModal.displayName = "MemoizedQRCodeModal";
