import {readFileSync} from 'node:fs';
import {sparkleBuilderConfig} from 'electron-sparkle-updater/builder';
const sparkleConfig=JSON.parse(readFileSync(new URL('./build/sparkle.json',import.meta.url),'utf8'));
if(!/^https:/.test(sparkleConfig.feedUrl)||!/^[A-Za-z0-9+/]{43}=$/.test(sparkleConfig.publicEdKey))throw new Error('A valid Sparkle feed and public key are required.');
const sparkle=sparkleBuilderConfig({...sparkleConfig,deltaHistory:0,localizations:['en']});
const {buildNumber}=JSON.parse(readFileSync(new URL('./package.json',import.meta.url),'utf8'));
const macSigned=!!(process.env.CSC_LINK||process.env.CSC_NAME),notarize=!!(process.env.APPLE_API_KEY||process.env.APPLE_ID&&process.env.APPLE_APP_SPECIFIC_PASSWORD&&process.env.APPLE_TEAM_ID);
if(process.env.CI&&macSigned&&!notarize)throw new Error('Signed macOS CI builds require notarization credentials.');
export default {
  appId:'com.pochihh.heavens-door',productName:"Heaven's Door",
  buildVersion:`${buildNumber}.0.0`,artifactName:'Heavens-Door-${version}-${os}-${arch}.${ext}',
  directories:{output:'release',buildResources:'build'},asar:true,npmRebuild:false,asarUnpack:sparkle.asarUnpack,
  files:['dist/**/*','package.json','!dist/**/*.map',...sparkle.files],
  dmg:sparkle.dmg,
  extraResources:[{from:'build/icon.png',to:'icon.png'},{from:'build/sparkle.json',to:'sparkle.json'}],
  publish:{provider:'github',owner:'pochihh',repo:'heavens-door',releaseType:'draft'},
  mac:{extraFiles:sparkle.extraFiles,extendInfo:{...sparkle.mac.extendInfo,SUEnableAutomaticChecks:false,SUAutomaticallyUpdate:false,SUVerifyUpdateBeforeExtraction:true,SURequireSignedFeed:true},category:'public.app-category.productivity',icon:'build/icon.icns',target:['dmg','zip'],
    identity:macSigned?undefined:'-',hardenedRuntime:macSigned,
    entitlements:'build/entitlements.mac.plist',entitlementsInherit:'build/entitlements.mac.plist',
    notarize},
  win:{icon:'build/icon.ico',target:['nsis']},
  nsis:{oneClick:false,perMachine:false,allowToChangeInstallationDirectory:true,deleteAppDataOnUninstall:false,
    shortcutName:"Heaven's Door",installerIcon:'build/icon.ico',uninstallerIcon:'build/icon.ico'},
};
