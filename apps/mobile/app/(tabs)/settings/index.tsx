import React, { useRef, useState } from "react";
import {
  Image,
  View,
  SectionList,
  TouchableOpacity,
  Linking,
} from "react-native";
import Constants from "expo-constants";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import TabHeaderText from "@/components/ui/atoms/TabHeaderText";
import { Typography } from "@/components/ui/atoms/Typography";
import { ScreenLayout } from "@/components/ui/layout";
import { SettingsItem } from "@/components/ui/molecules";
import { DeleteAccountModal } from "@/components/ui/organisms/modals/DeleteAccountModal";
import { NotificationsSheet } from "@/components/ui/organisms/modals/NotificationsSheet";
import { Spacing } from "@/constants/Spacing";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { useBalances } from "@/hooks/useBalances";
import { useNotificationPreference } from "@/hooks/usePushRegistration";
import { useAppTheme } from "@/contexts/AppThemeContext";
import { addressUrl, monad } from "@/lib/chain";

const SITE_URL = "https://ferry.money";
const PRIVACY_POLICY_URL = `${SITE_URL}/privacy`;
const TERMS_URL = `${SITE_URL}/terms`;

const APP_VERSION = Constants.expoConfig?.version ?? "1.0.0";
const APP_BUILD =
  Constants.expoConfig?.ios?.buildNumber ??
  Constants.expoConfig?.android?.versionCode?.toString();

export default function SettingsScreen() {
  const router = useRouter();
  const { signOut, user, address } = useAuth();
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const notificationsSheetRef = useRef<BottomSheetModal>(null);
  const notifications = useNotificationPreference();
  const { showToast } = useToast();
  const { total: balanceTotal, totalDisplay: balanceDisplay } = useBalances();
  const { theme } = useAppTheme();

  const handleAccountDeleted = async () => {
    showToast("Your account has been deleted");
    await signOut();
  };

  type Item = {
    label: string;
    icon: React.ReactNode;
    onPress: () => void;
    color?: string;
  };
  const sections: { title: string; data: Item[] }[] = [
    {
      title: "Account",
      data: [
        {
          label: user?.handle ? `@${user.handle}` : "Edit account",
          icon: <Ionicons name="person-outline" size={19} color={theme.text} />,
          onPress: () => router.push("/profile" as never),
        },
        {
          label: "Address book",
          icon: <Ionicons name="people-outline" size={19} color={theme.text} />,
          onPress: () => router.push("/settings/address-book" as never),
        },
        {
          label: user?.payoutReady ? "Bank account" : "Add bank account",
          icon: (
            <Ionicons name="business-outline" size={19} color={theme.text} />
          ),
          onPress: () => router.push("/settings/payout-account" as never),
        },
        {
          label: "Notifications",
          icon: (
            <Ionicons
              name="notifications-outline"
              size={19}
              color={theme.text}
            />
          ),
          onPress: () => notificationsSheetRef.current?.present(),
        },
      ],
    },
    {
      title: "Appearance",
      data: [
        {
          label: `Appearance · ${theme.dark ? "Dark" : "Light"}`,
          icon: (
            <Ionicons
              name="color-palette-outline"
              size={19}
              color={theme.text}
            />
          ),
          onPress: () => router.push("/settings/appearance" as never),
        },
      ],
    },
    {
      title: "Security",
      data: [
        {
          label: "Recovery phrase",
          icon: <Ionicons name="key-outline" size={19} color={theme.text} />,
          onPress: () => router.push("/settings/recovery-phrase" as never),
        },
        {
          label: `View on ${monad.name}`,
          icon: <Ionicons name="open-outline" size={19} color={theme.text} />,
          onPress: () => address && Linking.openURL(addressUrl(address)),
        },
      ],
    },
    {
      title: "About",
      data: [
        {
          label: "Sign out",
          icon: (
            <Ionicons name="log-out-outline" size={19} color={theme.text} />
          ),
          onPress: signOut,
        },
        {
          label: "Delete account",
          icon: <Ionicons name="trash-outline" size={19} color="#D14343" />,
          onPress: () => setShowDeleteAccount(true),
          color: "#D14343",
        },
      ],
    },
  ];

  return (
    <ScreenLayout
      className="px-5 pb-0 pt-0"
      lightColor={theme.background}
      darkColor={theme.background}
    >
      <View className="w-full flex-1">
        <SectionList
          ListHeaderComponent={
            <TabHeaderText
              className="pb-3 pt-2 text-[24px] tracking-[-0.7px]"
              style={{ color: theme.text }}
            >
              Settings
            </TabHeaderText>
          }
          sections={sections}
          keyExtractor={(item, index) => item.label + index}
          renderItem={({ item }) => (
            <SettingsItem
              label={item.label}
              icon={item.icon}
              onPress={item.onPress}
              color={item.color}
              className="min-h-[64px] bg-transparent px-2 py-3.5"
              backgroundColor="transparent"
              textColor={item.color ?? theme.text}
              iconBackgroundColor="transparent"
              chevronColor={theme.faint}
            />
          )}
          renderSectionHeader={({ section: { title } }) => (
            <View className="mb-2 mt-5 px-1">
              <Typography
                weight="700"
                className="text-[11px] uppercase tracking-[1.25px] text-black/35"
                style={{ color: theme.muted }}
              >
                {title}
              </Typography>
            </View>
          )}
          ListFooterComponent={
            <View className="mt-7 items-center pb-3">
              <Image
                source={require("@/assets/images/icon.png")}
                className="mb-3 size-8 rounded-lg opacity-40"
                resizeMode="contain"
              />
              <Typography
                weight="500"
                className="text-sm"
                style={{ color: theme.muted }}
              >
                Ferry {APP_VERSION}
                {APP_BUILD ? ` (${APP_BUILD})` : ""} · {monad.name}
              </Typography>
              <View className="mt-3 flex-row items-center">
                <TouchableOpacity
                  onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}
                >
                  <Typography
                    weight="500"
                    className="text-xs"
                    style={{ color: theme.muted }}
                  >
                    Privacy
                  </Typography>
                </TouchableOpacity>
                <Typography
                  weight="500"
                  className="mx-2 text-xs"
                  style={{ color: theme.muted }}
                >
                  ·
                </Typography>
                <TouchableOpacity onPress={() => Linking.openURL(TERMS_URL)}>
                  <Typography
                    weight="500"
                    className="text-xs"
                    style={{ color: theme.muted }}
                  >
                    Terms
                  </Typography>
                </TouchableOpacity>
              </View>
            </View>
          }
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingBottom: Spacing.xxxl }}
          showsVerticalScrollIndicator={false}
        />
      </View>

      <DeleteAccountModal
        visible={showDeleteAccount}
        onClose={() => setShowDeleteAccount(false)}
        balance={balanceTotal}
        balanceDisplay={`$${balanceDisplay}`}
        onDeleted={handleAccountDeleted}
      />
      <NotificationsSheet
        ref={notificationsSheetRef}
        initialEnabled={notifications.enabled ?? true}
        onToggle={notifications.setEnabled}
      />
    </ScreenLayout>
  );
}
