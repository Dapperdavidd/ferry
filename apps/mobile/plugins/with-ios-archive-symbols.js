const {
  createRunOncePlugin,
  withPodfile,
  withXcodeProject,
} = require("@expo/config-plugins");

const PLUGIN_NAME = "with-ios-archive-symbols";
const BUILD_PHASE_NAME = "[Ferry] Collect archive dSYMs";
const RN_SYMBOL_ENV = "ENV['RCT_SYMBOLICATE_PREBUILT_FRAMEWORKS'] ||= '1'";
const PHASE_ORDER_MARKER = "# Ferry: keep the symbol collector after CocoaPods embeds frameworks";
const PHASE_ORDER_HOOK = `${PHASE_ORDER_MARKER}
post_integrate do |installer|
  # React Native stores its downloaded dSYM inside React.framework. Exclude
  # that directory while CocoaPods embeds frameworks; Apple rejects a dSYM
  # nested in Ferry.app even when the same symbols also exist in the archive.
  Dir.glob(File.join(installer.sandbox.root.to_s, 'Target Support Files', 'Pods-*', 'Pods-*-frameworks.sh')).each do |script_path|
    contents = File.read(script_path)
    next if contents.include?('--filter "- dSYMs/"')

    contents.gsub!(
      '--filter "- Modules" "\${source}" "\${destination}"',
      '--filter "- Modules" --filter "- dSYMs/" "\${source}" "\${destination}"'
    )
    File.write(script_path, contents)
  end

  installer.aggregate_targets.map(&:user_project).compact.uniq.each do |project|
    project.native_targets.each do |target|
      phase = target.shell_script_build_phases.find { |build_phase| build_phase.name == '${BUILD_PHASE_NAME}' }
      next unless phase

      target.build_phases.delete(phase)
      target.build_phases << phase
    end
    project.save
  end
end`;

// CocoaPods embeds prebuilt XCFramework binaries but does not always copy the
// matching dSYM bundles into an .xcarchive. App Store Connect then reports an
// "Upload Symbols Failed" warning for every omitted framework. CocoaPods keeps
// this phase after its framework embed phase, where it copies UUID-matched
// vendor symbols into the archive. Frameworks that Xcode already symbolizes are
// left to its normal archive pipeline, avoiding duplicate top-level dSYMs. React
// Native embeds its downloaded dSYM inside React.framework; the Podfile hook
// excludes that folder while embedding, and the final cleanup is a second guard
// so Apple never sees standalone binaries in Ferry.app.
const COLLECT_DSYMS_SCRIPT = `set -e

if [ "\${CONFIGURATION:-}" != "Release" ]; then
  exit 0
fi

frameworks_dir="\${TARGET_BUILD_DIR}/\${FRAMEWORKS_FOLDER_PATH}"
symbols_dir="\${DWARF_DSYM_FOLDER_PATH}"
candidates_file="\${DERIVED_FILE_DIR}/ferry-dsym-candidates.txt"
required_frameworks="ExpoCameraBarcodeScanning ExpoImage ReactNativeDependencies SDWebImage SDWebImageAVIFCoder SDWebImageSVGCoder SDWebImageWebPCoder hermesvm"
dsymutil_fallbacks="ReactNativeDependencies hermesvm"

if [ ! -d "$frameworks_dir" ]; then
  exit 0
fi

mkdir -p "$symbols_dir"
: > "$candidates_file"

for root in "$PODS_ROOT" "$SRCROOT/../../../node_modules"; do
  if [ -d "$root" ]; then
    find "$root" -type d -name "*.framework.dSYM" -print >> "$candidates_file" 2>/dev/null || true
  fi
done

uuids_match() {
  framework_binary="$1"
  dsym_bundle="$2"
  framework_name="$3"
  dsym_binary="$dsym_bundle/Contents/Resources/DWARF/$framework_name"

  if [ ! -f "$dsym_binary" ]; then
    return 1
  fi

  framework_uuids="$(xcrun dwarfdump --uuid "$framework_binary" 2>/dev/null | awk '{print $2}' | sort)"
  dsym_uuids="$(xcrun dwarfdump --uuid "$dsym_binary" 2>/dev/null | awk '{print $2}' | sort)"
  [ -n "$framework_uuids" ] && [ "$framework_uuids" = "$dsym_uuids" ]
}

find "$frameworks_dir" -type d -name "*.framework" -print | while IFS= read -r framework_path; do
  [ -d "$framework_path" ] || continue

  framework_name="$(basename "$framework_path" .framework)"
  framework_binary="$framework_path/$framework_name"
  destination="$symbols_dir/$framework_name.framework.dSYM"

  [ -f "$framework_binary" ] || continue

  case " $required_frameworks " in
    *" $framework_name "*) ;;
    *) continue ;;
  esac

  if [ -d "$destination" ] && uuids_match "$framework_binary" "$destination" "$framework_name"; then
    continue
  fi

  matching_dsym=""
  while IFS= read -r candidate; do
    if [ "$(basename "$candidate")" = "$framework_name.framework.dSYM" ] && uuids_match "$framework_binary" "$candidate" "$framework_name"; then
      matching_dsym="$candidate"
      break
    fi
  done < "$candidates_file"

  if [ -n "$matching_dsym" ]; then
    ditto "$matching_dsym" "$destination"
    echo "Ferry dSYM: archived symbols for $framework_name"
  else
    case " $dsymutil_fallbacks " in
      *" $framework_name "*)
        xcrun dsymutil "$framework_binary" -o "$destination" >/dev/null 2>&1 || true
        ;;
    esac
  fi

  if [ ! -d "$destination" ] || ! uuids_match "$framework_binary" "$destination" "$framework_name"; then
    echo "warning: Ferry dSYM: could not archive UUID-matched symbols for $framework_name"
  fi
done

# dSYMs belong beside the archive payload, never inside an embedded framework.
# In particular, React Native's prebuilt-symbol flow places React.framework.dSYM
# at React.framework/dSYMs until the consuming build moves it out.
find "$frameworks_dir" -type d -name "*.dSYM" -prune -exec rm -rf {} +`;

const withReactNativeSymbols = (config) =>
  withPodfile(config, (podfileConfig) => {
    if (!podfileConfig.modResults.contents.includes(RN_SYMBOL_ENV)) {
      podfileConfig.modResults.contents = `${RN_SYMBOL_ENV}\n${podfileConfig.modResults.contents}`;
    }
    if (!podfileConfig.modResults.contents.includes(PHASE_ORDER_MARKER)) {
      podfileConfig.modResults.contents = `${podfileConfig.modResults.contents.trimEnd()}\n\n${PHASE_ORDER_HOOK}\n`;
    }
    return podfileConfig;
  });

const withArchiveSymbolPhase = (config) =>
  withXcodeProject(config, (projectConfig) => {
    const project = projectConfig.modResults;
    const phases = project.hash.project.objects.PBXShellScriptBuildPhase ?? {};
    const existingPhase = Object.values(phases).find(
      (phase) => phase && typeof phase === "object" && phase.name === `"${BUILD_PHASE_NAME}"`,
    );

    if (existingPhase) {
      existingPhase.shellPath = "/bin/sh";
      existingPhase.shellScript = JSON.stringify(COLLECT_DSYMS_SCRIPT);
    } else {
      project.addBuildPhase(
        [],
        "PBXShellScriptBuildPhase",
        BUILD_PHASE_NAME,
        project.getFirstTarget().uuid,
        {
          shellPath: "/bin/sh",
          shellScript: COLLECT_DSYMS_SCRIPT,
          inputPaths: [],
          outputPaths: [],
        },
      );
    }

    return projectConfig;
  });

const withIosArchiveSymbols = (config) =>
  withArchiveSymbolPhase(withReactNativeSymbols(config));

module.exports = createRunOncePlugin(withIosArchiveSymbols, PLUGIN_NAME, "1.0.0");
