import { handleTelegramConfig, handleTelegramWebhook } from "./telegram-bot.js";
const FINISHER = "🙏🏻";
const MAX_HAND_SIGNS = 5;
const MEMORY_ARENA_KEY = "ARENA_STATE_V1";
const FORCE_ADVANTAGE_BONUS = 18;
const FORCE_ADVANTAGE_SCALE = 0.08;
const LONG_COMBO_RISK_STEP = 5;

const AI_CONFIG_KEY = "cloudflare-ai:config";
const DEFAULT_CHRONICLE_MODEL = "@cf/meta/llama-3.1-8b-instruct";
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
aiButler:{
id:"AI-BUTLER-1",
name:"AI Butler",
history:[],
winRate:0.5,
preferredStyle:"Mystic",
adaptationLevel:0.1
}
};

function normalizeArena(arena){
const base=arena && typeof arena==="object" ? arena : {};
return {
queue:Array.isArray(base.queue) ? base.queue : [],
activeBattles:Array.isArray(base.activeBattles) ? base.activeBattles : [],
history:Array.isArray(base.history) ? base.history : [],
leaderboard:base.leaderboard && typeof base.leaderboard==="object" ? base.leaderboard : {},
aiButler:mergeAiButler(base.aiButler)
};
}



const GESTURES = {

"💪🏻":{name:"Flex",atk:6,def:2,spc:2,type:"kinetic"},
"👏🏻":{name:"Clap",atk:3,def:4,spc:3,type:"barrier"},
"👍🏻":{name:"Up",atk:4,def:4,spc:2,type:"barrier"},
"👎🏻":{name:"Down",atk:4,def:3,spc:3,type:"kinetic"},

"🫶🏻":{name:"Heart",atk:2,def:5,spc:6,type:"mystic"},
"🙌🏻":{name:"Raise",atk:4,def:4,spc:5,type:"mystic"},
"👐🏻":{name:"Open",atk:3,def:6,spc:1,type:"barrier"},
"🤲🏻":{name:"Cup",atk:1,def:6,spc:3,type:"barrier"},


"🤜🏻":{name:"Right Hook",atk:9,def:1,spc:0,type:"kinetic"},
"🤛🏻":{name:"Left Hook",atk:9,def:1,spc:0,type:"kinetic"},
"✊🏻":{name:"Fist",atk:8,def:2,spc:0,type:"kinetic"},
"👊🏻":{name:"Strike",atk:8,def:2,spc:0,type:"kinetic"},


"🫸🏻":{name:"Thrust",atk:7,def:3,spc:0,type:"kinetic"},
"🫷🏻":{name:"Reverse Thrust",atk:7,def:3,spc:0,type:"kinetic"},


"🤚🏻":{name:"Guard",atk:1,def:8,spc:1,type:"barrier"},
"🖐🏻":{name:"Palm",atk:2,def:8,spc:0,type:"barrier"},
"✋🏻":{name:"Stop",atk:1,def:9,spc:0,type:"barrier"},


"🖖🏻":{name:"Vulcan",atk:3,def:3,spc:9,type:"mystic"},
"🤟🏻":{name:"Love",atk:2,def:4,spc:8,type:"mystic"},
"🤞🏻":{name:"Cross",atk:4,def:3,spc:7,type:"mystic"},
"✌🏻":{name:"Peace",atk:3,def:4,spc:7,type:"mystic"},
"🤌🏻":{name:"Kiss",atk:4,def:4,spc:6,type:"mystic"},
"🫳🏻":{name:"Palm Down",atk:5,def:4,spc:1,type:"barrier"},
"🫴🏻":{name:"Palm Up",atk:3,def:5,spc:4,type:"mystic"},
"🫲🏻":{name:"Leftward Hand",atk:5,def:3,spc:2,type:"kinetic"},
"🫱🏻":{name:"Rightward Hand",atk:5,def:3,spc:2,type:"kinetic"},
"👋🏻":{name:"Wave",atk:2,def:3,spc:7,type:"mystic"},
"🫰🏻":{name:"Snap",atk:5,def:2,spc:7,type:"mystic"},
"🤙🏻":{name:"Call",atk:3,def:3,spc:8,type:"mystic"},
"🤏🏻":{name:"Pinch",atk:5,def:4,spc:5,type:"mystic"},
"👌🏻":{name:"Focus",atk:4,def:5,spc:6,type:"mystic"},
"🫵🏻":{name:"Challenge",atk:7,def:2,spc:3,type:"kinetic"},
"👉🏻":{name:"Point Right",atk:5,def:2,spc:5,type:"kinetic"},
"👈🏻":{name:"Point Left",atk:5,def:2,spc:5,type:"kinetic"},
"☝🏻":{name:"Index Up",atk:3,def:4,spc:8,type:"mystic"},
"👆🏻":{name:"Point Up",atk:4,def:3,spc:7,type:"mystic"},
"👇🏻":{name:"Point Down",atk:6,def:4,spc:3,type:"kinetic"},
"🖕🏻":{name:"Defiance",atk:8,def:1,spc:3,type:"kinetic"},
"✍🏻":{name:"Script",atk:2,def:4,spc:8,type:"mystic"},
"🤳🏻":{name:"Mirror",atk:2,def:6,spc:6,type:"barrier"}

};

const NON_HAND_OUTCOMES = [
"🔥", "🛡️", "🔮", "⚡", "🌊", "🌪️", "🌋", "🪨", "🌙", "☀️",
"⭐", "💫", "🌈", "❄️", "🌿", "🍄", "🐉", "🦊", "🐺", "🦅",
"🐍", "🦂", "🕸️", "💎", "🧲", "🧪", "🪬", "🧿", "🕯️", "🗝️",
"🧭", "⏳", "🌀", "💥", "☄️", "🌌", "🏔️", "🌧️", "🎭", "🎲"
];

function emojiSignature(value){
return Array.from(value).reduce((total,char,index)=>total + char.codePointAt(0)*(index+1),0);
}

function outcomeForCast(cast){
const signs=Array.isArray(cast) ? cast : [cast];
const signature=signs.reduce((total,sign,index)=>total + emojiSignature(sign)*(index+1),0);
return NON_HAND_OUTCOMES[signature % NON_HAND_OUTCOMES.length];
}

function outcomeMatrix(){
return Object.fromEntries(Object.keys(GESTURES).map(gesture=>[gesture,outcomeForCast(gesture)]));
}



const FINISHERS={

"👊🏻":{
name:"Execution Blow",
atk:15
},

"✋🏻":{
name:"Absolute Barrier",
def:15
},

"🖖🏻":{
name:"Astral Seal",
spc:15
}

};



const CODEX={


help:{

title:"Emoji Jutsu Commands",

summary:"Every command returns JSON. Unknown paths return a clear not-a-command message with a curl example for /help.",

usage:[
"Pick 1-5 hand signs.",
"End every combo with 🙏🏻.",
"URL encode emoji combos when you paste commands into a shell.",
"Use GET commands for quick lookups and POST commands when sending JSON bodies."
],

commands:[
{method:"GET",path:"/help",description:"Show this command guide with curl examples.",curl:"curl \"$BASE_URL/help\""},
{method:"GET",path:"/lookup?combo=👊🏻🖖🏻🙏🏻",description:"Cast a sealed technique and receive its generated name, rank, stats and battle style.",curl:"curl \"$BASE_URL/lookup?combo=%F0%9F%91%8A%F0%9F%8F%BB%F0%9F%96%96%F0%9F%8F%BB%F0%9F%99%8F%F0%9F%8F%BB\""},
{method:"GET",path:"/analyze?combo=👊🏻🖖🏻🙏🏻",description:"Explain each hand sign in a technique and show how the final stats are built.",curl:"curl \"$BASE_URL/analyze?combo=%F0%9F%91%8A%F0%9F%8F%BB%F0%9F%96%96%F0%9F%8F%BB%F0%9F%99%8F%F0%9F%8F%BB\""},
{method:"GET",path:"/gestures",description:"List every available hand sign and its ATK, DEF, SPC and force type.",curl:"curl \"$BASE_URL/gestures\""},
{method:"GET",path:"/rules",description:"Read the deterministic combat rules, force triangle, finisher rules and replay guarantees.",curl:"curl \"$BASE_URL/rules\""},
{method:"GET",path:"/duel?combo=👊🏻🖖🏻🙏🏻&opponent=✋🏻🤟🏻🙏🏻",description:"Compare two sealed techniques and return the winner, damage, scores and force analysis.",curl:"curl \"$BASE_URL/duel?combo=%F0%9F%91%8A%F0%9F%8F%BB%F0%9F%96%96%F0%9F%8F%BB%F0%9F%99%8F%F0%9F%8F%BB&opponent=%E2%9C%8B%F0%9F%8F%BB%F0%9F%A4%9F%F0%9F%8F%BB%F0%9F%99%8F%F0%9F%8F%BB\""},
{method:"GET",path:"/simulate?combo=👊🏻🖖🏻🙏🏻&opponent=✋🏻👐🏻🙏🏻",description:"Run a deterministic duel that can be replayed from the same inputs.",curl:"curl \"$BASE_URL/simulate?combo=%F0%9F%91%8A%F0%9F%8F%BB%F0%9F%96%96%F0%9F%8F%BB%F0%9F%99%8F%F0%9F%8F%BB&opponent=%E2%9C%8B%F0%9F%8F%BB%F0%9F%AB%90%F0%9F%8F%BB%F0%9F%99%8F%F0%9F%8F%BB\""},
{method:"GET",path:"/replay?combo=👊🏻🖖🏻🙏🏻&opponent=✋🏻👐🏻🙏🏻&matchId=MATCH-123",description:"Verify a previous deterministic match by passing the same combos and match id.",curl:"curl \"$BASE_URL/replay?combo=%F0%9F%91%8A%F0%9F%8F%BB%F0%9F%96%96%F0%9F%8F%BB%F0%9F%99%8F%F0%9F%8F%BB&opponent=%E2%9C%8B%F0%9F%8F%BB%F0%9F%AB%90%F0%9F%8F%BB%F0%9F%99%8F%F0%9F%8F%BB&matchId=MATCH-123\""},
{method:"GET",path:"/train",description:"Get a step-by-step starter lesson for building a combo.",curl:"curl \"$BASE_URL/train\""},
{method:"POST",path:"/queue",description:"Submit a sealed technique into the asynchronous arena queue.",curl:"curl -X POST \"$BASE_URL/queue\" -H \"Content-Type: application/json\" -d '{\"playerId\":\"shinobi\",\"combo\":\"👊🏻🖖🏻🙏🏻\",\"includeButler\":true}'"},
{method:"GET",path:"/arena",description:"View persistent arena queue, history, leaderboard and AI Butler state.",curl:"curl \"$BASE_URL/arena\""},
{method:"GET",path:"/battle/:id",description:"Replay a completed arena battle from history.",curl:"curl \"$BASE_URL/battle/BATTLE-ID\""},
{method:"GET",path:"/butler",description:"Inspect the evolving AI Butler opponent and its next combo.",curl:"curl \"$BASE_URL/butler\""},
{method:"POST",path:"/telegram/config",description:"Save the Telegram bot token in KV and configure the Telegram webhook so the bot can receive updates.",curl:"curl -X POST \"$BASE_URL/telegram/config\" -H \"Content-Type: application/json\" -d '{\"token\":\"123456:ABC...\"}'"},
{method:"POST",path:"/ai/config",description:"Save the Cloudflare AI API token, account ID, model, and chronicle system prompt in KV for the AI model feature.",curl:"curl -X POST \"$BASE_URL/ai/config\" -H \"Content-Type: application/json\" -d '{\"token\":\"CF_API_TOKEN\",\"accountId\":\"CF_ACCOUNT_ID\",\"model\":\"@cf/meta/llama-3.1-8b-instruct\"}'"},
{method:"GET",path:"/ai/config",description:"Inspect the configured Cloudflare AI account and model without returning the token.",curl:"curl \"$BASE_URL/ai/config\""},
{method:"POST",path:"/ai/chronicle",description:"Send raw match JSON to Cloudflare AI and receive a dark anime battle chronicle using the configured model.",curl:"curl -X POST \"$BASE_URL/ai/chronicle\" -H \"Content-Type: application/json\" -d '{\"match\":{\"id\":\"MATCH-123\"},\"rounds\":[],\"winner\":\"Player 1\"}'"},
{method:"POST",path:"/player/create",description:"Create a persistent D1 player profile.",curl:"curl -X POST \"$BASE_URL/player/create\" -H \"Content-Type: application/json\" -d '{\"name\":\"shinobi\"}'"},
{method:"GET",path:"/player?id=PLAYER-ID",description:"Load a player profile.",curl:"curl \"$BASE_URL/player?id=PLAYER-ID\""},
{method:"POST",path:"/jutsu/save",description:"Save a player's signature jutsu.",curl:"curl -X POST \"$BASE_URL/jutsu/save\" -H \"Content-Type: application/json\" -d '{\"playerId\":\"PLAYER-ID\",\"name\":\"Astral Jab\",\"combo\":\"👊🏻🖖🏻🙏🏻\"}'"},
{method:"GET",path:"/stats?id=PLAYER-ID",description:"View player progression, battle history and signature jutsu.",curl:"curl \"$BASE_URL/stats?id=PLAYER-ID\""}
]

},



rules:{

title:"The Jutsu System",

text:

`
Emoji Jutsu is a deterministic combat language.

Create a sequence of hand signs.

Every technique MUST end with 🙏🏻.

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
Last hand sign before 🙏🏻 can unlock a finisher.

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
Seal your technique with 🙏🏻.

Step 4:
Discover your spell.

Example:

💪🏻👏🏻👍🏻🫶🏻🙌🏻🙏🏻
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
const power=Math.max(1,baseTotal + diversityBonus + complexityBonus - repetitionPenalty);
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
boosted.power=boosted.atk+boosted.def+boosted.spc + (boosted.modifiers?.diversityBonus ?? 0) + (boosted.modifiers?.complexityBonus ?? 0) - (boosted.modifiers?.repetitionPenalty ?? 0);
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
outcome:outcomeForCast(parsed.combo)
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
}catch{
// Older deployments without the ai_butlers migration should keep working via KV/in-memory arena state.
}

}



function updateAiButlerAfterBattle(aiButler,{battleId,winnerId,aiOpponent,completedAt}){

const updated={
...aiButler,
history:[...(aiButler.history || [])]
};

const aiWon=winnerId===updated.id;
updated.history.unshift({battleId,winner:winnerId,at:completedAt});
updated.history=updated.history.slice(0,25);
const wins=updated.history.filter(h=>h.winner===updated.id).length;
updated.winRate=Number((wins/updated.history.length).toFixed(2));
updated.adaptationLevel=Number(Math.min(1,updated.adaptationLevel+(aiWon ? 0.01 : 0.05)).toFixed(2));
if(!aiWon && aiOpponent?.spell?.class)
updated.preferredStyle=aiOpponent.spell.class;

return updated;

}


async function loadArena(env){

if(env?.ARENA_KV){
const stored=await env.ARENA_KV.get(MEMORY_ARENA_KEY,"json");
if(stored)
return normalizeArena(stored);
}

const aiButler=await loadAiButlerFromD1(env);
if(aiButler)
MEMORY_ARENA.aiButler=aiButler;

return normalizeArena(MEMORY_ARENA);

}



async function saveArena(env,arena){

if(env?.ARENA_KV)
await env.ARENA_KV.put(MEMORY_ARENA_KEY,JSON.stringify(arena));

await persistAiButlerToD1(env,arena.aiButler);

MEMORY_ARENA.queue=arena.queue;
MEMORY_ARENA.activeBattles=arena.activeBattles;
MEMORY_ARENA.history=arena.history;
MEMORY_ARENA.leaderboard=arena.leaderboard;
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
(id, player_id, name, combo, atk, def, spc, class, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`).bind(
id,
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



async function persistDuelResult(env,{playerA,playerB,comboA,comboB,replay}){

if(!env?.DB || !playerA || !playerB)
return;

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
WHERE player_id IN (?, ?) AND combo IN (?, ?)
`).bind(winnerId,playerA,playerB,comboA,comboB).run();
}else{
await env.DB.prepare(`
UPDATE signature_jutsu
SET usage_count = usage_count + 1
WHERE player_id IN (?, ?) AND combo IN (?, ?)
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



function aiComboForButler(ai){

if(ai.winRate<0.4)
return "✋🏻👐🏻🤲🏻🙏🏻";

if(ai.preferredStyle==="Kinetic")
return "👊🏻🤜🏻✊🏻🙏🏻";

if(ai.preferredStyle==="Barrier")
return "✋🏻🤚🏻👐🏻🙏🏻";

return "🖖🏻🤞🏻🤟🏻🙏🏻";

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

async function resolveArena(arena){

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
const winnerId=replay.winner==="Player 1" ? first.playerId : replay.winner==="Player 2" ? second.playerId : "Draw";

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
completedAt:new Date().toISOString()
};

arena.history.unshift(battle);
recordLeaderboard(arena,first.playerId,second.playerId,winnerId==="Draw");

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


function parseTechnique(input){

if(!input)
return {error:"Missing combo",status:400};

let decoded;
try{
decoded=decodeURIComponent(input);
}catch{
return {
error:"Combo could not be decoded. Please URL-encode emoji combos, for example /lookup?combo=%F0%9F%91%8A%F0%9F%8F%BB%F0%9F%99%8F%F0%9F%8F%BB",
status:400
};
}

if(!decoded.endsWith(FINISHER))
return {error:"Every technique must end with 🙏🏻",status:400};

const core=decoded.slice(0,decoded.length-FINISHER.length);

const combo=parseEmojis(core);

if(!combo)
return {error:"Unknown gesture detected",status:400};

if(combo.length<1)
return {error:"Choose at least one hand sign before 🙏🏻",status:400};

if(combo.length>MAX_HAND_SIGNS)
return {error:`Training rules allow 1-${MAX_HAND_SIGNS} hand signs before 🙏🏻`,status:400};

const spell=applyFinisher(buildSpell(combo),combo[combo.length-1]);

return {decoded,combo,spell};

}



function analyze(combo){


return combo.map(e=>{

let g=GESTURES[e];


return `${e} ${g.name} → ${outcomeForCast(e)}: +${g.atk} ATK +${g.def} DEF +${g.spc} SPC`;

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
updatedAt:config.updatedAt
};

}



async function handleAiConfig(request,env){

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

if(!token)
return json({error:"Missing Cloudflare AI API token"},400);

if(!accountId)
return json({error:"Missing Cloudflare account ID"},400);

if(!model)
return json({error:"Missing Cloudflare AI model"},400);

const config={token,accountId,model,systemPrompt,updatedAt:new Date().toISOString()};
await env.BOT_SESSIONS.put(AI_CONFIG_KEY,JSON.stringify(config));

return json({
ok:true,
...redactAiConfig(config),
message:"Cloudflare AI API token, account ID, model, and chronicle system prompt saved. The token is not returned."
});

}



async function handleAiChronicle(request,env){

if(request.method!=="POST")
return json({error:"Use POST /ai/chronicle with raw match JSON"},405);

const config=await getAiConfig(env);
if(!config.token || !config.accountId)
return json({error:"Cloudflare AI is not configured. Set it with POST /ai/config."},503);

let matchData;
try{
matchData=await request.json();
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
{role:"user",content:JSON.stringify(matchData,null,2)}
]
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
<section class="card wide"><h2>Connection</h2><div class="row"><div><label>Worker base URL</label><input id="baseUrl" placeholder="https://example.workers.dev"></div><div><label>Telegram webhook secret token</label><input id="webhookSecret" type="password" placeholder="X-Telegram-Bot-Api-Secret-Token"></div></div><label>Telegram bot token</label><input id="botToken" type="password" placeholder="123456:ABC... used for setWebhook/getWebhookInfo/deleteWebhook"><div class="actions"><button onclick="saveBotToken()">Save token + set webhook</button><button class="secondary" onclick="setWebhook()">Set Telegram webhook only</button><button class="secondary" onclick="telegramMethod('getWebhookInfo')">Get webhook info</button><button class="secondary" onclick="telegramMethod('deleteWebhook')">Delete webhook</button><a class="button secondary" href="/help" target="_blank">Open API help</a></div><p class="small">Webhook URL: <span class="kbd" id="webhookUrl"></span></p></section>
<section class="card wide"><h2>Cloudflare AI chronicle</h2><div class="row"><div><label>Cloudflare account ID</label><input id="cfAccountId" placeholder="account id"></div><div><label>Cloudflare AI model</label><input id="cfModel" value="@cf/meta/llama-3.1-8b-instruct"></div></div><label>Cloudflare AI API token</label><input id="cfToken" type="password" placeholder="API token with Workers AI access"><label>Raw match JSON</label><textarea id="chronicleJson" placeholder='{"match":{"id":"MATCH-123"},"rounds":[],"winner":"Player 1"}'></textarea><div class="actions"><button onclick="saveAiConfig()">Save AI config</button><button class="secondary" onclick="loadAiConfig()">Load AI config</button><button class="good" onclick="chronicle()">Generate chronicle</button></div><p class="small">Curl: <span class="kbd">POST /ai/config</span> stores token/account/model; <span class="kbd">POST /ai/chronicle</span> sends match JSON to the configured model.</p></section>
<section class="card"><h2>Player actions</h2><label>Username</label><input id="username" value="admin-player"><button onclick="createPlayer()">Create player</button><label>Player ID</label><input id="playerId" placeholder="UUID"><div class="actions"><button class="secondary" onclick="getPlayer()">Load player</button><button class="secondary" onclick="getStats()">Stats</button></div></section>
<section class="card"><h2>Jutsu lab</h2><label>Combo</label><input id="combo" value="👊🏻🖖🏻🙏🏻"><label>Signature name</label><input id="jutsuName" value="Astral Jab"><div class="actions"><button onclick="lookup()">Lookup</button><button class="secondary" onclick="analyze()">Analyze</button><button class="good" onclick="saveJutsu()">Save signature</button></div></section>
<section class="card"><h2>Arena controls</h2><label>Queue player ID</label><input id="queuePlayer" placeholder="player id or anonymous"><label><input id="includeButler" type="checkbox" style="width:auto" checked> Include AI Butler</label><div class="actions"><button onclick="queueCombo()">Queue combo</button><button class="secondary" onclick="loadArena()">Refresh arena</button><button class="secondary" onclick="loadButler()">AI Butler</button></div></section>
<section class="card"><h2>Duel simulator</h2><label>Opponent combo</label><input id="opponent" value="✋🏻🤟🏻🙏🏻"><div class="row"><div><label>Player A ID (optional)</label><input id="playerA"></div><div><label>Player B ID (optional)</label><input id="playerB"></div></div><button onclick="simulate()">Run duel</button></section>
<section class="card wide"><h2>System shortcuts</h2><div class="actions"><button class="secondary" onclick="api('/gestures')">Gestures</button><button class="secondary" onclick="api('/rules')">Rules</button><button class="secondary" onclick="api('/train')">Training</button><button class="secondary" onclick="api('/queue')">Queue</button></div></section>
<section class="card wide"><h2>Result <span id="status" class="status"></span></h2><pre id="result" class="result">Ready.</pre></section>
</main>
<script>
const $=id=>document.getElementById(id);function base(){return ($('baseUrl').value||location.origin).replace(/\/$/,'')}function webhookUrl(){return base()+'/telegram/webhook'}function updateWebhookUrl(){$('webhookUrl').textContent=webhookUrl()}$('baseUrl').value=location.origin;updateWebhookUrl();$('baseUrl').addEventListener('input',updateWebhookUrl);
function show(data,ok=true){$('status').textContent=ok?'OK':'ERROR';$('status').className='status '+(ok?'ok':'err');$('result').textContent=typeof data==='string'?data:JSON.stringify(data,null,2)}
async function api(path,init={}){try{const r=await fetch(base()+path,{headers:{'Content-Type':'application/json',...(init.headers||{})},...init});const t=await r.text();let d;try{d=JSON.parse(t)}catch{d=t}show(d,r.ok);return d}catch(e){show(e.message,false)}}
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



function json(data,status=200){

return new Response(

JSON.stringify(withResponseHelp(data,status),null,2),

{
status,
headers:{
"Access-Control-Allow-Origin":"*",
"Content-Type":"application/json"
}
}

);

}





export default {


async fetch(request,env){

globalThis.__ALCHEMICAL_REQUEST_URL=request.url;
globalThis.__ALCHEMICAL_REQUEST_METHOD=request.method;


const url=new URL(request.url);


const path=url.pathname;

if(path==="/" || path==="/admin")
return new Response(adminPage(),{headers:{"Content-Type":"text/html; charset=utf-8"}});



if(path==="/telegram/config")
return handleTelegramConfig(request,env);

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



if(path==="/rules")
return json(CODEX.rules);



if(path==="/train")
return json(CODEX.train);



if(path==="/arena" || path==="/butler" || path.startsWith("/battle/") || path==="/queue"){
const arena=await loadArena(env);

if(path==="/arena")
return json({
queue:arena.queue,
activeBattles:arena.activeBattles,
history:arena.history.slice(0,25),
leaderboard:Object.values(arena.leaderboard).sort((a,b)=>b.wins-a.wins || a.losses-b.losses),
aiButler:arena.aiButler
});

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
return json({queue:arena.queue});

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

const resolved=await resolveArena(arena);
await saveArena(env,arena);

return json({status:"queued",entry,resolved,queueDepth:arena.queue.length,latestBattle:arena.history[0] ?? null},201);
}





if(path==="/gestures")

return json({

count:Object.keys(GESTURES).length,

gestures:GESTURES,

outcomes:outcomeMatrix(),

outcomeLegend:NON_HAND_OUTCOMES

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

if(playerA===MEMORY_ARENA.aiButler.id || playerB===MEMORY_ARENA.aiButler.id){
const arena=await loadArena(env);
const winnerId=replay.winner==="Player 1" ? playerA : replay.winner==="Player 2" ? playerB : "Draw";
const aiOpponent=playerA===MEMORY_ARENA.aiButler.id ? decoratedOpponent : parsed;
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
forceRule:"Kinetic > Mystic > Barrier > Kinetic"
});

}





if(path==="/analyze")

return json({

id,

name,

technique:decoded,

outcome:parsed.outcome,

outcomeMatrix:combo.map(gesture=>({gesture,outcome:outcomeForCast(gesture)})),

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
