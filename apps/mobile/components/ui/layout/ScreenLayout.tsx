import { SafeAreaView } from "react-native-safe-area-context";
import { ThemedView } from "@/components/ui/atoms";
import { ViewProps } from "react-native";
import { cn } from "@/utils/cn";
import { useAppTheme } from "@/contexts/AppThemeContext";
import { ThemeBackdrop } from "@/components/ui/atoms/ThemeBackdrop";

export type ScreenLayoutProps = ViewProps & {
  children: React.ReactNode;
  className?: string;
  lightColor?: string;
  darkColor?: string;
  decorated?: boolean;
};

export function ScreenLayout({
  children,
  className,
  lightColor,
  darkColor,
  decorated = true,
  ...rest
}: ScreenLayoutProps) {
  const { theme } = useAppTheme();
  const backgroundColor = lightColor ?? theme.background;
  const darkBackgroundColor = darkColor ?? theme.background;

  return (
    <SafeAreaView
      // bg-white default so the safe-area insets (and, under edge-to-edge, the
      // status/nav bar areas behind them) match the screen instead of showing
      // the gray window background. A caller-provided lightColor still overrides.
      className="flex-1"
      // DYNAMIC-COLOR (caller-provided light theme bg)
      style={{ backgroundColor }}
    >
      <ThemedView
        className={cn("flex-1 p-5", className)}
        lightColor={backgroundColor}
        darkColor={darkBackgroundColor}
        {...rest}
      >
        {decorated ? <ThemeBackdrop quiet /> : null}
        {children}
      </ThemedView>
    </SafeAreaView>
  );
}
