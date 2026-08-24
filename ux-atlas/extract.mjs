import fs from 'node:fs';
import zlib from 'node:zlib';

const payloadSource = fs.readFileSync(new URL('./payload.js', import.meta.url), 'utf8');
const match = payloadSource.match(/__ARAL_ATLAS_PAYLOAD\s*=\s*"([A-Za-z0-9+/=]+)"/u);
if (!match) throw new Error('payload.js inválido');
const payload = JSON.parse(zlib.gunzipSync(Buffer.from(match[1], 'base64')).toString('utf8'));
fs.writeFileSync(new URL('./atlas.generated.css', import.meta.url), payload.css);
fs.writeFileSync(new URL('./graphs.generated.js', import.meta.url), payload.graphs);
fs.writeFileSync(new URL('./atlas.generated.js', import.meta.url), payload.js);
console.log('Gerados: atlas.generated.css, graphs.generated.js, atlas.generated.js');
