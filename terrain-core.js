// 地形高程運算。不依賴 Three.js，可單獨測試。
export const NX=461, NY=361; // 23×18 km preset = 50 m between samples
export const TYPES={
 mountain:{name:'三角錐',group:'純幾何',height:700,w:.11,l:.13,soft:.26,angle:0,info:'先以三角錐原型定位，再將三個斜面轉成高程網格，柔化山腳；三角錐是建模工具，不代表真實角峰成因'},
 cone:{name:'圓錐',group:'純幾何',height:600,w:.10,l:.10,soft:.28,angle:0,info:'圓形底面、尖頂；堆積形成錐狀山，侵蝕形成錐狀凹地'},
 sphere:{name:'球體（半球地表）',group:'純幾何',height:420,w:.115,l:.115,soft:.38,angle:0,info:'將球體上半部轉成半球形地表；堆積為圓頂丘、侵蝕為碗狀坑'},
 box:{name:'長方體',group:'純幾何',height:350,w:.12,l:.095,soft:.22,angle:0,info:'頂面平坦、側壁較陡；柔和程度控制平台邊緣與地表銜接'},
 cylinder:{name:'圓柱',group:'純幾何',height:320,w:.09,l:.09,soft:.20,angle:0,info:'圓形平頂台地或圓柱狀凹穴；邊緣柔和可以避免硬切線'},
 horn:{name:'角峰',group:'冰蝕',height:550,w:.105,l:.16,soft:.38,angle:0,info:'集中抬升的尖銳高地；實際角峰通常由多個冰斗向後侵蝕形成'},
 ridge:{name:'刃嶺',group:'冰蝕',height:270,w:.17,l:.065,soft:.3,angle:-10,info:'狹窄稜線；需配合相鄰冰斗判讀'},
 cirque:{name:'冰斗',group:'冰蝕',height:-360,w:.115,l:.18,soft:.42,angle:0,info:'半碗狀凹地；左側較高斗壁、右側開口，旋轉可改開口方向'},
 valley:{name:'冰槽（U型谷）',group:'冰蝕',height:-450,w:.25,l:.12,soft:.35,angle:0,info:'寬平谷底與較陡谷壁；從橫剖面觀察 U 型'},
 roche:{name:'羊背石',group:'冰蝕',height:80,w:.065,l:.042,soft:.36,angle:0,info:'塑造圓滑迎冰面與較陡背冰面；成因需岩性資料'},
 drumlin:{name:'鼓丘',group:'冰磧',height:100,w:.13,l:.055,soft:.44,angle:0,info:'長軸近似順冰流方向的流線形丘陵'},
 esker:{name:'蛇丘',group:'冰水',height:85,w:.20,l:.047,soft:.36,angle:0,info:'蜿蜒、狹長的冰水沉積脊'},
 moraine:{name:'端磧',group:'冰磧',height:125,w:.085,l:.23,soft:.32,angle:0,info:'冰緣附近的弧形堆積脊；非單看形狀便能斷言成因'},
 outwash:{name:'冰水沖積平原',group:'冰水',height:-60,w:.26,l:.23,soft:.55,angle:0,info:'局部整平與緩坡；真實冰水沉積形成的地形需觀察沉積證據'},
 dune:{name:'風積沙丘',group:'風積',height:65,w:.065,l:.08,soft:.4,angle:0,info:'新月形小丘，風向／砂源影響形態'}
};
export const GEOMETRY_TYPES=new Set(['mountain','cone','sphere','box','cylinder']);
export const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
export const lerp=(a,b,t)=>a+(b-a)*t;
export const fmt=n=>Math.round(n).toLocaleString('en-US');
export function newShape(type,x=.5,y=.5){const t=TYPES[type];if(!t)throw Error('未知類型');return {id:'s'+Date.now().toString(36)+Math.floor(Math.random()*1e6).toString(36),type,x,y,w:t.w,l:t.l,height:t.height,angle:t.angle,soft:t.soft,...(GEOMETRY_TYPES.has(type)?{operation:'deposit'}:{})};}
// 使用四角高度建立連續起伏地表；上方為北，右側為東。
export function boundaryBase(nw=2600,ne=700,sw=1900,se=500){
 const a=new Float32Array(NX*NY);
 for(let j=0;j<NY;j++){const v=j/(NY-1);const left=lerp(nw,sw,v),right=lerp(ne,se,v);
   for(let i=0;i<NX;i++)a[j*NX+i]=lerp(left,right,i/(NX-1));}
 return a;
}
export function emptyBase(level=600,slope=0){const a=new Float32Array(NX*NY);for(let j=0;j<NY;j++)for(let i=0;i<NX;i++)a[j*NX+i]=level+slope*(1-i/(NX-1));return a;}
export function bilinear(src,sw,sh,u,v){const x=clamp(u,0,1)*(sw-1),y=clamp(v,0,1)*(sh-1),i=Math.floor(x),j=Math.floor(y),fx=x-i,fy=y-j,k=(xx,yy)=>src[Math.min(sh-1,yy)*sw+Math.min(sw-1,xx)];const a=lerp(k(i,j),k(i+1,j),fx),b=lerp(k(i,j+1),k(i+1,j+1),fx);return lerp(a,b,fy);}
export function resample(src,sw,sh){const dst=new Float32Array(NX*NY);for(let y=0;y<NY;y++)for(let x=0;x<NX;x++)dst[y*NX+x]=bilinear(src,sw,sh,x/(NX-1),y/(NY-1));return dst;}
// 將輸入 DEM 中央裁切至固定教材畫幅，避免因輸入長寬比不同而拉伸地形
export function cropResample(src,sw,sh,cellX=1,cellY=1){
 const target=NX/NY;let cw=sw,ch=sh;
 if(sw*cellX/(sh*cellY)>target){cw=Math.max(2,Math.floor(sh*cellY*target/cellX));}
 else{ch=Math.max(2,Math.floor(sw*cellX/target/cellY));}
 const left=(sw-cw)/2,top=(sh-ch)/2;
 const out=new Float32Array(NX*NY);
 for(let j=0;j<NY;j++)for(let i=0;i<NX;i++){
  const u=(left+i/(NX-1)*(cw-1))/(sw-1),v=(top+j/(NY-1)*(ch-1))/(sh-1);
  out[j*NX+i]=bilinear(src,sw,sh,u,v);
 }
 return {base:out,widthM:cw*cellX,heightM:ch*cellY};
}

function smoothstep(a,b,v){const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);}
function decay(r,p){return Math.exp(-Math.pow(Math.abs(r),p));}
export function influence(s,u,v){const ang=s.angle*Math.PI/180,dx=u-s.x,dy=v-s.y;const co=Math.cos(ang),si=Math.sin(ang);const rx=(dx*co+dy*si)/Math.max(.01,s.w),ry=(-dx*si+dy*co)/Math.max(.01,s.l);if(Math.abs(rx)>3.7||Math.abs(ry)>3.7)return 0;
 const soft=s.soft,sharp=lerp(3.6,1.5,soft),p=lerp(1.5,2.4,soft);let val=0;
 switch(s.type){
 case 'mountain':{
  // 三角錐原型：三角形底面三條邊與一個中心峰頂。
  // 由內向邊緣的線性高度形成三個斜面；柔化參數使山腳逐漸過渡。
  const ax=-1,ay=-.8,bx=1,by=-.8,cx=0,cy=1,px=0,py=-.2;
  const side=(x1,y1,x2,y2,x,y)=>(x2-x1)*(y-y1)-(y2-y1)*(x-x1);
  const v1=side(ax,ay,bx,by,rx,ry)/side(ax,ay,bx,by,px,py);
  const v2=side(bx,by,cx,cy,rx,ry)/side(bx,by,cx,cy,px,py);
  const v3=side(cx,cy,ax,ay,rx,ry)/side(cx,cy,ax,ay,px,py);
  const core=Math.min(v1,v2,v3);
  // 三角錐尖頂保持清楚，外緣以可調的緩衝帶與周圍地表銜接。
  const shoulder=Math.max(0, Math.min(1,(core+.12*soft)/(.12*soft+.0001)));
  val=Math.max(0,core)*shoulder;
  break;
 }
 case 'cone':{const r=Math.hypot(rx,ry);val=Math.max(0,1-r);break;}
 case 'sphere':{const r=Math.hypot(rx,ry);val=r>=1?0:Math.sqrt(Math.max(0,1-r*r))*(1-smoothstep(1-(.08+soft*.30),1,r));break;}
 case 'box':{const r=Math.max(Math.abs(rx),Math.abs(ry)),e=.04+soft*.32;val=1-smoothstep(1-e,1+e,r);break;}
 case 'cylinder':{const r=Math.hypot(rx,ry),e=.04+soft*.32;val=1-smoothstep(1-e,1+e,r);break;}
 case 'horn':val=Math.exp(-sharp*Math.pow(Math.hypot(rx,ry),p*.78));break;
 case 'ridge':val=decay(ry*sharp,1.35)*Math.exp(-Math.pow(Math.max(0,Math.abs(rx)-.68)*2.7,2));break;
 case 'cirque':{const r=Math.hypot(rx,ry);const bowl=Math.exp(-1.8*Math.pow(r,1.8));const horseshoe=Math.exp(-Math.pow((r-.95)/(.19+soft*.14),2))*(rx<.2?1:.08);val=bowl-.40*horseshoe;break;}
 case 'valley':{const across=Math.max(0,Math.abs(ry)-.45);val=Math.exp(-2.4*Math.pow(across*2.5,2.1))*Math.exp(-Math.pow(Math.max(0,Math.abs(rx)-.8)*2.6,2));break;}
 case 'roche':{const X=rx<0?rx*1.5:rx*.72;val=Math.exp(-(X*X*2.5+ry*ry*3));break;}
 case 'drumlin':{const X=rx<0?rx*1.25:rx*.75;val=Math.exp(-1.6*X*X-3.4*ry*ry);break;}
 case 'esker':{const centre=.55*Math.sin((rx+.45)*Math.PI*1.7);val=Math.exp(-10*Math.pow(ry-centre,2))*Math.exp(-Math.pow(Math.max(0,Math.abs(rx)-1)*2,2));break;}
 case 'moraine':{const bend=.55*(1-(ry*ry));val=Math.exp(-13*Math.pow(rx-bend,2))*Math.exp(-Math.pow(Math.max(0,Math.abs(ry)-1)*3,2));break;}
 case 'outwash':{val=Math.exp(-2.2*(rx*rx+ry*ry));break;}
 case 'dune':{const bent=.55*Math.pow(Math.abs(ry),1.5);const xoff=rx-bent;const X=xoff<0?xoff*1.5:xoff*.72;val=Math.exp(-2.4*X*X-3.3*ry*ry)*(1+.35*Math.max(0,-rx));break;}
 }
 return Number.isFinite(val)?val:0;
}
export function applyShapes(base,objects,smooth=2){const height=new Float32Array(base);if(!objects.length)return height;for(const s of objects){for(let y=0;y<NY;y++)for(let x=0;x<NX;x++){const k=y*NX+x;const inf=influence(s,x/(NX-1),y/(NY-1));if(Math.abs(inf)<.00001)continue;if(s.type==='outwash'){
 // 局部整平：保留一部分原地形，混合成緩斜地；height 代表下切/抬升基準值
 const target=base[k]+s.height + 15*(s.x-x/(NX-1));height[k]=lerp(height[k],target,clamp(inf*.84,0,.90));
 }else{const delta=GEOMETRY_TYPES.has(s.type)?(s.operation==='erode'?-Math.abs(s.height):Math.abs(s.height)):s.height;height[k]+=delta*inf;}
 }}
 if(smooth<=0)return height;
 // 保留真實 DEM 的原始細節，只平滑加上的地形變化量
 const d=new Float32Array(height.length);for(let k=0;k<d.length;k++)d[k]=height[k]-base[k];let a=d,b=new Float32Array(d.length);for(let pass=0;pass<smooth;pass++){for(let y=0;y<NY;y++)for(let x=0;x<NX;x++){const k=y*NX+x;let sum=a[k]*4,ww=4;for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]){const xx=x+dx,yy=y+dy;if(xx>=0&&xx<NX&&yy>=0&&yy<NY){sum+=a[yy*NX+xx];ww++;}}b[k]=sum/ww;}[a,b]=[b,a];}
 for(let k=0;k<height.length;k++)height[k]=base[k]+a[k];return height;
}
export function rangeOf(data){let min=Infinity,max=-Infinity;for(const v of data){if(Number.isFinite(v)){min=Math.min(min,v);max=Math.max(max,v);}}return {min,max,span:Math.max(1,max-min)};}
export function eachContour(data,interval,cb){let {min,max}=rangeOf(data);let skip=1;let count=Math.ceil(max/interval)-Math.floor(min/interval);if(count>100)skip=Math.ceil(count/100);
 const segments=[[3,0], [0,1], [3,1], [1,2], [0,2], null, [3,2], [2,3], [2,3], [0,2], null, [3,1], [1,2], [0,1], [3,0]];
 for(let n=Math.ceil(min/interval);n*interval<=max;n+=skip){const lv=n*interval;for(let j=0;j<NY-1;j++)for(let i=0;i<NX-1;i++){
 const v0=data[j*NX+i],v1=data[j*NX+i+1],v2=data[(j+1)*NX+i+1],v3=data[(j+1)*NX+i];
 const mask=(v0>=lv?1:0)|(v1>=lv?2:0)|(v2>=lv?4:0)|(v3>=lv?8:0);if(mask===0||mask===15)continue;
 const vals=[v0,v1,v2,v3],corners=[[i,j],[i+1,j],[i+1,j+1],[i,j+1]];
 const cross=e=>{const a=e,b=(e+1)%4,t=clamp((lv-vals[a])/(vals[b]-vals[a]||1),0,1);return [lerp(corners[a][0],corners[b][0],t)/(NX-1),lerp(corners[a][1],corners[b][1],t)/(NY-1)];};
 // 邊依序 0=頂 1=右 2=底 3=左；處理 saddle case
 let edges=[];for(let e=0;e<4;e++){const a=e,b=(e+1)%4;if((vals[a]>=lv)!==(vals[b]>=lv))edges.push(e);}
 if(edges.length===2){cb(cross(edges[0]),cross(edges[1]),lv);}
 else if(edges.length===4){const center=(v0+v1+v2+v3)*.25;const pairs=center>=lv?[[0,1],[2,3]]:[[0,3],[1,2]];for(const [a,b] of pairs)cb(cross(a),cross(b),lv);}
 }}
}
export function demo(){const b=emptyBase(620,1450);const shapes=[];const add=(type,x,y,props={})=>shapes.push(Object.assign(newShape(type,x,y),props));
 add('horn',.15,.33,{height:650,w:.14,l:.26,soft:.28});add('ridge',.23,.26,{height:300,w:.17,l:.05,angle:30});add('horn',.29,.55,{height:310,w:.09,l:.14});
 add('cirque',.15,.56,{height:-360,w:.115,l:.17,angle:-25});add('cirque',.27,.37,{height:-285,w:.12,l:.16,angle:15});add('valley',.41,.50,{height:-540,w:.26,l:.12,angle:-4});
 add('moraine',.66,.53,{height:140,w:.095,l:.27,angle:0});add('outwash',.79,.51,{height:-80,w:.21,l:.36});
 for(const [x,y] of [[.69,.26],[.77,.32],[.72,.68],[.82,.72]])add('drumlin',x,y,{height:80,w:.066,l:.033,angle:-12});
 add('esker',.79,.57,{height:87,w:.16,l:.035,angle:18});for(const [x,y] of [[.92,.3],[.93,.54],[.95,.75]])add('dune',x,y,{height:65,w:.05,l:.045,angle:-15});
 return {base:b,objects:shapes,widthM:23000,heightM:18000,source:'虛構冰河地景（示意地形，可修改）',sourceURL:'',real:false};
}
export function parseASC(raw){const lines=raw.replace(/^\uFEFF/,'').trim().split(/\r?\n/);const head={};let idx=0;while(idx<lines.length&&Object.keys(head).length<6){const m=lines[idx].trim().match(/^([a-zA-Z_]+)\s+([-+\d.eE]+)/);if(!m)break;head[m[1].toLowerCase()]=+m[2];idx++;}
 const sw=head.ncols,sh=head.nrows;if(!(sw>=2&&sh>=2&&sw<=10000&&sh<=10000))throw Error('ASC 標頭缺少有效的 ncols/nrows');const vals=lines.slice(idx).join(' ').trim().split(/\s+/).map(Number);if(vals.length<sw*sh)throw Error('ASC 高程筆數不足');let data=Float32Array.from(vals.slice(0,sw*sh));const nodata=head.nodata_value;let min=Infinity;for(const v of data)if(Number.isFinite(v)&&v!==nodata&&v>-9990)min=Math.min(min,v);if(!Number.isFinite(min))throw Error('ASC 沒有有效高程');for(let i=0;i<data.length;i++)if(!Number.isFinite(data[i])||data[i]===nodata||data[i]<-9990)data[i]=min;
 return {data,sw,sh,widthM:(head.cellsize||100)*sw,heightM:(head.cellsize||100)*sh};
}
// ESRI ASCII Raster requires square cells; resample rows for non-square project aspect ratios.
export function exportASC(h,widthM,heightM){
 const cell=widthM/(NX-1);
 const outRows=Math.max(2,Math.ceil(heightM/cell)+1);
 const rows=[`ncols ${NX}`,`nrows ${outRows}`,`xllcorner 0`,`yllcorner 0`,`cellsize ${cell.toFixed(6)}`,`NODATA_value -9999`];
 for(let j=0;j<outRows;j++){
  const v=j/(outRows-1);
  let line=[];
  for(let i=0;i<NX;i++)line.push(bilinear(h,NX,NY,i/(NX-1),v).toFixed(2));
  rows.push(line.join(' '));
 }
 return rows.join('\n');
}
