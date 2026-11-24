const { withAndroidManifest, withDangerousMod, withMainActivity } = require('expo/config-plugins');
const fs = require('node:fs/promises');
const path = require('node:path');

const exclusions = ['database', 'sharedpref', 'file', 'root', 'external']
  .map((domain) => `<exclude domain="${domain}" path="." />`).join('\n');

module.exports = function withAndroidPrivacy(config) {
  config = withAndroidManifest(config, (mod) => {
    const application = mod.modResults.manifest.application[0].$;
    application['android:allowBackup'] = 'false';
    application['android:fullBackupContent'] = '@xml/ahorraso_backup';
    application['android:dataExtractionRules'] = '@xml/ahorraso_data_extraction';
    return mod;
  });

  config = withDangerousMod(config, ['android', async (mod) => {
    const dir = path.join(mod.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'ahorraso_backup.xml'),
      `<full-backup-content>${exclusions}</full-backup-content>\n`);
    await fs.writeFile(path.join(dir, 'ahorraso_data_extraction.xml'),
      `<data-extraction-rules><cloud-backup>${exclusions}</cloud-backup><device-transfer>${exclusions}</device-transfer></data-extraction-rules>\n`);
    return mod;
  }]);

  return withMainActivity(config, (mod) => {
    const flag = 'window.addFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE)';
    const onCreate = 'super.onCreate(null)';
    if (!mod.modResults.contents.includes(flag)) {
      if (mod.modResults.language !== 'kt' || !mod.modResults.contents.includes(onCreate)) {
        throw new Error('AhorRaso could not configure FLAG_SECURE in MainActivity');
      }
      mod.modResults.contents = mod.modResults.contents.replace(onCreate, `${flag}\n    ${onCreate}`);
    }
    const interaction = 'com.ahorraso.pinkdf.PinKdfModule.recordUserInteraction()';
    if (!mod.modResults.contents.includes(interaction)) {
      const declaration = 'class MainActivity : ReactActivity() {';
      if (!mod.modResults.contents.includes(declaration)) throw new Error('Cannot configure Android inactivity tracking');
      mod.modResults.contents = mod.modResults.contents.replace(declaration, `${declaration}
  override fun onUserInteraction() {
    super.onUserInteraction()
    ${interaction}
  }
`);
    }
    return mod;
  });
};
