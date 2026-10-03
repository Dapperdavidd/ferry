import React, { useRef, useState } from "react";
import {
  Image,
  View,
  SectionList,
  TouchableOpacity,
  Linking,
  type ImageSourcePropType,
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
    icon: ImageSourcePropType | React.ReactNode;
    onPress: () => void;
    color?: string;
  };
  const sections: { title: string; data: Item[] }[] = [
    {
      title: "Account",
      data: [
        {
          label: user?.handle ? `@${user.handle}` : "Edit account",
          icon: require("@/assets/icons/edit-wallet.png"),
          onPress: () => setShowEditWallet(true),
        },
        {
          label: "Address book",
          icon: require("@/assets/icons/address-book.png"),
          onPress: () => router.push("/settings/address-book" as never),
        },
        {
          label: "Notifications",
          icon: require("@/assets/icons/notification.png"),
          onPress: () => notificationsSheetRef.current?.present(),
        },
      ],
    },
    {
      title: "Security",
      data: [
        {
          label: "Recovery phrase",
          icon: require("@/assets/icons/keys.png"),
          onPress: () => router.push("/settings/recovery-phrase" as never),
        },
        {
          label: `View on ${monad.name}`,
          icon: require("@/assets/icons/wallet.png"),
          onPress: () => address && Linking.openURL(addressUrl(address)),
        },
      ],
    },
    {
      title: "About",
      data: [
        {
          label: "Sign out",
          icon: <Ionicons name="log-out-outline" size={22} color="#000000" />,
          onPress: signOut,
        },
        {
          label: "Delete account",
          icon: (
            <Ionicons name="person-remove-outline" size={22} color="#F90101" />
          ),
          onPress: () => setShowDeleteAccount(true),
          color: "#F90101",
        },
      ],
    },
  ];

  return (
    <ScreenLayout>
      <View className="w-full flex-1">
        <SectionList
          ListHeaderComponent={<TabHeaderText>Settings</TabHeaderText>}
          sections={sections}
          keyExtractor={(item, index) => item.label + index}
          renderItem={({ item }) => (
            <SettingsItem
              label={item.label}
              icon={item.icon}
              onPress={item.onPress}
              color={item.color}
            />
          )}
          renderSectionHeader={({ section: { title } }) => (
            <View className="mb-2 mt-6">
              <Typography weight="500" className="text-lg text-black/40">
                {title}
              </Typography>
            </View>
          )}
          ListFooterComponent={
            <View className="mt-8 items-center">
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
