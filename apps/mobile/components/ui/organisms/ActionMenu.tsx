import React, { type ComponentProps, useMemo } from "react";
import { Modal, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
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

type ActionIcon = ComponentProps<typeof Ionicons>["name"];

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
        icon: "arrow-down" as ActionIcon,
        onPress: showReceiveModal,
      },
      {
        title: "Send",
        icon: "arrow-up" as ActionIcon,
        onPress: showSendModal,
      },
      {
        title: "Bills",
        icon: "receipt-outline" as ActionIcon,
        onPress: () => router.push("/bills" as never),
      },
      {
        title: "Flow",
        icon: "git-branch-outline" as ActionIcon,
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
                <View
                  className="size-11 items-center justify-center rounded-2xl border"
                  style={{
                    backgroundColor: theme.cardStrong,
                    borderColor: theme.border,
                    shadowColor: theme.dark ? "#000000" : theme.text,
                    shadowOpacity: theme.dark ? 0.24 : 0.08,
                    shadowRadius: 8,
                    shadowOffset: { width: 0, height: 3 },
                  }}
                >
                  <Ionicons name={action.icon} size={21} color={theme.accent} />
                </View>
              </HapticPressable>
            </Animated.View>
          ))}
        </View>
      </View>
    </Modal>
  );
}
