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
  'applyOptimisticCommandState', "join(',')+'/json?poll=0'", "if(t.key==='cmd')parseBotStato(msg)",
  'function firebaseFetch', 'resetLiveFeedSession();',
  'tab-btn-plan', 'plan-v-canvas', 'DAILY_PLAN_ZOOMS',
  'schedulerConfigSubset', 'planConfigSubset', 'saveDailyPlan',
  'dailyPlanApplySignature', 'waitForDailyPlanApplied', 'applySavedConfigToPcu',
  'Planner salvato e applicato: confermato da PCU', "action:'applyDailyCptPlan'", "replyTopic:(cfg.topicCmd || '').trim()",
  "pull-firebase-config planner:", "waitForDailyPlanApplied(configPatch.dailyCptPlan, Date.now()+10000, sent && sent.applyId)"
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
const sendCmdBlock = match[1].slice(match[1].indexOf('function sendCmd'), match[1].indexOf('function setBtnTextByKey'));
if (sendCmdBlock.includes('loadPcuStatus')) throw new Error('Il comando Bot non deve spegnere gli AR con una lettura anticipata');
if (!html.includes("switchTab('scheduler',this);loadCfgCloud(true)")) throw new Error('Sched deve aprire direttamente la configurazione cloud');
if (!html.includes("switchTab('plan',this);loadCfgCloud(true)")) throw new Error('Plan deve aprire direttamente la configurazione cloud');
if (!html.includes("DAILY_PLAN_ZOOMS=[0.5,0.75,1,1.5,2,3,4,5]")) throw new Error('Zoom Plan deve arrivare al 500%');
if (!html.includes("status.plannerApplyId === applyId")) throw new Error('Conferma Plan deve usare l’ID restituito da PCU');
if (!html.includes("'/pcu_command_results/'+applyId")) throw new Error('Conferma Plan deve leggere il risultato dedicato');
if (!html.includes("target:minute,from:minute")) throw new Error('Assault deve conservare il target durante il tap');
if (!html.includes('capturePlannerNtfyResult')) throw new Error('Away deve intercettare la conferma planner ntfy');
if (!html.includes('PCU_PLANNER_APPLIED:')) throw new Error('Protocollo ntfy planner mancante');

const ntfyAckStart = match[1].indexOf('var _plannerNtfyResults');
const ntfyAckEnd = match[1].indexOf('function isTechnicalFeedMessage', ntfyAckStart);
if (ntfyAckStart < 0 || ntfyAckEnd <= ntfyAckStart) throw new Error('Parser conferma planner ntfy non trovato');
const ntfyAckSandbox = {};
vm.runInNewContext(match[1].slice(ntfyAckStart, ntfyAckEnd) + '\nthis.captureAck=capturePlannerNtfyResult;this.acks=_plannerNtfyResults;', ntfyAckSandbox);
if (!ntfyAckSandbox.captureAck({ message:'PCU_PLANNER_APPLIED:planner_test_123 — Ho aggiornato il planner' })) throw new Error('Ack planner ntfy non riconosciuto');
if (!ntfyAckSandbox.acks.planner_test_123 || ntfyAckSandbox.acks.planner_test_123.ok !== true) throw new Error('Ack planner ntfy non memorizzato');
if (!html.includes("loadHaul(true,false)")) throw new Error('Haul deve caricare subito senza attesa push');

const schedulerPanel = html.slice(html.indexOf('id="tab-scheduler"'), html.indexOf('id="tab-plan"'));
if (schedulerPanel.includes('Planner Giornaliero CPT')) throw new Error('Il planner CPT non deve più stare in Sched');
const planPanel = html.slice(html.indexOf('id="tab-plan"'), html.indexOf('id="tab-filters"'));
for (const token of ['Planner Giornaliero CPT', 'Point Blank', 'Assault', 'Backstab', 'Autorefresh']) {
  if (!planPanel.includes(token)) throw new Error('Contenuto Plan mancante: ' + token);
}

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
