import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import QRCode from "react-native-qrcode-svg";
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  Polygon,
  Rect,
  Stop,
} from "react-native-svg";

import HapticPressable from "@/components/ui/atoms/HapticPressable";
import { TokenMark } from "@/components/ui/atoms/TokenMark";
import { Typography } from "@/components/ui/atoms/Typography";
import { ScreenLayout } from "@/components/ui/layout";
import { useToast } from "@/contexts/ToastContext";
import {
  apiClient,
  apiErrorMessage,
  type DepositNetwork,
} from "@/utils/apiClient";

const NETWORKS: Record<
  DepositNetwork,
  { label: string; shortLabel: string; family: "EVM" | "SVM" }
> = {
  arbitrum: { label: "Arbitrum", shortLabel: "ARB", family: "EVM" },
  avalanche: { label: "Avalanche", shortLabel: "AVAX", family: "EVM" },
  base: { label: "Base", shortLabel: "BASE", family: "EVM" },
  ethereum: { label: "Ethereum", shortLabel: "ETH", family: "EVM" },
  immutable: { label: "Immutable", shortLabel: "IMX", family: "EVM" },
  monad: { label: "Monad", shortLabel: "MON", family: "EVM" },
  "polygon-pos": { label: "Polygon", shortLabel: "POL", family: "EVM" },
  solana: { label: "Solana", shortLabel: "SOL", family: "SVM" },
};

const NETWORK_PRIORITY: DepositNetwork[] = [
  "base",
  "arbitrum",
  "ethereum",
  "polygon-pos",
  "avalanche",
  "solana",
  "monad",
  "immutable",
];

const ROUTE_CARD_ART = require("../assets/images/funding/usdc-route-card-bg.jpg");

export default function DepositUsdcScreen() {
  const { showToast } = useToast();
  const [selectedChain, setSelectedChain] = useState<DepositNetwork | null>(
    null
  );
  const [safetyOpen, setSafetyOpen] = useState(false);
  const route = useQuery({
    queryKey: ["usdc-deposit-route"],
    queryFn: () => apiClient.getUsdcDepositRoute(),
    staleTime: Number.POSITIVE_INFINITY,
    retry: 1,
  });

  const instructions = useMemo(() => {
    const available = route.data?.instructions ?? [];
    return [...available].sort(
      (a, b) =>
        NETWORK_PRIORITY.indexOf(a.chain) - NETWORK_PRIORITY.indexOf(b.chain)
    );
  }, [route.data]);

  useEffect(() => {
    if (
      instructions.length > 0 &&
      !instructions.some((instruction) => instruction.chain === selectedChain)
    ) {
      setSelectedChain(instructions[0].chain);
    }
  }, [instructions, selectedChain]);

  const selected = instructions.find(
    (instruction) => instruction.chain === selectedChain
  );
  const isPreview = route.data?.mode === "mock";

  const copyAddress = async () => {
    if (!selected) return;
    if (isPreview) {
      showToast("Preview only — connect Agora before accepting deposits.");
      return;
    }
    await Clipboard.setStringAsync(selected.depositAddress);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showToast("USDC deposit address copied.");
  };

  const shareAddress = async () => {
    if (!selected || isPreview) {
      if (isPreview)
        showToast("Preview only — this is not a live deposit address.");
      return;
    }
    const network = NETWORKS[selected.chain].label;
    await Share.share({
      message: `Send only USDC on ${network} to ${selected.depositAddress}`,
    });
  };

  return (
    <ScreenLayout
      className="bg-[#F7F7F4] p-0"
      lightColor="#F7F7F4"
      darkColor="#F7F7F4"
    >
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-6 pb-7 pt-2"
        showsVerticalScrollIndicator={false}
      >
        <View className="relative h-16 flex-row items-center justify-between">
          <HapticPressable
            accessibilityLabel="Go back"
            feedback="selection"
            onPress={() => router.back()}
            className="z-10 size-12 items-center justify-center rounded-full bg-white"
          >
            <Ionicons name="chevron-back" size={25} color="#111111" />
          </HapticPressable>
          <View
            pointerEvents="none"
            className="absolute inset-x-0 items-center"
          >
            <Typography
              weight="700"
              className="text-[20px] tracking-[-0.3px] text-[#111111]"
            >
              Deposit USDC
            </Typography>
          </View>
          <View className="size-12" />
        </View>

        {route.isLoading ? (
          <LoadingState />
        ) : route.isError ? (
          <ErrorState
            message={
              apiErrorMessage(route.error) ??
              "We couldn't prepare your deposit route."
            }
            onRetry={() => void route.refetch()}
          />
        ) : selected ? (
          <>
            <RouteArtwork chain={selected.chain} isPreview={isPreview} />

            <NetworkSelector
              instructions={instructions}
              selectedChain={selected.chain}
              isPreview={isPreview}
              onSelect={setSelectedChain}
            />

            <View className="mt-4 overflow-hidden rounded-[30px] bg-white px-5 pb-5 pt-5">
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-3">
                  <NetworkLogo chain={selected.chain} size={44} />
                  <View>
                    <Typography
                      weight="700"
                      className="text-[17px] text-[#111111]"
                    >
                      {NETWORKS[selected.chain].label}
                    </Typography>
                    <Typography
                      weight="500"
                      className="mt-0.5 text-[12px] text-black/35"
                    >
                      USDC deposit network
                    </Typography>
                  </View>
                </View>
                <HapticPressable
                  accessibilityRole="button"
                  accessibilityLabel="Deposit safety information"
                  feedback="selection"
                  onPress={() => setSafetyOpen(true)}
                  className="size-10 items-center justify-center rounded-full bg-black/[0.045]"
                >
                  <Ionicons
                    name="information-outline"
                    size={21}
                    color="#111111"
                  />
                </HapticPressable>
              </View>

              <View className="mt-4 items-center rounded-[24px] bg-[#FAFAF8] px-4 py-4">
                <View className={isPreview ? "opacity-35" : undefined}>
                  <QRCode
                    value={selected.depositAddress}
                    size={142}
                    color="#111111"
                    backgroundColor="#FAFAF8"
                    ecl="M"
                  />
                </View>
                <Typography
                  accessibilityLabel={`Deposit address ${selected.depositAddress}`}
                  numberOfLines={1}
                  weight="500"
                  className="mt-3 text-center text-[11px] leading-[15px] text-black/40"
                >
                  {compactAddress(selected.depositAddress)}
                </Typography>
              </View>

              <View className="mt-4 flex-row gap-2">
                <HapticPressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    isPreview ? "Preview deposit route" : "Copy deposit address"
                  }
                  onPress={() => void copyAddress()}
                  className="h-[52px] flex-1 flex-row items-center justify-center gap-2 rounded-full bg-[#111111]"
                >
                  <Ionicons
                    name={isPreview ? "lock-closed-outline" : "copy-outline"}
                    size={18}
                    color="white"
                  />
                  <Typography weight="700" className="text-[15px] text-white">
                    {isPreview ? "Preview only" : "Copy address"}
                  </Typography>
                </HapticPressable>

                {!isPreview ? (
                  <HapticPressable
                    accessibilityRole="button"
                    accessibilityLabel="Share deposit address"
                    onPress={() => void shareAddress()}
                    className="size-[52px] items-center justify-center rounded-full bg-black/[0.045]"
                  >
                    <Ionicons name="share-outline" size={20} color="#111111" />
                  </HapticPressable>
                ) : null}
              </View>
            </View>

            <SafetySheet
              chain={selected.chain}
              visible={safetyOpen}
              onClose={() => setSafetyOpen(false)}
            />
          </>
        ) : null}
      </ScrollView>
    </ScreenLayout>
  );
}

function LoadingState() {
  return (
    <View className="mt-32 items-center">
      <ActivityIndicator size="small" color="#111111" />
      <Typography weight="600" className="mt-4 text-[14px] text-black/40">
        Preparing your secure deposit route…
      </Typography>
    </View>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <View className="mt-24 items-center rounded-[30px] bg-white px-7 py-10">
      <View className="size-14 items-center justify-center rounded-full bg-black/[0.04]">
        <Ionicons name="cloud-offline-outline" size={25} color="#111111" />
      </View>
      <Typography
        weight="700"
        className="mt-5 text-center text-[21px] text-[#111111]"
      >
        Route unavailable
      </Typography>
      <Typography
        weight="500"
        className="mt-2 text-center text-[14px] leading-5 text-black/40"
      >
        {message}
      </Typography>
      <HapticPressable
        onPress={onRetry}
        className="mt-7 rounded-full bg-black px-8 py-4"
      >
        <Typography weight="700" className="text-[15px] text-white">
          Try again
        </Typography>
      </HapticPressable>
    </View>
  );
}

function RouteArtwork({
  chain,
  isPreview,
}: {
  chain: DepositNetwork;
  isPreview: boolean;
}) {
  return (
    <View className="relative mt-5 h-[132px] overflow-hidden rounded-[28px] bg-[#171816]">
      <Image
        source={ROUTE_CARD_ART}
        contentFit="cover"
        transition={0}
        style={[StyleSheet.absoluteFill, { zIndex: 0 }]}
      />
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { zIndex: 1 }]}
      >
        <View
          style={{
            position: "absolute",
            right: -24,
            top: 10,
            width: 168,
            height: 42,
            borderRadius: 999,
            backgroundColor: "rgba(209, 201, 142, 0.14)",
            transform: [{ rotate: "-9deg" }],
          }}
        />
        <View
          style={{
            position: "absolute",
            right: -9,
            bottom: 10,
            width: 148,
            height: 40,
            borderRadius: 999,
            backgroundColor: "rgba(255, 255, 255, 0.075)",
            transform: [{ rotate: "7deg" }],
          }}
        />
        <View className="absolute -right-20 -top-24 size-64 rounded-full border border-white/10" />
        <View className="absolute -right-12 -top-16 size-52 rounded-full border border-[#D1C98E]/30" />
        <Image
          source={require("@/assets/images/logo/ferry-mark-white-2048.png")}
          contentFit="contain"
          transition={0}
          style={{
            position: "absolute",
            right: -8,
            bottom: -22,
            width: 150,
            height: 150,
            opacity: 0.16,
            transform: [{ rotate: "-12deg" }],
          }}
        />
      </View>
      <View
        className="flex-1 px-5 py-4"
        style={{ position: "relative", zIndex: 2 }}
      >
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2 rounded-full border border-white/15 bg-black/35 px-3 py-1.5">
            <View
              className={
                isPreview
                  ? "size-1.5 rounded-full bg-[#B8A581]"
                  : "size-1.5 rounded-full bg-[#55D878]"
              }
            />
            <Typography
              weight="700"
              className="text-[10px] tracking-[0.8px] text-white/75"
            >
              {isPreview ? "PREVIEW ROUTE" : "LIVE ROUTE"}
            </Typography>
          </View>
          <View className="flex-row items-center">
            <NetworkLogo chain={chain} size={28} />
            <View className="-ml-1">
              <TokenMark token="AUSD" size={28} />
            </View>
          </View>
        </View>

        <Typography
          weight="700"
          className="mt-4 text-[23px] tracking-[-0.6px] text-white"
        >
          USDC → AUSD
        </Typography>
        <Typography weight="600" className="mt-0.5 text-[12px] text-white/50">
          {isPreview
            ? "Not a live address yet"
            : `${NETWORKS[chain].label} in · Monad out`}
        </Typography>
      </View>
    </View>
  );
}

function NetworkSelector({
  instructions,
  selectedChain,
  isPreview,
  onSelect,
}: {
  instructions: { chain: DepositNetwork }[];
  selectedChain: DepositNetwork;
  isPreview: boolean;
  onSelect: (chain: DepositNetwork) => void;
}) {
  const selected = NETWORKS[selectedChain];

  return (
    <View className="relative mt-5 overflow-hidden rounded-[30px] border border-white/80 bg-[#ECEDE7] pb-4 pt-4">
      <NetworkSelectorBackdrop />

      <View className="relative flex-row items-end justify-between px-5">
        <View>
          <Typography
            weight="700"
            className="text-[10px] uppercase tracking-[1.5px] text-black/35"
          >
            Source network
          </Typography>
          <Typography
            weight="600"
            className="mt-1 text-[12px] tracking-[-0.1px] text-black/55"
          >
            Where your USDC starts
          </Typography>
        </View>
        <View className="rounded-full border border-white/80 bg-white/45 px-2.5 py-1.5">
          <Typography
            weight="700"
            className="text-[9px] uppercase tracking-[1px] text-black/35"
          >
            USDC only
          </Typography>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="relative mt-3"
        contentContainerClassName="gap-1 px-4"
      >
        {instructions.map((instruction) => (
          <NetworkNode
            key={instruction.chain}
            chain={instruction.chain}
            selected={instruction.chain === selectedChain}
            onPress={() => onSelect(instruction.chain)}
          />
        ))}
      </ScrollView>

      <View className="relative mx-4 mt-3 flex-row items-center rounded-[22px] border border-white/70 bg-white/55 px-3.5 py-3">
        <View className="min-w-[88px] flex-row items-center gap-2.5">
          <NetworkLogo chain={selectedChain} size={28} />
          <View>
            <Typography
              weight="700"
              numberOfLines={1}
              className="max-w-[72px] text-[12px] tracking-[-0.2px] text-[#111111]"
            >
              {selected.label}
            </Typography>
            <Typography
              weight="700"
              className="mt-0.5 text-[8px] uppercase tracking-[0.8px] text-black/30"
            >
              {selected.family} · USDC
            </Typography>
          </View>
        </View>

        <RouteTrace isPreview={isPreview} />

        <View className="min-w-[75px] flex-row items-center justify-end gap-2">
          <Image
            source={require("@/assets/images/logo/ferry-mark-black-2048.png")}
            contentFit="contain"
            transition={0}
            style={{ width: 24, height: 24 }}
          />
          <View>
            <Typography weight="700" className="text-[12px] text-[#111111]">
              AUSD
            </Typography>
            <Typography
              weight="700"
              className="mt-0.5 text-[8px] uppercase tracking-[0.8px] text-black/30"
            >
              Monad
            </Typography>
          </View>
        </View>
      </View>
    </View>
  );
}

function NetworkNode({
  chain,
  selected,
  onPress,
}: {
  chain: DepositNetwork;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <HapticPressable
      accessibilityRole="button"
      accessibilityLabel={`${NETWORKS[chain].label} network`}
      accessibilityState={{ selected }}
      onPress={onPress}
      feedback="selection"
      pressedScale={0.94}
      className="relative min-h-[67px] w-[68px] items-center justify-center overflow-hidden rounded-[20px]"
      style={
        selected
          ? {
              backgroundColor: "rgba(255,255,255,0.56)",
              shadowColor: "#77724A",
              shadowOffset: { width: 0, height: 5 },
              shadowOpacity: 0.07,
              shadowRadius: 12,
              elevation: 2,
            }
          : undefined
      }
    >
      {selected ? <SelectedNetworkBorder /> : null}
      <NetworkLogo chain={chain} size={27} />
      <Typography
        weight="700"
        className={
          selected
            ? "mt-1.5 text-[9px] tracking-[0.6px] text-[#111111]"
            : "mt-1.5 text-[9px] tracking-[0.6px] text-black/35"
        }
      >
        {NETWORKS[chain].shortLabel}
      </Typography>
    </HapticPressable>
  );
}

function RouteTrace({ isPreview }: { isPreview: boolean }) {
  return (
    <View className="mx-2 min-w-0 flex-1 items-center">
      <Svg width="100%" height={22} viewBox="0 0 100 22">
        <Defs>
          <LinearGradient id="route-trace" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor="#B2A755" />
            <Stop offset="52%" stopColor="#77786F" />
            <Stop offset="100%" stopColor="#111111" />
          </LinearGradient>
        </Defs>
        <Path
          d="M4 11 C28 2 68 20 96 11"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="7"
          strokeLinecap="round"
        />
        <Path
          d="M4 11 C28 2 68 20 96 11"
          fill="none"
          stroke="url(#route-trace)"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <Circle cx="4" cy="11" r="3.2" fill="#B2A755" />
        <Circle cx="50" cy="11" r="2.2" fill="#FFFFFF" />
        <Circle cx="96" cy="11" r="3.2" fill="#111111" />
      </Svg>
      <Typography
        weight="700"
        className="mt-0.5 text-[7px] uppercase tracking-[0.9px] text-black/25"
      >
        {isPreview ? "Preview route" : "Route ready"}
      </Typography>
    </View>
  );
}

function NetworkSelectorBackdrop() {
  return (
    <Svg
      pointerEvents="none"
      width="100%"
      height="100%"
      viewBox="0 0 390 196"
      preserveAspectRatio="xMidYMid slice"
      style={StyleSheet.absoluteFill}
    >
      <Defs>
        <LinearGradient id="selector-wash" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.5" />
          <Stop offset="60%" stopColor="#E6E8E0" stopOpacity="0.08" />
          <Stop offset="100%" stopColor="#CACEBF" stopOpacity="0.35" />
        </LinearGradient>
      </Defs>
      <Rect width="390" height="196" rx="30" fill="url(#selector-wash)" />
      {[64, 104, 144].map((y) => (
        <Path
          key={y}
          d={`M0 ${y} H390`}
          stroke="#111111"
          strokeOpacity="0.025"
          strokeWidth="1"
        />
      ))}
      {[66, 132, 198, 264, 330].map((x) => (
        <Path
          key={x}
          d={`M${x} 0 V196`}
          stroke="#111111"
          strokeOpacity="0.022"
          strokeWidth="1"
        />
      ))}
      <Circle cx="356" cy="22" r="62" fill="#FFFFFF" opacity="0.22" />
      <Circle
        cx="356"
        cy="22"
        r="44"
        fill="none"
        stroke="#B2A755"
        strokeOpacity="0.09"
      />
    </Svg>
  );
}

function SelectedNetworkBorder() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient
            id="selected-network-border"
            x1="0%"
            y1="50%"
            x2="100%"
            y2="50%"
          >
            <Stop offset="0%" stopColor="#0000FF" />
            <Stop offset="52%" stopColor="#8176FF" />
            <Stop offset="100%" stopColor="#B0A757" />
          </LinearGradient>
        </Defs>
        <Rect
          x="1"
          y="1"
          width="98%"
          height="96%"
          rx="19"
          fill="none"
          stroke="url(#selected-network-border)"
          strokeWidth="2"
        />
      </Svg>
    </View>
  );
}

function SafetySheet({
  chain,
  visible,
  onClose,
}: {
  chain: DepositNetwork;
  visible: boolean;
  onClose: () => void;
}) {
  const rows = [
    `Send only USDC on ${NETWORKS[chain].label}.`,
    "This deposit address is reusable.",
    "AUSD appears automatically after Agora settles the deposit.",
  ];
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end bg-black/35">
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View className="rounded-t-[34px] bg-[#F7F7F4] px-6 pb-9 pt-3">
          <View className="mx-auto h-1 w-10 rounded-full bg-black/15" />
          <View className="mt-5 flex-row items-center justify-between">
            <View className="flex-row items-center gap-3">
              <View className="size-11 items-center justify-center rounded-full bg-black">
                <Ionicons
                  name="shield-checkmark-outline"
                  size={21}
                  color="white"
                />
              </View>
              <View>
                <Typography
                  weight="700"
                  className="text-[20px] tracking-[-0.4px] text-[#111111]"
                >
                  Deposit safely
                </Typography>
                <Typography
                  weight="500"
                  className="mt-0.5 text-[12px] text-black/40"
                >
                  Three things to check
                </Typography>
              </View>
            </View>
            <HapticPressable
              accessibilityRole="button"
              accessibilityLabel="Close deposit safety information"
              feedback="selection"
              onPress={onClose}
              className="size-10 items-center justify-center rounded-full bg-white"
            >
              <Ionicons name="close" size={21} color="#111111" />
            </HapticPressable>
          </View>

          <View className="mt-6 gap-2.5">
            {rows.map((row, index) => (
              <View
                key={row}
                className="flex-row items-center gap-3 rounded-[20px] bg-white px-4 py-4"
              >
                <View className="size-7 items-center justify-center rounded-full bg-black">
                  <Typography weight="700" className="text-[11px] text-white">
                    {index + 1}
                  </Typography>
                </View>
                <Typography
                  weight="600"
                  className="min-w-0 flex-1 text-[13px] leading-[18px] text-black/60"
                >
                  {row}
                </Typography>
              </View>
            ))}
          </View>

          <HapticPressable
            accessibilityRole="button"
            onPress={onClose}
            className="mt-6 items-center rounded-full bg-black py-[17px]"
          >
            <Typography weight="700" className="text-[15px] text-white">
              Got it
            </Typography>
          </HapticPressable>
        </View>
      </View>
    </Modal>
  );
}

function NetworkLogo({ chain, size }: { chain: DepositNetwork; size: number }) {
  if (chain === "base") {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size * 0.05,
          backgroundColor: "#0000FF",
        }}
      />
    );
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      {chain === "arbitrum" ? (
        <>
          <Path d="M20 2 35.5 11v18L20 38 4.5 29V11Z" fill="#213147" />
          <Path d="m11 28 7.2-18h5L16 31Z" fill="#28A0F0" />
          <Path d="m18 31 7.8-19.3 3.2 1.9L21.8 32.8Z" fill="#12AAFF" />
          <Path
            d="M20 2 35.5 11v18L20 38 4.5 29V11Z"
            fill="none"
            stroke="#6C8DB7"
            strokeWidth="1.4"
          />
        </>
      ) : chain === "ethereum" ? (
        <>
          <Polygon points="20,5 11,20 20,25" fill="#627EEA" />
          <Polygon points="20,5 29,20 20,25" fill="#8998E8" />
          <Polygon points="20,27 11,22 20,35" fill="#627EEA" />
          <Polygon points="20,27 29,22 20,35" fill="#8998E8" />
        </>
      ) : chain === "polygon-pos" ? (
        <Path
          d="M14.2 24.5 10.7 22.5a4 4 0 0 1 0-6.9l3.5-2a4 4 0 0 1 4 0l2.2 1.3m5.4.6 3.5 2a4 4 0 0 1 0 6.9l-3.5 2a4 4 0 0 1-4 0l-2.2-1.3m-5.4-4.6 4.6 2.7a2.5 2.5 0 0 0 2.5 0l4.5-2.7"
          fill="none"
          stroke="#8247E5"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3.2"
        />
      ) : chain === "avalanche" ? (
        <>
          <Circle cx="20" cy="20" r="20" fill="#E84142" />
          <Path
            d="m20 8-9.2 18.2c-.7 1.4.3 3 1.8 3h5l6.8-13.5-3-6.3A1.6 1.6 0 0 0 20 8Zm7.1 13.7-3.8 7.5h5.2c1.4 0 2.4-1.5 1.8-2.8Z"
            fill="white"
          />
        </>
      ) : chain === "solana" ? (
        <>
          <Path d="M9 8h24l-5 6H4Z" fill="#00FFA3" />
          <Path d="M9 17h24l-5 6H4Z" fill="#7B61FF" />
          <Path d="M9 26h24l-5 6H4Z" fill="#00D1FF" />
        </>
      ) : chain === "monad" ? (
        <Path
          d="M20 3 36 13v14L20 37 4 27V13Zm0 7-9.5 6v8l9.5 6 9.5-6v-8Z"
          fill="#836EF9"
        />
      ) : chain === "immutable" ? (
        <Path
          d="M7 8h6v24H7Zm20 0h6v24h-6ZM15 20l9-12v9l-4.7 6L24 31.8H17l-5-8.4Z"
          fill="#111111"
        />
      ) : (
        <Rect x="7" y="7" width="26" height="26" rx="6" fill="#8247E5" />
      )}
    </Svg>
  );
}

function compactAddress(address: string) {
  if (address.length <= 24) return address;
  return `${address.slice(0, 12)}…${address.slice(-10)}`;
}
