import { useEffect, useRef, useState } from "react";
import * as Linking from "expo-linking";
import { useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { REWARDS_QUERY_KEY, useRewards } from "@/hooks/useRewards";
import {
  apiClient,
  apiErrorCode,
  apiErrorMessage,
  apiErrorStatus,
} from "@/utils/apiClient";
import {
  earnedMilesDelta,
  PendingReferralStorage,
  referralCodeFromUrl,
  RewardBalanceStorage,
} from "@/utils/rewardAttribution";

const TERMINAL_REFERRAL_ERRORS = new Set([
  "REFERRAL_NOT_FOUND",
  "REFERRAL_SELF",
  "REFERRAL_ALREADY_APPLIED",
  "REFERRAL_TOO_LATE",
  "REFERRAL_UNAVAILABLE",
  "REQUEST_FAILED",
]);

/**
 * Owns the parts of Ferry Miles that must work beyond a single screen:
 * invite attribution through authentication/onboarding, and quiet earned-Miles
 * acknowledgement after the ledger balance actually changes.
 */
export function useRewardLifecycle() {
  const { isAuthenticated, user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const rewards = useRewards();
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const applyingRef = useRef(false);
  const processedBalanceRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    const capture = async (url: string | null) => {
      if (!url) return;
      const code = referralCodeFromUrl(url);
      if (!code) return;
      await PendingReferralStorage.save(code);
      if (active) setPendingCode(code);
    };

    void PendingReferralStorage.get().then((pending) => {
      if (active && pending) setPendingCode(pending.code);
    });
    void Linking.getInitialURL().then(capture);
    const subscription = Linking.addEventListener("url", ({ url }) => {
      void capture(url);
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (
      !isAuthenticated ||
      !user?.id ||
      !user.handle ||
      !pendingCode ||
      applyingRef.current
    ) {
      return;
    }

    let active = true;
    applyingRef.current = true;
    void apiClient
      .applyReferral(pendingCode)
      .then(async () => {
        await PendingReferralStorage.clear();
        await queryClient.invalidateQueries({
          queryKey: REWARDS_QUERY_KEY(user.id),
        });
        if (!active) return;
        setPendingCode(null);
        showToast("Invite code linked");
      })
      .catch(async (error: unknown) => {
        const code = apiErrorCode(error);
        const status = apiErrorStatus(error);
        const terminal =
          (code !== null && TERMINAL_REFERRAL_ERRORS.has(code)) ||
          (status !== null && status >= 400 && status < 500 && status !== 401);
        if (!terminal) return;
        await PendingReferralStorage.clear();
        if (!active) return;
        setPendingCode(null);
        showToast(
          apiErrorMessage(error) ?? "We couldn't link that invite code"
        );
      })
      .finally(() => {
        applyingRef.current = false;
      });

    return () => {
      active = false;
    };
  }, [isAuthenticated, pendingCode, queryClient, showToast, user]);

  useEffect(() => {
    if (!user?.id || !rewards.data) return;
    const snapshot = {
      balance: rewards.data.balance,
      asOf: rewards.data.asOf,
    };
    const processingKey = `${user.id}:${snapshot.asOf}:${snapshot.balance}`;
    if (processedBalanceRef.current === processingKey) return;
    processedBalanceRef.current = processingKey;

    let active = true;
    void RewardBalanceStorage.get(user.id).then(async (previous) => {
      const delta = earnedMilesDelta(previous, snapshot);
      const previousTime = previous ? Date.parse(previous.asOf) : Number.NaN;
      const nextTime = Date.parse(snapshot.asOf);
      if (
        !previous ||
        !Number.isFinite(previousTime) ||
        !Number.isFinite(nextTime) ||
        nextTime > previousTime
      ) {
        await RewardBalanceStorage.save(user.id, snapshot);
      }
      if (active && delta > 0) {
        showToast(`+${delta.toLocaleString()} Ferry Miles`);
      }
    });
    return () => {
      active = false;
    };
  }, [rewards.data, showToast, user?.id]);
}
