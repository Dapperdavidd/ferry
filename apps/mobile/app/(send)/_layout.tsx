import { Stack, router } from "expo-router";
import { TouchableOpacity } from "react-native";
import { useThemeColor } from "@/hooks/useThemeColor";
import { ThemedText } from "@/components/ui/atoms";
import { Ionicons } from "@expo/vector-icons";

export default function SendLayout() {
  const textColor = useThemeColor({}, "text");

  const getHeaderTitle = (title: string) => {
    return <ThemedText type="defaultSemiBold">{title}</ThemedText>;
  };

  const renderBackButton = () => {
    return (
      <TouchableOpacity onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={24} color={textColor} />
      </TouchableOpacity>
    );
  };

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerShadowVisible: false,
        headerBackTitle: "Back",
        headerTintColor: textColor,
        headerBackVisible: false,
        headerLeft: () => renderBackButton(),
      }}
    >
      <Stack.Screen
        name="confirm"
        options={{
          title: "",
          headerTitle: () => getHeaderTitle("Confirm Send"),
        }}
      />
    </Stack>
  );
}
