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
import { EditWalletModal } from "@/components/ui/organisms/modals/EditWalletModal";
import { NotificationsSheet } from "@/components/ui/organisms/modals/NotificationsSheet";
import { Spacing } from "@/constants/Spacing";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { useBalances } from "@/hooks/useBalances";
import { useNotificationPreference } from "@/hooks/usePushRegistration";
import { useWalletName } from "@/hooks/useWalletName";
import { addressUrl, monad } from "@/lib/chain";
import { cn } from "@/utils/cn";

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
  const { name: walletName, setName: setWalletName } = useWalletName();
  const [showEditWallet, setShowEditWallet] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const notificationsSheetRef = useRef<BottomSheetModal>(null);
  const notifications = useNotificationPreference();
  const { showToast } = useToast();
  const { total: balanceTotal, totalDisplay: balanceDisplay } = useBalances();

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
          icon: <Ionicons name="person-outline" size={19} color="#111111" />,
          onPress: () => setShowEditWallet(true),
        },
        {
          label: "Address book",
          icon: <Ionicons name="people-outline" size={19} color="#111111" />,
          onPress: () => router.push("/settings/address-book" as never),
        },
        {
          label: user?.payoutReady ? "Bank account" : "Add bank account",
          icon: <Ionicons name="business-outline" size={19} color="#111111" />,
          onPress: () => router.push("/settings/payout-account" as never),
        },
        {
          label: "Notifications",
          icon: (
            <Ionicons name="notifications-outline" size={19} color="#111111" />
          ),
          onPress: () => notificationsSheetRef.current?.present(),
        },
      ],
    },
    {
      title: "Security",
      data: [
        {
          label: "Recovery phrase",
          icon: <Ionicons name="key-outline" size={19} color="#111111" />,
          onPress: () => router.push("/settings/recovery-phrase" as never),
        },
        {
          label: `View on ${monad.name}`,
          icon: <Ionicons name="open-outline" size={19} color="#111111" />,
          onPress: () => address && Linking.openURL(addressUrl(address)),
        },
      ],
    },
    {
      title: "About",
      data: [
        {
          label: "Sign out",
          icon: <Ionicons name="log-out-outline" size={19} color="#111111" />,
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
      className="bg-[#F7F7F4] px-5 pb-0 pt-0"
      lightColor="#F7F7F4"
      darkColor="#F7F7F4"
    >
      <View className="w-full flex-1">
        <SectionList
          ListHeaderComponent={
            <TabHeaderText className="pb-3 pt-2 text-[24px] tracking-[-0.7px]">
              Settings
            </TabHeaderText>
          }
          sections={sections}
          keyExtractor={(item, index) => item.label + index}
          renderItem={({ item, index, section }) => (
            <SettingsItem
              label={item.label}
              icon={item.icon}
              onPress={item.onPress}
              color={item.color}
              className={cn(
                index === 0 && "rounded-t-[24px]",
                index === section.data.length - 1
                  ? "rounded-b-[24px]"
                  : "border-b border-black/[0.045]"
              )}
            />
          )}
          renderSectionHeader={({ section: { title } }) => (
            <View className="mb-2 mt-5 px-1">
              <Typography
                weight="700"
                className="text-[11px] uppercase tracking-[1.25px] text-black/35"
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
              <Typography weight="500" className="text-sm text-black/40">
                Ferry {APP_VERSION}
                {APP_BUILD ? ` (${APP_BUILD})` : ""} · {monad.name}
              </Typography>
              <View className="mt-3 flex-row items-center">
                <TouchableOpacity
                  onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}
                >
                  <Typography weight="500" className="text-xs text-black/40">
                    Privacy
                  </Typography>
                </TouchableOpacity>
                <Typography weight="500" className="mx-2 text-xs text-black/40">
                  ·
                </Typography>
                <TouchableOpacity onPress={() => Linking.openURL(TERMS_URL)}>
                  <Typography weight="500" className="text-xs text-black/40">
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

      <EditWalletModal
        visible={showEditWallet}
        onClose={() => setShowEditWallet(false)}
        initialName={walletName}
        address={address ?? ""}
        onSave={setWalletName}
      />
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
