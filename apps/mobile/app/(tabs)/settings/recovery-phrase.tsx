import React, { useState } from "react";
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";

import { Typography } from "@/components/ui/atoms/Typography";
import { ScreenLayout } from "@/components/ui/layout";
import { ThemedButton } from "@/components/ui/molecules/ThemedButton";
import { useAuth } from "@/contexts/AuthContext";
import { mnemonicFromPrf, signInWithPasskey, zero } from "@/lib/mera";

/**
 * The 24 words are the PRF output in BIP-39 form. Anyone with them has the
 * account, so they are shown once, after a fresh Face ID, and never stored.
 */
export default function RecoveryPhraseScreen() {
  const router = useRouter();
  const { account } = useAuth();
  const [words, setWords] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reveal = async () => {
    if (!account || busy) return;
    setBusy(true);
    setError(null);
    try {
      const asserted = await signInWithPasskey({
        credentialId: account.credentialId,
      });
      try {
        setWords(mnemonicFromPrf(asserted.prfOutput).split(" "));
      } finally {
        zero(asserted.prfOutput);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't unlock the phrase.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenLayout>
      <ScrollView contentContainerClassName="px-6 pb-10 pt-4">
        <Typography weight="700" className="text-3xl">
          Recovery phrase
        </Typography>
        <Typography className="mt-2 text-base text-black/60">
          Your passkey is the key to this account. These 24 words are the same
          key written out, so any wallet can restore it. Anyone who sees them
          can spend your money. Write them somewhere private, never in a photo
          or a message.
        </Typography>

        {words ? (
          <View className="mt-6 flex-row flex-wrap gap-2">
            {words.map((word, index) => (
              <View
                key={index}
                className="w-[30%] flex-row items-center gap-2 rounded-xl bg-black/[0.04] px-3 py-2"
              >
                <Typography weight="500" className="text-xs text-black/40">
                  {index + 1}
                </Typography>
                <Typography weight="600" className="text-sm">
                  {word}
                </Typography>
              </View>
            ))}
          </View>
        ) : (
          <View className="mt-8">
            <ThemedButton
              title={busy ? "Unlocking…" : "Reveal with Face ID"}
              onPress={reveal}
              disabled={busy || !account}
            />
          </View>
        )}

        {error ? (
          <Typography className="mt-4 text-sm text-destructive">
            {error}
          </Typography>
        ) : null}

        <View className="mt-10">
          <ThemedButton
            title="Done"
            variant="secondary"
            onPress={() => router.back()}
          />
        </View>
      </ScrollView>
    </ScreenLayout>
  );
}
