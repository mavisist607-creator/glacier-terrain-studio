let THREE, OrbitControls, GLTFExporter; // 非同步載入，2D 編輯器可在 3D 套件載入失敗時繼續使用
import {NX,NY,TYPES,GEOMETRY_TYPES,clamp,lerp,fmt,newShape,emptyBase,boundaryBase,bilinear,influence,resample,cropResample,applyShapes,rangeOf,eachContour,demo,parseASC,exportASC} from './terrain-core.js?v=4.3';

const $=id=>document.getElementById(id), map=$('map'),ctx=map.getContext('2d',{willReadFrequently:true});
let state=demo(),height=new Float32Array(NX*NY),selected=null,placeType=null,brushMode=null,brushPoint=null,mapMode='contours',viewMode='now',show3DContours=false,showStamps=true,history=[],future=[],refreshTimer=0;
let renderer,scene,camera,controls,terrainMesh,linesGroup,raycaster,markersGroup,waterGroup,placementGhost;
let miniRenderer,miniScene,miniCamera,miniMesh,miniFrame=0;
let orbitMode=false, viewReady=false, ghostRange=null, geometryOperation='deposit', prefabPage='geometry';
let WORLD_W=10,WORLD_D=10*state.heightM/state.widthM;
function msg(t){$('status').textContent=t;}
function snapshot(){return {objects:structuredClone(state.objects),base:Array.from(state.base),source:state.source,sourceURL:state.sourceURL,real:state.real,widthM:state.widthM,heightM:state.heightM,smooth:state.smooth??2,lockBoundary:$('lock-boundary').checked,baseThickness:Number($('base-thickness').value)};}
function remember(){history.push(snapshot());if(history.length>28)history.shift();future=[];}
function restore(s){state={...s,base:Float32Array.from(s.base)};for(const item of state.objects){if(GEOMETRY_TYPES.has(item.type)){item.operation=item.operation||((item.height||0)<0?'erode':'deposit');item.height=Math.abs(item.height);}}selected=null;brushMode=null;chooseStamp(null);if(s.lockBoundary!==undefined)$('lock-boundary').checked=s.lockBoundary;if(s.baseThickness!==undefined)$('base-thickness').value=s.baseThickness;syncUI();refresh(true);}
function syncSettings(){state.smooth=Number($('smooth').value);state.interval=Number($('interval').value);state.zscale=Number($('z-scale').value);}
function recalc(){syncSettings();WORLD_D=WORLD_W*state.heightM/state.widthM;
 const targetCanvasHeight=Math.max(100,Math.round(map.width*state.heightM/state.widthM));
 if(map.height!==targetCanvasHeight){map.height=targetCanvasHeight; const mapWrap=map.closest(".map-wrap");if(mapWrap)mapWrap.style.aspectRatio=String(state.widthM/state.heightM);}
 height=applyShapes(state.base,state.objects,state.smooth);
 if($('lock-boundary').checked){for(let i=0;i<NX;i++){height[i]=state.base[i];height[(NY-1)*NX+i]=state.base[(NY-1)*NX+i];}for(let j=0;j<NY;j++){height[j*NX]=state.base[j*NX];height[j*NX+NX-1]=state.base[j*NX+NX-1];}}
 const r=rangeOf(height);ghostRange=r;const cell=state.widthM/(NX-1),cellY=state.heightM/(NY-1);$('range-info').textContent=`高程 ${fmt(r.min)}～${fmt(r.max)} m｜格網 ${NX}×${NY}（每格約 ${fmt(cell)} × ${fmt(cellY)} m）｜積木 ${state.objects.length} 件`;
 $('extent-info').textContent=`場景：${(state.widthM/1000).toFixed(1)} × ${(state.heightM/1000).toFixed(1)} km；國家公園尺度僅代表觀察範圍，不包含實際園區界線。`;
 $('map-scale').textContent=`東西 ${Math.round(state.widthM/1000)} km × 南北 ${Math.round(state.heightM/1000)} km`;}
function syncUI(){ $('smooth').value=state.smooth??2;$('smooth-o').textContent=$('smooth').value+' 次';$('z-scale').value=state.zscale??1.5;$('z-o').textContent=$('z-scale').value+'×';$('base-thickness-o').textContent=$('base-thickness').value;showBrushOutputs();}

function refresh(full=true){clearTimeout(refreshTimer);recalc();drawMap();if(full){updateTerrain();update3DContours();}updateList();updateEditor();$('source-label').textContent='來源：'+state.source;}
function schedule(){clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>refresh(true),65);}
function setActiveButtons(group,current){group.forEach(id=>$(id).classList.toggle('active',id===current));}
// 模型選單的縮圖，並非只有一個文字符號；縮圖顯示此積木的主要立體輪廓。
const PREFAB_STYLE={cone:['#dcc6a1','#a88a62'],sphere:['#a6c5af','#648e74'],box:['#dfc8ae','#aa906f'],cylinder:['#bdc7b0','#84947b'],mountain:['#d4b68b','#ad8560'],horn:['#c8d0d5','#738998'],ridge:['#a9bc9e','#6b866e'],cirque:['#b4ced0','#638c9a'],valley:['#c6cd9b','#73956b'],roche:['#a7a7a2','#5c696d'],drumlin:['#b1c88c','#6d9060'],esker:['#dbc397','#9e7d57'],moraine:['#c7a879','#947149'],outwash:['#c8d6ae','#86a576'],dune:['#e4c78e','#b99253']};
function tileSVG(type){
 const [top,side]=PREFAB_STYLE[type]||PREFAB_STYLE.mountain;
 const path=type==='mountain'||type==='horn'?'M10 38 L43 6 L78 38 Z':
    type==='cone'?'M12 38 Q44 44 78 38 L44 7 Z':
    type==='sphere'?'M10 38 A34 29 0 0 1 78 38 Z':
    type==='box'?'M12 21 L57 12 L79 22 L79 39 L32 42 L12 34 Z':
    type==='cylinder'?'M13 21 Q45 10 78 21 L78 36 Q45 47 13 36 Z':
   type==='ridge'?'M8 37 L27 28 L38 14 L67 21 L80 38 Z':
   type==='cirque'?'M10 24 Q43 47 79 24 Q66 12 56 15 Q43 26 31 15 Q19 10 10 24 Z':
   type==='valley'?'M8 13 Q25 40 43 39 Q62 40 81 13 L81 38 L8 38 Z':
   type==='roche'||type==='drumlin'?'M10 37 Q12 17 36 17 Q65 11 80 37 Z':
   type==='esker'?'M8 34 Q20 13 38 27 T76 21 L81 37 Q61 29 43 39 T8 34 Z':
   type==='moraine'?'M10 35 Q25 9 45 18 Q66 14 80 35 L80 40 L10 40 Z':
   type==='outwash'?'M10 29 L47 18 L80 29 L80 39 L10 39 Z':
   'M10 36 Q23 11 47 19 Q65 14 80 36 Z';
 return `<svg viewBox="0 0 90 48" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><ellipse cx="45" cy="41" rx="38" ry="5" fill="#b0babb" opacity=".24"/><path d="${path}" fill="${top}" stroke="${side}" stroke-width="1.5" stroke-linejoin="round"/><path d="M10 38 L43 6 L43 38 Z" fill="${side}" opacity="${type==='mountain'?'.38':'0'}"/></svg>`;
}
function decoratePrefabButtons(){
 document.querySelectorAll('#stamp-grid [data-type]').forEach(b=>{
  const type=b.dataset.type;
  b.innerHTML=`<span class="prefab-tile">${tileSVG(type)}</span><span class="prefab-name">${TYPES[type].name}</span>`;
  b.title=TYPES[type].info;
 });
}
decoratePrefabButtons();
function setPrefabPage(page){
 if(!['geometry','landforms'].includes(page))return;
 prefabPage=page;
 $('page-geometry').hidden=page!=='geometry';$('page-landforms').hidden=page!=='landforms';
 $('geometry-operation-row').hidden=page!=='geometry';
 for(const [id,which] of [['tab-geometry','geometry'],['tab-landforms','landforms']]){
  const active=page===which;$(id).classList.toggle('active',active);$(id).setAttribute('aria-selected',String(active));
 }
 if(placeType && (GEOMETRY_TYPES.has(placeType)!==(page==='geometry')))chooseStamp(null);
}
$('tab-geometry').onclick=()=>setPrefabPage('geometry');
$('tab-landforms').onclick=()=>setPrefabPage('landforms');
$('geometry-operation').onchange=e=>{geometryOperation=e.target.value;updatePrefabDescription(placeType);msg(geometryOperation==='deposit'?'幾何圖形將堆積抬升地表。':'幾何圖形將侵蝕下切地表。');};
function operationLabel(op){return op==='erode'?'侵蝕／下切':'堆積／抬升';}
function updatePrefabDescription(type){
 const t=TYPES[type];
 $('prefab-name').textContent=t?.name||'選擇地形積木';
 $('prefab-subtitle').textContent=t?(GEOMETRY_TYPES.has(type)?`3D 幾何原型 · ${operationLabel(geometryOperation)}`:'3D 地形原型 · 滑過模型可定位'):'選擇積木後，在這裡旋轉預覽';
 $('prefab-description').textContent=t?(GEOMETRY_TYPES.has(type)?`【${operationLabel(geometryOperation)}】${t.info}`:t.info):'先選擇一個地形積木，觀看原型，再放到立體地表上。';
 refreshMiniPrefab(type);
 refreshPlacementGhost(null);
}
function chooseStamp(type){if(type)setPrefabPage(GEOMETRY_TYPES.has(type)?'geometry':'landforms');placeType=type;brushMode=null;orbitMode=false;selected=null;document.querySelectorAll('[data-brush]').forEach(b=>b.classList.remove('active'));document.querySelectorAll('[data-type]').forEach(x=>x.classList.toggle('active',x.dataset.type===type));$('btn-select').classList.toggle('selected',!type);$('btn-orbit').classList.remove('selected');$('map-hint').textContent=type?`放置 ${TYPES[type].name}：點擊地圖或 3D 模型`:'選取模型上的圓形控制點後拖曳，可移動積木；拖曳空白處可旋轉';$('stage-tip').textContent=type?`移動到地表查看「${TYPES[type].name}」透明預覽，點擊後融合成地形`:'選取圓點移動積木；拖曳空白處旋轉';updatePrefabDescription(type);updateEditor();}
function chooseBrush(mode){placeType=null;brushMode=mode;orbitMode=false;selected=null;document.querySelectorAll('[data-type]').forEach(b=>b.classList.remove('active'));document.querySelectorAll('[data-brush]').forEach(b=>b.classList.toggle('active',b.dataset.brush===mode));$('btn-select').classList.remove('selected');$('btn-orbit').classList.remove('selected');$('map-hint').textContent='手繪模式：可在 2D 或 3D 地表拖曳';$('stage-tip').textContent='手繪模式｜在 3D 地表拖曳，轉動請先切換「旋轉觀察」';refreshPlacementGhost(null);updateEditor();drawMap();}
function showBrushOutputs(){$('brush-radius-o').textContent=Number($('brush-radius').value).toFixed(1)+' km';$('brush-strength-o').textContent=$('brush-strength').value+' m';}
function brushAt(u,v){const radius=Number($('brush-radius').value),strength=Number($('brush-strength').value),target=Number($('brush-target').value)||0;
 const radX=radius*1000/state.widthM,radY=radius*1000/state.heightM;
 const i0=Math.max(0,Math.floor((u-radX)*(NX-1))),i1=Math.min(NX-1,Math.ceil((u+radX)*(NX-1)));
 const j0=Math.max(0,Math.floor((v-radY)*(NY-1))),j1=Math.min(NY-1,Math.ceil((v+radY)*(NY-1)));
 const original=brushMode==='smooth'?new Float32Array(state.base):null;
 for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){
  if($('lock-boundary').checked&&(i===0||j===0||i===NX-1||j===NY-1))continue;
  const dx=(i/(NX-1)-u)*state.widthM/1000,dy=(j/(NY-1)-v)*state.heightM/1000,dist=Math.hypot(dx,dy);
  if(dist>=radius)continue;const w=(1-dist/radius)**2,k=j*NX+i;
  if(brushMode==='raise')state.base[k]+=strength*.35*w;
  if(brushMode==='lower')state.base[k]-=strength*.35*w;
  if(brushMode==='flatten')state.base[k]=lerp(state.base[k],target,Math.min(.95,.55*w));
  if(brushMode==='smooth'){
   const left=original[j*NX+Math.max(0,i-1)],right=original[j*NX+Math.min(NX-1,i+1)],up=original[Math.max(0,j-1)*NX+i],down=original[Math.min(NY-1,j+1)*NX+i];
   const avg=(original[k]*2+left+right+up+down)/6;
   state.base[k]=lerp(original[k],avg,Math.min(1,w*.8));
  }
 }
}
function brushLine(a,b){const r=Number($('brush-radius').value),d=Math.hypot((a[0]-b[0])*state.widthM/1000,(a[1]-b[1])*state.heightM/1000);
 const pieces=Math.min(50,Math.max(1,Math.ceil(d/Math.max(.15,r*.35))));
 for(let n=1;n<=pieces;n++)brushAt(lerp(a[0],b[0],n/pieces),lerp(a[1],b[1],n/pieces));
}

function selectShape(id){selected=id;chooseStamp(null);selected=id;updateList();updateEditor();updateMarkers();}
function addShape(u,v){if(!placeType)return;remember();const shape=newShape(placeType,clamp(u,.01,.99),clamp(v,.01,.99));if(GEOMETRY_TYPES.has(shape.type))shape.operation=geometryOperation;state.objects.push(shape);selectShape(shape.id);refresh();msg(`已新增「${TYPES[shape.type].name}」。拖曳地圖上的圓點或右側調整尺寸。`);}
function updateList(){$('shape-count').textContent=state.objects.length;const root=$('shape-list');root.innerHTML='';for(const s of [...state.objects].reverse()){const b=document.createElement('button');b.textContent=`${TYPES[s.type].name}${GEOMETRY_TYPES.has(s.type)?'｜'+(s.operation==='erode'?'侵蝕':'堆積'):''} · ${fmt(Math.abs(s.height))} m`;b.classList.toggle('current',s.id===selected);b.onclick=()=>selectShape(s.id);root.appendChild(b);}}
function selectedShape(){return state.objects.find(s=>s.id===selected);}
function updateEditor(){
 const s=selectedShape();$('editor').hidden=!s;$('no-selection').hidden=!!s;
 $('shape-operation-row').hidden=!s||!GEOMETRY_TYPES.has(s.type);
 if(!s)return;
 $('selected-name').textContent=TYPES[s.type].name;
 $('selected-typehint').textContent=TYPES[s.type].info;
 if(GEOMETRY_TYPES.has(s.type)){
   $('shape-operation').value=s.operation||'deposit';$('height').min=10;$('height').max=2500;$('height').step=10;
 }else{$('height').min=-1200;$('height').max=2500;$('height').step=10;}
 for(const id of ['height','width','length','angle','soft'])$(id).value=s[id==='width'?'w':id==='length'?'l':id];showOutput();
}
function showOutput(){$('height-o').textContent=$('height').value+' m';$('width-o').textContent=(Number($('width').value)*state.widthM/1000).toFixed(2)+' km';$('length-o').textContent=(Number($('length').value)*state.heightM/1000).toFixed(2)+' km';$('angle-o').textContent=$('angle').value+'°';$('soft-o').textContent=$('soft').value;}
let drag=null,moved=false,painting=null;
function mapUV(e){const rect=map.getBoundingClientRect();return [clamp((e.clientX-rect.left)/rect.width,0,1),clamp((e.clientY-rect.top)/rect.height,0,1)];}
function hit(u,v){let best=null,d=.035;for(let i=state.objects.length-1;i>=0;i--){const s=state.objects[i],ds=Math.hypot((s.x-u)*1.3,s.y-v);if(ds<d){best=s;d=ds;}}return best;}
map.addEventListener('pointerdown',e=>{if(e.button!==0)return;map.setPointerCapture(e.pointerId);const [u,v]=mapUV(e);if(brushMode){remember();painting=[u,v];brushPoint=[u,v];brushAt(u,v);schedule();return;}if(placeType){addShape(u,v);return;}const s=hit(u,v);if(s){if(selected!==s.id)selectShape(s.id);remember();drag={id:s.id,ox:u-s.x,oy:v-s.y};moved=false;}else{selected=null;updateList();updateEditor();drawMap();}});
map.addEventListener('pointermove',e=>{if(brushMode){const uv=mapUV(e);brushPoint=uv;if(painting){brushLine(painting,uv);painting=uv;schedule();}else drawMap();return;}if(!drag)return;const s=state.objects.find(x=>x.id===drag.id);if(!s)return;const [u,v]=mapUV(e);s.x=clamp(u-drag.ox,.005,.995);s.y=clamp(v-drag.oy,.005,.995);moved=true;schedule();});
map.addEventListener('pointerup',()=>{if(painting){painting=null;refresh();msg('已完成一筆手繪塑形，可撤銷。');}if(drag){drag=null;refresh();}});map.addEventListener('pointercancel',()=>{drag=null;painting=null;});map.addEventListener('pointerleave',()=>{brushPoint=null;if(!painting)drawMap();});
for(const typeBtn of document.querySelectorAll('[data-type]'))typeBtn.onclick=()=>chooseStamp(typeBtn.dataset.type);
$('btn-select').onclick=()=>chooseStamp(null);$('btn-orbit').onclick=()=>{chooseStamp(null);orbitMode=true;$('btn-select').classList.remove('selected');$('btn-orbit').classList.add('selected');$('stage-tip').textContent='旋轉觀察｜拖曳旋轉視角，滾輪縮放';};for(const b of document.querySelectorAll('[data-brush]'))b.onclick=()=>chooseBrush(b.dataset.brush);for(const id of ['brush-radius','brush-strength'])$(id).oninput=()=>{showBrushOutputs();drawMap();};
for(const id of ['height','width','length','angle','soft']){$(id).addEventListener('pointerdown',()=>{if(selectedShape())remember();},{passive:true});$(id).addEventListener('input',()=>{const s=selectedShape();if(!s)return;s[id==='width'?'w':id==='length'?'l':id]=Number($(id).value);showOutput();schedule();});}
$('shape-operation').onchange=()=>{
 const s=selectedShape();if(!s||!GEOMETRY_TYPES.has(s.type))return;
 remember();s.operation=$('shape-operation').value;geometryOperation=s.operation;$('geometry-operation').value=geometryOperation;
 refresh();msg(`已把「${TYPES[s.type].name}」設為${operationLabel(s.operation)}。`);
};
$('btn-delete').onclick=()=>{if(!selectedShape())return;remember();state.objects=state.objects.filter(x=>x.id!==selected);selected=null;refresh();};
$('btn-duplicate').onclick=()=>{const s=selectedShape();if(!s)return;remember();const copy={...s,id:newShape(s.type).id,x:clamp(s.x+.04,0,1),y:clamp(s.y+.035,0,1)};state.objects.push(copy);selectShape(copy.id);refresh();};
$('btn-undo').onclick=()=>{if(!history.length)return;future.push(snapshot());restore(history.pop());msg('已撤銷上一步。');};
$('btn-map-toggle').onclick=()=>{$('map-popup').hidden=!$('map-popup').hidden;drawMap();};$('btn-map-close').onclick=()=>{$('map-popup').hidden=true;};function resetCamera(){if(camera&&controls){camera.position.set(10,Math.max(8,WORLD_D*.95),14+Math.max(0,WORLD_D-6)*.35);controls.target.set(0,1.1,0);controls.update();}}
$('btn-reset-view').onclick=resetCamera;
$('btn-demo').onclick=()=>{remember();state=demo();chooseStamp(null);refresh();resetCamera();msg('已載入虛構冰河地景（23×18 km），可手繪與放置地形積木。');};
$('btn-blank').onclick=()=>{remember();const widthM=Number($('extent-preset').value),heightM=Number($('extent-height').value)*1000;state={...demo(),base:emptyBase(600,0),objects:[],widthM,heightM,source:'虛構平坦地表（海拔 600m）',real:false};chooseStamp(null);refresh();resetCamera();msg('已建立平坦地表。也能先用四角高程建立坡地。');};
$('btn-equal-boundary').onclick=()=>{const h=Number($('boundary-all').value);if(!Number.isFinite(h))return;for(const id of ['boundary-nw','boundary-ne','boundary-sw','boundary-se'])$(id).value=h;};
$('btn-create').onclick=()=>{
 const vals=['boundary-nw','boundary-ne','boundary-sw','boundary-se'].map(id=>Number($(id).value));if(vals.some(v=>!Number.isFinite(v))){msg('請輸入有效的四角高程。');return;}
 const widthM=Number($('extent-preset').value),heightM=Number($('extent-height').value)*1000;
 if(!(heightM>=1000&&heightM<=250000)){msg('南北範圍請設定在 1～250 公里。');return;}
 if(state.objects.length&&!confirm('這會清除目前的積木及手繪地形，確定建立新地表？'))return;
 remember();state={...demo(),base:boundaryBase(...vals),objects:[],widthM,heightM,source:'虛構地表｜四角邊界高程建模',sourceURL:'',real:false};
 chooseStamp(null);refresh();resetCamera();msg(`已依四角高度 ${vals.join('/')} m 建立 ${widthM/1000} × ${heightM/1000} km 地形。`);
};
const presetHeights={18000:23,23000:18,20000:12,40000:30,50000:30,80000:48,120000:72,180000:108};
$('extent-preset').onchange=()=>{ $('extent-height').value=presetHeights[$('extent-preset').value]||18;msg('已選擇場景尺寸；按「依邊界高度建立新地表」套用。');};
$('lock-boundary').onchange=()=>refresh();
$('base-thickness').oninput=()=>{$('base-thickness-o').textContent=$('base-thickness').value;updateTerrain();};

$('smooth').oninput=()=>{$('smooth-o').textContent=$('smooth').value+' 次';schedule();};
$('z-scale').oninput=()=>{$('z-o').textContent=$('z-scale').value+'×';updateTerrain();update3DContours();};
$('interval').onchange=()=>refresh();
$('contours-overlay').onchange=()=>{show3DContours=$('contours-overlay').checked;update3DContours();};$('water-overlay').onchange=()=>updateWater();$('markers-overlay').onchange=()=>updateMarkers();
$('show-stamps').onchange=()=>{showStamps=$('show-stamps').checked;drawMap();};
for(const id of ['map-contours','map-elev','map-change'])$(id).onclick=()=>{mapMode={ 'map-contours':'contours','map-elev':'elev','map-change':'change'}[id];setActiveButtons(['map-contours','map-elev','map-change'],id);drawMap();};
for(const id of ['view-now','view-before','view-diff'])$(id).onclick=()=>{viewMode={'view-now':'now','view-before':'before','view-diff':'diff'}[id];setActiveButtons(['view-now','view-before','view-diff'],id);updateTerrain();update3DContours();};
function renderBackdrop(target,mode='contours',labels=true){const c=target.canvas,w=c.width,h=c.height;target.clearRect(0,0,w,h);const pad=mode==='print'?{l:90,t:130,r:60,b:170}:{l:0,t:0,r:0,b:0};let area={x:pad.l,y:pad.t,w:w-pad.l-pad.r,h:h-pad.t-pad.b};if(mode==='print'){const ratio=state.widthM/state.heightM;if(area.w/area.h>ratio){const old=area.w;area.w=area.h*ratio;area.x+=(old-area.w)/2;}else{const old=area.h;area.h=area.w/ratio;area.y+=(old-area.h)/2;}}const r=rangeOf(height),br=rangeOf(state.base),deltaMax=Math.max(25,Math.max(Math.abs(r.max-br.min),Math.abs(r.min-br.max)));const sw=NX,sh=NY;
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
function drawMap(){const area=renderBackdrop(ctx,mapMode);if(brushMode&&brushPoint){const rx=Number($('brush-radius').value)*1000/state.widthM*map.width,ry=Number($('brush-radius').value)*1000/state.heightM*map.height;ctx.beginPath();ctx.ellipse(brushPoint[0]*map.width,brushPoint[1]*map.height,rx,ry,0,0,Math.PI*2);ctx.strokeStyle='#ca6327';ctx.lineWidth=2;ctx.setLineDash([6,4]);ctx.stroke();ctx.setLineDash([]);}if(!showStamps)return;for(const s of state.objects){const px=s.x*map.width,py=s.y*map.height;ctx.beginPath();ctx.ellipse(px,py,Math.max(5,s.w*map.width*.6),Math.max(5,s.l*map.height*.65),s.angle*Math.PI/180,0,2*Math.PI);ctx.strokeStyle=s.id===selected?'#e27039':'#3b8393aa';ctx.lineWidth=s.id===selected?3:1.4;ctx.setLineDash([5,5]);ctx.stroke();ctx.setLineDash([]);ctx.beginPath();ctx.arc(px,py,s.id===selected?9:6,0,Math.PI*2);ctx.fillStyle=s.id===selected?'#e57040':'#255d6d';ctx.fill();ctx.fillStyle='#15364a';ctx.font='bold 14px system-ui';ctx.fillText(TYPES[s.type].name,px+10,py-9);}}
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
function geometryFor(arr,mode=viewMode){
 const active=mode==='before'?state.base:arr,base=state.base,r=rangeOf(active),rr=rangeOf(height),zEx=Number($('z-scale').value),factor=2.7/Math.max(300,rr.span)*zEx;
 const positions=new Float32Array(NX*NY*3),colors=new Float32Array(NX*NY*3),idx=[];let z0=rr.min;
 for(let j=0;j<NY;j++)for(let i=0;i<NX;i++){
  const k=j*NX+i,x=i/(NX-1),y=j/(NY-1),el=active[k],hh=(el-z0)*factor;
  positions[3*k]=(x-.5)*WORLD_W;positions[3*k+1]=hh;positions[3*k+2]=(y-.5)*WORLD_D;let col;
  if(mode==='diff'){
   const d=height[k]-base[k],t=clamp(Math.abs(d)/250,0,1);
   col=d>=0?new THREE.Color().setRGB(lerp(.88,.98,t),lerp(.9,.48,t),lerp(.78,.27,t)):new THREE.Color().setRGB(lerp(.85,.19,t),lerp(.90,.57,t),lerp(.93,.83,t));
  } else col=shadedTerrainColor(active,i,j,rr.min,rr.span,factor);
  colors[3*k]=col.r;colors[3*k+1]=col.g;colors[3*k+2]=col.b;
 }
 for(let j=0;j<NY-1;j++)for(let i=0;i<NX-1;i++){const k=j*NX+i;idx.push(k,k+NX,k+1,k+1,k+NX,k+NX+1);}
 // 封閉幾何：地形上表面＋四周側壁＋底面，GLB 不再是單層薄片。
 const vertices=Array.from(positions),vertexColors=Array.from(colors),indices=idx;
 const thickness=Number($('base-thickness').value),floorY=-thickness;
 const addVertex=(x,y,z,col)=>{const id=vertices.length/3;vertices.push(x,y,z);vertexColors.push(...col);return id;};
 const loop=[];
 for(let i=0;i<NX;i++)loop.push(i);
 for(let j=1;j<NY;j++)loop.push(j*NX+NX-1);
 for(let i=NX-2;i>=0;i--)loop.push((NY-1)*NX+i);
 for(let j=NY-2;j>=1;j--)loop.push(j*NX);
 // 地層色帶是教學示意，不代表真實岩層厚度或地質層序
 const colorsOfBands=[[.69,.53,.31],[.88,.73,.48],[.77,.58,.34],[.65,.45,.26],[.54,.38,.27],[.48,.34,.24]];
 const steps=[0,.05,.23,.46,.70,.88,1];
 for(let n=0;n<loop.length;n++){
  const a=loop[n],b=loop[(n+1)%loop.length],A=a*3,B=b*3;
  const topY1=positions[A+1],topY2=positions[B+1];
  for(let band=0;band<steps.length-1;band++){
   const f0=steps[band],f1=steps[band+1],c=colorsOfBands[band];
   const yA0=lerp(topY1,floorY,f0),yB0=lerp(topY2,floorY,f0);
   const yA1=lerp(topY1,floorY,f1),yB1=lerp(topY2,floorY,f1);
   const v0=addVertex(positions[A],yA0,positions[A+2],c);
   const v1=addVertex(positions[B],yB0,positions[B+2],c);
   const v2=addVertex(positions[A],yA1,positions[A+2],c);
   const v3=addVertex(positions[B],yB1,positions[B+2],c);
   indices.push(v0,v1,v2,v1,v3,v2);
  }
 }
 const bottom=[
  addVertex(-WORLD_W/2,floorY,-WORLD_D/2,[.25,.22,.19]),
  addVertex(WORLD_W/2,floorY,-WORLD_D/2,[.25,.22,.19]),
  addVertex(WORLD_W/2,floorY,WORLD_D/2,[.25,.22,.19]),
  addVertex(-WORLD_W/2,floorY,WORLD_D/2,[.25,.22,.19])];
 indices.push(bottom[0],bottom[1],bottom[2],bottom[0],bottom[2],bottom[3]);
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setAttribute('color',new THREE.Float32BufferAttribute(vertexColors,3));g.setIndex(indices);g.computeVertexNormals();return g;
}
// 用與建模核心相同的影響函式，繪製可旋轉的立體積木縮小模型。
function prefabGeometry(type){
 const s={type,x:.5,y:.5,w:.23,l:.23,height:1,angle:0,soft:.25};
 const n=40,verts=[],cols=[],inds=[];
 for(let j=0;j<=n;j++)for(let i=0;i<=n;i++){
  const u=i/n,v=j/n,el=influence(s,u,v);
  verts.push((u-.5)*2.6,el*.98,(v-.5)*2.6);
  const green=el>=0?[.50,.67,.49]:[.56,.77,.81];
  const t=clamp(Math.abs(el),0,1);
  cols.push(lerp(.68,green[0],t),lerp(.64,green[1],t),lerp(.49,green[2],t));
 }
 for(let j=0;j<n;j++)for(let i=0;i<n;i++){
  const k=j*(n+1)+i;inds.push(k,k+n+1,k+1,k+1,k+n+1,k+n+2);
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));g.setAttribute('color',new THREE.Float32BufferAttribute(cols,3));g.setIndex(inds);g.computeVertexNormals();return g;
}
function initMiniPreview(){
 if(!THREE)return;
 const root=$('prefab-preview');
 miniRenderer=new THREE.WebGLRenderer({antialias:true,alpha:true});miniRenderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));
 miniRenderer.outputColorSpace=THREE.SRGBColorSpace;root.appendChild(miniRenderer.domElement);
 miniScene=new THREE.Scene();miniScene.background=new THREE.Color('#e3edf0');
 miniCamera=new THREE.PerspectiveCamera(42,1,.1,40);miniCamera.position.set(3.1,2.9,3.6);miniCamera.lookAt(0,.15,0);
 miniScene.add(new THREE.HemisphereLight(0xf4faff,0xa3a399,2));const light=new THREE.DirectionalLight(0xffeed8,2.1);light.position.set(-4,7,6);miniScene.add(light);
 function size(){const r=root.getBoundingClientRect();miniRenderer.setSize(Math.max(50,r.width),Math.max(50,r.height),false);miniCamera.aspect=r.width/Math.max(1,r.height);miniCamera.updateProjectionMatrix();}
 size();new ResizeObserver(size).observe(root);refreshMiniPrefab(placeType);
}
function refreshMiniPrefab(type){
 if(!miniScene||!THREE)return;
 if(miniMesh){miniScene.remove(miniMesh);miniMesh.geometry.dispose();miniMesh.material.dispose();miniMesh=null;}
 if(!type){$('prefab-fallback').style.display='flex';return;}
 $('prefab-fallback').style.display='none';
 const geometric=GEOMETRY_TYPES.has(type),op=geometryOperation;
 const geometry=geometric?primitiveGeometry(type):prefabGeometry(type);
 const material=geometric?new THREE.MeshStandardMaterial({color:op==='erode'?0xc87959:0x97b3a0,roughness:.78,side:THREE.DoubleSide}):new THREE.MeshStandardMaterial({vertexColors:true,roughness:.87,side:THREE.DoubleSide});
 miniMesh=new THREE.Mesh(geometry,material);
 if(geometric){miniMesh.scale.set(.85,op==='erode'?-.85:.85,.85);miniMesh.position.y=op==='erode'?.2:0;}
 miniScene.add(miniMesh);
}
function primitiveGeometry(type){
 if(type==='mountain'){
  // 三角形底面、三角形側面的三角錐，與高程函式的同一原型。
  const vertices=[0,1,-.2, -1,0,-.8, 1,0,-.8, 0,0,1];
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex([0,1,2,0,2,3,0,3,1,1,3,2]);g.computeVertexNormals();return g;
 }
 if(type==='cone'){const g=new THREE.ConeGeometry(1,1,40);g.translate(0,.5,0);return g;}
 if(type==='sphere'){return new THREE.SphereGeometry(1,32,20,0,Math.PI*2,0,Math.PI/2);}
 if(type==='box'){const g=new THREE.BoxGeometry(2,1,2);g.translate(0,.5,0);return g;}
 if(type==='cylinder'){const g=new THREE.CylinderGeometry(1,1,1,40);g.translate(0,.5,0);return g;}
 return null;
}
function ghostGeometry(type){return primitiveGeometry(type)||prefabGeometry(type);}
function refreshPlacementGhost(uv){
 if(!scene||!THREE)return;
 if(!uv||!placeType||viewMode!=='now'){
  if(placementGhost)placementGhost.visible=false;
  return;
 }
 if(!placementGhost||placementGhost.userData.type!==placeType){
  if(placementGhost){scene.remove(placementGhost);placementGhost.geometry.dispose();placementGhost.material.dispose();}
  const geom=ghostGeometry(placeType);
  const mat=new THREE.MeshStandardMaterial({color:0x47c9e2,side:THREE.DoubleSide,transparent:true,opacity:.46,roughness:.6,depthWrite:false,depthTest:false});
  placementGhost=new THREE.Mesh(geom,mat);
  placementGhost.userData.type=placeType;
  placementGhost.renderOrder=3;
  scene.add(placementGhost);
 }
 const prototype=TYPES[placeType],rr=ghostRange||rangeOf(height),factor=2.7/Math.max(300,rr.span)*Number($('z-scale').value);
 const h=bilinear(height,NX,NY,...uv);
 const sx=prototype.w*WORLD_W,sz=prototype.l*WORLD_D;
 if(GEOMETRY_TYPES.has(placeType)){
  const sign=geometryOperation==='erode'?-1:1;
  placementGhost.scale.set(sx,sign*Math.max(.18,Math.abs(prototype.height)*factor),sz);
  placementGhost.material.color.set(geometryOperation==='erode'?0xe99655:0x47c9e2);
  placementGhost.rotation.y=-prototype.angle*Math.PI/180;
 }else{
  placementGhost.scale.set(sx*2,Math.max(.12,Math.abs(prototype.height)*factor),sz*2);
  placementGhost.rotation.y=0;
 }
 placementGhost.position.set((uv[0]-.5)*WORLD_W,(h-rr.min)*factor+.025,(uv[1]-.5)*WORLD_D);
 placementGhost.visible=true;
}
function pickTerrain(e){if(!renderer||!terrainMesh)return null;
 const rect=renderer.domElement.getBoundingClientRect();
 const p=new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);
 raycaster.setFromCamera(p,camera);
 const markerHit=markersGroup?.visible?raycaster.intersectObjects(markersGroup.children,false)[0]:null;
 const surfaceHit=raycaster.intersectObject(terrainMesh,false)[0];
 let uv=null;
 if(surfaceHit){const q=surfaceHit.point;uv=[clamp(q.x/WORLD_W+.5,0,1),clamp(q.z/WORLD_D+.5,0,1)];}
 return {uv,marker:markerHit?.object.userData?.shapeId||null};
}
function shapeAt3D(uv){if(!uv)return null;let found=null,dist=.042;for(let i=state.objects.length-1;i>=0;i--){const s=state.objects[i],d=Math.hypot((uv[0]-s.x)*1.1,uv[1]-s.y);if(d<dist){dist=d;found=s;}}return found;}
function updateMarkers(){if(!markersGroup||!THREE)return;
 for(const child of [...markersGroup.children]){markersGroup.remove(child);child.geometry.dispose();child.material.dispose();}
 markersGroup.visible=$('markers-overlay').checked && viewMode!=='before';if(!markersGroup.visible)return;
 const r=rangeOf(height),scale=2.7/Math.max(300,r.span)*Number($('z-scale').value);
 for(const s of state.objects){const h=bilinear(height,NX,NY,s.x,s.y);const marker=new THREE.Mesh(new THREE.SphereGeometry(.11,10,8),new THREE.MeshStandardMaterial({color:s.id===selected?0xf18c33:0x1d6f83,roughness:.45,emissive:s.id===selected?0x542500:0x072a35,emissiveIntensity:.25}));
 marker.position.set((s.x-.5)*WORLD_W,(h-r.min)*scale+.13,(s.y-.5)*WORLD_D);marker.userData.shapeId=s.id;markersGroup.add(marker);}
}
function waterRibbon(path,width=.045,color=0x3ab4dd){const pos=[],tri=[];const r=rangeOf(height),factor=2.7/Math.max(300,r.span)*Number($('z-scale').value);
 for(let n=0;n<path.length;n++){const [u,v]=path[n];let du,dv;if(n===0){du=path[1][0]-u;dv=path[1][1]-v;}else if(n===path.length-1){du=u-path[n-1][0];dv=v-path[n-1][1];}else{du=path[n+1][0]-path[n-1][0];dv=path[n+1][1]-path[n-1][1];}
 const len=Math.hypot(du*WORLD_W,dv*WORLD_D)||1;const ox=-dv*WORLD_D/len*width/WORLD_W,oy=du*WORLD_W/len*width/WORLD_D;
 for(const sign of [-1,1]){const x=clamp(u+ox*sign,0,1),y=clamp(v+oy*sign,0,1),h=bilinear(height,NX,NY,x,y);pos.push((x-.5)*WORLD_W,(h-r.min)*factor+.035,(y-.5)*WORLD_D);}
 if(n>0){const a=(n-1)*2,b=n*2;tri.push(a,a+1,b,b,a+1,b+1);}
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(tri);g.computeVertexNormals();return new THREE.Mesh(g,new THREE.MeshStandardMaterial({color,roughness:.3,metalness:.03,side:THREE.DoubleSide,transparent:true,opacity:.92,depthWrite:false}));
}
function updateWater(){if(!waterGroup||!THREE)return;
 for(const m of [...waterGroup.children]){waterGroup.remove(m);m.geometry?.dispose();m.material?.dispose();}
 if(!$('water-overlay').checked || viewMode!=='now')return;
 // 示意流路。不是流向、匯流與冰水搬運的物理模擬；不寫入 DEM。
 const main=[];for(let n=0;n<=95;n++){const u=.12+.83*n/95,v=.52+.037*Math.sin(u*18)-.025*Math.sin(u*37);main.push([u,v]);}
 waterGroup.add(waterRibbon(main,.055,0x45c2e5));
 for(const [start,end,shift] of [[.15,.32,-.16],[.21,.41,.13],[.32,.51,-.19]]){
  const tributary=[];for(let n=0;n<=30;n++){const t=n/30,u=lerp(start,end,t),v=lerp(.52+shift,.52+.037*Math.sin(end*18)-.025*Math.sin(end*37),t)+.007*Math.sin(t*8);tributary.push([u,v]);}
  waterGroup.add(waterRibbon(tributary,.022,0x8dd9ed));
 }
}
function build3D(){
 const root=$('three-wrap');renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});
 renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.outputColorSpace=THREE.SRGBColorSpace;
 root.appendChild(renderer.domElement);$('three-placeholder').remove();scene=new THREE.Scene();scene.background=new THREE.Color('#e6f0f5');
 camera=new THREE.PerspectiveCamera(40,2,.1,1000);camera.position.set(10,9,13);
 controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.085;controls.target.set(0,1,0);controls.minDistance=5;controls.maxDistance=40;
 scene.add(new THREE.HemisphereLight(0xf4faff,0xb9a68a,1.5));const light=new THREE.DirectionalLight(0xfff4df,2.2);light.position.set(-7,15,9);scene.add(light);
 scene.add(new THREE.AmbientLight(0xe1ecf3,.4));
 terrainMesh=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,roughness:.94}));scene.add(terrainMesh);
 linesGroup=new THREE.Group();scene.add(linesGroup);waterGroup=new THREE.Group();scene.add(waterGroup);markersGroup=new THREE.Group();scene.add(markersGroup);
 raycaster=new THREE.Raycaster();try{initMiniPreview();}catch(err){console.warn('小型預覽未啟動',err);$('prefab-fallback').textContent='小型 3D 預覽暫不可用，仍可在主視窗放置';}
 function resize(){const rect=root.getBoundingClientRect();renderer.setSize(rect.width,rect.height,false);camera.aspect=rect.width/rect.height;camera.updateProjectionMatrix();}
 resize();new ResizeObserver(resize).observe(root);
 // 3D 地形直接編輯：積木放置、標記拖曳、手繪（另外保留相機旋轉）
 let operation=null;
 const canvas=renderer.domElement;
 canvas.addEventListener('pointerdown',e=>{
  if(e.button!==0)return;const hit=pickTerrain(e);if(!hit?.uv)return;
  if(orbitMode)return;
  if(brushMode){remember();operation={kind:'brush',last:hit.uv};brushAt(...hit.uv);schedule();}
  else if(placeType){operation={kind:'place',start:[e.clientX,e.clientY],uv:hit.uv};}
  else{const s=state.objects.find(o=>o.id===hit.marker)||shapeAt3D(hit.uv);
   if(s){selectShape(s.id);remember();operation={kind:'move',id:s.id,ox:hit.uv[0]-s.x,oy:hit.uv[1]-s.y};}
  }
  if(operation){controls.enabled=false;canvas.setPointerCapture(e.pointerId);e.preventDefault();e.stopImmediatePropagation();}
 },true);
 canvas.addEventListener('pointermove',e=>{
  if(!operation){
   if(placeType){const hit=pickTerrain(e);refreshPlacementGhost(hit?.uv||null);}
   else if(placementGhost)refreshPlacementGhost(null);
   return;
  }
  const hit=pickTerrain(e);if(!hit?.uv)return;
  if(operation.kind==='move'){const s=state.objects.find(o=>o.id===operation.id);if(!s)return;s.x=clamp(hit.uv[0]-operation.ox,.005,.995);s.y=clamp(hit.uv[1]-operation.oy,.005,.995);schedule();}
  if(operation.kind==='brush'){brushLine(operation.last,hit.uv);operation.last=hit.uv;schedule();}
 },true);
 function finish(e){if(!operation)return;
  if(operation.kind==='place'){if(Math.hypot(e.clientX-operation.start[0],e.clientY-operation.start[1])<10){const uv=pickTerrain(e)?.uv||operation.uv;addShape(...uv);}}
  else{refresh();msg(operation.kind==='move'?'已在 3D 模型中移動地形積木。':'已完成 3D 手繪塑形，可撤銷。');}
  operation=null;controls.enabled=true;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
 }
 canvas.addEventListener('pointerup',finish,true);canvas.addEventListener('pointercancel',finish,true);
 canvas.addEventListener('pointerleave',()=>refreshPlacementGhost(null));
 renderer.setAnimationLoop(()=>{
  controls.update();renderer.render(scene,camera);
  if(miniRenderer&&miniScene&&miniFrame++%2===0){if(miniMesh)miniMesh.rotation.y+=.009;miniRenderer.render(miniScene,miniCamera);}
 });viewReady=true;
}
function updateTerrain(){if(!renderer)return;const old=terrainMesh.geometry;terrainMesh.geometry=geometryFor(height);old.dispose();const r=rangeOf(height);updateMarkers();updateWater();if(placementGhost)refreshPlacementGhost(null);$('height-legend').textContent=viewMode==='diff'?'藍：降低（侵蝕）／橘：增高（堆積）':`分層設色＋實心底座｜高程 ${fmt(r.min)}～${fmt(r.max)} m｜垂直誇大 ${$('z-scale').value}×`;}
function update3DContours(){if(!linesGroup)return;while(linesGroup.children.length){const c=linesGroup.children[0];linesGroup.remove(c);c.geometry?.dispose();c.material?.dispose();}if(!show3DContours)return;const arr=viewMode==='before'?state.base:height,r=rangeOf(height),factor=2.7/Math.max(300,r.span)*Number($('z-scale').value),positions=[];let levelCount=0;eachContour(arr,Number($('interval').value),(a,b,lv)=>{const h=clamp((lv-r.min)*factor+.015,-2,10);positions.push((a[0]-.5)*WORLD_W,h,(a[1]-.5)*WORLD_D,(b[0]-.5)*WORLD_W,h,(b[1]-.5)*WORLD_D);levelCount++;});if(positions.length){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));linesGroup.add(new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:0x34474c,opacity:.67,transparent:true,depthTest:true})));}}
function downloadBlob(data,name,mime='application/octet-stream'){const blob=data instanceof Blob?data:new Blob([data],{type:mime}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}
$('btn-save').onclick=()=>{downloadBlob(JSON.stringify({format:'glacier-studio-v4.3',savedAt:new Date().toISOString(),...snapshot(),interval:Number($('interval').value),zscale:Number($('z-scale').value)},null,2),'glacier-terrain-v4.3.json','application/json');msg('已儲存可再次編輯的專案 JSON。');};
$('btn-open').onclick=()=>$('file-project').click();
$('file-project').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{const data=JSON.parse(await file.text());if(!['glacier-studio-v2','glacier-studio-v3','glacier-studio-v4','glacier-studio-v4.1','glacier-studio-v4.2','glacier-studio-v4.3'].includes(data.format))throw Error('此 JSON 不是工作室 V2/V3/V4 專案');
 if(!data.base||!Array.isArray(data.objects))throw Error('專案格式不完整');
 if(data.base.length===180*108) data.base=Array.from(resample(Float32Array.from(data.base),180,108));
 if(data.base.length===300*180) data.base=Array.from(resample(Float32Array.from(data.base),300,180));
 if(data.base.length!==NX*NY)throw Error('專案格網尺寸不符');
 remember();restore(data);$('interval').value=data.interval??100;$('z-scale').value=data.zscale??1.5;refresh();msg('已載入專案。');}catch(err){msg('讀取專案失敗：'+err.message);}e.target.value='';};
$('btn-asc').onclick=()=>{downloadBlob(exportASC(height,state.widthM,state.heightM),'glacier-terrain.asc','text/plain');msg('已輸出 QGIS 可讀取的 ASC 高程網格（虛構座標或來源局部平面網格）。');};
$('btn-heights').onclick=()=>{const c=document.createElement('canvas');c.width=NX;c.height=NY;const x=c.getContext('2d'),im=x.createImageData(NX,NY),r=rangeOf(height);for(let k=0;k<height.length;k++){const v=Math.round(clamp((height[k]-r.min)/r.span,0,1)*255);im.data.set([v,v,v,255],k*4);}x.putImageData(im,0,0);c.toBlob(blob=>downloadBlob(blob,'glacier-heightmap-8bit.png','image/png'));msg('已輸出相對灰階高度 PNG。精確高程請用 ASC。');};
$('btn-a4').onclick=()=>{const c=document.createElement('canvas');c.width=3508;c.height=2480;const cc=c.getContext('2d');cc.fillStyle='#fff';cc.fillRect(0,0,c.width,c.height);cc.fillStyle='#223e4f';cc.font='bold 76px system-ui';cc.fillText('冰河地形等高線判讀',110,110);cc.font='36px system-ui';cc.fillText('等高距：'+$('interval').value+' 公尺　｜　N ↑　｜　依平面線條判讀地形與坡度',120,184);const a=renderBackdrop(cc,'print');cc.fillStyle='#203c49';cc.font='33px system-ui';cc.fillText('請使用不同顏色標記地形，並說明判讀依據。',130,2340);cc.font='28px system-ui';cc.fillText('姓名／組別：_____________________    地形資料：'+(state.real?'實際 DEM 局部範圍（可能已人工修改）':'虛構教學示意'),130,2402);c.toBlob(b=>downloadBlob(b,'glacier-student-A4.png','image/png'),'image/png');msg('已輸出橫向 A4 學生圖（3508×2480）。');};
$('btn-glb').onclick=()=>{if(!renderer){msg('3D 引擎尚未載入，無法匯出 GLB。');return;}const clone=new THREE.Mesh(geometryFor(height,'now'),new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,roughness:.85}));const g=new THREE.Group();g.add(clone);
 if($('water-overlay').checked){for(const water of waterGroup?.children||[]){const m=water.clone();m.geometry=water.geometry.clone();m.material=water.material.clone();g.add(m);}}
 const exporter=new GLTFExporter();exporter.parse(g,data=>{downloadBlob(data,'glacier-solid-terrain.glb','model/gltf-binary');g.traverse(obj=>{obj.geometry?.dispose();obj.material?.dispose();});msg('已輸出地形方塊 GLB（含側壁與底面）'+($('water-overlay').checked?'，並含示意水道。':'。'));},err=>msg('GLB 匯出失敗：'+err.message),{binary:true,onlyVisible:true,trs:false});};
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
async function loadAletschMosaic(p){
 // Web Mercator pixels at z12; ~26m/source pixel at 46.43 N, resampled to ~50m DEM.
 const z=p.z, worldPixels=256*(2**z), rad=p.lat*Math.PI/180;
 const cx=(p.lon+180)/360*worldPixels;
 const cy=(1-Math.asinh(Math.tan(rad))/Math.PI)/2*worldPixels;
 const mpp=2*Math.PI*6378137*Math.cos(rad)/worldPixels;
 const widthM=18000,heightM=23000;
 const wPx=widthM/mpp,hPx=heightM/mpp;
 const x0=Math.floor(cx/256)-2,y0=Math.floor(cy/256)-2;
 const nTiles=5,tw=nTiles*256,th=nTiles*256;
 const allTiles=[];for(let j=0;j<nTiles;j++)for(let i=0;i<nTiles;i++)allTiles.push({x:x0+i,y:y0+j,i,j});
 const cv=document.createElement('canvas');cv.width=tw;cv.height=th;
 const context=cv.getContext('2d',{willReadFrequently:true});let next=0,done=0;
 async function worker(){while(next<allTiles.length){
   const tile=allTiles[next++];const url=`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${tile.x}/${tile.y}.png`;
   const response=await fetch(url,{mode:'cors'});if(!response.ok)throw Error(`${tile.x}/${tile.y} HTTP ${response.status}`);
   const bitmap=await createImageBitmap(await response.blob());
   context.drawImage(bitmap,tile.i*256,tile.j*256,256,256);bitmap.close?.();
   done++;if(done%5===0)msg(`正在下載阿雷奇區高程圖磚：${done}/25 張…`);
 }}
 await Promise.all(Array.from({length:5},worker));
 const raw=context.getImageData(0,0,tw,th).data;
 const samples=new Float32Array(tw*th);
 for(let k=0;k<samples.length;k++)samples[k]=(raw[k*4]*256+raw[k*4+1]+raw[k*4+2]/256)-32768;
 const left=cx-x0*256-wPx/2, top=cy-y0*256-hPx/2;
 if(left<0||top<0||left+wPx>=tw||top+hPx>=th)throw Error('圖磚範圍不足，請改用較小的地形範圍');
 const grid=new Float32Array(NX*NY);
 for(let j=0;j<NY;j++)for(let i=0;i<NX;i++){
   const px=left+i/(NX-1)*wPx, py=top+j/(NY-1)*hPx;
   grid[j*NX+i]=bilinear(samples,tw,th,px/(tw-1),py/(th-1));
 }
 return {base:grid,widthM,heightM,sourceURL:`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x0+2}/${y0+2}.png`,count:allTiles.length};
}
async function loadReal(key){
 const p=REAL[key],info=tileInfo(p);lastTileURL=info.url;
 msg('正在下載真實 DEM：'+p.name+'…');
 try{
  let base,widthM,heightM,sourceURL,detail;
  if(key==='aletsch'){
    const mosaic=await loadAletschMosaic(p);
    ({base,widthM,heightM,sourceURL}=mosaic);
    detail='Terrarium 多圖磚裁切，約 18×23 km（非參考網站同一精確邊界）';
  }else{
    const response=await fetch(info.url,{mode:'cors'});
    if(!response.ok)throw Error('下載回應 '+response.status);
    const result=await readTerrainPNG(await response.blob());
    const circ=2*Math.PI*6378137*Math.cos(p.lat*Math.PI/180);
    widthM=circ/(2**p.z);heightM=widthM*NY/NX;
    base=result.base;sourceURL=info.url;detail='單張 Terrarium 圖磚';
  }
  remember();state={base,objects:[],widthM,heightM,source:`真實 DEM｜${p.name}｜${detail}（Mapzen AWS）`,sourceURL,real:true};
  chooseStamp(null);const span=rangeOf(state.base).span;
  $('interval').value=span<100?'10':span<400?'25':span<1200?'50':'100';
  refresh();resetCamera();msg(`已載入 ${p.name}。範圍 ${(widthM/1000).toFixed(1)}×${(heightM/1000).toFixed(1)} km；新增積木屬教學模擬。`);
 }catch(err){msg('真實地形讀取失敗：'+err.message+'。請檢查網路、圖磚存取或 CORS；可用 QGIS 的 GeoTIFF 匯入替代。');}
}
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
 }else throw Error('不支援此檔案格式');remember();state={base:r.base,objects:[],widthM:r.widthM||80000,heightM:r.heightM||(r.widthM||80000)*NY/NX,source:'本機匯入｜'+file.name,sourceURL:'',real:true};chooseStamp(null);refresh();msg('高程資料已匯入。注意 GeoTIFF 若為經緯度 CRS，水平公尺比例須先用 QGIS 重新投影；若是 GeoTIFF 多波段，請使用第一波段高程。');}catch(err){msg('匯入失敗：'+err.message);}e.target.value='';};
syncUI();refresh();msg('V4.3 已就緒：地形積木與手繪功能已整合在立體模型工作區中。正在載入 3D 引擎…');
async function init3D(){try{
 const [lib,orbit,exporter]=await Promise.all([import('three'),import('three/addons/controls/OrbitControls.js'),import('three/addons/exporters/GLTFExporter.js')]);
 THREE=lib;OrbitControls=orbit.OrbitControls;GLTFExporter=exporter.GLTFExporter;
 build3D();updateTerrain();update3DContours();msg('3D 模型已就緒。可直接在立體地表放置積木、移動積木或使用手繪工具。');
}catch(err){msg('2D 功能正常，但 3D 套件載入失敗：'+err.message+'。請檢查外部 CDN 連線。');$('three-placeholder').textContent='3D 套件無法載入；可使用右上角「2D 等高線」繼續編輯。';$('map-popup').hidden=false;}}
init3D();
