import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import HapticPressable from "@/components/ui/atoms/HapticPressable";
import { Typography } from "@/components/ui/atoms/Typography";
import { ScreenLayout } from "@/components/ui/layout";
import { PremiumActionButton } from "@/components/ui/molecules/PremiumActionButton";
import { useAppTheme } from "@/contexts/AppThemeContext";
import { useToast } from "@/contexts/ToastContext";
import { useBillGroups, useCreateBillGroup } from "@/hooks/useBills";
import { apiErrorMessage } from "@/utils/apiClient";

export default function BillGroupsScreen() {
  const { theme } = useAppTheme();
  const { showToast } = useToast();
  const router = useRouter();
  const groups = useBillGroups();
  const createGroup = useCreateBillGroup();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [handles, setHandles] = useState("");

  const save = async () => {
    const members = handles
      .split(/[\s,]+/)
      .map((handle) => handle.trim().replace(/^@/, "").toLowerCase())
      .filter(Boolean);
    try {
      await createGroup.mutateAsync({ name: name.trim(), handles: members });
      setName("");
      setHandles("");
      setCreating(false);
      showToast("Group created");
    } catch (error) {
      showToast(apiErrorMessage(error) ?? "We couldn't create that group");
    }
  };

  return (
    <ScreenLayout
      className="p-0"
      lightColor={theme.background}
      darkColor={theme.background}
    >
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View className="h-16 flex-row items-center justify-between px-6">
          <HapticPressable
            accessibilityRole="button"
            accessibilityLabel="Back to Bills"
            feedback="selection"
            onPress={() => router.back()}
            className="size-12 items-center justify-center rounded-full"
            style={{ backgroundColor: theme.card }}
          >
            <Ionicons name="chevron-back" size={24} color={theme.text} />
          </HapticPressable>
          <Typography
            weight="700"
            className="text-[19px]"
            style={{ color: theme.text }}
          >
            Groups
          </Typography>
          <HapticPressable
            accessibilityRole="button"
            accessibilityLabel="Create a group"
            feedback="impact"
            onPress={() => setCreating((value) => !value)}
            className="size-12 items-center justify-center rounded-full"
            style={{ backgroundColor: theme.primary }}
          >
            <Ionicons
              name={creating ? "close" : "add"}
              size={24}
              color={theme.primaryText}
            />
          </HapticPressable>
        </View>

        <ScrollView
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="px-6 pb-10 pt-5"
          showsVerticalScrollIndicator={false}
        >
          <Typography
            weight="700"
            className="text-[34px] leading-10 tracking-[-1.2px]"
            style={{ color: theme.text }}
          >
            Your people,
            {"\n"}ready for the next split.
          </Typography>

          {creating ? (
            <View
              className="mt-8 rounded-[28px] p-5"
              style={{ backgroundColor: theme.card }}
            >
              <TextInput
                accessibilityLabel="Group name"
                value={name}
                onChangeText={setName}
                placeholder="Weekend crew"
                placeholderTextColor={theme.faint}
                className="h-14 border-b font-inter-semibold text-base"
                style={{ color: theme.text, borderColor: theme.border }}
              />
              <TextInput
                accessibilityLabel="Group member handles"
                value={handles}
                onChangeText={setHandles}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="@bola, @mina"
                placeholderTextColor={theme.faint}
                className="mt-2 h-14 font-inter-medium text-sm"
                style={{ color: theme.text }}
              />
              <PremiumActionButton
                label={createGroup.isPending ? "Creating…" : "Create group"}
                tone="ink"
                disabled={!name.trim() || createGroup.isPending}
                onPress={() => void save()}
                style={{ marginTop: 12 }}
              />
            </View>
          ) : null}

          {groups.isLoading ? (
            <ActivityIndicator className="mt-16" color={theme.accent} />
          ) : (groups.data ?? []).length ? (
            <View className="mt-8 gap-3">
              {groups.data?.map((group) => (
                <View
                  key={group.id}
                  className="rounded-[28px] p-5"
                  style={{ backgroundColor: theme.card }}
                >
                  <View className="flex-row items-center justify-between">
                    <Typography
                      weight="700"
                      className="text-lg"
                      style={{ color: theme.text }}
                    >
                      {group.name}
                    </Typography>
                    <Typography
                      weight="600"
                      className="text-xs"
                      style={{ color: theme.muted }}
                    >
                      {group.members.length} members
                    </Typography>
                  </View>
                  <View className="mt-4 flex-row flex-wrap gap-2">
                    {group.members.map((member) => (
                      <View
                        key={member.id}
                        className="flex-row items-center rounded-full px-3 py-2"
                        style={{ backgroundColor: theme.cardStrong }}
                      >
                        <Typography
                          weight="700"
                          className="text-xs"
                          style={{ color: theme.text }}
                        >
                          {member.initials || "F"}
                        </Typography>
                        <Typography
                          weight="600"
                          className="ml-2 text-xs"
                          style={{ color: theme.muted }}
                        >
                          {member.handle ? `@${member.handle}` : member.name}
                        </Typography>
                      </View>
                    ))}
                  </View>
                  <HapticPressable
                    accessibilityRole="button"
                    accessibilityLabel={`Create a bill with ${group.name}`}
                    feedback="impact"
                    onPress={() =>
                      router.push({
                        pathname: "/bills/new",
                        params: { groupId: group.id },
                      } as never)
                    }
                    className="mt-5 flex-row items-center justify-center rounded-full py-3"
                    style={{ backgroundColor: theme.primary }}
                  >
                    <Ionicons name="add" size={17} color={theme.primaryText} />
                    <Typography
                      weight="700"
                      className="ml-2 text-xs"
                      style={{ color: theme.primaryText }}
                    >
                      Split with this group
                    </Typography>
                  </HapticPressable>
                </View>
              ))}
            </View>
          ) : (
            <View className="items-center py-20">
              <Ionicons name="people-outline" size={36} color={theme.faint} />
              <Typography
                weight="700"
                className="mt-4 text-base"
                style={{ color: theme.text }}
              >
                No groups yet
              </Typography>
              <Typography
                weight="500"
                className="mt-2 text-center text-sm"
                style={{ color: theme.muted }}
              >
                Make one for the people you split with often.
              </Typography>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenLayout>
  );
}
