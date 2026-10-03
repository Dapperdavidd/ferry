import { useAuth } from "@/contexts/AuthContext";

export function useUserId(): string | null {
  const { user, address } = useAuth();
  return user?.id ?? address ?? null;
}
