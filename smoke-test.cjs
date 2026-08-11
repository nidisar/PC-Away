const fs = require('fs');
const vm = require('vm');
const path = require('path');

const root = __dirname;
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const match = html.match(/<script>([\s\S]*)<\/script>/);
if (!match) throw new Error('Inline script non trovato');
new vm.Script(match[1]);

JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

const ids = new Set(Array.from(html.matchAll(/\sid="([^"]+)"/g), row => row[1]));
const fixedRefs = Array.from(match[1].matchAll(/getElementById\(['"]([^'"]+)['"]\)/g), row => row[1]);
const optionalIds = new Set(['sc-daily-enabled']);
const missing = Array.from(new Set(fixedRefs.filter(id => !ids.has(id) && !optionalIds.has(id))));
if (missing.length) throw new Error('ID DOM mancanti: ' + missing.join(', '));

const required = [
  'resetLiveFeedSession', 'manualByQueue', 'queueFilter', 'waitMissingEtv',
  'backstab_window', 'hotspot', 'Attendo PCU', "'PATCH', configPatch",
  '/pcu_v2/confirmed_orders.json', "row.origin === 'remote_ntfy'",
  '_fbAuthPromise', 'fetchWithTimeout', 'waitForFreshPcuStatus', '_cloudLoaded',
  'applyOptimisticCommandState', "join(',')+'/json?poll=0'", "if(t.key==='cmd')parseBotStato(msg)"
];
for (const token of required) {
  if (!html.includes(token)) throw new Error('Contratto mancante: ' + token);
}
const forbidden = [
  'preloadNtfyHistory', 'FEED_BOOTSTRAP_LIMIT', 'SSEID_KEY', 'loadFeedSeen',
  'saveFeedSeen', 'since=10m', "fbDbUrl(path, null)", '6 * 60 * 60 * 1000',
  'Stato bot in caricamento dallo storico', 'poll=1&since='
];
for (const token of forbidden) {
  if (html.includes(token)) throw new Error('Codice obsoleto ancora presente: ' + token);
}

const startupBlock = match[1].slice(match[1].indexOf('function refreshStartupData'), match[1].indexOf('function configuredTopics'));
if (startupBlock.includes('loadDrops(')) throw new Error('Drops non deve caricarsi automaticamente all\'avvio');
const commandInitBlock = match[1].slice(match[1].indexOf('function initializeCommandStates'), match[1].indexOf('function setActiveMode'));
if (commandInitBlock.includes('setActiveMode(')) throw new Error('Il Bot non deve inventare un modo iniziale');

const plannerStart = match[1].indexOf('function dailyAwayPad2');
const plannerEnd = match[1].indexOf('function readDailyAwayPlan');
if (plannerStart < 0 || plannerEnd <= plannerStart) throw new Error('Funzioni planner non trovate');
const plannerSandbox = {};
vm.runInNewContext(match[1].slice(plannerStart, plannerEnd) + '\nthis.normalizePlan = normalizeDailyAwayPlan;', plannerSandbox);
const normalized = plannerSandbox.normalizePlan({ enabled:true, events:[
  { type:'point_blank', at:'01:00:00', randomize:true },
  { type:'ar_window', from:'01:58:00', to:'02:03:00' },
  { type:'backstab_window', from:'02:30:00', to:'02:35:00' },
  { type:'hotspot', target:'00:02:00', fromHour:2, toHour:7, profile:'surgical_night' }
] });
const plannerTypes = Array.from(normalized.events, event => event.type).sort();
for (const type of ['point_blank','ar_window','backstab_window','hotspot']) {
  if (!plannerTypes.includes(type)) throw new Error('Evento planner perso: ' + type);
}
if (!normalized.events.find(event => event.type === 'point_blank').randomize) throw new Error('Random PB perso');

console.log('PCU Away smoke test: OK');
