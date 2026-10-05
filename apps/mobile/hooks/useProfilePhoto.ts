import { File, Paths } from "expo-file-system";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useUserId } from "@/hooks/useUserId";
import { StorageService, userScopedKey } from "@/utils/storage";

const PROFILE_PHOTO_KEY = "ferry.profile-photo";

function profilePhotoKey(userId: string) {
  return userScopedKey(PROFILE_PHOTO_KEY, userId);
}

function localPhotoName(userId: string, source: File) {
  const safeUserId = userId.replace(/[^A-Za-z0-9._-]/g, "_");
  const extension = source.extension || ".jpg";
  return `ferry-profile-${safeUserId}${extension.toLowerCase()}`;
}

export function useProfilePhoto() {
  const queryClient = useQueryClient();
  const userId = useUserId();
  const queryKey = ["profilePhoto", userId] as const;
  const storageKey = userId ? profilePhotoKey(userId) : null;

  const query = useQuery({
    queryKey,
    enabled: !!storageKey,
    queryFn: async () => {
      if (!storageKey) return null;
      const stored = await StorageService.getItem<string>(storageKey);
      if (!stored) return null;

      try {
        if (new File(stored).exists) return stored;
      } catch {
        // The file may have been removed by an app reinstall or OS cleanup.
      }
      await StorageService.deleteItem(storageKey).catch(() => {});
      return null;
    },
    staleTime: Infinity,
  });

  const saveMutation = useMutation({
    mutationFn: async (sourceUri: string) => {
      if (!storageKey || !userId) throw new Error("No signed-in profile");

      const source = new File(sourceUri);
      const destination = new File(
        Paths.document,
        localPhotoName(userId, source)
      );
      await source.copy(destination, { overwrite: true });

      const previous = queryClient.getQueryData<string | null>(queryKey);
      if (previous && previous !== destination.uri) {
        try {
          const previousFile = new File(previous);
          if (previousFile.exists) previousFile.delete();
        } catch {
          // The new photo is already safe; a stale old file should not block it.
        }
      }

      await StorageService.setItem(storageKey, destination.uri);
      return destination.uri;
    },
    onSuccess: (uri) => queryClient.setQueryData(queryKey, uri),
  });

  const removeMutation = useMutation({
    mutationFn: async () => {
      if (!storageKey) return null;
      const current = queryClient.getQueryData<string | null>(queryKey);
      if (current) {
        try {
          const file = new File(current);
          if (file.exists) file.delete();
        } catch {
          // Clearing the saved reference is sufficient if the file is already gone.
        }
      }
      await StorageService.deleteItem(storageKey);
      return null;
    },
    onSuccess: () => queryClient.setQueryData(queryKey, null),
  });

  return {
    photoUri: query.data ?? null,
    isLoading: query.isLoading,
    isSaving: saveMutation.isPending || removeMutation.isPending,
    savePhoto: saveMutation.mutateAsync,
    removePhoto: removeMutation.mutateAsync,
  };
}
