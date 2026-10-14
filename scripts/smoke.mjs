import { _electron as electron, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'tokencal-desktop-'));
const now=Date.now();
await fs.mkdir(path.join(root,'sessions'));await fs.mkdir(path.join(root,'claude'));
const log=(type,payload,at=now)=>JSON.stringify({timestamp:new Date(at).toISOString(),type,payload});
await fs.writeFile(path.join(root,'sessions','sample.jsonl'),[
  log('session_meta',{id:'fixture',cwd:'/sample/=SAMPLE'},now-180000),
  log('turn_context',{model:'gpt-6.1-sol'},now-180000),
  log('event_msg',{type:'task_started',turn_id:'turn-1'},now-180000),
  log('token_usage_record',{response_id:'response-1',usage:{input_tokens:1000,cached_input_tokens:500,output_tokens:100}},now-120000),
  log('event_msg',{type:'task_complete'},now-60000),
  log('event_msg',{type:'token_count',rate_limits:{limit_id:'codex',plan_type:'plus',primary:{used_percent:25,window_minutes:300,resets_at:now/1000+3600},secondary:{used_percent:42,window_minutes:10080,resets_at:now/1000+86400}}}),
].join('\n')+'\n');
await fs.writeFile(path.join(root,'history.json'),JSON.stringify({version:2,samples:[{t:now,org:'fixture',u:{fh:18,sd:51}}]}));
const config={claudePath:path.join(root,'claude'),codexPath:path.join(root,'sessions'),claudeHistoryPath:path.join(root,'history.json')};
await fs.mkdir(path.join(root,'data'));await fs.writeFile(path.join(root,'data','settings.json'),JSON.stringify(config));
const env={...process.env,TOKENCAL_DATA_DIR:path.join(root,'data')};delete env.ELECTRON_RUN_AS_NODE;delete env.TOKENCAL_DEV_URL;
let application;
try {
  application=await electron.launch({args:process.env.TOKENCAL_TEST_EXECUTABLE?[]:['.'],executablePath:process.env.TOKENCAL_TEST_EXECUTABLE,env,timeout:30000});
  const page=await application.firstWindow();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.waitForFunction(async()=>{const s=await window.tokenCal?.getSnapshot();return s&&!s.scanning&&s.sessions.length===1;},null,{timeout:30000});
  await expect(page.getByText('Your usage, at a glance.')).toBeVisible();
  expect(await page.evaluate(()=>typeof window.require)).toBe('undefined');
  const totals=await page.evaluate(async()=>(await window.tokenCal.getSnapshot()).totals.today);
  expect(totals.totalTokens).toBe(1100);expect(totals.cost).toBeCloseTo(.00205);
  await page.getByRole('button',{name:'Sessions',exact:true}).click();
  await page.getByRole('textbox',{name:'Search sessions'}).fill('no-such-project');
  await expect(page.getByText('No sessions here yet')).toBeVisible();
  await page.getByRole('textbox',{name:'Search sessions'}).fill('');
  await page.getByRole('button',{name:'=SAMPLE'}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button',{name:'Close session details'}).click();
  await page.getByRole('button',{name:'Insights',exact:true}).click();
  await expect(page.getByText('By model', {exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByRole('switch',{name:'Show top-edge widget'}).click();
  await expect(page.getByRole('switch',{name:'Show top-edge widget'})).toHaveAttribute('aria-checked','true');
  await expect.poll(()=>application.windows().length).toBe(2);
  const widget=application.windows().find(w=>w!==page);
  await widget.getByRole('button',{name:'Expand TokenCal widget'}).hover();
  await expect(widget.getByRole('button',{name:'Open dashboard',exact:true})).toBeVisible();
  await page.getByRole('switch',{name:'Show top-edge widget'}).click();
  await expect.poll(()=>application.windows().length).toBe(1);
  await page.getByRole('switch',{name:'Show cost in the menu bar'}).click();
  await expect(page.getByRole('switch',{name:'Show cost in the menu bar'})).toHaveAttribute('aria-checked','false');
  await expect.poll(async()=>JSON.parse(await fs.readFile(path.join(root,'data','settings.json'),'utf8')).trayCost).toBe(false);
  const exportPath=path.join(root,'export.csv');
  await application.evaluate(({dialog},filename)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:filename});},exportPath);
  await page.evaluate(()=>window.tokenCal.exportCSV());
  expect(await fs.readFile(exportPath,'utf8')).toContain("'=SAMPLE");
  await application.evaluate(({app})=>process.getBuiltinModule('module').createRequire(`${app.getAppPath()}/package.json`)('./dist-electron/main.cjs').showPopup());
  await expect.poll(()=>application.windows().length).toBe(2);
  const popup=application.windows().find(w=>w!==page);
  await expect(popup.getByRole('button',{name:'Open dashboard',exact:true})).toBeVisible();
  await fs.mkdir('.cache/screenshots',{recursive:true});
  await popup.screenshot({path:'.cache/screenshots/tray.png'});
  await popup.getByRole('button',{name:'Open dashboard',exact:true}).click();
  await page.getByRole('button',{name:'Overview',exact:true}).click();
  await page.getByRole('button',{name:'Explore sample data'}).click();
  await expect(page.getByText('Sample data · explore how TokenCal works')).toBeVisible();
  const dismiss=page.getByRole('button',{name:'Dismiss notice'});
  if(await dismiss.isVisible())await dismiss.click();
  await page.mouse.move(1150,75);
  await page.screenshot({path:'assets/screenshot-demo.png',fullPage:true});
  await page.getByRole('button',{name:'Back to my usage'}).click();
  expect(errors).toEqual([]);
  console.log('Desktop smoke passed: collector, sandbox, navigation, search, session details, settings persistence, widget, tray popup, CSV export, sample mode.');
}finally{await application?.close();await fs.rm(root,{recursive:true,force:true});}
