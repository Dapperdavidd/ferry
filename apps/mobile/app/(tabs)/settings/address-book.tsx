import React, { useRef, useState } from "react";
import { Alert, View } from "react-native";
import { router } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { ScreenLayout } from "@/components/ui/layout";
import { Typography } from "@/components/ui/atoms/Typography";
import {
  ContactActionsPopover,
  PopoverAnchor,
  ScreenActionFooter,
} from "@/components/ui/molecules";
import {
  AddContactSheet,
  AddContactSheetRef,
} from "@/components/ui/organisms/modals/AddContactSheet";
import { EditWalletModal } from "@/components/ui/organisms/modals/EditWalletModal";
import { Ionicons } from "@expo/vector-icons";
import HapticPressable from "@/components/ui/atoms/HapticPressable";
import { Contact, useContacts } from "@/hooks/useContacts";
import { useToast } from "@/contexts/ToastContext";
import { useAppTheme } from "@/contexts/AppThemeContext";

export default function AddressBookScreen() {
  const addContactRef = useRef<AddContactSheetRef>(null);
  const { contacts, addContact, removeContact, updateContact } = useContacts();
  const { showToast } = useToast();
  const { theme } = useAppTheme();
  const [menuContact, setMenuContact] = useState<Contact | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<PopoverAnchor | null>(null);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);

  const existingAddresses = contacts.map((c) => c.address);

  const openMenu = (
    contact: Contact,
    ref: {
      measureInWindow: (
        cb: (x: number, y: number, w: number, h: number) => void
      ) => void;
    } | null
  ) => {
    if (!ref) return;
    ref.measureInWindow((x, y, width, height) => {
      setMenuAnchor({ x, y, width, height });
      setMenuContact(contact);
    });
  };

  const closeMenu = () => {
    setMenuContact(null);
    setMenuAnchor(null);
  };

  const confirmRemove = (name: string, address: string) => {
    Alert.alert(
      "Remove contact",
      `Remove ${name} from your address book?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => removeContact(address),
        },
      ],
      { cancelable: true }
    );
  };

  const handleCopyAddress = async (address: string) => {
    await Clipboard.setStringAsync(address);
    showToast(
      "Copied to clipboard",
      <Ionicons name="checkmark-circle" size={16} color={theme.text} />
    );
  };

  const handleSaveContactName = (newName: string) => {
    if (!editingContact) return;
    updateContact({
      originalAddress: editingContact.address,
      contact: { name: newName, address: editingContact.address },
    });
    setEditingContact(null);
  };

  return (
    <ScreenLayout>
      <View className="flex-1">
        <View
          className="mt-6 size-12 items-center justify-center rounded-2xl"
          style={{ backgroundColor: theme.accentSoft }}
        >
          <Ionicons name="people-outline" size={24} color={theme.text} />
        </View>

        <Typography
          weight="700"
          className="mt-3 text-3xl"
          style={{ color: theme.text }}
        >
          Address book
        </Typography>
        <Typography
          weight="500"
          className="mt-2 text-base leading-6"
          style={{ color: theme.muted }}
        >
          Save frequently used addresses{"\n"}for easy access.
        </Typography>

        {contacts.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <View
              className="mb-4 h-14 w-24 items-center justify-center rounded-full border-2 border-dashed"
              style={{ backgroundColor: theme.card, borderColor: theme.border }}
            >
              <Ionicons name="people-outline" size={22} color={theme.faint} />
            </View>
            <Typography
              weight="700"
              className="text-lg"
              style={{ color: theme.text }}
            >
              No Contacts yet
            </Typography>
            <Typography
              weight="500"
              className="mt-1 text-base"
              style={{ color: theme.muted }}
            >
              Add Contacts to your address book
            </Typography>
          </View>
        ) : (
          <View className="mt-6 flex-1 gap-2">
            {contacts.map((c) => (
              <ContactRow
                key={c.address}
                contact={c}
                onCopy={handleCopyAddress}
                onOpenMenu={openMenu}
              />
            ))}
          </View>
        )}

        <ScreenActionFooter
          onBack={() => router.back()}
          actionLabel="Add Contact"
          onAction={() => addContactRef.current?.present()}
        />
      </View>

      <ContactActionsPopover
        visible={menuContact !== null}
        anchor={menuAnchor}
        onClose={closeMenu}
        onEdit={() => {
          if (menuContact) {
            setEditingContact(menuContact);
          }
        }}
        onDelete={() => {
          if (menuContact) {
            confirmRemove(menuContact.name, menuContact.address);
          }
        }}
      />

      <AddContactSheet
        ref={addContactRef}
        onAdd={addContact}
        existingAddresses={existingAddresses}
      />

      <EditWalletModal
        visible={editingContact !== null}
        onClose={() => setEditingContact(null)}
        initialName={editingContact?.name ?? ""}
        address={editingContact?.address ?? ""}
        onSave={handleSaveContactName}
        placeholder="Contact name"
      />
    </ScreenLayout>
  );
}

interface ContactRowProps {
  contact: Contact;
  onCopy: (address: string) => void;
  onOpenMenu: (
    contact: Contact,
    ref: {
      measureInWindow: (
        cb: (x: number, y: number, w: number, h: number) => void
      ) => void;
    } | null
  ) => void;
}

function ContactRow({ contact, onCopy, onOpenMenu }: ContactRowProps) {
  const buttonRef = useRef<View>(null);
  const { theme } = useAppTheme();

  return (
    <View
      className="flex-row items-center rounded-[22px] border px-3 py-3"
      style={{ backgroundColor: theme.card, borderColor: theme.border }}
    >
      <HapticPressable
        onPress={() => onCopy(contact.address)}
        className="flex-1 flex-row items-center"
      >
        <View
          className="mr-3 size-12 items-center justify-center rounded-full"
          style={{ backgroundColor: theme.accentSoft }}
        >
          <Ionicons name="wallet-outline" size={18} color={theme.text} />
        </View>
        <View className="flex-1">
          <Typography
            weight="600"
            className="text-base"
            style={{ color: theme.text }}
          >
            {contact.name}
          </Typography>
          <Typography
            weight="500"
            className="text-xs"
            style={{ color: theme.muted }}
          >
            {contact.address.slice(0, 4)}...{contact.address.slice(-4)}
          </Typography>
        </View>
      </HapticPressable>
      <View ref={buttonRef} collapsable={false}>
        <HapticPressable
          className="p-1"
          hitSlop={8}
          onPress={() => onOpenMenu(contact, buttonRef.current)}
        >
          <Ionicons name="ellipsis-horizontal" size={18} color={theme.muted} />
        </HapticPressable>
      </View>
    </View>
  );
}
