#!/usr/bin/python3
"""可移植的独立源码快照引擎；由 backup_checkpoint.py 持有共享锁后调用。

与本机5分钟备份兼容的镜像、manifest格式；不改开发Git、不部署。
运行数据和秘密不进入源码备份，排除边界见备份与交接/资料边界.md。
"""
import datetime,fcntl,hashlib,json,os,re,shutil,subprocess,sys,traceback
from pathlib import Path
os.umask(0o077)
BASE=Path.home()/'.banyuexuan-project-sync';GIT='/usr/bin/git'
ENV=os.environ.copy()
for k in list(ENV):
 if k.lower() in ['http_proxy','https_proxy','all_proxy']:ENV.pop(k)
ENV['GIT_TERMINAL_PROMPT']='0';ENV['GIT_SSH_COMMAND']='/usr/bin/ssh -o BatchMode=yes -o ConnectTimeout=20 -o ServerAliveInterval=15 -o ServerAliveCountMax=3'
SKIP={'node_modules','.git','.venv','venv','build','dist','tmp','__pycache__','.gradle','.pytest_cache','.claude','.cache','backups','发出文件','coverage','dev-dist'}
EXT={'.pem','.key','.db','.sqlite','.sqlite3','.log','.jks','.keystore','.apk','.aab','.bin','.dmg','.exe','.so','.dylib','.zip','.gz','.tar','.enc','.part','.bak','.blend1'}
TOKENS=[re.compile(x.encode()) for x in [r'-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----',r'gh[pousr]_[A-Za-z0-9]{30,}',r'github_pat_[A-Za-z0-9_]{30,}',r'AKIA[A-Z0-9]{16}',r'sk-[A-Za-z0-9_-]{25,}',r'AIza[A-Za-z0-9_-]{30,}']]
def log(s):print(datetime.datetime.now().astimezone().isoformat(timespec='seconds')+' '+s,flush=True)
def git(root,*args,ok=True):
 p=subprocess.run([GIT,'-C',str(root),*args],env=ENV,capture_output=True,text=True,timeout=1800)
 if ok and p.returncode:raise RuntimeError('git '+args[0]+' 失败：'+p.stderr[-700:])
 return p.stdout.strip()
def excluded(p,rel):
 n=p.name
 return p.is_symlink() or (n.startswith('.env') and not n.endswith(('.example','.template'))) or n in {'.git','credentials.json','cookies.json','settings.local.json','local.properties','.DS_Store'} or p.suffix.lower() in EXT or (p.suffix=='.sql' and 'migrations' not in rel.parts)

# 仅排除明确的运行数据目录，不能把auth/models/data等业务源码目录按名字全局排除。
RUNTIME_DIRS={('host','config'),('host','upgrade-backups'),('host','data'),('host','models'),('host','mosquitto','auth'),('apps','api','storage'),('uploads',)}
REQUIRED={'ai':['package.json','package-lock.json','apps/api/src/auth/auth.controller.ts','apps/api/src/auth/auth.module.ts','apps/api/prisma/schema.prisma','apps/web/src/main.ts','apps/ai-service/main.py','备份与交接/交接说明.md','备份与交接/备份计划.md','tools/backup_checkpoint.py','tools/verify_backup.py']}
def skip_directory(root,relative):
 return root.name in SKIP or root.is_symlink() or relative.parts in RUNTIME_DIRS or (relative.parts[:2] == ('development', 'bycall') and relative.parts[2:] in RUNTIME_DIRS)

def snapshot(pr):
 src=Path(pr['source']);mirror=BASE/'repos'/pr['id'];branch='backup/live' if pr['existing'] else 'main';mirror.mkdir(parents=True,exist_ok=True)
 if not (mirror/'.git').exists():
  git(mirror,'init','-b',branch);git(mirror,'config','user.name','Alston project backup');git(mirror,'config','user.email','alston3825@users.noreply.github.com');git(mirror,'remote','add','origin','git@github.com:'+pr['repo']+'.git')
 if git(mirror,'remote','get-url','origin')!='git@github.com:'+pr['repo']+'.git':raise RuntimeError('远端不符合固定配置，停止')
 # 由本任务创建的镜像仓库只接收快照；不重写原仓库/生产分支。
 files={};removed=[]
 for root,ds,ns in os.walk(src,onerror=lambda e: (_ for _ in ()).throw(e)):
  ds[:]=[d for d in ds if not skip_directory(Path(root,d),Path(root,d).relative_to(src))]
  for n in ns:
   p=Path(root,n);rel=p.relative_to(src)
   if excluded(p,rel) or str(rel) in {'docs/自动接手快照.md','docs/源码文件校验清单.json'}:continue
   if p.stat().st_size>99*1024**2:raise RuntimeError('文件超过GitHub单文件限制，请先制定存放方式：'+str(rel))
   data=p.read_bytes()
   if any(t.search(data) for t in TOKENS):raise RuntimeError('检测到疑似私钥/令牌，停止整个项目上传：'+str(rel))
   destrel=Path('docs/备份的CI配置')/(p.name+'.txt') if rel.parts[:2]==('.github','workflows') else rel
   files[str(destrel)]=(p,hashlib.sha256(data).hexdigest(),len(data))
 if not files:raise RuntimeError('源目录为空或不可读，拒绝空快照')
 for name in REQUIRED.get(pr['id'],[]):
  if name not in files:raise RuntimeError('缺少关键源码，拒绝覆盖备份：'+name)
 origin=git(src,'rev-parse','HEAD',ok=False) if (src/'.git').exists() else ''
 date=datetime.datetime.now().astimezone().strftime('%Y-%m-%d')
 statepath=BASE/(pr['id']+'-manifest.json');previous=json.loads(statepath.read_text()) if statepath.exists() else {}
 if previous.get('files') and len(files)<len(previous['files'])*0.8:raise RuntimeError('源码文件数量异常减少超过20%，拒绝覆盖备份')
 changed=[n for n,x in files.items() if previous.get('files',{}).get(n)!=x[1]]
 removed=sorted(set(previous.get('files',{}))-set(files))
 manifest={n:x[1] for n,x in files.items()}
 fingerprint=hashlib.sha256(json.dumps(manifest,sort_keys=True).encode()).hexdigest()
 # 每天的快照可被任何AI读到；没有变化时不重复创建提交。
 if previous.get('fingerprint')!=fingerprint or previous.get('date')!=date:
  for p in mirror.iterdir():
   if p.name=='.git':continue
   if p.is_dir() and not p.is_symlink():shutil.rmtree(p)
   else:p.unlink()
  for name,(source,h,size) in files.items():
   target=mirror/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,target)
   if hashlib.sha256(target.read_bytes()).hexdigest()!=h:raise RuntimeError('扫描期间文件变化，待下次重试：'+name)
  docs=mirror/'docs';docs.mkdir(exist_ok=True)
  note=f'# {pr["name"]} · 自动接手快照\n\n日期：{date}（Mac本地时间）。\n\n原目录：`{src}`\n\n原所属Git版本：`{origin or "无独立Git，采用内容哈希快照"}`\n\n源码/文档文件数：{len(files)}；总大小：{sum(x[2] for x in files.values())}字节。内容清单摘要：`{fingerprint}`。\n\n自上次快照新增或变化：{len(changed)}；移除：{len(removed)}。此为文件变化事实，不代表功能验收。\n\n先读 备份与交接/交接说明.md、AGENTS.md、docs/当前开发任务.md。真实配置在原机器安全位置，生产数据走独立加密备份。\n\n最近变化路径：\n\n'+''.join('- `'+n+'`\n' for n in sorted(changed)[:100])
  (docs/'自动接手快照.md').write_text(note)
  (docs/'源码文件校验清单.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
  if not (mirror/'README.md').exists():(mirror/'README.md').write_text('# '+pr['name']+'\n\n从 [AI接手说明](docs/AI接手说明.md) 开始。\n')
  git(mirror,'add','--all','--force','.');git(mirror,'commit','-m','backup: '+pr['name']+' '+date)
  state={'date':date,'fingerprint':fingerprint,'files':manifest};tmp=statepath.with_suffix('.part');tmp.write_text(json.dumps(state,ensure_ascii=False));os.replace(tmp,statepath)
 # 前次断网即使本次内容没变化也重试推送；不force、不删除远端历史。
 git(mirror,'push','origin','HEAD:refs/heads/'+branch)
 sha=git(mirror,'rev-parse','HEAD');return {'name':pr['name'],'repo':'https://github.com/'+pr['repo'],'branch':branch,'commit':sha,'checked_at':datetime.datetime.now().astimezone().isoformat(),'files':len(files),'result':'ok'}
