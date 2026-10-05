import { useEffect } from "react";
import { Redirect } from "expo-router";

import LoadingScreen from "@/components/ui/layout/LoadingScreen";
import { useAuth } from "@/contexts/AuthContext";

export default function DevelopmentPreviewScreen() {
  const { status, signInDemo } = useAuth();

  useEffect(() => {
    if (__DEV__ && status !== "signedIn") void signInDemo();
  }, [signInDemo, status]);

  if (!__DEV__) return <Redirect href="/login" />;
  if (status !== "signedIn") return <LoadingScreen />;
  return <Redirect href="/(tabs)" />;
}
