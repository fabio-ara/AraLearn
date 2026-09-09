import { AuthoringApiError } from './errors.js';
import { createAuthoringProcessMandate, normalizeAuthoringProcessMandate } from '../aralearn/runtime/domain/authoringProcessPreferences.js';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const invalid=()=>{throw new AuthoringApiError(422,'invalid_authoring_process_reference','Use a referência do processo combinado para este curso e esta conta.');};
export const AUTHORING_PROCESS_REFERENCE_SCHEMA={type:'string',minLength:1,maxLength:16384,
  description:'Referência opaca do processo já combinado, devolvida na retomada ou preparação. Reutilize durante o fluxo; uma nova leitura sem referência adota as preferências correntes.'};
// Estado de continuação do fluxo, sem tabela/sessão paralela. As condições do
// curso são relidas e conciliadas; esta referência nunca concede acesso.
export function createAuthoringProcessReference(principal,resolution) {
  if(!UUID.test(principal?.actorId))invalid();
  const value={actor:principal.actorId,mandate:createAuthoringProcessMandate(resolution,resolution.preferences)};
  const encoded=btoa(Array.from(new TextEncoder().encode(JSON.stringify(value)),byte=>String.fromCharCode(byte)).join(''))
    .replaceAll('+','-').replaceAll('/','_').replace(/=+$/u,'');
  if(encoded.length>16384)invalid();
  return encoded;
}
export function openAuthoringProcessReference(reference,principal,courseId) {
  let value;
  try {
    if(typeof reference!=='string'||reference.length>16384||!/^[A-Za-z0-9_-]+$/u.test(reference))invalid();
    value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(
      atob(reference.replaceAll('-','+').replaceAll('_','/')),character=>character.charCodeAt(0))));
    if(!value||Object.keys(value).sort().join(',')!=='actor,mandate'||value.actor!==principal?.actorId||!UUID.test(value.actor))invalid();
    value=normalizeAuthoringProcessMandate(value.mandate);
    if(value.courseId!==courseId)invalid();
  }catch{invalid();}
  return value;
}
