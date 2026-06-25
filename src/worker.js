import { handleTelegramConfig, handleTelegramStatus, handleTelegramWebhook } from "./telegram-bot.js";
const APP_NAME = "emoji-alchemy-worker";
const APP_VERSION = "1.2.0";
const FINISHER = "🙏";
const EMOJI_SKIN_TONE_MODIFIER_PATTERN = /[\u{1F3FB}-\u{1F3FF}]/gu;
const MAX_HAND_SIGNS = 5;
const PUBLIC_BALANCE_MAX_LENGTH = 3;
const MEMORY_ARENA_KEY = "ARENA_STATE_V1";
const FORCE_ADVANTAGE_BONUS = 18;
const FORCE_ADVANTAGE_SCALE = 0.08;
const LONG_COMBO_RISK_STEP = 5;
const AI_BUTLER_HISTORY_LIMIT = 100;
const RATE_LIMIT_WINDOW_SECONDS = 60;
const DUEL_RATE_LIMIT = 30;
const CHRONICLE_RATE_LIMIT = 10;
const BALANCE_SIMULATE_RATE_LIMIT = 5;

const AI_CONFIG_KEY = "cloudflare-ai:config";
const DEFAULT_CHRONICLE_MODEL = "@cf/meta/llama-3.1-8b-instruct";
const DEFAULT_CHRONICLE_MAX_TOKENS = 1500;
const MAX_CHRONICLE_BODY_BYTES = 64 * 1024;
const CHRONICLE_SYSTEM_PROMPT = `You are a highly advanced narrative translation engine. Your task is to intercept raw competitive match data (JSON format) and translate it into a highly stylized, dark, mysterious, and epic anime-style chronicle. 

You must strictly adhere to the following narrative and structural rules:

1. TONALITY & LORE:
   - Use a cryptic, theatrical, and mythic tone (e.g., "the primordial void," "cosmic scale," "blood tribute").
   - Replace generic player terms: "Player 1" becomes "The First Initiate" and "Player 2" becomes "The Second Follower".
   - Treat stats, costs, risks, and classes as literal magical elements, universal laws, or physical tolls on the body.

2. DATA INTEGRITY (NO OMISSION):
   - You must weave EVERY single piece of data from the JSON into the story.
   - Include: Match ID, Jutsu IDs, hand sign emojis, exact stat distributions (atk, def, spc, power), costs, risks, score modifiers, class advantages, round-by-round damage/scores, and the final winner. Do not summarize or skip numbers.

3. STRUCTURE:
   - ## Title: An epic name for the battle using data parameters.
   - ### Section 1: The Combatants & Incantations (Introduce both players, their techniques, hand signs, exact base stats, costs, and casting penalties).
   - ### Section 2: The Clashing Epochs (A round-by-round breakdown translating damage and execution scores into a narrative clash, explicitly detailing the class advantage mechanics).
   - ### Section 3: The Final Judgment (The definitive conclusion stating the survivor, their final outcome emoji, and the destruction of the loser).`;

const MEMORY_ARENA = {
queue:[],
activeBattles:[],
history:[],
leaderboard:{},
player_rating:{},
player_wins:{},
player_losses:{},
player_rank:{},
aiButler:{
id:"AI-BUTLER-1",
name:"AI Butler",
history:[],
winRate:0.5,
preferredStyle:"Mystic",
adaptationLevel:0.1
}
};

function arenaKvNamespace(env){
return env?.ARENA_KV || env?.KV_BINDING || null;
}

function getArenaPersistenceMode(env){

if(env?.ARENA_KV)
return {mode:"kv",binding:"ARENA_KV",durable:true,warning:null};

if(env?.KV_BINDING)
return {
mode:"kv",
binding:"KV_BINDING",
durable:true,
warning:"ARENA_KV is not bound; using KV_BINDING for arena state. Create and bind a dedicated ARENA_KV namespace when you need isolated arena storage."
};

return {
mode:"memory",
binding:null,
durable:false,
warning:"No KV namespace is bound for arena state; arena queue, active battles, and history are volatile and may reset when the Worker isolate is evicted.",
productionError:"A KV namespace must be bound for production arena state; bind ARENA_KV or KV_BINDING before deploying production traffic."
};

}



function normalizeArena(arena){
const base=arena && typeof arena==="object" ? arena : {};
return {
queue:Array.isArray(base.queue) ? base.queue : [],
activeBattles:Array.isArray(base.activeBattles) ? base.activeBattles : [],
history:Array.isArray(base.history) ? base.history : [],
leaderboard:base.leaderboard && typeof base.leaderboard==="object" ? base.leaderboard : {},
player_rating:base.player_rating && typeof base.player_rating==="object" ? base.player_rating : {},
player_wins:base.player_wins && typeof base.player_wins==="object" ? base.player_wins : {},
player_losses:base.player_losses && typeof base.player_losses==="object" ? base.player_losses : {},
player_rank:base.player_rank && typeof base.player_rank==="object" ? base.player_rank : {},
aiButler:mergeAiButler(base.aiButler)
};
}



const GESTURES = {

"💪":{name:"Flex",atk:6,def:2,spc:2,type:"kinetic"},
"👏":{name:"Clap",atk:3,def:4,spc:3,type:"barrier"},
"👍":{name:"Up",atk:4,def:4,spc:2,type:"barrier"},
"👎":{name:"Down",atk:4,def:3,spc:3,type:"kinetic"},

"🫶":{name:"Heart",atk:2,def:5,spc:6,type:"mystic"},
"🙌":{name:"Raise",atk:4,def:4,spc:5,type:"mystic"},
"👐":{name:"Open",atk:3,def:6,spc:1,type:"barrier"},
"🤲":{name:"Cup",atk:1,def:6,spc:3,type:"barrier"},


"🤜":{name:"Right Hook",atk:9,def:1,spc:0,type:"kinetic"},
"🤛":{name:"Left Hook",atk:9,def:1,spc:0,type:"kinetic"},
"✊":{name:"Fist",atk:8,def:2,spc:0,type:"kinetic"},
"👊":{name:"Strike",atk:8,def:2,spc:0,type:"kinetic"},


"🫸":{name:"Thrust",atk:7,def:3,spc:0,type:"kinetic"},
"🫷":{name:"Reverse Thrust",atk:7,def:3,spc:0,type:"kinetic"},


"🤚":{name:"Guard",atk:1,def:8,spc:1,type:"barrier"},
"🖐":{name:"Palm",atk:2,def:8,spc:0,type:"barrier"},
"✋":{name:"Stop",atk:1,def:9,spc:0,type:"barrier"},


"🖖":{name:"Vulcan",atk:3,def:3,spc:9,type:"mystic"},
"🤟":{name:"Love",atk:2,def:4,spc:8,type:"mystic"},
"🤘":{name:"Horns",atk:6,def:2,spc:6,type:"mystic"},
"🤞":{name:"Cross",atk:4,def:3,spc:7,type:"mystic"},
"✌":{name:"Peace",atk:3,def:4,spc:7,type:"mystic"},
"🤌":{name:"Kiss",atk:4,def:4,spc:6,type:"mystic"},
"🫳":{name:"Palm Down",atk:5,def:4,spc:1,type:"barrier"},
"🫴":{name:"Palm Up",atk:3,def:5,spc:4,type:"mystic"},
"🫲":{name:"Leftward Hand",atk:5,def:3,spc:2,type:"kinetic"},
"🫱":{name:"Rightward Hand",atk:5,def:3,spc:2,type:"kinetic"},
"👋":{name:"Wave",atk:2,def:3,spc:7,type:"mystic"},
"🫰":{name:"Snap",atk:5,def:2,spc:7,type:"mystic"},
"🤙":{name:"Call",atk:3,def:3,spc:8,type:"mystic"},
"🤏":{name:"Pinch",atk:5,def:4,spc:5,type:"mystic"},
"👌":{name:"Focus",atk:4,def:5,spc:6,type:"mystic"},
"🫵":{name:"Challenge",atk:7,def:2,spc:3,type:"kinetic"},
"👉":{name:"Point Right",atk:5,def:2,spc:5,type:"kinetic"},
"👈":{name:"Point Left",atk:5,def:2,spc:5,type:"kinetic"},
"☝":{name:"Index Up",atk:3,def:4,spc:8,type:"mystic"},
"👆":{name:"Point Up",atk:4,def:3,spc:7,type:"mystic"},
"👇":{name:"Point Down",atk:6,def:4,spc:3,type:"kinetic"},
"🖕":{name:"Defiance",atk:8,def:1,spc:3,type:"kinetic"},
"✍":{name:"Script",atk:2,def:4,spc:8,type:"mystic"},
"🤳":{name:"Mirror",atk:2,def:6,spc:6,type:"barrier"}

};

const NON_HAND_OUTCOMES = [
{symbol:"🔥",name:"Ember Crown"},
{symbol:"🛡️",name:"Aegis Ward"},
{symbol:"🔮",name:"Oracle Lens"},
{symbol:"⚡",name:"Thunder Brand"},
{symbol:"🌊",name:"Tidal Verse"},
{symbol:"🌪️",name:"Cyclone Spiral"},
{symbol:"🌋",name:"Volcanic Oath"},
{symbol:"🪨",name:"Stone Root"},
{symbol:"🌙",name:"Moonlit Veil"},
{symbol:"☀️",name:"Solar Crest"},
{symbol:"⭐",name:"Star Sigil"},
{symbol:"💫",name:"Comet Halo"},
{symbol:"🌈",name:"Prismatic Bridge"},
{symbol:"❄️",name:"Frost Rune"},
{symbol:"🌿",name:"Verdant Thread"},
{symbol:"🍄",name:"Mycelium Bloom"},
{symbol:"🐉",name:"Dragon Pulse"},
{symbol:"🦊",name:"Fox Mirage"},
{symbol:"🐺",name:"Wolf Howl"},
{symbol:"🦅",name:"Eagle Ascendant"},
{symbol:"🐍",name:"Serpent Coil"},
{symbol:"🦂",name:"Scorpion Sting"},
{symbol:"🕸️",name:"Spiderweb Snare"},
{symbol:"💎",name:"Diamond Core"},
{symbol:"🧲",name:"Magnet Chain"},
{symbol:"🧪",name:"Alchemist Phial"},
{symbol:"🪬",name:"Hamsa Ward"},
{symbol:"🧿",name:"Evil Eye Seal"},
{symbol:"🕯️",name:"Candlelit Vigil"},
{symbol:"🗝️",name:"Keybearer Glyph"},
{symbol:"🧭",name:"Compass Path"},
{symbol:"⏳",name:"Hourglass Toll"},
{symbol:"🌀",name:"Vortex Gate"},
{symbol:"💥",name:"Impact Nova"},
{symbol:"☄️",name:"Meteor Scar"},
{symbol:"🌌",name:"Cosmic Expanse"},
{symbol:"🏔️",name:"Mountain Throne"},
{symbol:"🌧️",name:"Rainfall Lament"},
{symbol:"🎭",name:"Mask of Fates"},
{symbol:"🎲",name:"Dice Mandate"}
];

function emojiSignature(value){
return Array.from(value).reduce((total,char,index)=>total + char.codePointAt(0)*(index+1),0);
}

function outcomeDetailsForCast(cast){
const signs=Array.isArray(cast) ? cast : [cast];
const signature=signs.reduce((total,sign,index)=>total + emojiSignature(sign)*(index+1),0);
return NON_HAND_OUTCOMES[signature % NON_HAND_OUTCOMES.length];
}

function outcomeForCast(cast){
return outcomeDetailsForCast(cast).symbol;
}

function outcomeNameForCast(cast){
return outcomeDetailsForCast(cast).name;
}

function outcomeNameMatrix(){
return Object.fromEntries(NON_HAND_OUTCOMES.map(outcome=>[outcome.symbol,outcome.name]));
}

function outcomeMatrix(){
return Object.fromEntries(Object.entries(GESTURES).map(([gesture,details])=>[gesture,{
gestureName:details.name,
outcome:outcomeForCast(gesture),
outcomeName:outcomeNameForCast(gesture)
}]));
}



function ultimateKey(signs){
return [...signs].sort().join("");
}

const ELEMENTAL_ULTIMATES=Object.fromEntries([
[["🤜","🤛","✊","👊","🖕"],{name:"Meteor Fang Cataclysm",element:"Inferno",atk:28,def:0,spc:7}],
[["🤚","🖐","✋","👐","🤲"],{name:"World-Turtle Aegis",element:"Terra",atk:0,def:32,spc:4}],
[["🖖","🤟","🤞","✌","☝"],{name:"Celestial Mystic Seal",element:"Astral",atk:4,def:4,spc:32}],
[["👏","🙌","🫶","🫴","👌"],{name:"Aurora Heart Mandala",element:"Luminous",atk:6,def:14,spc:24}],
[["👉","👈","👆","👇","🫵"],{name:"Five-Point Thunder Sentence",element:"Storm",atk:22,def:5,spc:15}]
].map(([signs,ultimate])=>[ultimateKey(signs),ultimate]));

const FINISHERS={

"👊":{
name:"Execution Blow",
atk:15
},

"✋":{
name:"Absolute Barrier",
def:15
},

"🖖":{
name:"Astral Seal",
spc:15
}

};




const CHANGELOG = {

title:"Emoji Jutsu Change Log",

summary:"Recent product and API updates for the Emoji Jutsu worker.",

source:"CHANGELOG.md",

entries:[
{
version:"1.2.0",
date:"2026-06-25",
title:"Telegram polish and leaderboard routes",
changes:[
"Added CORS preflight handling, public /changelog, and /leaderboard routes.",
"Added public rate limiting for /balance/simulate and listed /leaderboard in /help.",
"Fixed lookup verification for skin-tone-modified hand signs and the horns hand sign after users hit failed seals; this frustration should never have happened in the first place.",
"Improved Telegram bot previews, arena/profile displays, cancellation, typing indicators, and AI Butler combo selection."
]
},
{
version:"1.1.0",
date:"2026-06-22",
title:"Public change log",
changes:[
"Added GET /changelog so players and operators can inspect recent feature updates as JSON.",
"Linked the change log from /help and the admin console system shortcuts for easier discovery.",
"Documented the initial operational features already available in the worker, including the admin console, Telegram setup, Cloudflare AI chronicle generation, arena matchmaking, player profiles, signature jutsu, deterministic duels, and replay helpers."
]
},
{
version:"1.0.0",
date:"2026-06-01",
title:"Initial public API",
changes:[
"Launched deterministic emoji technique lookup, analysis, duel simulation, replay, training, rules, and gesture catalog endpoints.",
"Added persistent arena queue, battle history, leaderboard, adaptive AI Butler, D1 player profiles, and signature jutsu storage.",
"Added Telegram bot webhook handling plus configurable Cloudflare AI battle chronicles."
]
}
]

};

const CODEX={


help:{

title:"Emoji Jutsu Commands",

summary:"Every command returns JSON. Unknown paths return a clear not-a-command message with a curl example for /help.",

usage:[
"Pick 1-5 hand signs.",
"End every combo with 🙏.",
"URL encode emoji combos when you paste commands into a shell.",
"Use GET commands for quick lookups and POST commands when sending JSON bodies.",
"Admin config endpoints are locked until ADMIN_TOKEN or CONFIG_ADMIN_TOKEN is set with wrangler secret put; send that value as Bearer or X-Admin-Token."
],

commands:[
{method:"GET",path:"/help",description:"Show this command guide with curl examples.",curl:"curl \"$BASE_URL/help\""},
{method:"GET",path:"/changelog",description:"Show recent API and product changes.",curl:"curl \"$BASE_URL/changelog\""},
{method:"GET",path:"/about",description:"Show service identity and current application version.",curl:"curl \"$BASE_URL/about\""},
{method:"GET",path:"/lookup?combo=👊🖖🙏",description:"Cast a sealed technique and receive its generated name, rank, stats and battle style.",curl:"curl \"$BASE_URL/lookup?combo=%F0%9F%91%8A%F0%9F%96%96%F0%9F%99%8F\""},
{method:"GET",path:"/analyze?combo=👊🖖🙏",description:"Explain each hand sign in a technique and show how the final stats are built.",curl:"curl \"$BASE_URL/analyze?combo=%F0%9F%91%8A%F0%9F%96%96%F0%9F%99%8F\""},
{method:"GET",path:"/gestures",description:"List every available hand sign and its ATK, DEF, SPC and force type.",curl:"curl \"$BASE_URL/gestures\""},
{method:"GET",path:"/rules",description:"Read the deterministic combat rules, force triangle, finisher rules and replay guarantees.",curl:"curl \"$BASE_URL/rules\""},
{method:"GET",path:"/balance/simulate?maxLength=3",description:"Run the deterministic balance simulator over every 1-N gesture combo and report class/length win rates plus dominant combos.",curl:"curl \"$BASE_URL/balance/simulate?maxLength=3\""},
{method:"GET",path:"/duel?combo=👊🖖🙏&opponent=✋🤟🙏",description:"Compare two sealed techniques and return the winner, damage, scores and force analysis.",curl:"curl \"$BASE_URL/duel?combo=%F0%9F%91%8A%F0%9F%96%96%F0%9F%99%8F&opponent=%E2%9C%8B%F0%9F%A4%9F%F0%9F%99%8F\""},
{method:"GET",path:"/simulate?combo=👊🖖🙏&opponent=✋👐🙏",description:"Run a deterministic duel that can be replayed from the same inputs.",curl:"curl \"$BASE_URL/simulate?combo=%F0%9F%91%8A%F0%9F%96%96%F0%9F%99%8F&opponent=%E2%9C%8B%F0%9F%AB%90%F0%9F%99%8F\""},
{method:"GET",path:"/replay?combo=👊🖖🙏&opponent=✋👐🙏&matchId=MATCH-123",description:"Verify a previous deterministic match by passing the same combos and match id.",curl:"curl \"$BASE_URL/replay?combo=%F0%9F%91%8A%F0%9F%96%96%F0%9F%99%8F&opponent=%E2%9C%8B%F0%9F%AB%90%F0%9F%99%8F&matchId=MATCH-123\""},
{method:"GET",path:"/train",description:"Get a step-by-step starter lesson for building a combo.",curl:"curl \"$BASE_URL/train\""},
{method:"POST",path:"/queue",description:"Submit a sealed technique into the asynchronous arena queue.",curl:"curl -X POST \"$BASE_URL/queue\" -H \"Content-Type: application/json\" -d '{\"playerId\":\"shinobi\",\"combo\":\"👊🖖🙏\",\"includeButler\":true}'"},
{method:"GET",path:"/arena",description:"View persistent arena queue, history, leaderboard and AI Butler state.",curl:"curl \"$BASE_URL/arena\""},
{method:"GET",path:"/leaderboard",description:"View ranked arena leaders with records and win rates.",curl:"curl \"$BASE_URL/leaderboard\""},
{method:"GET",path:"/battle/:id",description:"Replay a completed arena battle from history.",curl:"curl \"$BASE_URL/battle/BATTLE-ID\""},
{method:"GET",path:"/butler",description:"Inspect the evolving AI Butler opponent and its next combo.",curl:"curl \"$BASE_URL/butler\""},
{method:"POST",path:"/telegram/config",description:"Save the Telegram bot token in KV and configure the Telegram webhook so the bot can receive updates. Requires ADMIN_TOKEN or CONFIG_ADMIN_TOKEN.",curl:"curl -X POST \"$BASE_URL/telegram/config\" -H \"Content-Type: application/json\" -H \"X-Admin-Token: $ADMIN_TOKEN\" -d '{\"token\":\"123456:ABC...\"}'"},
{method:"GET",path:"/telegram/status",description:"Check Telegram bot configuration, bot identity, webhook health, pending updates, and recent webhook delivery errors without returning the token. Requires ADMIN_TOKEN or CONFIG_ADMIN_TOKEN.",curl:"curl \"$BASE_URL/telegram/status\" -H \"X-Admin-Token: $ADMIN_TOKEN\""},
{method:"POST",path:"/ai/config",description:"Save the Cloudflare AI API token, account ID, model, and chronicle system prompt in KV for the AI model feature. Requires ADMIN_TOKEN or CONFIG_ADMIN_TOKEN.",curl:"curl -X POST \"$BASE_URL/ai/config\" -H \"Content-Type: application/json\" -H \"X-Admin-Token: $ADMIN_TOKEN\" -d '{\"token\":\"CF_API_TOKEN\",\"accountId\":\"CF_ACCOUNT_ID\",\"model\":\"@cf/meta/llama-3.1-8b-instruct\"}'"},
{method:"GET",path:"/ai/config",description:"Inspect the configured Cloudflare AI account and model without returning the token. Requires ADMIN_TOKEN or CONFIG_ADMIN_TOKEN.",curl:"curl \"$BASE_URL/ai/config\" -H \"X-Admin-Token: $ADMIN_TOKEN\""},
{method:"POST",path:"/ai/chronicle",description:"Send raw match JSON to Cloudflare AI and receive a dark anime battle chronicle using the configured model.",curl:"curl -X POST \"$BASE_URL/ai/chronicle\" -H \"Content-Type: application/json\" -d '{\"match\":{\"id\":\"MATCH-123\"},\"rounds\":[],\"winner\":\"Player 1\"}'"},
{method:"POST",path:"/player/create",description:"Create a persistent D1 player profile.",curl:"curl -X POST \"$BASE_URL/player/create\" -H \"Content-Type: application/json\" -d '{\"name\":\"shinobi\"}'"},
{method:"GET",path:"/player?id=PLAYER-ID",description:"Load a player profile.",curl:"curl \"$BASE_URL/player?id=PLAYER-ID\""},
{method:"POST",path:"/jutsu/save",description:"Save a player's signature jutsu.",curl:"curl -X POST \"$BASE_URL/jutsu/save\" -H \"Content-Type: application/json\" -d '{\"playerId\":\"PLAYER-ID\",\"name\":\"Astral Jab\",\"combo\":\"👊🖖🙏\"}'"},
{method:"GET",path:"/stats?id=PLAYER-ID",description:"View player progression, battle history and signature jutsu.",curl:"curl \"$BASE_URL/stats?id=PLAYER-ID\""}
]

},



rules:{

title:"The Jutsu System",

text:

`
Emoji Jutsu is a deterministic combat language.

Create a sequence of hand signs.

Every technique MUST end with 🙏.

The finisher seals the technique.

Three forces exist:

🔥 Kinetic
Power and aggression.

🛡 Barrier
Defense and control.

🔮 Mystic
Energy and complexity.


Kinetic > Mystic

Mystic > Barrier

Barrier > Kinetic

Repeat matching forces for synergy bonuses, but repeating the exact same hand sign adds a repetition penalty.
Longer combos add complexity, cost, and risk; each hand sign after the third adds extra risk so max-length combos are not always safest.
Risk lowers duel score and can create a small backlash in close exchanges.
Last hand sign before 🙏 can unlock a finisher.

Duel simulations are deterministic: the same combos and match ID always replay the same result.
Technique IDs are generated from each sealed combo for leaderboards and match history.
`

},


train:{

message:

`
TRAINING MODE

Step 1:
Choose 1-5 hand signs from the gesture list.

Step 2:
Mix power, defense and energy.

Step 3:
Seal your technique with 🙏.

Step 4:
Discover your spell.

Example:

💪👏👍🫶🙌🙏
`

}

};





function parseEmojis(input){

let result=[];
let remaining=input;


while(remaining.length){

let found=false;


for(const e of Object.keys(GESTURES)){

if(remaining.startsWith(e)){

result.push(e);
remaining=remaining.slice(e.length);
found=true;
break;

}

}


if(!found)
return null;

}


return result;

}





function encodeHex(buffer){

return Array.from(new Uint8Array(buffer))
.map(b=>b.toString(16).padStart(2,"0"))
.join("");

}



async function sha256Hex(value){

const bytes=new TextEncoder().encode(value);
const digest=await crypto.subtle.digest("SHA-256",bytes);

return encodeHex(digest);

}



function seedNumber(seed,index){

const slice=seed.slice(index*8,index*8+8);
return parseInt(slice,16) / 0xffffffff;

}



function scale(x){

return Math.floor(
x + Math.sqrt(x)*3
);

}






function buildSpell(combo){


let atk=0;
let def=0;
let spc=0;


let types=[];


combo.forEach(e=>{

let g=GESTURES[e];

atk+=g.atk;
def+=g.def;
spc+=g.spc;

types.push(g.type);

});



// synergy

for(let i=0;i<combo.length-1;i++){

let a=GESTURES[combo[i]];
let b=GESTURES[combo[i+1]];


if(a.type===b.type){

if(a.type==="kinetic")
atk+=3;

if(a.type==="barrier")
def+=3;

if(a.type==="mystic")
spc+=3;

}

}



atk=scale(atk);
def=scale(def);
spc=scale(spc);



let className;


if(atk>=def && atk>=spc)
className="Kinetic";


else if(def>=atk && def>=spc)
className="Barrier";


else
className="Mystic";





const baseTotal=atk+def+spc;
const uniqueSigns=new Set(combo).size;
const repetitionPenalty=(combo.length-uniqueSigns)*4;
const diversityBonus=uniqueSigns*2;
const complexityBonus=Math.max(0,combo.length-2)*2;
const longComboRisk=Math.max(0,combo.length-3)*LONG_COMBO_RISK_STEP;
const ultimate=ELEMENTAL_ULTIMATES[ultimateKey(combo)] || null;
if(ultimate){
atk+=ultimate.atk;
def+=ultimate.def;
spc+=ultimate.spc;
}
const power=Math.max(1,baseTotal + diversityBonus + complexityBonus - repetitionPenalty + (ultimate ? 30 : 0));
const cost=Math.ceil(power*0.42 + combo.length*4);
const risk=Math.max(1,Math.floor((atk*0.24 + spc*0.18) - (def*0.12) + repetitionPenalty + longComboRisk));

return {

atk,
def,
spc,

class:className,
power,
cost,
risk,
ultimate,
modifiers:{
diversityBonus,
complexityBonus,
repetitionPenalty,
longComboRisk
},

types:[...new Set(types)]

};

}





function rank(spell){

let total=spell.power ?? (
spell.atk+
spell.def+
spell.spc
);


if(total>100)
return "S";


if(total>75)
return "A";


if(total>50)
return "B";


return "C";

}



function applyFinisher(spell,last){

const finisher=FINISHERS[last];

if(!finisher)
return spell;

const boosted={...spell};

if(finisher.atk) boosted.atk+=finisher.atk;
if(finisher.def) boosted.def+=finisher.def;
if(finisher.spc) boosted.spc+=finisher.spc;

boosted.finisher=finisher.name;
boosted.power=boosted.atk+boosted.def+boosted.spc + (boosted.ultimate ? 30 : 0) + (boosted.modifiers?.diversityBonus ?? 0) + (boosted.modifiers?.complexityBonus ?? 0) - (boosted.modifiers?.repetitionPenalty ?? 0);
boosted.cost=Math.ceil(boosted.power*0.42);
boosted.risk=Math.max(1,Math.floor((boosted.atk*0.24 + boosted.spc*0.18) - (boosted.def*0.12) + (boosted.modifiers?.repetitionPenalty ?? 0) + (boosted.modifiers?.longComboRisk ?? 0)));

return boosted;

}



function forceAdvantage(attacker,defender){

if(attacker.class===defender.class)
return 0;

if(
(attacker.class==="Kinetic" && defender.class==="Mystic") ||
(attacker.class==="Mystic" && defender.class==="Barrier") ||
(attacker.class==="Barrier" && defender.class==="Kinetic")
)
return FORCE_ADVANTAGE_BONUS + Math.round(defender.power*FORCE_ADVANTAGE_SCALE);

return -(FORCE_ADVANTAGE_BONUS + Math.round(attacker.power*FORCE_ADVANTAGE_SCALE));

}



function scoreDuelist(spell,opponent,seed=0){

const deterministicPressure=(seed-0.5)*6;
return spell.atk*1.05 + spell.def*0.95 + spell.spc*0.85 + forceAdvantage(spell,opponent) - spell.cost*0.12 - spell.risk*0.35 + deterministicPressure;

}



function describeTechnique(spell){

const prefix=spell.spc>=spell.atk && spell.spc>=spell.def ? "Celestial" : spell.def>=spell.atk ? "Heavenly" : "Iron";
const core=spell.class==="Kinetic" ? "Fang" : spell.class==="Barrier" ? "Fortress" : "Seal";
return `${prefix} ${spell.class} ${core}`;

}



function forceAnalysis(attacker,defender){

const advantage=forceAdvantage(attacker,defender);

if(advantage>0)
return `${attacker.class} pressures ${defender.class}`;

if(advantage<0)
return `${defender.class} resists ${attacker.class}`;

return `${attacker.class} and ${defender.class} cancel evenly`;

}



async function decorateTechnique(parsed){

const idHash=await sha256Hex(parsed.decoded);
return {
...parsed,
id:`JUTSU-${idHash.slice(0,5).toUpperCase()}`,
name:describeTechnique(parsed.spell),
outcome:outcomeForCast(parsed.combo),
outcomeName:outcomeNameForCast(parsed.combo)
};

}



async function simulateBattle(player,opponent,requestedMatchId){

const canonical=[player.decoded,opponent.decoded,requestedMatchId ?? ""].join("|");
const matchHash=await sha256Hex(canonical);
const matchId=requestedMatchId || `MATCH-${matchHash.slice(0,10).toUpperCase()}`;
const seed=await sha256Hex(`${player.decoded}|${opponent.decoded}|${matchId}`);

const playerScore=scoreDuelist(player.spell,opponent.spell,seedNumber(seed,0));
const opponentScore=scoreDuelist(opponent.spell,player.spell,seedNumber(seed,1));
const playerRiskBacklash=Math.floor(player.spell.risk*0.18);
const opponentRiskBacklash=Math.floor(opponent.spell.risk*0.18);
const playerDamage=Math.max(0,Math.round(playerScore - opponent.spell.def*0.35 - playerRiskBacklash + seedNumber(seed,2)*5));
const opponentDamage=Math.max(0,Math.round(opponentScore - player.spell.def*0.35 - opponentRiskBacklash + seedNumber(seed,3)*5));

let winner="Draw";
if(playerDamage>opponentDamage) winner="Player 1";
if(opponentDamage>playerDamage) winner="Player 2";

return {
match:{
id:matchId,
seed,
player1:player.name,
player2:opponent.name,
player1TechniqueId:player.id,
player2TechniqueId:opponent.id
},
analysis:[
`Player 1 created a ${player.spell.types.join("-")} ${player.spell.class} technique`,
`Player 2 created a ${opponent.spell.types.join("-")} ${opponent.spell.class} technique`,
forceAnalysis(player.spell,opponent.spell),
forceAnalysis(opponent.spell,player.spell),
`Player 1 cost ${player.spell.cost} with risk ${player.spell.risk} (-${Number((player.spell.risk*0.35).toFixed(2))} score, -${playerRiskBacklash} backlash)`,
`Player 2 cost ${opponent.spell.cost} with risk ${opponent.spell.risk} (-${Number((opponent.spell.risk*0.35).toFixed(2))} score, -${opponentRiskBacklash} backlash)`,
`Player 1 repetition penalty ${player.spell.modifiers?.repetitionPenalty ?? 0}; long combo risk ${player.spell.modifiers?.longComboRisk ?? 0}`,
`Player 2 repetition penalty ${opponent.spell.modifiers?.repetitionPenalty ?? 0}; long combo risk ${opponent.spell.modifiers?.longComboRisk ?? 0}`
],
rounds:[
{attacker:"Player 1",damage:playerDamage,score:Number(playerScore.toFixed(2))},
{attacker:"Player 2",damage:opponentDamage,score:Number(opponentScore.toFixed(2))}
],
winner
};

}





function mergeAiButler(stored){

if(!stored)
return {...MEMORY_ARENA.aiButler,history:[...MEMORY_ARENA.aiButler.history]};

let history=[];
try{
history=stored.history_json ? JSON.parse(stored.history_json) : (Array.isArray(stored.history) ? stored.history : []);
}catch{
history=[];
}

return {
id:stored.id || MEMORY_ARENA.aiButler.id,
name:stored.name || MEMORY_ARENA.aiButler.name,
history,
winRate:Number(stored.win_rate ?? stored.winRate ?? MEMORY_ARENA.aiButler.winRate),
preferredStyle:stored.style || stored.preferredStyle || MEMORY_ARENA.aiButler.preferredStyle,
adaptationLevel:Number(stored.adaptation ?? stored.adaptationLevel ?? MEMORY_ARENA.aiButler.adaptationLevel)
};

}



async function loadAiButlerFromD1(env){

if(!env?.DB)
return null;

try{
const stored=await env.DB.prepare(`
SELECT id, name, style, win_rate, adaptation, history_json
FROM ai_butlers
WHERE id = ?
`).bind(MEMORY_ARENA.aiButler.id).first();

return mergeAiButler(stored);
}catch{
return null;
}

}



async function persistAiButlerToD1(env,aiButler,lastCombo){

if(!env?.DB || !aiButler)
return;

try{
await env.DB.prepare(`
INSERT INTO ai_butlers (id, name, style, win_rate, adaptation, last_combo, history_json, updated_at, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
name = excluded.name,
style = excluded.style,
win_rate = excluded.win_rate,
adaptation = excluded.adaptation,
last_combo = excluded.last_combo,
history_json = excluded.history_json,
updated_at = excluded.updated_at
`).bind(
aiButler.id,
aiButler.name,
aiButler.preferredStyle,
aiButler.winRate,
aiButler.adaptationLevel,
lastCombo || aiComboForButler(aiButler),
JSON.stringify(aiButler.history || []),
createdAt(),
createdAt()
).run();
}catch(error){
try{
await env.DB.prepare(`
INSERT INTO ai_butlers (id, name, style, win_rate, adaptation, last_combo, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
name = excluded.name,
style = excluded.style,
win_rate = excluded.win_rate,
adaptation = excluded.adaptation,
last_combo = excluded.last_combo
`).bind(
aiButler.id,
aiButler.name,
aiButler.preferredStyle,
aiButler.winRate,
aiButler.adaptationLevel,
lastCombo || aiComboForButler(aiButler),
createdAt()
).run();
}catch(fallbackError){
console.warn("ai_butlers persistence skipped",error.message,fallbackError.message);
}
}

}



function updateAiButlerAfterBattle(aiButler,{battleId,winnerId,aiOpponent,completedAt}){

const updated={
...aiButler,
history:[...(aiButler.history || [])]
};

const aiWon=winnerId===updated.id;
updated.history.unshift({battleId,winner:winnerId,at:completedAt});
updated.history=updated.history.slice(0,AI_BUTLER_HISTORY_LIMIT);
const wins=updated.history.filter(h=>h.winner===updated.id).length;
updated.winRate=Number((wins/updated.history.length).toFixed(2));
updated.adaptationLevel=Number(Math.min(1,updated.adaptationLevel+(aiWon ? 0.01 : 0.05)).toFixed(2));
if(!aiWon && aiOpponent?.spell?.class)
updated.preferredStyle=aiOpponent.spell.class;

return updated;

}


function shouldForbidMemoryArena(env){
return !arenaKvNamespace(env) && String(env?.ENVIRONMENT || env?.NODE_ENV || "").toLowerCase()==="production";
}

async function loadArena(env){

const persistence=getArenaPersistenceMode(env);
if(shouldForbidMemoryArena(env))
throw new Error(persistence.productionError);
if(!persistence.durable)
console.warn(persistence.warning);

const arenaKv=arenaKvNamespace(env);
if(arenaKv){
const stored=await arenaKv.get(MEMORY_ARENA_KEY,"json");
if(stored)
return normalizeArena(stored);
}

const aiButler=await loadAiButlerFromD1(env);
if(aiButler)
MEMORY_ARENA.aiButler=aiButler;

return normalizeArena(MEMORY_ARENA);

}



async function saveArena(env,arena){

if(shouldForbidMemoryArena(env))
throw new Error(getArenaPersistenceMode(env).productionError);

const arenaKv=arenaKvNamespace(env);
if(arenaKv)
await arenaKv.put(MEMORY_ARENA_KEY,JSON.stringify(arena));

await persistAiButlerToD1(env,arena.aiButler);

MEMORY_ARENA.queue=arena.queue;
MEMORY_ARENA.activeBattles=arena.activeBattles;
MEMORY_ARENA.history=arena.history;
MEMORY_ARENA.leaderboard=arena.leaderboard;
MEMORY_ARENA.player_rating=arena.player_rating;
MEMORY_ARENA.player_wins=arena.player_wins;
MEMORY_ARENA.player_losses=arena.player_losses;
MEMORY_ARENA.player_rank=arena.player_rank;
MEMORY_ARENA.aiButler=arena.aiButler;

}



function nowId(prefix){

return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(16).slice(2,6).toUpperCase()}`;

}



function requireDb(env){

if(!env?.DB)
return {error:"D1 database binding DB is not configured",status:503};

return null;

}



function createdAt(){

return Date.now();

}



async function createPlayer(request,env){

const dbError=requireDb(env);
if(dbError)
return json({error:dbError.error},dbError.status);

const url=new URL(request.url);
let body={};

if(request.method==="POST"){
try{
body=await request.json();
}catch{
body={};
}
}

const username=(body.username || body.name || url.searchParams.get("username") || url.searchParams.get("name") || "").trim();

if(!username)
return json({error:"Missing player name"},400);

const id=crypto.randomUUID();

try{
await env.DB.prepare(`
INSERT INTO players (id, username, created_at)
VALUES (?, ?, ?)
`).bind(id,username,createdAt()).run();
}catch(error){
return json({error:"Player could not be created",detail:error.message},409);
}

return json({
status:"created",
playerId:id,
username
},201);

}



async function getPlayer(request,env){

const dbError=requireDb(env);
if(dbError)
return json({error:dbError.error},dbError.status);

const playerId=new URL(request.url).searchParams.get("id");

if(!playerId)
return json({error:"Missing player id"},400);

const player=await env.DB.prepare(`
SELECT * FROM players WHERE id = ?
`).bind(playerId).first();

if(!player)
return json({error:"Player not found"},404);

return json({player});

}



async function saveSignature(request,env){

const dbError=requireDb(env);
if(dbError)
return json({error:dbError.error},dbError.status);

if(request.method!=="POST")
return json({error:"Use POST /jutsu/save with JSON body"},405);

let body={};
try{
body=await request.json();
}catch{
return json({error:"Invalid JSON body"},400);
}

const playerId=body.playerId;
const signatureName=(body.name || "").trim();
const parsed=parseTechnique(body.combo);

if(!playerId)
return json({error:"Missing playerId"},400);

if(!signatureName)
return json({error:"Missing signature jutsu name"},400);

if(parsed.error)
return json({error:parsed.error},parsed.status);

const player=await env.DB.prepare(`
SELECT id FROM players WHERE id = ?
`).bind(playerId).first();

if(!player)
return json({error:"Player not found"},404);

const decorated=await decorateTechnique(parsed);
const id=crypto.randomUUID();

await env.DB.prepare(`
INSERT INTO signature_jutsu
(id, player_id, user_id, name, combo, atk, def, spc, class, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).bind(
id,
playerId,
playerId,
signatureName,
decorated.decoded,
decorated.spell.atk,
decorated.spell.def,
decorated.spell.spc,
decorated.spell.class,
createdAt()
).run();

return json({
status:"signature_created",
jutsu:{
id,
name:signatureName,
combo:decorated.decoded,
techniqueId:decorated.id,
generatedName:decorated.name,
stats:decorated.spell
}
},201);

}



async function getStats(request,env){

const dbError=requireDb(env);
if(dbError)
return json({error:dbError.error},dbError.status);

const playerId=new URL(request.url).searchParams.get("id");

if(!playerId)
return json({error:"Missing player id"},400);

const player=await env.DB.prepare(`
SELECT * FROM players WHERE id = ?
`).bind(playerId).first();

if(!player)
return json({error:"Player not found"},404);

const jutsu=await env.DB.prepare(`
SELECT * FROM signature_jutsu WHERE player_id = ? ORDER BY created_at DESC
`).bind(playerId).all();

const battles=await env.DB.prepare(`
SELECT * FROM battles
WHERE player_a = ? OR player_b = ?
ORDER BY created_at DESC
LIMIT 25
`).bind(playerId,playerId).all();

return json({
player,
signature_jutsu:jutsu.results,
battles:battles.results
});

}



// Canonicalization is forward-looking: new duel records are saved trimmed and NFC-normalized.
// Legacy rows with non-NFC combo text still need a data migration before they can match these values.
function canonicalCombo(combo){
return String(combo || "").normalize("NFC").trim();
}



async function persistDuelResult(env,{playerA,playerB,comboA,comboB,replay}){

if(!env?.DB || !playerA || !playerB)
return;

comboA=canonicalCombo(comboA);
comboB=canonicalCombo(comboB);

const winnerId=replay.winner==="Player 1" ? playerA : replay.winner==="Player 2" ? playerB : "Draw";
const timestamp=createdAt();

await env.DB.batch([
env.DB.prepare(`
INSERT INTO battles (id, player_a, player_b, combo_a, combo_b, winner, log, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`).bind(replay.match.id,playerA,playerB,comboA,comboB,winnerId,JSON.stringify(replay),timestamp),
env.DB.prepare(`
UPDATE players
SET wins = wins + ?, losses = losses + ?, draws = draws + ?, points = points + ?, xp = xp + ?
WHERE id = ?
`).bind(replay.winner==="Player 1" ? 1 : 0,replay.winner==="Player 2" ? 1 : 0,replay.winner==="Draw" ? 1 : 0,replay.winner==="Player 1" ? 100 : replay.winner==="Draw" ? 10 : -50,replay.winner==="Player 1" ? 25 : 5,playerA),
env.DB.prepare(`
UPDATE players
SET wins = wins + ?, losses = losses + ?, draws = draws + ?, points = points + ?, xp = xp + ?
WHERE id = ?
`).bind(replay.winner==="Player 2" ? 1 : 0,replay.winner==="Player 1" ? 1 : 0,replay.winner==="Draw" ? 1 : 0,replay.winner==="Player 2" ? 100 : replay.winner==="Draw" ? 10 : -50,replay.winner==="Player 2" ? 25 : 5,playerB)
]);

if(winnerId!=="Draw"){
await env.DB.prepare(`
UPDATE signature_jutsu
SET usage_count = usage_count + 1,
wins = wins + CASE WHEN player_id = ? THEN 1 ELSE 0 END
WHERE player_id IN (?, ?) AND TRIM(combo) IN (?, ?)
`).bind(winnerId,playerA,playerB,comboA,comboB).run();
}else{
await env.DB.prepare(`
UPDATE signature_jutsu
SET usage_count = usage_count + 1
WHERE player_id IN (?, ?) AND TRIM(combo) IN (?, ?)
`).bind(playerA,playerB,comboA,comboB).run();
}

}



function dominantType(spell){

return spell.class.toLowerCase();

}



function isCompatible(a,b){

if(a.playerId===b.playerId)
return false;

const powerGap=Math.abs(a.spell.power-b.spell.power);
const maxPower=Math.max(a.spell.power,b.spell.power,1);
const fairPower=powerGap/maxPower<=0.35;
const styleContrast=dominantType(a.spell)!==dominantType(b.spell);

return fairPower || styleContrast || a.riskQueue || b.riskQueue;

}



function findMatch(queue){

let fallback=null;

for(let i=0;i<queue.length;i++){
for(let j=i+1;j<queue.length;j++){
if(queue[i].playerId===queue[j].playerId)
continue;

if(isCompatible(queue[i],queue[j]))
return [i,j];

fallback ??= [i,j];
}
}

return fallback;

}



function recordLeaderboard(arena,winnerId,loserId,draw=false){

for(const id of [winnerId,loserId]){
if(!arena.leaderboard[id])
arena.leaderboard[id]={playerId:id,wins:0,losses:0,draws:0,battles:0};
}

arena.leaderboard[winnerId].battles++;
arena.leaderboard[loserId].battles++;

if(draw){
arena.leaderboard[winnerId].draws++;
arena.leaderboard[loserId].draws++;
return;
}

arena.leaderboard[winnerId].wins++;
arena.leaderboard[loserId].losses++;

}



const RANKED_INITIAL_RATING = 1000;
const RANKED_K_FACTOR = 32;
const RANK_TIERS = [
{ name: "Bronze", min: 0 },
{ name: "Silver", min: 1100 },
{ name: "Gold", min: 1250 },
{ name: "Platinum", min: 1400 },
{ name: "Astral", min: 1600 },
{ name: "Mythic", min: 1800 }
];

function rankForRating(rating){
const safeRating=Number.isFinite(Number(rating)) ? Number(rating) : RANKED_INITIAL_RATING;
return [...RANK_TIERS].reverse().find(tier=>safeRating>=tier.min)?.name || RANK_TIERS[0].name;
}

function ensureRankedPlayer(arena,playerId){
const id=String(playerId || "anonymous");
arena.player_rating ||= {};
arena.player_wins ||= {};
arena.player_losses ||= {};
arena.player_rank ||= {};
if(!Number.isFinite(Number(arena.player_rating[id])))
arena.player_rating[id]=RANKED_INITIAL_RATING;
arena.player_wins[id]=Number(arena.player_wins[id] || 0);
arena.player_losses[id]=Number(arena.player_losses[id] || 0);
arena.player_rank[id]=rankForRating(arena.player_rating[id]);
return {
playerId:id,
rating:Number(arena.player_rating[id]),
wins:arena.player_wins[id],
losses:arena.player_losses[id],
rank:arena.player_rank[id]
};
}

function applyRankedResult(arena,playerId,opponentId,result){
const player=ensureRankedPlayer(arena,playerId);
const opponent=ensureRankedPlayer(arena,opponentId);
const expected=1/(1+Math.pow(10,(opponent.rating-player.rating)/400));
const newRating=player.rating + RANKED_K_FACTOR*(result-expected);
arena.player_rating[player.playerId]=Math.round(newRating);
if(result===1)
arena.player_wins[player.playerId]=player.wins+1;
else if(result===0)
arena.player_losses[player.playerId]=player.losses+1;
arena.player_rank[player.playerId]=rankForRating(arena.player_rating[player.playerId]);
return {
...ensureRankedPlayer(arena,player.playerId),
previousRating:player.rating,
expected:Number(expected.toFixed(4)),
ratingChange:arena.player_rating[player.playerId]-player.rating
};
}

function recordRankedDuel(arena,playerA,playerB,winnerId){
if(!playerA || !playerB || playerA===playerB)
return null;
const beforeA=ensureRankedPlayer(arena,playerA);
const beforeB=ensureRankedPlayer(arena,playerB);
const resultA=winnerId==="Draw" ? 0.5 : winnerId===playerA ? 1 : 0;
const resultB=winnerId==="Draw" ? 0.5 : winnerId===playerB ? 1 : 0;
const expectedA=1/(1+Math.pow(10,(beforeB.rating-beforeA.rating)/400));
const expectedB=1/(1+Math.pow(10,(beforeA.rating-beforeB.rating)/400));
arena.player_rating[beforeA.playerId]=Math.round(beforeA.rating + RANKED_K_FACTOR*(resultA-expectedA));
arena.player_rating[beforeB.playerId]=Math.round(beforeB.rating + RANKED_K_FACTOR*(resultB-expectedB));
if(resultA===1) arena.player_wins[beforeA.playerId]=beforeA.wins+1;
else if(resultA===0) arena.player_losses[beforeA.playerId]=beforeA.losses+1;
if(resultB===1) arena.player_wins[beforeB.playerId]=beforeB.wins+1;
else if(resultB===0) arena.player_losses[beforeB.playerId]=beforeB.losses+1;
arena.player_rank[beforeA.playerId]=rankForRating(arena.player_rating[beforeA.playerId]);
arena.player_rank[beforeB.playerId]=rankForRating(arena.player_rating[beforeB.playerId]);
const afterA=ensureRankedPlayer(arena,beforeA.playerId);
const afterB=ensureRankedPlayer(arena,beforeB.playerId);
return {
[beforeA.playerId]:{...afterA,previousRating:beforeA.rating,expected:Number(expectedA.toFixed(4)),ratingChange:afterA.rating-beforeA.rating},
[beforeB.playerId]:{...afterB,previousRating:beforeB.rating,expected:Number(expectedB.toFixed(4)),ratingChange:afterB.rating-beforeB.rating}
};
}

function rankedLeaderboard(arena){
const ids=new Set([
...Object.keys(arena.player_rating || {}),
...Object.keys(arena.player_wins || {}),
...Object.keys(arena.player_losses || {})
]);
return [...ids].map(id=>ensureRankedPlayer(arena,id))
.map(row=>({ ...row, battles:row.wins+row.losses, winRate:row.wins+row.losses ? Number((row.wins/(row.wins+row.losses)).toFixed(4)) : 0 }))
.sort((a,b)=>b.rating-a.rating || b.wins-a.wins || a.losses-b.losses || a.playerId.localeCompare(b.playerId));
}

function aiComboForButler(ai){

const winRate=Number(ai?.winRate ?? 0.5);
const adaptation=Number(ai?.adaptationLevel ?? 0);
const style=ai?.preferredStyle || "Mystic";
const history=Array.isArray(ai?.history) ? ai.history : [];
const recentlyLost=history.slice(0,3).some(entry=>entry.winner && entry.winner!==ai.id);

if(winRate<0.35 || (recentlyLost && adaptation>0.35))
return "✋👐🤲🖐🙏";

if(style==="Kinetic")
return adaptation>0.6 ? "👊🤜✊🖕🙏" : "👊🤜✊🙏";

if(style==="Barrier")
return adaptation>0.6 ? "✋🤚👐🤲🙏" : "✋🤚👐🙏";

if(style==="Mystic")
return adaptation>0.6 ? "🖖🤞🤟☝🙏" : "🖖🤞🤟🙏";

return winRate>0.65 ? "👉👈👆👇🫵🙏" : "🖖🤞🤟🙏";

}



async function createQueueEntry({combo,playerId,riskQueue=false,isAi=false}){

const safePlayerId=String(playerId || (isAi ? "AI-BUTLER-1" : "anonymous")).trim();
if(!safePlayerId)
return {error:"Missing playerId",status:400};

let parsed=parseTechnique(combo);
if(parsed.error)
return {error:parsed.error,status:parsed.status};

parsed=await decorateTechnique(parsed);

return {
id:nowId("QUEUE"),
playerId:safePlayerId,
combo:parsed.decoded,
techniqueId:parsed.id,
name:parsed.name,
spell:parsed.spell,
status:"waiting",
riskQueue,
isAi,
createdAt:new Date().toISOString()
};

}




async function persistQueueEntry(env,entry){

if(!env?.DB || !entry)
return;

try{
await env.DB.prepare(`
INSERT INTO matchmaking_queue
(id, player_id, combo, technique_id, name, spell_json, status, risk_queue, is_ai, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).bind(
entry.id,
entry.playerId,
entry.combo,
entry.techniqueId,
entry.name,
JSON.stringify(entry.spell),
entry.status,
entry.riskQueue ? 1 : 0,
entry.isAi ? 1 : 0,
createdAt()
).run();
}catch(error){
console.warn("matchmaking_queue persistence skipped",error.message);
}

}

async function resolveArena(arena,env){

let matched=0;

while(arena.queue.length>1){
const pair=findMatch(arena.queue);
if(!pair)
break;

const [high,low]=pair.sort((a,b)=>b-a);
const second=arena.queue.splice(high,1)[0];
const first=arena.queue.splice(low,1)[0];

const battleId=nowId("BATTLE");
const player={decoded:first.combo,spell:first.spell,id:first.techniqueId,name:first.playerId};
const opponent={decoded:second.combo,spell:second.spell,id:second.techniqueId,name:second.playerId};
const replay=await simulateBattle(player,opponent,battleId);
await persistDuelResult(env,{playerA:first.playerId,playerB:second.playerId,comboA:first.combo,comboB:second.combo,replay});
const winnerId=replay.winner==="Player 1" ? first.playerId : replay.winner==="Player 2" ? second.playerId : "Draw";

recordLeaderboard(arena,first.playerId,second.playerId,winnerId==="Draw");
const ranked=recordRankedDuel(arena,first.playerId,second.playerId,winnerId);

const battle={
id:battleId,
status:"complete",
fighters:[first,second],
timeline:[
`${first.playerId} casts ${first.name}`,
`${second.playerId} responds with ${second.name}`,
...replay.analysis,
`Outcome: ${winnerId}`
],
winner:winnerId,
replay,
createdAt:new Date().toISOString(),
completedAt:new Date().toISOString(),
ranked
};

arena.history.unshift(battle);

if(first.isAi || second.isAi){
const aiOpponent=first.isAi ? second : first;
arena.aiButler=updateAiButlerAfterBattle(arena.aiButler,{
battleId,
winnerId,
aiOpponent,
completedAt:battle.completedAt
});
}

matched++;
}

return matched;

}


function normalizeEmojiModifiers(value){
return String(value || "").replace(EMOJI_SKIN_TONE_MODIFIER_PATTERN, "");
}

function parseTechnique(input){

if(!input)
return {error:"Missing combo",status:400};

let decoded;
try{
decoded=normalizeEmojiModifiers(decodeURIComponent(input));
}catch{
return {
error:"Combo could not be decoded. Please URL-encode emoji combos, for example /lookup?combo=%F0%9F%91%8A%F0%9F%99%8F",
status:400
};
}

if(!decoded.endsWith(FINISHER))
return {error:"Every technique must end with 🙏",status:400};

const core=decoded.slice(0,decoded.length-FINISHER.length);

const combo=parseEmojis(core);

if(!combo)
return {error:"Unknown gesture detected",status:400};

if(combo.length<1)
return {error:"Choose at least one hand sign before 🙏",status:400};

if(combo.length>MAX_HAND_SIGNS)
return {error:`Training rules allow 1-${MAX_HAND_SIGNS} hand signs before 🙏`,status:400};

const spell=applyFinisher(buildSpell(combo),combo[combo.length-1]);

return {decoded,combo,spell};

}



function analyze(combo){


return combo.map(e=>{

let g=GESTURES[e];


return `${e} ${g.name} → ${outcomeForCast(e)} ${outcomeNameForCast(e)}: +${g.atk} ATK +${g.def} DEF +${g.spc} SPC`;

});

}






async function getStoredAiConfig(env){

if(!env?.BOT_SESSIONS)
return {};

return (await env.BOT_SESSIONS.get(AI_CONFIG_KEY,"json")) || {};

}



async function getAiConfig(env){

const stored=await getStoredAiConfig(env);

return {
token:stored.token || env?.CLOUDFLARE_AI_API_TOKEN || env?.CF_AI_API_TOKEN || "",
accountId:stored.accountId || env?.CLOUDFLARE_ACCOUNT_ID || env?.CF_ACCOUNT_ID || "",
model:stored.model || env?.CLOUDFLARE_AI_MODEL || env?.CF_AI_MODEL || DEFAULT_CHRONICLE_MODEL,
systemPrompt:stored.systemPrompt || env?.CHRONICLE_SYSTEM_PROMPT || CHRONICLE_SYSTEM_PROMPT,
maxTokens:Number.parseInt(stored.maxTokens ?? stored.max_tokens ?? env?.CHRONICLE_MAX_TOKENS ?? DEFAULT_CHRONICLE_MAX_TOKENS,10) || DEFAULT_CHRONICLE_MAX_TOKENS,
updatedAt:stored.updatedAt || null
};

}



function redactAiConfig(config){

return {
configured:Boolean(config.token && config.accountId && config.model),
hasToken:Boolean(config.token),
accountId:config.accountId,
model:config.model,
systemPrompt:config.systemPrompt,
maxTokens:config.maxTokens,
updatedAt:config.updatedAt
};

}



function configAuthToken(env){
return env?.ADMIN_TOKEN || env?.CONFIG_ADMIN_TOKEN || "";
}

function isAuthorizedConfigRequest(request,env){
const token=configAuthToken(env);
if(!token)
return false;
const auth=request.headers.get("Authorization") || "";
const bearer=auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
const header=request.headers.get("X-Admin-Token") || "";
return bearer===token || header===token;
}

function requireConfigAuth(request,env){
if(isAuthorizedConfigRequest(request,env))
return null;
return json({error:"Unauthorized. Set ADMIN_TOKEN and send it as Bearer or X-Admin-Token."},401);
}



async function handleAiConfig(request,env){

const authError=requireConfigAuth(request,env);
if(authError)
return authError;

if(!env?.BOT_SESSIONS)
return json({error:"Missing BOT_SESSIONS KV binding"},503);

if(request.method==="GET")
return json(redactAiConfig(await getAiConfig(env)));

if(request.method!=="POST")
return json({error:"Use GET or POST /ai/config with JSON body"},405);

let body={};
try{
body=await request.json();
}catch{
return json({error:"Send JSON with token, accountId, and optional model fields"},400);
}

const existing=await getStoredAiConfig(env);
const token=(body.token || body.apiToken || body.cloudflareAiApiToken || existing.token || "").trim();
const accountId=(body.accountId || body.accountID || body.cloudflareAccountId || existing.accountId || "").trim();
const model=(body.model || existing.model || DEFAULT_CHRONICLE_MODEL).trim();
const systemPrompt=(body.systemPrompt || existing.systemPrompt || CHRONICLE_SYSTEM_PROMPT).trim();
const maxTokens=Number.parseInt(body.maxTokens ?? body.max_tokens ?? existing.maxTokens ?? DEFAULT_CHRONICLE_MAX_TOKENS,10);

if(!token)
return json({error:"Missing Cloudflare AI API token"},400);

if(!accountId)
return json({error:"Missing Cloudflare account ID"},400);

if(!model)
return json({error:"Missing Cloudflare AI model"},400);

if(!Number.isFinite(maxTokens) || maxTokens<1)
return json({error:"maxTokens must be a positive integer"},400);

const config={token,accountId,model,systemPrompt,maxTokens,updatedAt:new Date().toISOString()};
await env.BOT_SESSIONS.put(AI_CONFIG_KEY,JSON.stringify(config));

return json({
ok:true,
...redactAiConfig(config),
message:"Cloudflare AI API token, account ID, model, max tokens, and chronicle system prompt saved. The token is not returned."
});

}



async function handleAiChronicle(request,env){

if(request.method!=="POST")
return json({error:"Use POST /ai/chronicle with raw match JSON"},405);

const limited=await checkRateLimit(env,request,"ai-chronicle",CHRONICLE_RATE_LIMIT);
if(limited)
return limited;

const config=await getAiConfig(env);
if(!config.token || !config.accountId)
return json({error:"Cloudflare AI is not configured. Set it with POST /ai/config."},503);

const contentLength=Number.parseInt(request.headers.get("Content-Length") || "0",10);
if(contentLength>MAX_CHRONICLE_BODY_BYTES)
return json({error:`Match payload exceeds ${MAX_CHRONICLE_BODY_BYTES} byte limit`},413);

let rawBody;
try{
rawBody=await request.text();
}catch{
return json({error:"Could not read request body"},400);
}

if(new TextEncoder().encode(rawBody).length>MAX_CHRONICLE_BODY_BYTES)
return json({error:`Match payload exceeds ${MAX_CHRONICLE_BODY_BYTES} byte limit`},413);

let matchData;
try{
matchData=JSON.parse(rawBody);
}catch{
return json({error:"Invalid JSON body"},400);
}

const modelPath=config.model.split("/").map(encodeURIComponent).join("/");
const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(config.accountId)}/ai/run/${modelPath}`,{
method:"POST",
headers:{
"Authorization":`Bearer ${config.token}`,
"Content-Type":"application/json"
},
body:JSON.stringify({
messages:[
{role:"system",content:config.systemPrompt},
{role:"user",content:rawBody}
],
max_tokens:config.maxTokens || DEFAULT_CHRONICLE_MAX_TOKENS
})
});

let cloudflare;
const raw=await response.text();
try{
cloudflare=raw ? JSON.parse(raw) : {};
}catch{
cloudflare={raw};
}

if(!response.ok)
return json({error:"Cloudflare AI request failed",status:response.status,detail:cloudflare},502);

const chronicle=cloudflare.result?.response || cloudflare.result?.text || cloudflare.response || cloudflare.result || cloudflare;

return json({
ok:true,
model:config.model,
chronicle,
cloudflare
});

}

function clientRateLimitKey(request,bucket){
const ip=request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() || "local";
const window=Math.floor(Date.now()/(RATE_LIMIT_WINDOW_SECONDS*1000));
return `rate:${bucket}:${ip}:${window}`;
}

async function checkRateLimit(env,request,bucket,limit){
if(!env?.BOT_SESSIONS)
return null;
const key=clientRateLimitKey(request,bucket);
const current=Number.parseInt(await env.BOT_SESSIONS.get(key) || "0",10);
if(current>=limit)
return json({error:"Rate limit exceeded",bucket,limit,windowSeconds:RATE_LIMIT_WINDOW_SECONDS},429);
await env.BOT_SESSIONS.put(key,String(current+1),{expirationTtl:RATE_LIMIT_WINDOW_SECONDS*2});
return null;
}

function sealedComboFromSigns(signs){
return `${signs.join("")}${FINISHER}`;
}

async function runBalanceSimulator(maxLength=3,limit=PUBLIC_BALANCE_MAX_LENGTH){
const gestures=Object.keys(GESTURES);
const cappedLength=Math.max(1,Math.min(limit,Number(maxLength) || 3));
const combos=[];
function walk(prefix,length){
if(prefix.length===length){
const parsed=parseTechnique(encodeURIComponent(sealedComboFromSigns(prefix)));
combos.push({signs:[...prefix],decoded:sealedComboFromSigns(prefix),spell:parsed.spell,name:describeTechnique(parsed.spell),id:`SIM-${combos.length}`});
return;
}
for(const gesture of gestures)
walk([...prefix,gesture],length);
}
for(let length=1;length<=cappedLength;length++)
walk([],length);
const stats=new Map();
for(const combo of combos)
stats.set(combo.decoded,{combo:combo.decoded,class:combo.spell.class,length:combo.signs.length,wins:0,losses:0,draws:0,battles:0,rank:rank(combo.spell),power:combo.spell.power,ultimate:combo.spell.ultimate?.name || null});
for(let i=0;i<combos.length;i++){
for(let j=i+1;j<combos.length;j++){
const battle=await simulateBattle(combos[i],combos[j],`BAL-${i}-${j}`);
const a=stats.get(combos[i].decoded);
const b=stats.get(combos[j].decoded);
a.battles++;
b.battles++;
if(battle.winner==="Player 1"){a.wins++;b.losses++;}
else if(battle.winner==="Player 2"){b.wins++;a.losses++;}
else {a.draws++;b.draws++;}
}
}
const entries=[...stats.values()].map(item=>({...item,winRate:item.battles ? Number((item.wins/item.battles).toFixed(4)) : 0}));
return {
comboCount:combos.length,
maxLength:cappedLength,
classLengthBreakdown:Object.values(entries.reduce((acc,item)=>{
const key=`${item.class}:${item.length}`;
acc[key] ||= {class:item.class,length:item.length,wins:0,losses:0,draws:0,battles:0};
acc[key].wins+=item.wins; acc[key].losses+=item.losses; acc[key].draws+=item.draws; acc[key].battles+=item.battles;
return acc;
},{})).map(row=>({...row,winRate:row.battles ? Number((row.wins/row.battles).toFixed(4)) : 0})),
topCombos:entries.sort((a,b)=>b.winRate-a.winRate || b.power-a.power).slice(0,25)
};
}





function adminPage(){

return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Emoji Jutsu Admin Console</title>
<style>
:root{color-scheme:dark;--bg:#0b1020;--panel:#121a33;--panel2:#182345;--text:#eef3ff;--muted:#9fb0d8;--accent:#8b5cf6;--good:#34d399;--bad:#fb7185;--line:#2a3763}*{box-sizing:border-box}body{margin:0;font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;background:radial-gradient(circle at top left,#263169 0,#0b1020 42rem);color:var(--text)}header{padding:3rem 1.25rem 2rem;max-width:1180px;margin:auto}h1{font-size:clamp(2rem,5vw,4.5rem);line-height:.95;margin:0 0 1rem}p{color:var(--muted);line-height:1.6}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:1rem;max-width:1180px;margin:0 auto 3rem;padding:0 1.25rem}.card{background:linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.025));border:1px solid var(--line);border-radius:24px;padding:1.25rem;box-shadow:0 20px 60px rgba(0,0,0,.25)}.wide{grid-column:1/-1}h2{margin:.1rem 0 1rem;font-size:1.25rem}label{display:block;margin:.8rem 0 .35rem;color:#d8e1ff;font-weight:700;font-size:.9rem}input,textarea,select{width:100%;border:1px solid var(--line);border-radius:14px;background:#0a0f20;color:var(--text);padding:.8rem;font:inherit}textarea{min-height:7rem;resize:vertical}.row{display:grid;grid-template-columns:1fr 1fr;gap:.75rem}.actions{display:flex;flex-wrap:wrap;gap:.65rem;margin-top:1rem}button,a.button{border:0;border-radius:999px;padding:.8rem 1rem;background:var(--accent);color:white;font-weight:800;cursor:pointer;text-decoration:none}button.secondary{background:var(--panel2)}button.good{background:#059669}.pill{display:inline-flex;gap:.4rem;align-items:center;border:1px solid var(--line);border-radius:999px;padding:.35rem .65rem;color:var(--muted);margin:.2rem}.result{white-space:pre-wrap;background:#060914;border:1px solid var(--line);border-radius:18px;padding:1rem;min-height:8rem;overflow:auto;color:#d8e1ff}.status{font-weight:800}.ok{color:var(--good)}.err{color:var(--bad)}.small{font-size:.86rem}.kbd{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#050814;border:1px solid var(--line);padding:.15rem .35rem;border-radius:.45rem}@media(max-width:680px){.row{grid-template-columns:1fr}}
</style>
</head>
<body>
<header>
<span class="pill">🥷 Admin Console</span><span class="pill">🤖 Telegram setup</span><span class="pill">🧠 Cloudflare AI</span><span class="pill">⚔️ Arena controls</span>
<h1>Emoji Jutsu operations hub</h1>
<p>Configure the Telegram bot token and webhook, inspect game state, create players, save jutsu, queue battles, simulate duels, and review bot/player data from one static page. The Telegram token and Cloudflare AI token can be saved to Worker KV with setup buttons or curl commands.</p>
</header>
<main class="grid">
<section class="card wide"><h2>Connection</h2><label>Admin token</label><input id="adminToken" type="password" placeholder="ADMIN_TOKEN for config changes"><div class="row"><div><label>Worker base URL</label><input id="baseUrl" placeholder="https://example.workers.dev"></div><div><label>Telegram webhook secret token</label><input id="webhookSecret" type="password" placeholder="X-Telegram-Bot-Api-Secret-Token"></div></div><label>Telegram bot token</label><input id="botToken" type="password" placeholder="123456:ABC... used for setWebhook/getWebhookInfo/deleteWebhook"><div class="actions"><button onclick="saveBotToken()">Save token + set webhook</button><button class="secondary" onclick="setWebhook()">Set Telegram webhook only</button><button class="secondary" onclick="api('/telegram/status')">Check bot status</button><button class="secondary" onclick="telegramMethod('getWebhookInfo')">Get webhook info</button><button class="secondary" onclick="telegramMethod('deleteWebhook')">Delete webhook</button><a class="button secondary" href="/help" target="_blank">Open API help</a><a class="button secondary" href="/changelog" target="_blank">Open change log</a></div><p class="small">Webhook URL: <span class="kbd" id="webhookUrl"></span></p></section>
<section class="card wide"><h2>Cloudflare AI chronicle</h2><div class="row"><div><label>Cloudflare account ID</label><input id="cfAccountId" placeholder="account id"></div><div><label>Cloudflare AI model</label><input id="cfModel" value="@cf/meta/llama-3.1-8b-instruct"></div></div><label>Cloudflare AI API token</label><input id="cfToken" type="password" placeholder="API token with Workers AI access"><label>Raw match JSON</label><textarea id="chronicleJson" placeholder='{"match":{"id":"MATCH-123"},"rounds":[],"winner":"Player 1"}'></textarea><div class="actions"><button onclick="saveAiConfig()">Save AI config</button><button class="secondary" onclick="loadAiConfig()">Load AI config</button><button class="good" onclick="chronicle()">Generate chronicle</button></div><p class="small">Curl: <span class="kbd">POST /ai/config</span> stores token/account/model; <span class="kbd">POST /ai/chronicle</span> sends match JSON to the configured model.</p></section>
<section class="card"><h2>Player actions</h2><label>Username</label><input id="username" value="admin-player"><button onclick="createPlayer()">Create player</button><label>Player ID</label><input id="playerId" placeholder="UUID"><div class="actions"><button class="secondary" onclick="getPlayer()">Load player</button><button class="secondary" onclick="getStats()">Stats</button></div></section>
<section class="card"><h2>Jutsu lab</h2><label>Combo</label><input id="combo" value="👊🖖🙏"><label>Signature name</label><input id="jutsuName" value="Astral Jab"><div class="actions"><button onclick="lookup()">Lookup</button><button class="secondary" onclick="analyze()">Analyze</button><button class="good" onclick="saveJutsu()">Save signature</button></div></section>
<section class="card"><h2>Arena controls</h2><label>Queue player ID</label><input id="queuePlayer" placeholder="player id or anonymous"><label><input id="includeButler" type="checkbox" style="width:auto" checked> Include AI Butler</label><div class="actions"><button onclick="queueCombo()">Queue combo</button><button class="secondary" onclick="loadArena()">Refresh arena</button><button class="secondary" onclick="loadButler()">AI Butler</button></div></section>
<section class="card"><h2>Duel simulator</h2><label>Opponent combo</label><input id="opponent" value="✋🤟🙏"><div class="row"><div><label>Player A ID (optional)</label><input id="playerA"></div><div><label>Player B ID (optional)</label><input id="playerB"></div></div><button onclick="simulate()">Run duel</button></section>
<section class="card wide"><h2>System shortcuts</h2><div class="actions"><button class="secondary" onclick="api('/gestures')">Gestures</button><button class="secondary" onclick="api('/rules')">Rules</button><button class="secondary" onclick="api('/train')">Training</button><button class="secondary" onclick="api('/changelog')">Change log</button><button class="secondary" onclick="api('/queue')">Queue</button></div></section>
<section class="card wide"><h2>Result <span id="status" class="status"></span></h2><pre id="result" class="result">Ready.</pre></section>
</main>
<script>
const $=id=>document.getElementById(id);function base(){return ($('baseUrl').value||location.origin).replace(/\/$/,'')}function webhookUrl(){return base()+'/telegram/webhook'}function updateWebhookUrl(){$('webhookUrl').textContent=webhookUrl()}$('baseUrl').value=location.origin;updateWebhookUrl();$('baseUrl').addEventListener('input',updateWebhookUrl);
function show(data,ok=true){$('status').textContent=ok?'OK':'ERROR';$('status').className='status '+(ok?'ok':'err');$('result').textContent=typeof data==='string'?data:JSON.stringify(data,null,2)}
async function api(path,init={}){try{const adminToken=$('adminToken').value.trim();const authHeaders=adminToken?{'X-Admin-Token':adminToken}:{};const r=await fetch(base()+path,{headers:{'Content-Type':'application/json',...authHeaders,...(init.headers||{})},...init});const t=await r.text();let d;try{d=JSON.parse(t)}catch{d=t}show(d,r.ok);return d}catch(e){show(e.message,false)}}
async function telegramMethod(method,payload={}){const token=$('botToken').value.trim();if(!token)return show('Enter a Telegram bot token first.',false);const r=await fetch('https://api.telegram.org/bot'+token+'/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});show(await r.json(),r.ok)}
function setWebhook(){return telegramMethod('setWebhook',{url:webhookUrl(),secret_token:$('webhookSecret').value.trim(),allowed_updates:['message','callback_query']})}
function saveBotToken(){return api('/telegram/config',{method:'POST',body:JSON.stringify({token:$('botToken').value.trim(),webhookSecret:$('webhookSecret').value.trim()||undefined,webhookUrl:webhookUrl()})})}
function saveAiConfig(){return api('/ai/config',{method:'POST',body:JSON.stringify({token:$('cfToken').value.trim(),accountId:$('cfAccountId').value.trim(),model:$('cfModel').value.trim()})})}
function loadAiConfig(){return api('/ai/config')}
function chronicle(){let body;try{body=JSON.parse($('chronicleJson').value||'{}')}catch(e){return show('Invalid match JSON: '+e.message,false)}return api('/ai/chronicle',{method:'POST',body:JSON.stringify(body)})}
function createPlayer(){return api('/player/create',{method:'POST',body:JSON.stringify({username:$('username').value})})}function getPlayer(){return api('/player?id='+encodeURIComponent($('playerId').value))}function getStats(){return api('/stats?id='+encodeURIComponent($('playerId').value))}
function lookup(){return api('/lookup?combo='+encodeURIComponent($('combo').value))}function analyze(){return api('/analyze?combo='+encodeURIComponent($('combo').value))}function saveJutsu(){return api('/jutsu/save',{method:'POST',body:JSON.stringify({playerId:$('playerId').value,name:$('jutsuName').value,combo:$('combo').value})})}
function queueCombo(){return api('/queue',{method:'POST',body:JSON.stringify({playerId:$('queuePlayer').value||$('playerId').value||'anonymous',combo:$('combo').value,includeButler:$('includeButler').checked})})}function loadArena(){return api('/arena')}function loadButler(){return api('/butler')}
function simulate(){const q=new URLSearchParams({combo:$('combo').value,opponent:$('opponent').value});if($('playerA').value)q.set('playerA',$('playerA').value);if($('playerB').value)q.set('playerB',$('playerB').value);return api('/simulate?'+q)}
</script>
</body>
</html>`;

}


function requestBaseUrl(requestUrl){

const url=new URL(requestUrl);
return `${url.protocol}//${url.host}`;

}



function curlForRequest(requestUrl,method="GET"){

const url=new URL(requestUrl);
return method==="GET" ? `curl "${url.href}"` : `curl -X ${method} "${url.href}"`;

}



function withResponseHelp(data,status){

const requestUrl=globalThis.__ALCHEMICAL_REQUEST_URL;

if(!requestUrl || !data || typeof data!=="object" || Array.isArray(data))
return data;

if(data.curl && data.help && data.isSystemCommand!==undefined)
return data;

const method=globalThis.__ALCHEMICAL_REQUEST_METHOD || "GET";
const baseUrl=requestBaseUrl(requestUrl);

return {
...data,
curl:data.curl || curlForRequest(requestUrl,method),
help:data.help || `Set BASE_URL="${baseUrl}" and run curl "${baseUrl}/help" to see every system command.`,
isSystemCommand:data.isSystemCommand ?? status!==404
};

}



function corsHeaders(){
return {
"Access-Control-Allow-Origin":"*",
"Access-Control-Allow-Methods":"GET,POST,OPTIONS",
"Access-Control-Allow-Headers":"Content-Type, Authorization, X-Admin-Token, X-Telegram-Bot-Api-Secret-Token",
"Access-Control-Max-Age":"86400"
};
}

function json(data,status=200){

return new Response(

JSON.stringify(withResponseHelp(data,status),null,2),

{
status,
headers:{
...corsHeaders(),
"Content-Type":"application/json"
}
}

);

}





export {
AI_BUTLER_HISTORY_LIMIT,
FORCE_ADVANTAGE_BONUS,
FORCE_ADVANTAGE_SCALE,
buildSpell,
forceAdvantage,
getArenaPersistenceMode,
rankForRating,
rankedLeaderboard,
recordRankedDuel,
parseTechnique,
scoreDuelist,
simulateBattle,
updateAiButlerAfterBattle
};



export default {


async fetch(request,env){

globalThis.__ALCHEMICAL_REQUEST_URL=request.url;
globalThis.__ALCHEMICAL_REQUEST_METHOD=request.method;
globalThis.__ALCHEMICAL_WORKER_FETCH=this.fetch.bind(this);
globalThis.__ALCHEMICAL_WORKER_ENV=env;


const url=new URL(request.url);


const path=url.pathname;

if(request.method==="OPTIONS")
return new Response(null,{status:204,headers:corsHeaders()});

if(path==="/" || path==="/admin"){
const token=configAuthToken(env);
if(!token)
return json({error:"Admin console disabled until ADMIN_TOKEN or CONFIG_ADMIN_TOKEN is configured."},503);
// Query-string adminToken is intentionally kept only for opening the HTML console in a browser.
// Prefer Bearer or X-Admin-Token for API calls because URLs can be stored in logs, history, and Referer headers.
const supplied=url.searchParams.get("adminToken");
if(supplied!==token && !isAuthorizedConfigRequest(request,env))
return json({error:"Unauthorized admin console request. Add ?adminToken=... or send Bearer/X-Admin-Token."},401);
return new Response(adminPage(),{headers:{"Content-Type":"text/html; charset=utf-8"}});
}



if(path==="/telegram/config")
return handleTelegramConfig(request,env);

if(path==="/telegram/status")
return handleTelegramStatus(request,env);

if(path==="/telegram/webhook")
return handleTelegramWebhook(request,env);

if(path==="/ai/config")
return handleAiConfig(request,env);

if(path==="/ai/chronicle")
return handleAiChronicle(request,env);



if(path==="/player/create")
return createPlayer(request,env);



if(path==="/player")
return getPlayer(request,env);



if(path==="/jutsu/save")
return saveSignature(request,env);



if(path==="/stats")
return getStats(request,env);



if(path==="/help")
return json(CODEX.help);

if(path==="/changelog")
return json(CHANGELOG);



if(path==="/about")
return json({
name:APP_NAME,
version:APP_VERSION,
description:"Emoji Jutsu deterministic combat API",
availableCommandsUrl:"/help"
});



if(path==="/rules")
return json(CODEX.rules);

if(path==="/balance/simulate"){
if(!isAuthorizedConfigRequest(request,env)){
const limited=await checkRateLimit(env,request,"balance-simulate",BALANCE_SIMULATE_RATE_LIMIT);
if(limited)
return limited;
}
const maxLength=url.searchParams.get("maxLength") || 3;
const requestedLength=Number(maxLength) || 3;
const limit=isAuthorizedConfigRequest(request,env) ? MAX_HAND_SIGNS : PUBLIC_BALANCE_MAX_LENGTH;
if(requestedLength>limit)
return json({error:"Requested maxLength exceeds the allowed balance simulator limit.",requestedMaxLength:requestedLength,maxLengthLimit:limit,adminAuthenticated:limit===MAX_HAND_SIGNS},400);
return json(await runBalanceSimulator(maxLength,limit));
}



if(path==="/train")
return json(CODEX.train);



if(path==="/arena" || path==="/leaderboard" || path==="/rank" || path==="/butler" || path.startsWith("/battle/") || path==="/queue"){
const arena=await loadArena(env);

const legacyLeaderboard=Object.values(arena.leaderboard).map(row=>({
...row,
winRate:row.battles ? Number((row.wins/row.battles).toFixed(4)) : 0
})).sort((a,b)=>b.wins-a.wins || b.winRate-a.winRate || a.losses-b.losses);
const rankedRows=rankedLeaderboard(arena);

if(path==="/arena")
return json({
persistence:getArenaPersistenceMode(env),
queue:arena.queue,
activeBattles:arena.activeBattles,
history:arena.history.slice(0,25),
leaderboard:rankedRows,
legacyLeaderboard,
aiButler:arena.aiButler
});

if(path==="/leaderboard")
return json({
persistence:getArenaPersistenceMode(env),
leaderboard:rankedRows,
legacyLeaderboard,
ranks:RANK_TIERS.map(tier=>tier.name),
count:rankedRows.length
});

if(path==="/rank"){
const playerId=url.searchParams.get("id") || url.searchParams.get("player");
if(!playerId)
return json({error:"Missing player id"},400);
return json({rank:ensureRankedPlayer(arena,playerId),ranks:RANK_TIERS.map(tier=>tier.name)});
}

if(path==="/butler")
return json({
...arena.aiButler,
nextCombo:aiComboForButler(arena.aiButler),
behavior:"Queues adaptive techniques, learns from losses, and shifts preferred style toward winning counters."
});

if(path.startsWith("/battle/")){
const battleId=decodeURIComponent(path.split("/").pop());
const battle=arena.history.find(b=>b.id===battleId || b.replay?.match?.id===battleId);
return battle ? json(battle) : json({error:"Battle not found"},404);
}

if(request.method!=="POST" && request.method!=="GET")
return json({error:"Use POST /queue to submit a technique or GET /queue to inspect waiting entries"},405);

if(request.method==="GET")
return json({persistence:getArenaPersistenceMode(env),queue:arena.queue});

let body={};
try{
body=await request.json();
}catch{
body={};
}

const combo=body.combo || url.searchParams.get("combo");
const playerId=String(body.playerId || url.searchParams.get("player") || "anonymous").trim();
const riskQueue=Boolean(body.riskQueue || url.searchParams.get("riskQueue"));
const entry=await createQueueEntry({combo,playerId,riskQueue});

if(entry.error)
return json({error:entry.error},entry.status);

await persistQueueEntry(env,entry);
arena.queue.push(entry);

if(body.includeButler || url.searchParams.get("butler")==="true"){
const aiEntry=await createQueueEntry({combo:aiComboForButler(arena.aiButler),playerId:arena.aiButler.id,isAi:true});
if(aiEntry.error)
return json({error:aiEntry.error},aiEntry.status);
await persistQueueEntry(env,aiEntry);
arena.queue.push(aiEntry);
}

const resolved=await resolveArena(arena,env);
await saveArena(env,arena);

return json({status:"queued",entry,resolved,queueDepth:arena.queue.length,latestBattle:arena.history[0] ?? null},201);
}





if(path==="/gestures")

return json({

count:Object.keys(GESTURES).length,

gestures:GESTURES,

outcomes:outcomeMatrix(),

outcomeNameMatrix:outcomeNameMatrix(),

outcomeLegend:NON_HAND_OUTCOMES.map(outcome=>outcome.symbol),

outcomeCatalog:NON_HAND_OUTCOMES

});





if(
path!=="/lookup" &&
path!=="/analyze" &&
path!=="/duel" &&
path!=="/simulate" &&
path!=="/replay"
)

return json({
error:"That is not a command in the system.",
requestedPath:path,
availableCommandsUrl:"/help",
suggestion:"Run the curl command below or open /help to see every supported command."
},404);





let input=url.searchParams.get("combo");


let parsed=parseTechnique(input);

if(parsed.error)
return json({error:parsed.error},parsed.status);

parsed=await decorateTechnique(parsed);
let {decoded,combo,spell,id,name}=parsed;


if(path==="/duel" || path==="/simulate" || path==="/replay"){

if(path==="/duel"){
const limited=await checkRateLimit(env,request,"duel",DUEL_RATE_LIMIT);
if(limited)
return limited;
}

const opponentInput=url.searchParams.get("opponent");
const opponent=parseTechnique(opponentInput);

if(opponent.error)
return json({error:`Opponent: ${opponent.error}`},opponent.status);

const decoratedOpponent=await decorateTechnique(opponent);
const replay=await simulateBattle(parsed,decoratedOpponent,url.searchParams.get("matchId"));
const playerA=url.searchParams.get("playerA") || url.searchParams.get("player");
const playerB=url.searchParams.get("playerB") || url.searchParams.get("opponentPlayer");

await persistDuelResult(env,{
playerA,
playerB,
comboA:decoded,
comboB:decoratedOpponent.decoded,
replay
});

let ranked=null;
const winnerId=replay.winner==="Player 1" ? playerA : replay.winner==="Player 2" ? playerB : "Draw";
if(playerA && playerB){
const arena=await loadArena(env);
ranked=recordRankedDuel(arena,playerA,playerB,winnerId);
if(playerA===arena.aiButler.id || playerB===arena.aiButler.id){
const aiOpponent=playerA===arena.aiButler.id ? decoratedOpponent : parsed;
arena.aiButler=updateAiButlerAfterBattle(arena.aiButler,{
battleId:replay.match.id,
winnerId,
aiOpponent,
completedAt:new Date().toISOString()
});
}
await saveArena(env,arena);
}else if(playerA===MEMORY_ARENA.aiButler.id || playerB===MEMORY_ARENA.aiButler.id){
const arena=await loadArena(env);
const aiOpponent=playerA===arena.aiButler.id ? decoratedOpponent : parsed;
arena.aiButler=updateAiButlerAfterBattle(arena.aiButler,{
battleId:replay.match.id,
winnerId,
aiOpponent,
completedAt:new Date().toISOString()
});
await saveArena(env,arena);
}

return json({
status:"success",
...replay,
combo:{id,name,outcome:parsed.outcome,technique:decoded,class:spell.class,rank:rank(spell),stats:spell},
opponent:{id:decoratedOpponent.id,name:decoratedOpponent.name,outcome:decoratedOpponent.outcome,technique:decoratedOpponent.decoded,class:decoratedOpponent.spell.class,rank:rank(decoratedOpponent.spell),stats:decoratedOpponent.spell},
forceRule:"Kinetic > Mystic > Barrier > Kinetic",
ranked
});

}





if(path==="/analyze")

return json({

id,

name,

technique:decoded,

outcome:parsed.outcome,

outcomeName:parsed.outcomeName,

outcomeMatrix:combo.map(gesture=>({gesture,gestureName:GESTURES[gesture].name,outcome:outcomeForCast(gesture),outcomeName:outcomeNameForCast(gesture)})),

breakdown:analyze(combo),

class:spell.class,

rank:rank(spell),

stats:spell

});






return json({

status:"success",

id,

name,

technique:decoded,

outcome:parsed.outcome,

spell:

`${spell.class} Technique`,

element:spell.class,

type:spell.class,

damage:spell.power,

effect:`Power ${spell.power} / Risk ${spell.risk}`,

chakraCost:spell.cost,

rank:rank(spell),

stats:spell,


battleStyle:

spell.class==="Kinetic"?
"Fast destructive assault":

spell.class==="Barrier"?
"Counter defensive style":

"High energy mystical casting"


});


}


};
