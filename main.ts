import{readdirSync as R,readFileSync as F,mkdirSync as M,writeFileSync as X}from'fs'
const I=process.env.MAKEFUN_INPUT_DIR??'/input',O=process.env.MAKEFUN_OUTPUT_DIR??'/output'
for(const id of R(I).sort()){
const L=F(I+'/'+id+'/level.txt','utf8').split('\n').filter(r=>r),w=Math.max(...L.map(r=>r.length)),c=L.map(r=>r.padEnd(w,'#')).join(''),n=c.length,D=[-w,w,-1,1],fl=[...c].map(x=>+(x!='#')),gl=[],B=[],dt=Array(n).fill(-1),cm=dt.slice(),q=[]
let p=0,k=0,o=''
for(let i=0;i<n;i++){const x=c[i];'.*+'.includes(x)&&gl.push(i);'$*'.includes(x)&&B.push(i);'@+'.includes(x)&&(p=i)}
for(const g of gl){dt[g]=0;q.push(g)}
for(let i=0;i<q.length;i++)for(const d of D){const x=q[i]-d;if(fl[x]&&fl[x-d]&&dt[x]<0){dt[x]=dt[q[i]]+1;q.push(x)}}
const ok=v=>fl[v]&&cm[v]<0&&(dt[v]>=0||(v/w|0)!=(p/w|0))
for(let i=0;i<n;i++)if(ok(i)){cm[i]=k;const s=[i];for(let j=0;j<s.length;j++)for(const d of D){const v=s[j]+d;if(ok(v)){cm[v]=k;s.push(v)}}k++}
const e=b=>b.reduce((a,x)=>a+dt[x],0)
const A=(b0,p,g)=>{
const N=[{b:b0.sort((a,b)=>a-b),g:0}],Q=[],S=new Set,z=Array(n).fill(0)
let f=e(b0),T=0,x=0;Q[f]=[0]
for(;;){
while(!Q[f]?.length)if(++f>400)return
const id=Q[f].pop(),s=N[id],h=s.b
T+=2
for(const b of h)z[b]=T
const l=[s.p??p];let r=l[0];z[r]=T+1
for(let i=0;i<l.length;i++){const u=l[i];if(u<r)r=u;for(const d of D){const v=u+d;if(g[v]&&z[v]<T){z[v]=T+1;l.push(v)}}}
const y=r+','+h
if(S.has(y))continue
S.add(y)
if(!e(h)){
const m=[];for(let u=id;u;u=N[u].q)m.push(N[u].m)
const bx=new Set(N[0].b);let a=p,t=''
for(const[b,d]of m.reverse()){const j=b-d,pr=new Map([[a,0]]),w2=[a]
for(let i=0;i<w2.length&&!pr.has(j);i++)for(const e of D){const v=w2[i]+e;if(g[v]&&!bx.has(v)&&!pr.has(v)){pr.set(v,w2[i]);w2.push(v)}}
let s='';for(let v=j;v!=a;v=pr.get(v))s='udlr'[D.indexOf(v-pr.get(v))]+s
t+=s+'UDLR'[D.indexOf(d)];bx.delete(b);bx.add(b+d);a=b}
return[t,a]}
if(++x>3e6)return
h.forEach((b,i)=>D.forEach(d=>{const t=b+d;if(g[t]&&z[t]!=T&&dt[t]>=0&&z[b-d]==T+1){const u=[...h];u[i]=t;u.sort((a,b)=>a-b);(Q[s.g+1+e(u)]??=[]).push(N.push({b:u,g:s.g+1,q:id,m:[b,d],p:b})-1)}}))}}
for(let j=0;j<k&&o!=null;j++){const s=B.filter(b=>cm[b]==j);if(!s.length)continue
const g=[...fl];for(const b of B)if(cm[b]!=j)g[b]=0
const r=A(s,p,g);if(!r){o=null;break}
o+=r[0];p=r[1];B.splice(0,B.length,...B.filter(b=>cm[b]!=j),...gl.filter(x=>cm[x]==j))}
M(O+'/'+id,{recursive:true});X(O+'/'+id+'/solution.txt',(o??'')+'\n')}
