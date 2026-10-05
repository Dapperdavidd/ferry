import React, { useEffect, useMemo, useState } from "react";
import { Redirect, Slot, useSegments } from "expo-router";
import {
  AppState,
  AppStateStatus,
  Platform,
  StyleSheet,
  View,
} from "react-native";

import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";
import "@/global.css";
import "@/utils/cssInteropSetup";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AppLockProvider, useAppLock } from "@/contexts/AppLockContext";
import { ScreenThemeProvider } from "@/contexts/ScreenThemeContext";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/utils/cn";
import { ModalFlowProvider } from "@/contexts/ModalFlowContext";
import { ToastProvider } from "@/contexts/ToastContext";
import { AppThemeProvider, useAppTheme } from "@/contexts/AppThemeContext";
import {
  BlurTargetProvider,
  BlurTargetHost,
} from "@/contexts/BlurTargetContext";
import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import {
  focusManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";

import * as SplashScreen from "expo-splash-screen";
import {
  Inter_100Thin,
  Inter_200ExtraLight,
  Inter_300Light,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  Inter_900Black,
  Inter_100Thin_Italic,
  Inter_200ExtraLight_Italic,
  Inter_300Light_Italic,
  Inter_400Regular_Italic,
  Inter_500Medium_Italic,
  Inter_600SemiBold_Italic,
  Inter_700Bold_Italic,
  Inter_800ExtraBold_Italic,
  Inter_900Black_Italic,
  useFonts,
} from "@expo-google-fonts/inter";
import LoadingScreen from "@/components/ui/layout/LoadingScreen";
import LockScreen from "@/components/ui/layout/LockScreen";
import { usePendingWatch } from "@/hooks/useTransfers";
import {
  useNotificationRouting,
  usePushRegistration,
} from "@/hooks/usePushRegistration";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 2 } },
});

/**
 * Bridges React Native's AppState into React Query's focusManager so queries
 * refetch on foreground. `focusManager` handles this via the browser
 * `visibilitychange` event on web, so only wire it up on native.
 */
function ReactQueryFocusBridge() {
  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      focusManager.setFocused(state === "active");
    });
    return () => sub.remove();
  }, []);
  return null;
}

// Keep the native splash up until the app is ready, then hand off to the
// matching JS splash (LoadingScreen) — no white flash in between.
SplashScreen.preventAutoHideAsync();

// Error tracking in release builds only, and only when a DSN is configured.
const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
const SENTRY_ENABLED = !__DEV__ && !!SENTRY_DSN;

if (SENTRY_ENABLED) {
  const app = Constants.expoConfig;
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT ?? "production",
    release: app?.version ? `${app.slug ?? "ferry"}@${app.version}` : undefined,
    dist: app?.ios?.buildNumber ?? app?.android?.versionCode?.toString(),
    sendDefaultPii: true,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1,
    integrations: [
      Sentry.mobileReplayIntegration(),
      Sentry.feedbackIntegration(),
    ],
  });
}

function AuthLayout() {
  const segments = useSegments();
  const { status, user } = useAuth();
  const { isLocked, isObscured } = useAppLock();
  const { theme: appTheme } = useAppTheme();

  const screens = useMemo(
    () => (
      <ScreenThemeProvider>
        <ModalFlowProvider>
          <ToastProvider>
            <BlurTargetHost>
              <Slot />
            </BlurTargetHost>
            <StatusBar style={appTheme.dark ? "light" : "dark"} />
          </ToastProvider>
        </ModalFlowProvider>
      </ScreenThemeProvider>
    ),
    [appTheme.dark]
  );

  if (status === "loading") {
    return <LoadingScreen />;
  }

  const isAuthenticated = status === "signedIn";
  const inAuthGroup = segments[0] === "(auth)";
  const atOnboarding = segments[0] === "onboarding";
  const atDevelopmentPreview = __DEV__ && segments[0] === "dev-preview";
  // A handle is the identity people send to, so an account without one stays on onboarding.
  const needsHandle = isAuthenticated && (!user || !user.handle);

  if (!isAuthenticated && !inAuthGroup && !atDevelopmentPreview) {
    return <Redirect href="/login" withAnchor />;
  }

  if (needsHandle && !atOnboarding) {
    return <Redirect href="/onboarding" withAnchor />;
  }

  if (isAuthenticated && !needsHandle && (inAuthGroup || atOnboarding)) {
    return <Redirect href="/(tabs)" withAnchor />;
  }

  const showLock = isAuthenticated && !inAuthGroup && isLocked;
  const showObscure =
    isAuthenticated && !inAuthGroup && isObscured && !showLock;

  return (
    <View style={styles.authRoot}>
      <View
        accessibilityElementsHidden={showLock || showObscure}
        importantForAccessibility={
          showLock || showObscure ? "no-hide-descendants" : "auto"
        }
        pointerEvents={showLock || showObscure ? "none" : "auto"}
        style={styles.authContent}
      >
        {screens}
      </View>
      {showObscure && (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="auto"
          style={[styles.securityLayer, { backgroundColor: "#FAFAF8" }]}
        />
      )}
      {showLock && (
        <View pointerEvents="auto" style={styles.securityLayer}>
          <LockScreen />
        </View>
      )}
    </View>
  );
}

function RootLayout() {
  const [loaded, error] = useFonts({
    Inter_100Thin,
    Inter_200ExtraLight,
    Inter_300Light,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    Inter_900Black,
    Inter_100Thin_Italic,
    Inter_200ExtraLight_Italic,
    Inter_300Light_Italic,
    Inter_400Regular_Italic,
    Inter_500Medium_Italic,
    Inter_600SemiBold_Italic,
    Inter_700Bold_Italic,
    Inter_800ExtraBold_Italic,
    Inter_900Black_Italic,
  });

  const [fontTimeout, setFontTimeout] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setFontTimeout(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  const ready = loaded || !!error || fontTimeout;

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync();
    }
  }, [ready]);

  if (!ready) {
    return <LoadingScreen />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ReactQueryFocusBridge />
      <GestureHandlerRootView style={{ flex: 1 }}>
        <AppThemeProvider>
          <ThemedRoot>
            <AuthProvider>
              <ActivityWatch />
              <AppLockProvider>
                <BlurTargetProvider>
                  <BottomSheetModalProvider>
                    <AuthLayout />
                  </BottomSheetModalProvider>
                </BlurTargetProvider>
              </AppLockProvider>
            </AuthProvider>
          </ThemedRoot>
        </AppThemeProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}

/**
 * Watches for money arriving, from wherever the Consumer happens to be.
 *
 * Mounted above the screens rather than on one of them: a deposit lands
 * whether or not the activity feed is open, and before this it stayed
 * invisible until something else happened to refetch.
 */
function ActivityWatch() {
  usePendingWatch();
  usePushRegistration();
  useNotificationRouting();
  return null;
}

function ThemedRoot({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  const { theme: appTheme } = useAppTheme();
  return (
    <View
      className={cn("flex-1", theme === "dark" && "dark")}
      style={{ backgroundColor: appTheme.background }}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  authRoot: {
    flex: 1,
  },
  authContent: {
    flex: 1,
  },
  securityLayer: {
    bottom: 0,
    elevation: 10_000,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 10_000,
  },
});

export default SENTRY_ENABLED ? Sentry.wrap(RootLayout) : RootLayout;
