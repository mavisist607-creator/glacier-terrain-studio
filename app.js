let THREE, OrbitControls, GLTFExporter; // 非同步載入，2D 編輯器可在 3D 套件載入失敗時繼續使用
import {NX,NY,TYPES,clamp,lerp,fmt,newShape,emptyBase,bilinear,resample,cropResample,applyShapes,rangeOf,eachContour,demo,parseASC,exportASC} from './terrain-core.js';

const $=id=>document.getElementById(id), map=$('map'),ctx=map.getContext('2d',{willReadFrequently:true});
let state=demo(),height=new Float32Array(NX*NY),selected=null,placeType=null,mapMode='contours',viewMode='now',show3DContours=true,showStamps=true,history=[],future=[],refreshTimer=0;
let renderer,scene,camera,controls,terrainMesh,linesGroup,raycaster;
const WORLD_W=10,WORLD_D=6;
function msg(t){$('status').textContent=t;}
function snapshot(){return {objects:structuredClone(state.objects),base:Array.from(state.base),source:state.source,sourceURL:state.sourceURL,real:state.real,widthM:state.widthM,heightM:state.heightM,smooth:state.smooth??2};}
function remember(){history.push(snapshot());if(history.length>28)history.shift();future=[];}
function restore(s){state={...s,base:Float32Array.from(s.base)};selected=null;refresh(true);}
function syncSettings(){state.smooth=Number($('smooth').value);state.interval=Number($('interval').value);state.zscale=Number($('z-scale').value);}
function recalc(){syncSettings();height=applyShapes(state.base,state.objects,state.smooth);const r=rangeOf(height);$('range-info').textContent=`高程 ${fmt(r.min)}～${fmt(r.max)} m｜模型 ${NX}×${NY} 格網｜地形積木 ${state.objects.length} 件`;}
function refresh(full=true){clearTimeout(refreshTimer);recalc();drawMap();if(full){updateTerrain();update3DContours();}updateList();updateEditor();$('source-label').textContent='來源：'+state.source;}
function schedule(){clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>refresh(true),65);}
function setActiveButtons(group,current){group.forEach(id=>$(id).classList.toggle('active',id===current));}
function chooseStamp(type){placeType=type;selected=null;document.querySelectorAll('[data-type]').forEach(x=>x.classList.toggle('active',x.dataset.type===type));$('btn-select').classList.toggle('selected',!type);$('map-hint').textContent=type?`放置 ${TYPES[type].name}：點擊地圖或 3D 模型`:'選取積木後拖曳，可以移動位置';updateEditor();}
function selectShape(id){selected=id;chooseStamp(null);selected=id;updateList();updateEditor();}
function addShape(u,v){if(!placeType)return;remember();const shape=newShape(placeType,clamp(u,.01,.99),clamp(v,.01,.99));state.objects.push(shape);selectShape(shape.id);refresh();msg(`已新增「${TYPES[shape.type].name}」。拖曳地圖上的圓點或右側調整尺寸。`);}
function updateList(){$('shape-count').textContent=state.objects.length;const root=$('shape-list');root.innerHTML='';for(const s of [...state.objects].reverse()){const b=document.createElement('button');b.textContent=`${TYPES[s.type].name} · ${fmt(s.height)} m`;b.classList.toggle('current',s.id===selected);b.onclick=()=>selectShape(s.id);root.appendChild(b);}}
function selectedShape(){return state.objects.find(s=>s.id===selected);}
function updateEditor(){const s=selectedShape();$('editor').hidden=!s;$('no-selection').hidden=!!s;if(!s)return;$('selected-name').textContent=TYPES[s.type].name;$('selected-typehint').textContent=TYPES[s.type].info;for(const id of ['height','width','length','angle','soft'])$(id).value=s[id==='width'?'w':id==='length'?'l':id];showOutput();}
function showOutput(){$('height-o').textContent=$('height').value+' m';$('width-o').textContent=(Number($('width').value)*state.widthM/1000).toFixed(2)+' km';$('length-o').textContent=(Number($('length').value)*state.heightM/1000).toFixed(2)+' km';$('angle-o').textContent=$('angle').value+'°';$('soft-o').textContent=$('soft').value;}
let drag=null,moved=false;
function mapUV(e){const rect=map.getBoundingClientRect();return [clamp((e.clientX-rect.left)/rect.width,0,1),clamp((e.clientY-rect.top)/rect.height,0,1)];}
function hit(u,v){let best=null,d=.035;for(let i=state.objects.length-1;i>=0;i--){const s=state.objects[i],ds=Math.hypot((s.x-u)*1.3,s.y-v);if(ds<d){best=s;d=ds;}}return best;}
map.addEventListener('pointerdown',e=>{if(e.button!==0)return;map.setPointerCapture(e.pointerId);const [u,v]=mapUV(e);if(placeType){addShape(u,v);return;}const s=hit(u,v);if(s){if(selected!==s.id)selectShape(s.id);remember();drag={id:s.id,ox:u-s.x,oy:v-s.y};moved=false;}else{selected=null;updateList();updateEditor();drawMap();}});
map.addEventListener('pointermove',e=>{if(!drag)return;const s=state.objects.find(x=>x.id===drag.id);if(!s)return;const [u,v]=mapUV(e);s.x=clamp(u-drag.ox,.005,.995);s.y=clamp(v-drag.oy,.005,.995);moved=true;schedule();});
map.addEventListener('pointerup',()=>{if(drag){drag=null;refresh();}});map.addEventListener('pointercancel',()=>drag=null);
for(const typeBtn of document.querySelectorAll('[data-type]'))typeBtn.onclick=()=>chooseStamp(typeBtn.dataset.type);
$('btn-select').onclick=()=>chooseStamp(null);
for(const id of ['height','width','length','angle','soft']){$(id).addEventListener('pointerdown',()=>{if(selectedShape())remember();},{passive:true});$(id).addEventListener('input',()=>{const s=selectedShape();if(!s)return;s[id==='width'?'w':id==='length'?'l':id]=Number($(id).value);showOutput();schedule();});}
$('btn-delete').onclick=()=>{if(!selectedShape())return;remember();state.objects=state.objects.filter(x=>x.id!==selected);selected=null;refresh();};
$('btn-duplicate').onclick=()=>{const s=selectedShape();if(!s)return;remember();const copy={...s,id:newShape(s.type).id,x:clamp(s.x+.04,0,1),y:clamp(s.y+.035,0,1)};state.objects.push(copy);selectShape(copy.id);refresh();};
$('btn-undo').onclick=()=>{if(!history.length)return;future.push(snapshot());restore(history.pop());msg('已撤銷上一步。');};
$('btn-demo').onclick=()=>{remember();state=demo();chooseStamp(null);refresh();msg('已載入虛構冰河地景：可以移動或修改各種地形積木。');};
$('btn-blank').onclick=()=>{remember();state={...demo(),base:emptyBase(600,0),objects:[],source:'虛構平坦地表（海拔 600m）',real:false};chooseStamp(null);refresh();msg('已建立平坦地表。請選擇地形積木開始塑形。');};
$('smooth').oninput=()=>{$('smooth-o').textContent=$('smooth').value+' 次';schedule();};
$('z-scale').oninput=()=>{$('z-o').textContent=$('z-scale').value+'×';updateTerrain();update3DContours();};
$('interval').onchange=()=>refresh();
$('contours-overlay').onchange=()=>{show3DContours=$('contours-overlay').checked;update3DContours();};
$('show-stamps').onchange=()=>{showStamps=$('show-stamps').checked;drawMap();};
for(const id of ['map-contours','map-elev','map-change'])$(id).onclick=()=>{mapMode={ 'map-contours':'contours','map-elev':'elev','map-change':'change'}[id];setActiveButtons(['map-contours','map-elev','map-change'],id);drawMap();};
for(const id of ['view-now','view-before','view-diff'])$(id).onclick=()=>{viewMode={'view-now':'now','view-before':'before','view-diff':'diff'}[id];setActiveButtons(['view-now','view-before','view-diff'],id);updateTerrain();update3DContours();};
function renderBackdrop(target,mode='contours',labels=true){const c=target.canvas,w=c.width,h=c.height;target.clearRect(0,0,w,h);const pad=mode==='print'?{l:90,t:130,r:60,b:170}:{l:0,t:0,r:0,b:0};const area={x:pad.l,y:pad.t,w:w-pad.l-pad.r,h:h-pad.t-pad.b};const r=rangeOf(height),br=rangeOf(state.base),deltaMax=Math.max(25,Math.max(Math.abs(r.max-br.min),Math.abs(r.min-br.max)));const sw=NX,sh=NY;
 const cv=document.createElement('canvas');cv.width=sw;cv.height=sh;const cx=cv.getContext('2d');const im=cx.createImageData(sw,sh);
 for(let j=0;j<sh;j++)for(let i=0;i<sw;i++){const idx=j*sw+i,z=height[idx],delta=z-state.base[idx];let red,green,blue;
 if(mode==='change'){const a=clamp(Math.abs(delta)/250,0,1);if(delta>=0){red=248;green=243-102*a;blue=224-126*a;}else{red=232-141*a;green=244-68*a;blue=247-23*a;}}
 else if(mode==='elev'){const t=clamp((z-r.min)/r.span,0,1);if(t<.52){const q=t/.52;red=lerp(225,155,q);green=lerp(233,171,q);blue=lerp(216,132,q);}else{const q=(t-.52)/.48;red=lerp(155,237,q);green=lerp(171,230,q);blue=lerp(132,220,q);}}
 else{red=247;green=246;blue=239;}
 const off=idx*4;im.data[off]=red;im.data[off+1]=green;im.data[off+2]=blue;im.data[off+3]=255;}
 cx.putImageData(im,0,0);target.imageSmoothingEnabled=true;target.drawImage(cv,area.x,area.y,area.w,area.h);
 if(mode!=='elev'||labels){const interval=Number($('interval').value);target.lineWidth=Math.max(1,w/1000);let count=0;eachContour(height,interval,(a,b,level)=>{target.beginPath();target.moveTo(area.x+a[0]*area.w,area.y+a[1]*area.h);target.lineTo(area.x+b[0]*area.w,area.y+b[1]*area.h);const major=Math.abs(Math.round(level/interval))%5===0;target.strokeStyle=mode==='change'?'rgba(73,87,99,.35)':major?'rgba(87,76,58,.79)':'rgba(103,91,72,.44)';target.lineWidth=major?Math.max(1.15,w/700):Math.max(.65,w/1400);target.stroke();count++;});}
 target.strokeStyle='#7d8c8f';target.lineWidth=2;target.strokeRect(area.x+1,area.y+1,area.w-2,area.h-2);
 return area;
}
function drawMap(){const area=renderBackdrop(ctx,mapMode);if(!showStamps)return;for(const s of state.objects){const px=s.x*map.width,py=s.y*map.height;ctx.beginPath();ctx.ellipse(px,py,Math.max(5,s.w*map.width*.6),Math.max(5,s.l*map.height*.65),s.angle*Math.PI/180,0,2*Math.PI);ctx.strokeStyle=s.id===selected?'#e27039':'#3b8393aa';ctx.lineWidth=s.id===selected?3:1.4;ctx.setLineDash([5,5]);ctx.stroke();ctx.setLineDash([]);ctx.beginPath();ctx.arc(px,py,s.id===selected?9:6,0,Math.PI*2);ctx.fillStyle=s.id===selected?'#e57040':'#255d6d';ctx.fill();ctx.fillStyle='#15364a';ctx.font='bold 14px system-ui';ctx.fillText(TYPES[s.type].name,px+10,py-9);}}
function blendColor(a,b,t){return new THREE.Color().setRGB(lerp(a[0],b[0],t),lerp(a[1],b[1],t),lerp(a[2],b[2],t));}
function terrainBaseColor(t){
 // 更接近真實地形的分層設色：低地綠、山麓黃褐、中高山岩色、雪線白色
 if(t<0.12) return blendColor([0.24,0.44,0.30],[0.32,0.56,0.35],t/0.12);           // 低地濕潤綠
 if(t<0.30) return blendColor([0.32,0.56,0.35],[0.53,0.67,0.39],(t-0.12)/0.18);    // 丘陵綠
 if(t<0.48) return blendColor([0.53,0.67,0.39],[0.72,0.69,0.47],(t-0.30)/0.18);    // 山麓黃綠
 if(t<0.68) return blendColor([0.72,0.69,0.47],[0.61,0.50,0.38],(t-0.48)/0.20);    // 褐色裸露地
 if(t<0.83) return blendColor([0.61,0.50,0.38],[0.56,0.56,0.56],(t-0.68)/0.15);    // 岩石灰褐
 return blendColor([0.82,0.84,0.84],[0.98,0.99,1.00],Math.min(1,(t-0.83)/0.17));   // 雪線以上
}
function shadedTerrainColor(arr,i,j,min,span,factor){
 const k=j*NX+i,el=arr[k],t=clamp((el-min)/span,0,1);
 let col=terrainBaseColor(t);
 // 冰河/高山谷地略偏冷色，讓冰斗與高山谷更像真實冰蝕環境
 if(t>0.72 && t<0.92){
   const cold=blendColor([0.77,0.84,0.86],[0.91,0.95,0.97],clamp((t-0.72)/0.20,0,1));
   col.lerp(cold,0.18);
 }
 const left=arr[j*NX+Math.max(0,i-1)],right=arr[j*NX+Math.min(NX-1,i+1)],up=arr[Math.max(0,j-1)*NX+i],down=arr[Math.min(NY-1,j+1)*NX+i];
 const cellX=WORLD_W/(NX-1),cellY=WORLD_D/(NY-1);
 const dx=((right-left)*factor)/(2*cellX),dy=((down-up)*factor)/(2*cellY);
 const n=new THREE.Vector3(-dx,1,-dy).normalize();
 const sun=new THREE.Vector3(-0.55,0.82,0.18).normalize();
 const diffuse=clamp(n.dot(sun),0,1);
 const shade=0.58 + diffuse*0.52; // 最暗不至於過黑，保留教材可讀性
 // 高海拔處略微提亮，模擬雪與裸岩的強反射
 const highBoost=t>0.78?lerp(1,1.08,(t-0.78)/0.22):1;
 col.multiplyScalar(shade*highBoost);
 return col;
}
function geometryFor(arr,mode='now'){
 const active=viewMode==='before'?state.base:height,base=state.base,r=rangeOf(active),rr=rangeOf(height),zEx=Number($('z-scale').value),factor=2.7/Math.max(300,rr.span)*zEx;
 const positions=new Float32Array(NX*NY*3),colors=new Float32Array(NX*NY*3),idx=[];let z0=rr.min;
 for(let j=0;j<NY;j++)for(let i=0;i<NX;i++){
  const k=j*NX+i,x=i/(NX-1),y=j/(NY-1),el=active[k],hh=(el-z0)*factor;
  positions[3*k]=(x-.5)*WORLD_W;positions[3*k+1]=hh;positions[3*k+2]=(y-.5)*WORLD_D;let col;
  if(viewMode==='diff'){
   const d=height[k]-base[k],t=clamp(Math.abs(d)/250,0,1);
   col=d>=0?new THREE.Color().setRGB(lerp(.88,.98,t),lerp(.9,.48,t),lerp(.78,.27,t)):new THREE.Color().setRGB(lerp(.85,.19,t),lerp(.90,.57,t),lerp(.93,.83,t));
  } else col=shadedTerrainColor(active,i,j,rr.min,rr.span,factor);
  colors[3*k]=col.r;colors[3*k+1]=col.g;colors[3*k+2]=col.b;
 }
 for(let j=0;j<NY-1;j++)for(let i=0;i<NX-1;i++){const k=j*NX+i;idx.push(k,k+NX,k+1,k+1,k+NX,k+NX+1);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(positions,3));g.setAttribute('color',new THREE.BufferAttribute(colors,3));g.setIndex(idx);g.computeVertexNormals();return g;
}
function build3D(){const root=$('three-wrap');renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.outputColorSpace=THREE.SRGBColorSpace;root.appendChild(renderer.domElement);$('three-placeholder').remove();scene=new THREE.Scene();scene.background=new THREE.Color('#dfeaf1');camera=new THREE.PerspectiveCamera(43,2,.1,1000);camera.position.set(10,10,13);controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.08;controls.target.set(0,1,0);controls.minDistance=5;controls.maxDistance=35;scene.add(new THREE.HemisphereLight(0xf2f8ff,0xc7c0aa,1.45));const light=new THREE.DirectionalLight(0xffffff,1.9);light.position.set(-5,13,7);scene.add(light);const rim=new THREE.DirectionalLight(0xdde6f5,0.7);rim.position.set(7,6,-5);scene.add(rim);terrainMesh=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,roughness:.98,metalness:0}));scene.add(terrainMesh);linesGroup=new THREE.Group();scene.add(linesGroup);raycaster=new THREE.Raycaster();function resize(){const rect=root.getBoundingClientRect();renderer.setSize(rect.width,rect.height,false);camera.aspect=rect.width/rect.height;camera.updateProjectionMatrix();}resize();new ResizeObserver(resize).observe(root);
 let pointerStart=null;renderer.domElement.addEventListener('pointerdown',e=>{pointerStart=[e.clientX,e.clientY];});renderer.domElement.addEventListener('pointerup',e=>{if(!placeType||!pointerStart||Math.hypot(e.clientX-pointerStart[0],e.clientY-pointerStart[1])>7)return;const rect=renderer.domElement.getBoundingClientRect(),p=new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(p,camera);const hits=raycaster.intersectObject(terrainMesh);if(!hits.length)return;const pos=hits[0].point;addShape(pos.x/WORLD_W+.5,pos.z/WORLD_D+.5);});
 renderer.setAnimationLoop(()=>{controls.update();renderer.render(scene,camera);});
}
function updateTerrain(){if(!renderer)return;const old=terrainMesh.geometry;terrainMesh.geometry=geometryFor(height);old.dispose();const r=rangeOf(height);$('height-legend').textContent=viewMode==='diff'?'藍：降低（侵蝕）／橘：增高（堆積）':`真實感分層設色｜高程 ${fmt(r.min)}～${fmt(r.max)} m｜垂直誇大 ${$('z-scale').value}×`;}
function update3DContours(){if(!linesGroup)return;while(linesGroup.children.length){const c=linesGroup.children[0];linesGroup.remove(c);c.geometry?.dispose();c.material?.dispose();}if(!show3DContours)return;const arr=viewMode==='before'?state.base:height,r=rangeOf(height),factor=2.7/Math.max(300,r.span)*Number($('z-scale').value),positions=[];let levelCount=0;eachContour(arr,Number($('interval').value),(a,b,lv)=>{const h=clamp((lv-r.min)*factor+.015,-2,10);positions.push((a[0]-.5)*WORLD_W,h,(a[1]-.5)*WORLD_D,(b[0]-.5)*WORLD_W,h,(b[1]-.5)*WORLD_D);levelCount++;});if(positions.length){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));linesGroup.add(new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:0x34474c,opacity:.67,transparent:true,depthTest:true})));}}
function downloadBlob(data,name,mime='application/octet-stream'){const blob=data instanceof Blob?data:new Blob([data],{type:mime}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}
$('btn-save').onclick=()=>{downloadBlob(JSON.stringify({format:'glacier-studio-v2',savedAt:new Date().toISOString(),...snapshot(),interval:Number($('interval').value),zscale:Number($('z-scale').value)},null,2),'glacier-terrain-v2.json','application/json');msg('已儲存可再次編輯的專案 JSON。');};
$('btn-open').onclick=()=>$('file-project').click();
$('file-project').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{const data=JSON.parse(await file.text());if(data.format!=='glacier-studio-v2')throw Error('僅支援新版 V2 專案，舊版請先另存備份');if(!data.base||data.base.length!==NX*NY||!Array.isArray(data.objects))throw Error('專案格式不完整');remember();restore(data);$('smooth').value=data.smooth??2;$('interval').value=data.interval??100;$('z-scale').value=data.zscale??1.5;refresh();msg('已載入專案。');}catch(err){msg('讀取專案失敗：'+err.message);}e.target.value='';};
$('btn-asc').onclick=()=>{downloadBlob(exportASC(height,state.widthM,state.heightM),'glacier-terrain.asc','text/plain');msg('已輸出 QGIS 可讀取的 ASC 高程網格（虛構座標或來源局部平面網格）。');};
$('btn-heights').onclick=()=>{const c=document.createElement('canvas');c.width=NX;c.height=NY;const x=c.getContext('2d'),im=x.createImageData(NX,NY),r=rangeOf(height);for(let k=0;k<height.length;k++){const v=Math.round(clamp((height[k]-r.min)/r.span,0,1)*255);im.data.set([v,v,v,255],k*4);}x.putImageData(im,0,0);c.toBlob(blob=>downloadBlob(blob,'glacier-heightmap-8bit.png','image/png'));msg('已輸出相對灰階高度 PNG。精確高程請用 ASC。');};
$('btn-a4').onclick=()=>{const c=document.createElement('canvas');c.width=3508;c.height=2480;const cc=c.getContext('2d');cc.fillStyle='#fff';cc.fillRect(0,0,c.width,c.height);cc.fillStyle='#223e4f';cc.font='bold 76px system-ui';cc.fillText('冰河地形等高線判讀',110,110);cc.font='36px system-ui';cc.fillText('等高距：'+$('interval').value+' 公尺　｜　N ↑　｜　依平面線條判讀地形與坡度',120,184);const a=renderBackdrop(cc,'print');cc.fillStyle='#203c49';cc.font='33px system-ui';cc.fillText('請使用不同顏色標記地形，並說明判讀依據。',130,2340);cc.font='28px system-ui';cc.fillText('姓名／組別：_____________________    地形資料：'+(state.real?'實際 DEM 局部範圍（可能已人工修改）':'虛構教學示意'),130,2402);c.toBlob(b=>downloadBlob(b,'glacier-student-A4.png','image/png'),'image/png');msg('已輸出橫向 A4 學生圖（3508×2480）。');};
$('btn-glb').onclick=()=>{if(!renderer){msg('3D 引擎尚未載入，無法匯出 GLB。');return;}const clone=new THREE.Mesh(geometryFor(height),new THREE.MeshStandardMaterial({vertexColors:true,doubleSided:true,side:THREE.DoubleSide,roughness:.85}));const g=new THREE.Group();g.add(clone);const exporter=new GLTFExporter();exporter.parse(g,data=>{downloadBlob(data,'glacier-terrain.glb','model/gltf-binary');clone.geometry.dispose();clone.material.dispose();msg('已輸出 GLB 模型。檔案使用固定橫向比例，垂直縮放請在下游依比例重新校準。');},err=>msg('GLB 匯出失敗：'+err.message),{binary:true,onlyVisible:true,trs:false});};
// ----- 真實 DEM：Mapzen / AWS Terrarium PNG 瓦片 -----
const REAL={
 aletsch:{name:'瑞士阿雷奇冰河附近',lat:46.43,lon:8.06,z:12,description:'山岳冰河區地表高程'},
 drumlin:{name:'美國 Clyman 鼓丘附近',lat:43.342419,lon:-88.689722,z:13,description:'威斯康辛州冰河丘陵區'},
 sandur:{name:'冰島 Skeiðarársandur 附近',lat:63.895,lon:-17.3,z:11,description:'冰水沖積平原地表高程'}
};
let lastTileURL='';
function tileInfo(p){const n=2**p.z,fx=(p.lon+180)/360*n,fy=(1-Math.asinh(Math.tan(p.lat*Math.PI/180))/Math.PI)/2*n,x=Math.floor(fx),y=Math.floor(fy);return {url:`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${p.z}/${x}/${y}.png`,x,y};}
async function readTerrainPNG(blob){const bmp=await createImageBitmap(blob),canvas=document.createElement('canvas');canvas.width=bmp.width;canvas.height=bmp.height;const x=canvas.getContext('2d',{willReadFrequently:true});x.drawImage(bmp,0,0);const img=x.getImageData(0,0,bmp.width,bmp.height).data;const sw=bmp.width,sh=bmp.height,data=new Float32Array(sw*sh);for(let k=0;k<data.length;k++)data[k]=(img[k*4]*256+img[k*4+1]+img[k*4+2]/256)-32768;
 // 取圖磚中央橫向 1.667:1 範圍以保留教材縱橫比
 const ch=Math.floor(sw*NY/NX),top=Math.max(0,Math.floor((sh-ch)/2));const cropped=new Float32Array(sw*ch);for(let j=0;j<ch;j++)cropped.set(data.subarray((j+top)*sw,(j+top+1)*sw),j*sw);return {base:resample(cropped,sw,ch),sw,sh:ch};}
async function loadReal(key){const p=REAL[key],info=tileInfo(p);lastTileURL=info.url;msg('正在下載真實 DEM：'+p.name+'…');try{const response=await fetch(info.url,{mode:'cors'});if(!response.ok)throw Error('下載回應 '+response.status);const result=await readTerrainPNG(await response.blob());remember();const earthR=6378137,circ=2*Math.PI*earthR*Math.cos(p.lat*Math.PI/180),size=circ/2**p.z;state={base:result.base,objects:[],widthM:size,heightM:size*NY/NX,source:`真實 DEM｜${p.name}｜Mapzen Terrain Tiles (AWS)，圖磚 z${p.z}/${info.x}/${info.y}`,sourceURL:info.url,real:true};chooseStamp(null);const span=rangeOf(state.base).span;$('interval').value=span<100?'10':span<400?'25':span<1200?'50':'100';refresh();msg('已載入真實高程資料。可用積木進行「模擬改造」；改造部分不是原始測量地形。');}catch(err){msg('線上案例讀取失敗（可能是 CORS、網路或供應商限制）：'+err.message+'。可開啟「原始 Terrarium PNG」，下載後從本機匯入。');}}
document.querySelectorAll('[data-real]').forEach(el=>el.onclick=()=>loadReal(el.dataset.real));
$('btn-download-tile').onclick=()=>{if(!lastTileURL){lastTileURL=tileInfo(REAL.aletsch).url;}window.open(lastTileURL,'_blank','noopener');};
$('file-dem').onchange=async e=>{const file=e.target.files[0];if(!file)return;msg('正在讀取本機高程：'+file.name+'…');try{let r;if(/\.asc$|\.txt$/i.test(file.name)){r=parseASC(await file.text());r=cropResample(r.data,r.sw,r.sh,r.widthM/r.sw,r.heightM/r.sh);}else if(/\.png$/i.test(file.name)){r=await readTerrainPNG(file);}else if(/\.tiff?$/i.test(file.name)){
 if(!window.GeoTIFF){await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/geotiff';script.onload=resolve;script.onerror=()=>reject(Error('GeoTIFF 解碼套件下載失敗'));document.head.appendChild(script);});}
 const gt=await window.GeoTIFF.fromArrayBuffer(await file.arrayBuffer()),img=await gt.getImage();const sw=img.getWidth(),sh=img.getHeight(),bands=await img.readRasters({samples:[0],interleave:true}),bad=img.getGDALNoData?.();const values=Float32Array.from(bands);let low=Infinity;for(const v of values)if(Number.isFinite(v)&&v!==bad&&v>-9999)low=Math.min(low,v);if(!Number.isFinite(low))throw Error('此 TIFF 沒有有效高程');for(let k=0;k<values.length;k++)if(!Number.isFinite(values[k])||values[k]===bad||values[k]<-9999)values[k]=low;
 const resolution=img.getResolution?.();let dx=Math.abs(resolution?.[0]||100),dy=Math.abs(resolution?.[1]||100);
 // 經緯度型 GeoTIFF：近似轉成公尺供局部教學圖使用；正式 GIS 精度仍需先在 QGIS 投影。
 const bbox=img.getBoundingBox?.();if(dx<1&&dy<1&&bbox&&Math.abs(bbox[1])<=90&&Math.abs(bbox[3])<=90){
  const lat=(bbox[1]+bbox[3])/2;dx=dx*111320*Math.cos(lat*Math.PI/180);dy=dy*111320;
 }
 r=cropResample(values,sw,sh,dx,dy);
 }else throw Error('不支援此檔案格式');remember();state={base:r.base,objects:[],widthM:r.widthM||16000,heightM:r.heightM||r.widthM*NY/NX||9600,source:'本機匯入｜'+file.name,sourceURL:'',real:true};chooseStamp(null);refresh();msg('高程資料已匯入。注意 GeoTIFF 若為經緯度 CRS，水平公尺比例須先用 QGIS 重新投影；若是 GeoTIFF 多波段，請使用第一波段高程。');}catch(err){msg('匯入失敗：'+err.message);}e.target.value='';};
refresh();msg('平面編輯器已就緒。正在載入 Three.js 3D 引擎…');
async function init3D(){try{
 const [lib,orbit,exporter]=await Promise.all([import('three'),import('three/addons/controls/OrbitControls.js'),import('three/addons/exporters/GLTFExporter.js')]);
 THREE=lib;OrbitControls=orbit.OrbitControls;GLTFExporter=exporter.GLTFExporter;
 build3D();updateTerrain();update3DContours();msg('3D 模型已就緒。先選擇地形積木，再點擊地圖或 3D 模型放置。');
}catch(err){msg('2D 功能正常，但 3D 套件載入失敗：'+err.message+'。請檢查外部 CDN 連線。');$('three-placeholder').textContent='3D 未能載入：請檢查 Three.js CDN 網路連線';}}
init3D();
