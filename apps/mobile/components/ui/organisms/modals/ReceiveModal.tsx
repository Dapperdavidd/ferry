import React from "react";
import { ActionModal } from "../ActionModal";
import {
  ModalOptionsList,
  ActionOption,
} from "../../molecules/ModalOptionsList";
import { useWalletAddress } from "@/hooks/useWalletAddress";
import { View } from "react-native";
import { Typography } from "@/components/ui/atoms/Typography";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "@/contexts/AppThemeContext";

const walletIcon = require("@/assets/icons/wallet.png");

interface ReceiveModalProps {
  visible: boolean;
  onClose: () => void;
  onOpenQRCode: () => void;
}

export function ReceiveModal({
  visible,
  onClose,
  onOpenQRCode,
}: ReceiveModalProps) {
  const { theme } = useAppTheme();
  // Null until the backend has answered with the Account. The option waits
  // rather than falling back to a signer's address, which is not where the
  // Consumer's money belongs.
  const address = useWalletAddress();

  const handleReceiveToWallet = () => {
    onClose();
    onOpenQRCode();
  };

  const receiveOptions: ActionOption[] = [
    {
      key: "crypto",
      title: "Your address",
      description: address
        ? "Share your address or QR code"
        : "Your Account address is not available yet",
      icon: walletIcon,
      onPress: handleReceiveToWallet,
      disabled: !address,
    },
  ];

  return (
    <ActionModal visible={visible} onClose={onClose}>
      <View className="mb-6 flex-col items-center justify-center">
        <View className="mb-4 size-16 items-center justify-center rounded-[22px]">
          <Ionicons name="qr-code-outline" size={28} color={theme.text} />
        </View>
        <Typography
          weight="700"
          className="mb-1 text-xl"
          style={{ color: theme.text }}
        >
          Receive
        </Typography>
        <Typography
          weight="500"
          className="max-w-[240px] text-center text-sm leading-5"
          style={{ color: theme.muted }}
        >
          Money sent to your address lands in your Account
        </Typography>
      </View>
      <ModalOptionsList options={receiveOptions} />
    </ActionModal>
  );
}
