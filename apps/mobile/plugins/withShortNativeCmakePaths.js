const { withAppBuildGradle, withProjectBuildGradle } = require('expo/config-plugins');

const projectMarker = '// AhorRaso: shorten Windows native CMake staging paths';
const appMarker = '// AhorRaso: shorten Windows app CMake staging path';
const gradleConfig = `
${projectMarker}
if (System.getProperty("os.name").toLowerCase(Locale.ROOT).contains("windows")) {
  def customCmakeRoot = System.getenv("AHORRASO_CMAKE_ROOT")
  def ahorrasoCmakeRoot = customCmakeRoot
    ? new File(customCmakeRoot)
    : new File(
        System.getenv("LOCALAPPDATA") ?: System.getProperty("user.home"),
        "AhorRaso/cxx"
      )

  subprojects { subproject ->
    if (subproject.name in [
      "react-native-reanimated",
      "react-native-screens",
      "react-native-worklets"
    ]) {
      subproject.beforeEvaluate {
        subproject.plugins.apply("com.android.library")
        def cmake = subproject.extensions.getByName("android").externalNativeBuild.cmake
        cmake.buildStagingDirectory = new File(ahorrasoCmakeRoot, subproject.name)
      }
    }
  }
}
`;

const replaceMarkedBlock = (contents, marker, block) => {
  const markerIndex = contents.indexOf(marker);

  if (markerIndex === -1) {
    return null;
  }

  const openingBraceIndex = contents.indexOf('{', markerIndex + marker.length);

  if (openingBraceIndex === -1) {
    throw new Error('Could not find the opening brace for the CMake path config.');
  }

  let braceDepth = 0;

  for (let index = openingBraceIndex; index < contents.length; index += 1) {
    if (contents[index] === '{') {
      braceDepth += 1;
    } else if (contents[index] === '}') {
      braceDepth -= 1;

      if (braceDepth === 0) {
        return (
          contents.slice(0, markerIndex) +
          block +
          contents.slice(index + 1)
        );
      }
    }
  }

  throw new Error('Could not find the closing brace for the CMake path config.');
};

module.exports = config =>
  withAppBuildGradle(
    withProjectBuildGradle(config, config => {
      const contents = config.modResults.contents;
      const replacement = replaceMarkedBlock(contents, projectMarker, gradleConfig);
      config.modResults.contents =
        replacement ??
        `${contents}\n${gradleConfig}\n`;
      return config;
    }),
    config => {
      const contents = config.modResults.contents;
      const replacement = replaceMarkedBlock(contents, appMarker, `
${appMarker}
if (System.getProperty("os.name").toLowerCase(Locale.ROOT).contains("windows")) {
  def customCmakeRoot = System.getenv("AHORRASO_CMAKE_ROOT")
  def ahorrasoCmakeRoot = customCmakeRoot
    ? new File(customCmakeRoot)
    : new File(
        System.getenv("LOCALAPPDATA") ?: System.getProperty("user.home"),
        "AhorRaso/cxx"
      )
  externalNativeBuild {
    cmake {
      buildStagingDirectory new File(ahorrasoCmakeRoot, "app")
    }
  }
}
`);

      if (replacement !== null) {
        config.modResults.contents = replacement;
      } else {
        const androidBlockIndex = contents.indexOf('android {');

        if (androidBlockIndex === -1) {
          throw new Error('Could not find the android block in app/build.gradle.');
        }

        const insertionIndex = androidBlockIndex + 'android {'.length;
        config.modResults.contents =
          contents.slice(0, insertionIndex) +
          `
${appMarker}
if (System.getProperty("os.name").toLowerCase(Locale.ROOT).contains("windows")) {
  def customCmakeRoot = System.getenv("AHORRASO_CMAKE_ROOT")
  def ahorrasoCmakeRoot = customCmakeRoot
    ? new File(customCmakeRoot)
    : new File(
        System.getenv("LOCALAPPDATA") ?: System.getProperty("user.home"),
        "AhorRaso/cxx"
      )
  externalNativeBuild {
    cmake {
      buildStagingDirectory new File(ahorrasoCmakeRoot, "app")
    }
  }
}
` +
          contents.slice(insertionIndex);
      }

      return config;
    }
  );
