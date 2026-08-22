(()=>{
const graphLayout=window.ARALEARN_GRAPH_LAYOUT;
const graphSvg=document.querySelector("#graphSvg");
const graphViewport=document.querySelector("#graphViewportNew");
const graphZoomLabel=document.querySelector("#graphZoomLabel");
const graphSelection=document.querySelector("#graphSelection");
const flowActions=document.querySelector("#flowActions");

const graphNodes=new Map(graphLayout.nodes.map(node=>[node.id,node]));
const graphClusters=new Map(graphLayout.clusters.map(cluster=>[cluster.id,cluster]));
const graphEdges=graphLayout.edges;
const graphKindLabels={
  conditional:"condicional",
  external:"fora do AraLearn",
  state:"muda estado",
  context:"atalho/contexto",
  detail:"abre detalhe",
  return:"retorno",
  loop:"repete etapa"
};

let currentGraphId=(location.hash||"#login").slice(1);
if(!graphNodes.has(currentGraphId)) currentGraphId="login";
let graphView={x:0,y:0,w:graphLayout.w,h:graphLayout.h};
const graphInitial={...graphView};
let graphFitAllWidth=graphLayout.w;
let drag=null;
let moved=false;

function svgEl(name,attrs={},text=""){
  const el=document.createElementNS("http://www.w3.org/2000/svg",name);
  for(const [key,value] of Object.entries(attrs)) el.setAttribute(key,String(value));
  if(text) el.textContent=text;
  return el;
}

function edgePath(points){
  if(!points?.length) return "";
  let d=`M ${points[0][0]} ${points[0][1]}`;
  for(let i=1;i+2<points.length;i+=3){
    d+=` C ${points[i][0]} ${points[i][1]} ${points[i+1][0]} ${points[i+1][1]} ${points[i+2][0]} ${points[i+2][1]}`;
  }
  return d;
}

function buildGraph(){
  graphSvg.setAttribute("viewBox",`0 0 ${graphLayout.w} ${graphLayout.h}`);
  const defs=svgEl("defs");
  const marker=svgEl("marker",{id:"arrow",viewBox:"0 0 10 10",refX:"9",refY:"5",markerWidth:"6",markerHeight:"6",orient:"auto-start-reverse"});
  marker.appendChild(svgEl("path",{d:"M 0 0 L 10 5 L 0 10 z",fill:"context-stroke"}));
  defs.appendChild(marker);
  graphSvg.appendChild(defs);

  const clusterLayer=svgEl("g",{class:"graph-clusters"});
  for(const c of graphLayout.clusters){
    const group=svgEl("g",{class:"graph-cluster",id:`cluster-${c.id}`});
    group.appendChild(svgEl("rect",{x:c.x,y:c.y,width:c.w,height:c.h,rx:14,fill:"transparent"}));
    group.appendChild(svgEl("text",{x:c.x+c.w/2,y:c.y+22,"text-anchor":"middle"},c.label));
    clusterLayer.appendChild(group);
  }
  graphSvg.appendChild(clusterLayer);

  const edgeLayer=svgEl("g",{class:"graph-edges"});
  for(const edge of graphEdges){
    const group=svgEl("g",{class:`graph-edge ${edge.kind?"kind-"+edge.kind:""}`,id:edge.id,"data-source":edge.s,"data-target":edge.t});
    group.appendChild(svgEl("path",{d:edgePath(edge.p),fill:"none","marker-end":"url(#arrow)"}));
    if(edge.lx!=null&&edge.ly!=null){
      group.appendChild(svgEl("text",{x:edge.lx,y:edge.ly,"text-anchor":"middle"},`${edge.n} · ${edge.label}`));
    }
    edgeLayer.appendChild(group);
  }
  graphSvg.appendChild(edgeLayer);

  const nodeLayer=svgEl("g",{class:"graph-nodes"});
  for(const node of graphLayout.nodes){
    const group=svgEl("g",{class:"graph-node",id:`screen-${node.id}`,"data-id":node.id,tabindex:"0",role:"button","aria-label":node.label});
    group.appendChild(svgEl("rect",{x:node.x,y:node.y,width:node.w,height:node.h,rx:9}));
    group.appendChild(svgEl("text",{x:node.x+node.w/2,y:node.y+node.h/2+4,"text-anchor":"middle"},node.label));
    group.addEventListener("click",()=>selectGraphScreen(node.id));
    group.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();selectGraphScreen(node.id);}});
    nodeLayer.appendChild(group);
  }
  graphSvg.appendChild(nodeLayer);
}

function setGraphView(next){
  graphView=next;
  graphSvg.setAttribute("viewBox",`${next.x} ${next.y} ${next.w} ${next.h}`);
  const pct=Math.round((graphFitAllWidth/next.w)*100);
  graphZoomLabel.textContent=`${pct}%`;
}

function unionBoxes(...boxes){
  const valid=boxes.filter(Boolean);
  const x=Math.min(...valid.map(b=>b.x));
  const y=Math.min(...valid.map(b=>b.y));
  const right=Math.max(...valid.map(b=>b.x+b.w));
  const bottom=Math.max(...valid.map(b=>b.y+b.h));
  return {x,y,w:right-x,h:bottom-y};
}

function focusBox(box,padding=.08){
  if(!box) return;
  const rect=graphViewport.getBoundingClientRect();
  if(!rect.width||!rect.height) return;
  const pad=Math.max(box.w,box.h)*padding;
  let w=box.w+2*pad, h=box.h+2*pad;
  const aspect=rect.width/rect.height;
  if(w/h<aspect) w=h*aspect; else h=w/aspect;
  setGraphView({x:box.x-(w-box.w)/2,y:box.y-(h-box.h)/2,w,h});
}

function journeyBox(journey){
  const cluster=graphClusters.get(journey);
  if(!cluster) return null;
  if(journey==="entrada") return unionBoxes(cluster,graphNodes.get("study-home"));
  return cluster;
}

function fitAll(){
  const rect=graphViewport.getBoundingClientRect();
  const aspect=rect.width/rect.height;
  let w=graphLayout.w,h=graphLayout.h;
  if(w/h<aspect) w=h*aspect; else h=w/aspect;
  const x=(graphLayout.w-w)/2,y=(graphLayout.h-h)/2;
  graphFitAllWidth=w;
  setGraphView({x,y,w,h});
  setActiveFocus("all");
}

function focusJourney(journey){
  if(journey==="all"){fitAll();return;}
  focusBox(journeyBox(journey),.08);
  setActiveFocus(journey);
}

function focusSelected(){focusBox(graphNodes.get(currentGraphId),.85);}

function setActiveFocus(value){
  document.querySelectorAll("[data-graph-focus]").forEach(button=>button.classList.toggle("active",button.dataset.graphFocus===value));
}

function zoomAt(factor,clientX=null,clientY=null){
  const rect=graphViewport.getBoundingClientRect();
  const px=clientX==null?.5:(clientX-rect.left)/rect.width;
  const py=clientY==null?.5:(clientY-rect.top)/rect.height;
  const cx=graphView.x+graphView.w*px,cy=graphView.y+graphView.h*py;
  const minW=graphLayout.w/12,maxW=graphLayout.w*1.4;
  const w=Math.max(minW,Math.min(maxW,graphView.w*factor));
  const h=w*(rect.height/rect.width);
  setGraphView({x:cx-w*px,y:cy-h*py,w,h});
}

function highlightGraph(){
  graphSvg.querySelectorAll(".selected,.neighbor,.outgoing,.incoming,.context-dim").forEach(el=>el.classList.remove("selected","neighbor","outgoing","incoming","context-dim"));
  const selected=graphSvg.querySelector(`#screen-${CSS.escape(currentGraphId)}`);
  selected?.classList.add("selected");
  const outgoing=graphEdges.filter(edge=>edge.s===currentGraphId).sort((a,b)=>a.n-b.n);
  const incoming=graphEdges.filter(edge=>edge.t===currentGraphId);
  const connected=new Set([currentGraphId]);
  for(const edge of outgoing){
    connected.add(edge.t);
    document.getElementById(edge.id)?.classList.add("outgoing");
    graphSvg.querySelector(`#screen-${CSS.escape(edge.t)}`)?.classList.add("neighbor");
  }
  for(const edge of incoming){
    connected.add(edge.s);
    document.getElementById(edge.id)?.classList.add("incoming");
    graphSvg.querySelector(`#screen-${CSS.escape(edge.s)}`)?.classList.add("neighbor");
  }
  graphSvg.querySelectorAll(".graph-node").forEach(node=>{if(!connected.has(node.dataset.id)) node.classList.add("context-dim");});
  graphSvg.querySelectorAll(".graph-edge").forEach(edge=>{if(!edge.classList.contains("outgoing")&&!edge.classList.contains("incoming")) edge.classList.add("context-dim");});
}

function controlMatches(control,edge){
  if(edge.matchTitle&&control.getAttribute("title")===edge.matchTitle) return true;
  if(edge.matchText){
    const text=(control.textContent||"").replace(/\s+/g," ").trim();
    return text.includes(edge.matchText);
  }
  return false;
}

function decorateCurrentMock(){
  document.querySelectorAll("#phone .flow-action-control").forEach(control=>{
    control.classList.remove("flow-action-control");
    delete control.dataset.flowNumber;
  });
  const outgoing=graphEdges.filter(edge=>edge.s===currentGraphId).sort((a,b)=>a.n-b.n);
  const controls=[...document.querySelectorAll("#phone button,#phone a,#phone summary")];
  const numbersByControl=new Map();
  for(const edge of outgoing){
    const control=controls.find(item=>controlMatches(item,edge));
    if(!control) continue;
    const list=numbersByControl.get(control)||[];
    list.push(edge.n);
    numbersByControl.set(control,list);
  }
  for(const [control,numbers] of numbersByControl){
    control.classList.add("flow-action-control");
    control.dataset.flowNumber=numbers.join("·");
  }

  if(!outgoing.length){
    flowActions.innerHTML='<p class="muted">Nenhuma outra tela foi ligada diretamente a partir deste estado no atlas.</p>';
    return;
  }
  flowActions.innerHTML=outgoing.map(edge=>{
    const target=graphNodes.get(edge.t);
    const kind=edge.kind&&graphKindLabels[edge.kind]?`<span class="flow-kind">${graphKindLabels[edge.kind]}</span>`:"";
    return `<button class="flow-action-row" type="button" data-target="${edge.t}">
      <span class="flow-number">${edge.n}</span>
      <span><span class="flow-label">${edge.label}</span>${kind}</span>
      <span class="flow-target">→ ${target?.label||edge.t}</span>
    </button>`;
  }).join("");
  flowActions.querySelectorAll("[data-target]").forEach(button=>button.addEventListener("click",()=>selectGraphScreen(button.dataset.target)));
}

function selectGraphScreen(id,{focus=false}={}){
  if(!graphNodes.has(id)) return;
  const previousJourney=graphNodes.get(currentGraphId)?.journey;
  currentGraphId=id;
  const nextJourney=graphNodes.get(id)?.journey;
  if(typeof selectScreen==="function") selectScreen(id,{focus:false});
  highlightGraph();
  requestAnimationFrame(decorateCurrentMock);
  if(focus) focusBox(graphNodes.get(id),.8);
  else if(previousJourney!==nextJourney) focusJourney(nextJourney);
}

buildGraph();

document.querySelectorAll("[data-graph-focus]").forEach(button=>button.addEventListener("click",()=>focusJourney(button.dataset.graphFocus)));
document.querySelector("#graphZoomIn").addEventListener("click",()=>zoomAt(.82));
document.querySelector("#graphZoomOut").addEventListener("click",()=>zoomAt(1.22));
document.querySelector("#graphFocusSelected").addEventListener("click",focusSelected);
document.querySelector("#graphFitAll").addEventListener("click",fitAll);
graphViewport.addEventListener("wheel",event=>{event.preventDefault();zoomAt(event.deltaY<0?.88:1.14,event.clientX,event.clientY);},{passive:false});

graphViewport.addEventListener("pointerdown",event=>{
  if(event.button!==0||event.target.closest?.(".graph-node")) return;
  drag={x:event.clientX,y:event.clientY,view:{...graphView}};
  moved=false;
  graphViewport.classList.add("dragging");
  graphViewport.setPointerCapture(event.pointerId);
});
graphViewport.addEventListener("pointermove",event=>{
  if(!drag) return;
  const rect=graphViewport.getBoundingClientRect();
  const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
  if(Math.abs(dx)+Math.abs(dy)>4)moved=true;
  setGraphView({x:drag.view.x-dx*(drag.view.w/rect.width),y:drag.view.y-dy*(drag.view.h/rect.height),w:drag.view.w,h:dragView.h});
});
function endDrag(event){
  drag=null;graphViewport.classList.remove("dragging");
  try{graphViewport.releasePointerCapture(event.pointerId)}catch{}
}
graphViewport.addEventListener("pointerup",endDrag);
graphViewport.addEventListener("pointercancel",endDrag);

window.addEventListener("resize",()=>focusJourney(graphNodes.get(currentGraphId)?.journey||"entrada"));

requestAnimationFrame(()=>{
  highlightGraph();
  decorateCurrentMock();
  focusJourney(graphNodes.get(currentGraphId)?.journey||"entrada");
});

})();
