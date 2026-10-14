import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const exec=promisify(execFile),repo=fileURLToPath(new URL('..',import.meta.url)),output=join(repo,'.local/test-app'),counterFile=join(output,'build.json');
assert.equal(process.platform,'darwin','The local Test app currently builds on macOS.');
const app=join(output,process.arch==='arm64'?'mac-arm64':'mac',"Heaven's Door Test.app"),executable=join(app,"Contents/MacOS/Heaven's Door Test");
const args=process.argv.slice(2),noOpen=args.includes('--no-open'),folder=args.find(arg=>!arg.startsWith('--')),workspace=folder&&resolve(folder);
if(workspace)assert.ok((await stat(workspace)).isDirectory(),'Choose a workspace folder.');
try{await exec('pgrep',['-f',executable.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')]);throw new Error("Quit Heaven's Door Test before rebuilding; its normal Quit saves pending edits.");}catch(error){if(error.code!==1)throw error;}
await mkdir(output,{recursive:true});let number=0;
try{number=JSON.parse(await readFile(counterFile,'utf8')).number;}catch(error){if(error.code!=='ENOENT')throw error;}
assert.ok(Number.isInteger(number)&&number>=0&&number<9999,'Invalid temporary build counter.');number++;
const pkg=JSON.parse(await readFile(join(repo,'package.json'),'utf8')),version=pkg.version+'-test.'+number;
assert.match(pkg.version,/^\d+\.\d+\.\d+$/,'Leave the release version stable.');
const config={appId:'com.pochihh.heavens-door.test',productName:"Heaven's Door Test",buildVersion:number+'.0.0',directories:{output:'.local/test-app',buildResources:'build'},asar:true,npmRebuild:false,files:['dist/**/*','package.json','!dist/**/*.map'],extraMetadata:{name:'heavens-door-test',productName:"Heaven's Door Test",version},extraResources:[{from:'build/test-icon.png',to:'icon.png'}],mac:{target:'dir',icon:'build/test-icon.icns',identity:'-',hardenedRuntime:false,notarize:false,category:'public.app-category.productivity'},publish:null};
const configFile=join(output,'builder.json');await writeFile(configFile,JSON.stringify(config,null,2));
const run=(command,args,env=process.env)=>new Promise((resolve,reject)=>{const child=spawn(command,args,{cwd:repo,env,stdio:'inherit'});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error(command+' failed ('+code+').')));});
await run('npm',['run','build'],{...process.env,HEAVENS_DOOR_TEST_BUILD:'1'});
await run(join(repo,'node_modules/.bin/electron-builder'),['--config',configFile,'--mac','dir','--'+process.arch,'--publish','never'],{...process.env,CSC_IDENTITY_AUTO_DISCOVERY:'false'});
const plist=join(app,'Contents/Info.plist');
assert.equal((await exec('/usr/libexec/PlistBuddy',['-c','Print :CFBundleIdentifier',plist])).stdout.trim(),'com.pochihh.heavens-door.test');
assert.equal((await exec('/usr/libexec/PlistBuddy',['-c','Print :CFBundleName',plist])).stdout.trim(),"Heaven's Door Test");
await exec('codesign',['--verify','--deep','--strict',app]);await writeFile(counterFile,JSON.stringify({number,version},null,2)+'\n');
console.log('Temporary build: '+version+'\nApp: '+app+'\nRelease version unchanged: '+pkg.version);
if(!noOpen)await exec('open',[app,...workspace?['--args','--test-workspace',workspace]:[]]);
