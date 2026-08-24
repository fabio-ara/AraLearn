import fs from 'node:fs';
import vm from 'node:vm';
import zlib from 'node:zlib';

const payloadSource=fs.readFileSync(new URL('./payload.js',import.meta.url),'utf8');
const match=payloadSource.match(/__ARAL_ATLAS_PAYLOAD\s*=\s*"([A-Za-z0-9+/=]+)"/);
if(!match) throw new Error('payload.js inválido');
const payload=JSON.parse(zlib.gunzipSync(Buffer.from(match[1],'base64')).toString('utf8'));
const atlas=payload.js;
const prefix=atlas.split('const modeDefaults =',1)[0];
const stub='const modeDefaults={overview:"overview_info",entry:"login",study:"study_home",authoring:"author_home",research:"research_home",coverage:"coverage_home"};\nfunction highlightGraph(){}\nfunction validateMock(){}\nfunction renderDetail(){}\nfunction selectScreen(){}\nfunction graphEdges(){return [];}\n';
const context={console,structuredClone,setTimeout,clearTimeout};
vm.createContext(context);
vm.runInContext(stub+prefix+'\nglobalThis.__atlasTest={screens,makeCtx,state};',context,{filename:'atlas.js'});
const {screens,makeCtx}=context.__atlasTest;
function edges(name){const text=fs.readFileSync(new URL(`./graphs/${name}.dot`,import.meta.url),'utf8');return new Set([...text.matchAll(/^\s*([A-Za-z0-9_]+)\s*->\s*([A-Za-z0-9_]+)/gm)].map(m=>`${m[1]}->${m[2]}`));}
const byMode=Object.fromEntries(['overview','entry','study','authoring','research','coverage'].map(x=>[x,edges(x)]));
const failures=[];let actionCount=0;
for(const [id,screen] of Object.entries(screens)){
 const ctx=makeCtx();let html='';try{html=screen.render(ctx);}catch(error){failures.push(`${id}: render falhou: ${error.message}`);continue;}
 if(typeof html!=='string'||!html.length)failures.push(`${id}: render vazio`);actionCount+=ctx.actions.length;
 const graph=byMode[screen.mode];if(!graph){failures.push(`${id}: modo sem grafo: ${screen.mode}`);continue;}
 for(const action of ctx.actions){if(action.effect==='goBack')continue;if(!screens[action.target])failures.push(`${id}: destino inexistente ${action.target}`);if(!graph.has(`${id}->${action.target}`))failures.push(`${id}: sem aresta para ${action.target}`);}
}
const v10=JSON.parse(fs.readFileSync(new URL('./v10-screen-ids.json',import.meta.url),'utf8'));
for(const id of v10)if(!screens[id])failures.push(`regressão: tela v10 ausente ${id}`);
vm.runInContext('scenario=200; state.v10CollectionsScenario=null; ensureCollectionsV10();',context);
function render(id){const ctx=makeCtx();return screens[id].render(ctx);}
const study=render('study_all'),author=render('author_all');
if((study.match(/class="course-card"/g)||[]).length!==200)failures.push('cenário 200: Estudo não tem 200 cards');
if((author.match(/class="course-card"/g)||[]).length!==112)failures.push('cenário 200: Autoria não tem 112 cards editáveis');
if(study.includes('Carregar mais')||author.includes('Carregar mais'))failures.push('cenário 200: Carregar mais reapareceu');
for(const label of ['Atividade do Curso','Materializações','Decisões de desenho','Fontes','Observações','Auditorias/correções','Variantes'])if(!render('research_home').includes(label))failures.push(`dataset ausente: ${label}`);
for(const label of ['Valores equivalentes ao gráfico','Como esta métrica é definida','Exportar CSV','Exportar JSON','Fatos do recorte'])if(!render('research_facts').includes(label))failures.push(`Analytics incompleto: ${label}`);
for(const label of ['Unidades','Gráficos usados','Observações após inspeção','Diferenças declaradas','Dados ausentes/incompletos'])if(!render('research_variant_compare').includes(label))failures.push(`Variantes incompletas: ${label}`);
const result={screens:Object.keys(screens).length,v10ScreensPreserved:v10.length,actions:actionCount,failures};
console.log(JSON.stringify(result,null,2));if(failures.length)process.exit(1);
