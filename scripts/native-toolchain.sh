#!/usr/bin/env bash
# Install the light native toolchain (brief section 6.3) into .toolchain/, each archive checked
# against a pinned SHA-1. Reuses ANDROID_HOME when it already holds build-tools 35.0.0 and
# platform 35 (a GitHub runner). Prints the three paths native-build.cjs reads.
#
#   bash scripts/native-toolchain.sh
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
dir="$root/.toolchain"
mkdir -p "$dir"

fetch() { # url sha1 file
  local url="$1" sha="$2" file="$dir/$3"
  if [[ ! -f "$file" ]] || ! echo "$sha  $file" | sha1sum -c --status; then
    curl -fsSL --retry 2 -o "$file.part" "$url"
    echo "$sha  $file.part" | sha1sum -c --status || { echo "native-toolchain: SHA-1 mismatch for $url" >&2; rm -f "$file.part"; exit 1; }
    mv "$file.part" "$file"
  fi
}

sdk="${ANDROID_HOME:-}"
if [[ -n "$sdk" && -f "$sdk/build-tools/35.0.0/lib/d8.jar" && -f "$sdk/platforms/android-35/android.jar" ]]; then
  build_tools="$sdk/build-tools/35.0.0"
  platform="$sdk/platforms/android-35"
else
  fetch https://dl.google.com/android/repository/build-tools_r35_linux.zip 2cfaa0bbb2336e9ec18ed3ecea84fa2e2af607bc build-tools.zip
  fetch https://dl.google.com/android/repository/platform-35_r02.zip 0bb560a90a7a2cbd0dd8348224d518b638fe7949 platform.zip
  [[ -d "$dir/build-tools" ]] || { unzip -q "$dir/build-tools.zip" -d "$dir/bt.tmp" && mv "$dir/bt.tmp/"* "$dir/build-tools" && rmdir "$dir/bt.tmp"; }
  [[ -d "$dir/platform" ]] || { unzip -q "$dir/platform.zip" -d "$dir/pf.tmp" && mv "$dir/pf.tmp/"* "$dir/platform" && rmdir "$dir/pf.tmp"; }
  build_tools="$dir/build-tools"
  platform="$dir/platform"
fi

# Google's mirror of Maven Central: repo1.maven.org rate-limits shared cloud IPs (HTTP 429).
fetch https://maven-central.storage-download.googleapis.com/maven2/com/facebook/react/react-android/0.79.2/react-android-0.79.2-release.aar \
  731432c6e8b55133710e3dd982933f59fc3f9048 react-android.aar
[[ -f "$dir/react-android.jar" ]] || unzip -p "$dir/react-android.aar" classes.jar > "$dir/react-android.jar"
# Compile-only: React Android's classes carry Kotlin annotations; without the Kotlin standard
# library javac warns «unknown enum constant AnnotationRetention.RUNTIME» (#32). PluginHost
# provides it at run time, so it is never packaged.
fetch https://maven-central.storage-download.googleapis.com/maven2/org/jetbrains/kotlin/kotlin-stdlib/2.0.21/kotlin-stdlib-2.0.21.jar \
  618b539767b4899b4660a83006e052b63f1db551 kotlin-stdlib.jar

echo "INK2PIC_BUILD_TOOLS=$build_tools"
echo "INK2PIC_ANDROID_JAR=$platform/android.jar"
echo "INK2PIC_REACT_JAR=$dir/react-android.jar"
echo "INK2PIC_KOTLIN_JAR=$dir/kotlin-stdlib.jar"
