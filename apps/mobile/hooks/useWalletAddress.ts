import { useAuth } from "@/contexts/AuthContext";

export function useWalletAddress(): string | null {
  return useAuth().address;
}
