import React, { useMemo } from "react";
import { Image, Modal, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import Animated, { FadeInRight, FadeOutRight } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FrostBlurView } from "@/components/ui/atoms/FrostBlurView";
import HapticPressable from "@/components/ui/atoms/HapticPressable";
import { useAppTheme } from "@/contexts/AppThemeContext";
import { useModalFlow } from "@/contexts/ModalFlowContext";
import { Typography } from "../atoms/Typography";
import { useNetwork } from "@/contexts/NetworkContext";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/utils/apiClient";
import { showToast } from "@/utils/toast";

type ActionMenuProps = {
  visible: boolean;
  onClose: () => void;
};

export function ActionMenu({ visible, onClose }: ActionMenuProps) {
  const { theme } = useAppTheme();
  const { showReceiveModal, showSendModal } = useModalFlow();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { network, config } = useNetwork();
  const { data: networkStatus } = useQuery({
    queryKey: ["network-status", network],
    queryFn: () => apiClient.network(),
    staleTime: 30_000,
  });
  const flowsAvailable = networkStatus?.capabilities.flows === true;

  const actions = useMemo(
    () => [
      {
        title: "Receive",
        icon: require("@/assets/icons/recieve.png"),
        onPress: showReceiveModal,
      },
      {
        title: "Send",
        icon: require("@/assets/icons/send.png"),
        onPress: showSendModal,
      },
      {
        title: "Bills",
        icon: require("@/assets/icons/money-added.png"),
        onPress: () => router.push("/bills" as never),
      },
      {
        title: "Flow",
        icon: require("@/assets/icons/earn.png"),
        onPress: () =>
          flowsAvailable
            ? router.push("/flows" as never)
            : showToast(`Flow is coming soon on ${config.label}`),
      },
    ],
    [config.label, flowsAvailable, router, showReceiveModal, showSendModal]
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View className="flex-1 items-end justify-end">
        <FrostBlurView
          intensity={62}
          tint={theme.dark ? "dark" : "light"}
          style={StyleSheet.absoluteFill}
        >
          <HapticPressable
            accessibilityLabel="Close money actions"
            className="flex-1"
            onPress={onClose}
          />
        </FrostBlurView>

        <View
          className="absolute right-6 items-end"
          style={{ bottom: insets.bottom + 72 }}
        >
          {actions.map((action, index) => (
            <Animated.View
              key={action.title}
              entering={FadeInRight.delay(index * 45)
                .springify()
                .damping(20)
                .stiffness(280)}
              exiting={FadeOutRight.duration(140)}
            >
              <HapticPressable
                accessibilityLabel={action.title}
                accessibilityRole="button"
                feedback="selection"
                onPress={() => {
                  onClose();
                  setTimeout(action.onPress, 10);
                }}
                className="flex-row items-center gap-4 py-4"
              >
                <Typography
                  weight="700"
                  className="text-[18px] tracking-[-0.25px]"
                  style={{ color: theme.text }}
                >
                  {action.title}
                </Typography>
                <Image
                  source={action.icon}
                  className="size-9"
                  resizeMode="contain"
                />
              </HapticPressable>
            </Animated.View>
          ))}
        </View>
      </View>
    </Modal>
  );
}
