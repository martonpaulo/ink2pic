#!/usr/bin/env node
/**
 * Light native build without Gradle (brief section 6.3, issue #11), adapted from the pipeline of
 * Keplex/supernote-pic2note at 5a210f8 (MIT, see NOTICE.md): javac, D8 and aapt2
 * produce build/native/app.npk, an APK-format ZIP that PluginHost loads.
 *
 *   node scripts/native-build.cjs            build build/native/app.npk
 *   node scripts/native-build.cjs --package  build it and add it to build/outputs/Ink2Pic.snplg,
 *                                            after `bash buildPlugin.sh` made the JS package
 *   node scripts/native-build.cjs --test     run the JVM tests (needs only a JDK)
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');

const root = path.resolve(__dirname, '..');
const build = path.join(root, 'build');
const out = path.join(build, 'native');
const PACKAGE_CLASS = 'com.ink2pic.files.Ink2PicFilesPackage';
const MIN_API = '27';
const TARGET_API = '35';

function run(binary, args, options = {}) {
  return execFileSync(binary, args, {cwd: root, stdio: 'inherit', ...options});
}

/** Paths printed by scripts/native-toolchain.sh, which installs what is missing. */
function tools() {
  const text = execFileSync('bash', [path.join(root, 'scripts/native-toolchain.sh')], {
    cwd: root,
    encoding: 'utf8',
  });
  const values = Object.fromEntries(
    text
      .split('\n')
      .filter(line => line.startsWith('INK2PIC_'))
      .map(line => line.split('=')),
  );
  const result = {
    androidJar: values.INK2PIC_ANDROID_JAR,
    reactJar: values.INK2PIC_REACT_JAR,
    kotlinJar: values.INK2PIC_KOTLIN_JAR,
    d8: path.join(values.INK2PIC_BUILD_TOOLS || '', 'lib/d8.jar'),
    aapt2: path.join(values.INK2PIC_BUILD_TOOLS || '', 'aapt2'),
  };
  for (const [name, file] of Object.entries(result)) {
    if (!file || !fs.existsSync(file)) {
      throw Error(`Missing ${name}: ${file}. Run scripts/native-toolchain.sh.`);
    }
  }
  return result;
}

function javaSources(folder) {
  return fs
    .readdirSync(folder, {withFileTypes: true})
    .flatMap(entry =>
      entry.isDirectory()
        ? javaSources(path.join(folder, entry.name))
        : entry.name.endsWith('.java')
        ? [path.join(folder, entry.name)]
        : [],
    );
}

function config() {
  return JSON.parse(fs.readFileSync(path.join(root, 'PluginConfig.json'), 'utf8'));
}

/** Written from PluginConfig.json, so the native versions can never drift from the plugin's. */
function manifest(file) {
  const {versionCode, versionName} = config();
  fs.writeFileSync(
    file,
    `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.ink2pic.files"
    android:versionCode="${versionCode}"
    android:versionName="${versionName}">
  <uses-sdk android:minSdkVersion="${MIN_API}" android:targetSdkVersion="${TARGET_API}" />
  <application android:hasCode="true" />
</manifest>
`,
  );
}

function buildNative() {
  const t = tools();
  fs.rmSync(out, {recursive: true, force: true});
  const classes = path.join(out, 'classes');
  const stage = path.join(out, 'npk');
  fs.mkdirSync(classes, {recursive: true});
  fs.mkdirSync(stage, {recursive: true});
  run('javac', [
    // -Werror: a new javac warning fails the build (#32).
    '--release', '8', '-encoding', 'UTF-8', '-Xlint:-options', '-Werror',
    '-cp', [t.androidJar, t.reactJar, t.kotlinJar].join(path.delimiter),
    '-d', classes, ...javaSources(path.join(root, 'native/src')),
  ]);
  const jar = path.join(out, 'files.jar');
  run('jar', ['cf', jar, '-C', classes, '.']);
  const dex = path.join(out, 'dex.zip');
  run('java', [
    '-cp', t.d8, 'com.android.tools.r8.D8', '--release', '--min-api', MIN_API,
    '--lib', t.androidJar, '--classpath', t.reactJar, '--output', dex, jar,
  ]);
  const manifestFile = path.join(out, 'AndroidManifest.xml');
  manifest(manifestFile);
  const resources = path.join(out, 'resources.apk');
  run(t.aapt2, [
    'link', '--manifest', manifestFile, '-I', t.androidJar,
    '--min-sdk-version', MIN_API, '--target-sdk-version', TARGET_API, '-o', resources,
  ]);
  run('unzip', ['-q', '-o', resources, '-d', stage]);
  run('unzip', ['-q', '-o', dex, '-d', stage]);
  for (const needed of ['classes.dex', 'AndroidManifest.xml']) {
    if (!fs.existsSync(path.join(stage, needed))) {
      throw Error(`app.npk would miss ${needed}`);
    }
  }
  const npk = path.join(out, 'app.npk');
  run('zip', ['-q', '-r', '-9', npk, '.'], {cwd: stage});
  run(t.aapt2, ['dump', 'badging', npk]);
  console.log(`native: app.npk ${fs.statSync(npk).size} bytes`);
  return npk;
}

/** Adds app.npk and its config fields to the package buildPlugin.sh made. */
function packagePlugin() {
  const generated = path.join(build, 'generated');
  const generatedConfig = path.join(generated, 'PluginConfig.json');
  if (!fs.existsSync(generatedConfig)) {
    throw Error('Run `bash buildPlugin.sh` first: build/generated/PluginConfig.json is missing.');
  }
  const npk = buildNative();
  fs.copyFileSync(npk, path.join(generated, 'app.npk'));
  const cfg = JSON.parse(fs.readFileSync(generatedConfig, 'utf8'));
  cfg.nativeCodePackage = '/app.npk';
  cfg.reactPackages = [PACKAGE_CLASS];
  fs.writeFileSync(generatedConfig, JSON.stringify(cfg, null, 2) + '\n');
  const outputs = path.join(build, 'outputs');
  const name = `${config().name}.snplg`;
  fs.mkdirSync(outputs, {recursive: true});
  for (const stale of [name, `${config().name}.zip`]) {
    fs.rmSync(path.join(outputs, stale), {force: true});
  }
  run('zip', ['-q', '-r', '-9', path.join(outputs, name), '.'], {cwd: generated});
  console.log(`native: ${name} ${fs.statSync(path.join(outputs, name)).size} bytes with app.npk`);
}

function testNative() {
  // A temporary folder: the gate may run as another user than the one that owns build/.
  const classes = fs.mkdtempSync(path.join(os.tmpdir(), 'ink2pic-native-tests-'));
  const pure = ['SafePaths', 'EinkPixels', 'ThumbGate', 'ThumbMeasures', 'Contour'].map(name =>
    path.join(root, `native/src/com/ink2pic/files/${name}.java`),
  );
  // Compile inside the try, so a compile error also removes the folder.
  try {
    run('javac', [
      '--release', '8', '-encoding', 'UTF-8', '-Xlint:-options', '-d', classes,
      ...pure, ...javaSources(path.join(root, 'native/tests')),
    ]);
    for (const test of ['SafePathsTest', 'EinkPixelsTest', 'ThumbGateTest', 'ThumbMeasuresTest', 'ContourTest']) {
      run('java', ['-cp', classes, `com.ink2pic.files.${test}`]);
    }
  } finally {
    fs.rmSync(classes, {recursive: true, force: true});
  }
}

if (require.main === module) {
  if (process.argv.includes('--test')) {
    testNative();
  } else if (process.argv.includes('--package')) {
    packagePlugin();
  } else {
    buildNative();
  }
}

module.exports = {buildNative, packagePlugin, testNative};
