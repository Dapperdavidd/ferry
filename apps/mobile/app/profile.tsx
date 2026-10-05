import React, { useRef, useState } from "react";
import { Alert, Linking, ScrollView, View } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { BottomSheetModal } from "@gorhom/bottom-sheet";

import HapticPressable from "@/components/ui/atoms/HapticPressable";
import { Typography } from "@/components/ui/atoms/Typography";
import { ScreenLayout } from "@/components/ui/layout";
import { EditWalletModal } from "@/components/ui/organisms/modals/EditWalletModal";
import { NotificationsSheet } from "@/components/ui/organisms/modals/NotificationsSheet";
import { useAppTheme } from "@/contexts/AppThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { useNotificationPreference } from "@/hooks/usePushRegistration";
import { useProfilePhoto } from "@/hooks/useProfilePhoto";
import { useWalletName } from "@/hooks/useWalletName";
import { useRewards } from "@/hooks/useRewards";

const SUPPORT_URL = "mailto:support@ferry.money?subject=Ferry%20support";

export default function ProfileScreen() {
  const router = useRouter();
  const { theme } = useAppTheme();
  const { user, address } = useAuth();
  const { showToast } = useToast();
  const { name: walletName, setName: setWalletName } = useWalletName();
  const { photoUri, isSaving, savePhoto, removePhoto } = useProfilePhoto();
  const notifications = useNotificationPreference();
  const { data: rewards } = useRewards();
  const notificationsSheetRef = useRef<BottomSheetModal>(null);
  const [showEditWallet, setShowEditWallet] = useState(false);

  const initial = (
    user?.displayName?.trim()[0] ??
    user?.handle?.trim()[0] ??
    "F"
  ).toUpperCase();
  const memberSince = formatMemberSince(user?.createdAt);
  const displayName = user?.displayName?.trim() || walletName;

  const choosePhoto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.82,
      });
      if (result.canceled || !result.assets[0]) return;

      await savePhoto(result.assets[0].uri);
      showToast("Profile photo updated");
    } catch {
      showToast("We couldn't update your photo");
    }
  };

  const editPhoto = () => {
    if (!photoUri) {
      void choosePhoto();
      return;
    }

    Alert.alert("Profile photo", undefined, [
      { text: "Choose another photo", onPress: () => void choosePhoto() },
      {
        text: "Remove photo",
        style: "destructive",
        onPress: () =>
          void removePhoto()
            .then(() => showToast("Profile photo removed"))
            .catch(() => showToast("We couldn't remove your photo")),
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const rows: ProfileRowProps[] = [
    {
      label: "Ferry Miles",
      value: rewards
        ? `${new Intl.NumberFormat("en-US").format(rewards.balance)} · ${rewards.level.name}`
        : undefined,
      icon: "sparkles-outline",
      onPress: () => router.push("/rewards" as never),
    },
    {
      label: "Account",
      icon: "person-outline",
      onPress: () => setShowEditWallet(true),
    },
    {
      label: "Security",
      icon: "lock-closed-outline",
      onPress: () => router.push("/settings/recovery-phrase" as never),
    },
    {
      label: "Statements",
      icon: "document-text-outline",
      onPress: () => router.push("/(tabs)/history" as never),
    },
    {
      label: "Notifications",
      icon: "notifications-outline",
      onPress: () => notificationsSheetRef.current?.present(),
    },
    {
      label: "Appearance",
      value: theme.dark ? "Dark" : "Light",
      icon: "color-palette-outline",
      onPress: () => router.push("/settings/appearance" as never),
    },
    {
      label: "Get help",
      icon: "help-circle-outline",
      onPress: () => void Linking.openURL(SUPPORT_URL),
    },
  ];

  return (
    <ScreenLayout
      className="p-0"
      lightColor={theme.background}
      darkColor={theme.background}
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40, paddingHorizontal: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="h-16 justify-center">
          <HapticPressable
            accessibilityLabel="Back to home"
            accessibilityRole="button"
            feedback="selection"
            onPress={() => router.back()}
            className="size-12 items-center justify-center rounded-full"
            style={{ backgroundColor: theme.card }}
          >
            <Ionicons name="chevron-back" size={25} color={theme.text} />
          </HapticPressable>
        </View>

        <View className="items-center pb-10 pt-14">
          <View className="relative">
            <View
              className="size-32 items-center justify-center overflow-hidden rounded-full"
              style={{ backgroundColor: theme.cardStrong }}
            >
              {photoUri ? (
                <Image
                  source={{ uri: photoUri }}
                  style={{ height: "100%", width: "100%" }}
                  contentFit="cover"
                  transition={160}
                />
              ) : (
                <Typography
                  weight="700"
                  className="text-[38px]"
                  style={{ color: theme.text }}
                >
                  {initial}
                </Typography>
              )}
            </View>
            <HapticPressable
              accessibilityLabel={
                photoUri ? "Change profile photo" : "Add profile photo"
              }
              accessibilityRole="button"
              disabled={isSaving}
              feedback="selection"
              onPress={editPhoto}
              className="absolute -right-1 top-1 size-11 items-center justify-center rounded-full border"
              style={{
                backgroundColor: theme.card,
                borderColor: theme.background,
              }}
            >
              <Ionicons name="pencil" size={19} color={theme.text} />
            </HapticPressable>
          </View>

          <Typography
            weight="700"
            className="mt-6 text-[24px] tracking-[-0.5px]"
            style={{ color: theme.text }}
          >
            {displayName}
          </Typography>
          <View
            className="mt-3 rounded-full px-5 py-2.5"
            style={{ backgroundColor: theme.cardStrong }}
          >
            <Typography
              weight="700"
              className="text-sm"
              style={{ color: theme.text }}
            >
              {user?.handle ? `@${user.handle}` : "Ferry member"}
            </Typography>
          </View>
          <Typography
            weight="600"
            className="mt-3 text-sm"
            style={{ color: theme.muted }}
          >
            Member since {memberSince}
          </Typography>
        </View>

        <View
          className="overflow-hidden rounded-[30px] border"
          style={{ backgroundColor: theme.card, borderColor: theme.border }}
        >
          {rows.map((row, index) => (
            <ProfileRow
              key={row.label}
              {...row}
              separated={index !== rows.length - 1}
            />
          ))}
        </View>
      </ScrollView>

      <EditWalletModal
        visible={showEditWallet}
        onClose={() => setShowEditWallet(false)}
        initialName={walletName}
        address={address ?? ""}
        onSave={setWalletName}
      />
      <NotificationsSheet
        ref={notificationsSheetRef}
        initialEnabled={notifications.enabled ?? true}
        onToggle={notifications.setEnabled}
      />
    </ScreenLayout>
  );
}

type ProfileRowProps = {
  label: string;
  value?: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  separated?: boolean;
};

function ProfileRow({
  label,
  value,
  icon,
  onPress,
  separated,
}: ProfileRowProps) {
  const { theme } = useAppTheme();
  return (
    <HapticPressable
      accessibilityRole="button"
      feedback="selection"
      onPress={onPress}
      className="min-h-[68px] flex-row items-center px-5"
      style={
        separated
          ? { borderBottomColor: theme.border, borderBottomWidth: 1 }
          : undefined
      }
    >
      <Ionicons name={icon} size={22} color={theme.muted} />
      <Typography
        weight="600"
        className="ml-4 flex-1 text-[16px]"
        style={{ color: theme.text }}
      >
        {label}
      </Typography>
      {value ? (
        <Typography
          weight="600"
          className="mr-3 text-sm"
          style={{ color: theme.muted }}
        >
          {value}
        </Typography>
      ) : null}
      <Ionicons name="chevron-forward" size={21} color={theme.faint} />
    </HapticPressable>
  );
}

function formatMemberSince(createdAt?: string) {
  if (!createdAt) return "today";
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "today";
  return new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
  }).format(date);
}
