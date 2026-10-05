import React from "react";
import { Share, ScrollView, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import HapticPressable from "@/components/ui/atoms/HapticPressable";
import { Typography } from "@/components/ui/atoms/Typography";
import { ScreenLayout } from "@/components/ui/layout";
import { useAppTheme } from "@/contexts/AppThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { useProfilePhoto } from "@/hooks/useProfilePhoto";
import { useRewards } from "@/hooks/useRewards";

export default function InviteFriendsScreen() {
  const router = useRouter();
  const { theme } = useAppTheme();
  const { user } = useAuth();
  const { photoUri } = useProfilePhoto();
  const { showToast } = useToast();
  const { data } = useRewards();
  const initial = (
    user?.displayName?.trim()[0] ??
    user?.handle?.trim()[0] ??
    "F"
  ).toUpperCase();

  const shareInvite = async () => {
    if (!data) return;
    await Share.share({
      message: `Join me on Ferry. Add code ${data.referral.code} before your first settled payment and we'll both earn Ferry Miles: ${data.referral.link}`,
      url: data.referral.link,
    });
  };

  const copyCode = async () => {
    if (!data) return;
    await Clipboard.setStringAsync(data.referral.code);
    showToast("Invite code copied");
  };

  return (
    <ScreenLayout
      className="p-0"
      decorated={false}
      lightColor={theme.background}
      darkColor={theme.background}
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 170, paddingHorizontal: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="h-16 justify-center">
          <HapticPressable
            accessibilityLabel="Back"
            accessibilityRole="button"
            feedback="selection"
            onPress={() => router.back()}
            className="size-12 items-center justify-center rounded-full"
            style={{ backgroundColor: theme.card }}
          >
            <Ionicons name="chevron-back" size={25} color={theme.text} />
          </HapticPressable>
        </View>

        <View className="items-center pb-8 pt-10">
          <View className="flex-row items-center">
            <View
              className="size-20 items-center justify-center overflow-hidden rounded-full"
              style={{ backgroundColor: theme.cardStrong }}
            >
              {photoUri ? (
                <Image
                  source={{ uri: photoUri }}
                  style={{ height: "100%", width: "100%" }}
                  contentFit="cover"
                />
              ) : (
                <Typography
                  weight="700"
                  className="text-[25px]"
                  style={{ color: theme.text }}
                >
                  {initial}
                </Typography>
              )}
            </View>
            <View
              className="-ml-2 size-20 items-center justify-center rounded-full"
              style={{ backgroundColor: theme.cardStrong }}
            >
              <Ionicons name="add" size={32} color={theme.muted} />
            </View>
          </View>
          <Typography
            weight="700"
            className="mt-8 text-center text-[38px] leading-[46px] tracking-[-1.7px]"
            style={{ color: theme.text }}
          >
            Invite a friend.{"\n"}Both earn Miles.
          </Typography>
          <Typography
            weight="500"
            className="mt-4 max-w-[310px] text-center text-[15px] leading-6"
            style={{ color: theme.muted }}
          >
            You earn {formatPoints(data?.referral.inviterReward ?? 1_000)} Miles
            and they earn {formatPoints(data?.referral.inviteeReward ?? 250)}{" "}
            after their first Ferry payment settles.
          </Typography>
        </View>

        <Typography
          weight="700"
          className="mb-4 mt-4 text-[21px]"
          style={{ color: theme.text }}
        >
          How it works
        </Typography>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 12, paddingRight: 24 }}
          style={{ marginHorizontal: -24, paddingHorizontal: 24 }}
        >
          <HowCard
            index="01"
            title="Share your code"
            detail="Send your personal Ferry link to someone you trust."
            icon="paper-plane-outline"
          />
          <HowCard
            index="02"
            title="They make a payment"
            detail="Their first Ferry payment must settle successfully."
            icon="checkmark-circle-outline"
          />
          <HowCard
            index="03"
            title="Miles arrive"
            detail="Both balances update from the verified ledger event."
            icon="sparkles-outline"
          />
        </ScrollView>

        <View
          className="mt-8 flex-row rounded-[28px] border px-5 py-6"
          style={{ backgroundColor: theme.card, borderColor: theme.border }}
        >
          <InviteMetric
            label="Qualified"
            value={data?.referral.qualifiedCount ?? 0}
          />
          <View
            className="mx-5 w-px"
            style={{ backgroundColor: theme.border }}
          />
          <InviteMetric
            label="Waiting"
            value={data?.referral.pendingCount ?? 0}
          />
        </View>

        <Typography
          weight="500"
          className="mt-5 text-center text-[12px] leading-5"
          style={{ color: theme.muted }}
        >
          Miles are non-transferable loyalty points and have no cash or AUSD
          value. Self-referrals and duplicate accounts do not qualify.
        </Typography>
      </ScrollView>

      <View
        className="absolute bottom-0 left-0 right-0 px-6 pb-7 pt-4"
        style={{ backgroundColor: theme.background }}
      >
        <View
          className="flex-row items-center rounded-[28px] px-5 py-4"
          style={{ backgroundColor: theme.primary }}
        >
          <HapticPressable
            accessibilityLabel="Copy invite code"
            feedback="selection"
            onPress={() => void copyCode()}
            className="flex-1"
          >
            <Typography
              weight="500"
              className="text-[12px]"
              style={{ color: theme.primaryText, opacity: 0.62 }}
            >
              Invite code
            </Typography>
            <View className="mt-1 flex-row items-center">
              <Typography
                weight="700"
                className="text-[17px]"
                style={{ color: theme.primaryText }}
              >
                {data?.referral.code ?? "Loading…"}
              </Typography>
              <Ionicons
                name="copy-outline"
                size={16}
                color={theme.primaryText}
                style={{ marginLeft: 8, opacity: 0.72 }}
              />
            </View>
          </HapticPressable>
          <HapticPressable
            accessibilityRole="button"
            disabled={!data}
            feedback="impact"
            onPress={() => void shareInvite()}
            className="rounded-full px-6 py-3.5"
            style={{ backgroundColor: theme.background }}
          >
            <Typography
              weight="700"
              className="text-[15px]"
              style={{ color: theme.text }}
            >
              Share
            </Typography>
          </HapticPressable>
        </View>
      </View>
    </ScreenLayout>
  );
}

function HowCard({
  index,
  title,
  detail,
  icon,
}: {
  index: string;
  title: string;
  detail: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  const { theme } = useAppTheme();
  return (
    <View
      className="w-[270px] rounded-[28px] border p-5"
      style={{ backgroundColor: theme.card, borderColor: theme.border }}
    >
      <View className="flex-row items-center justify-between">
        <View
          className="size-11 items-center justify-center rounded-full"
          style={{ backgroundColor: theme.cardStrong }}
        >
          <Ionicons name={icon} size={20} color={theme.text} />
        </View>
        <Typography
          weight="600"
          className="text-[12px]"
          style={{ color: theme.faint }}
        >
          {index}
        </Typography>
      </View>
      <Typography
        weight="700"
        className="mt-7 text-[18px]"
        style={{ color: theme.text }}
      >
        {title}
      </Typography>
      <Typography
        weight="500"
        className="mt-2 text-[13px] leading-5"
        style={{ color: theme.muted }}
      >
        {detail}
      </Typography>
    </View>
  );
}

function InviteMetric({ label, value }: { label: string; value: number }) {
  const { theme } = useAppTheme();
  return (
    <View className="flex-1 items-center">
      <Typography
        weight="600"
        className="text-[13px]"
        style={{ color: theme.muted }}
      >
        {label}
      </Typography>
      <Typography
        weight="700"
        className="mt-1 text-[24px]"
        style={{ color: theme.text }}
      >
        {value}
      </Typography>
    </View>
  );
}

function formatPoints(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
    value
  );
}
