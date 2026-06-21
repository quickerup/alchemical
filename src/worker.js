const FINISHER = "🙏🏻";


const GESTURES = {

"💪🏻":{name:"Flex",atk:6,def:2,spe:2,type:"kinetic"},
"👏🏻":{name:"Clap",atk:3,def:4,spe:3,type:"barrier"},
"👍🏻":{name:"Up",atk:4,def:4,spe:2,type:"barrier"},
"👎🏻":{name:"Down",atk:4,def:3,spe:3,type:"kinetic"},

"🫶🏻":{name:"Heart",atk:2,def:5,spe:6,type:"mystic"},
"🙌🏻":{name:"Raise",atk:4,def:4,spe:5,type:"mystic"},
"👐🏻":{name:"Open",atk:3,def:6,spe:1,type:"barrier"},
"🤲🏻":{name:"Cup",atk:1,def:6,spe:3,type:"barrier"},


"🤜🏻":{name:"Right Hook",atk:9,def:1,spe:0,type:"kinetic"},
"🤛🏻":{name:"Left Hook",atk:9,def:1,spe:0,type:"kinetic"},
"✊🏻":{name:"Fist",atk:8,def:2,spe:0,type:"kinetic"},
"👊🏻":{name:"Strike",atk:8,def:2,spe:0,type:"kinetic"},


"🫸🏻":{name:"Thrust",atk:7,def:3,spe:0,type:"kinetic"},
"🫷🏻":{name:"Reverse Thrust",atk:7,def:3,spe:0,type:"kinetic"},


"🤚🏻":{name:"Guard",atk:1,def:8,spe:1,type:"barrier"},
"🖐🏻":{name:"Palm",atk:2,def:8,spe:0,type:"barrier"},
"✋🏻":{name:"Stop",atk:1,def:9,spe:0,type:"barrier"},


"🖖🏻":{name:"Vulcan",atk:3,def:3,spe:9,type:"mystic"},
"🤟🏻":{name:"Love",atk:2,def:4,spe:8,type:"mystic"},
"🤞🏻":{name:"Cross",atk:4,def:3,spe:7,type:"mystic"},
"✌🏻":{name:"Peace",atk:3,def:4,spe:7,type:"mystic"},
"🤌🏻":{name:"Kiss",atk:4,def:4,spe:6,type:"mystic"}

};



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
spe:15
}

};



const CODEX={


help:{

title:"Emoji Jutsu Commands",

commands:[

"/lookup?combo=👊🏻🖖🏻🙏🏻",
"Cast a technique",

"/analyze?combo=👊🏻🖖🏻🙏🏻",
"Explain a technique",

"/gestures",
"View hand signs",

"/rules",
"Learn combat",

"/duel?combo=👊🏻🖖🏻🙏🏻&opponent=✋🏻🤟🏻🙏🏻",
"Compare two techniques in combat",

"/simulate?combo=👊🏻🖖🏻🙏🏻&opponent=✋🏻👐🏻🙏🏻",
"Replay a deterministic duel",

"/replay?combo=👊🏻🖖🏻🙏🏻&opponent=✋🏻👐🏻🙏🏻&matchId=MATCH-123",
"Verify a deterministic match",

"/train",
"Begin training"

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

Repeat matching forces for synergy bonuses.
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
Choose 1-5 hand signs.

Step 2:
Mix power, defense and energy.

Step 3:
Seal your technique with 🙏🏻.

Step 4:
Discover your spell.

Example:

👊🏻🖖🏻🤞🏻🙏🏻
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
let spe=0;


let types=[];


combo.forEach(e=>{

let g=GESTURES[e];

atk+=g.atk;
def+=g.def;
spe+=g.spe;

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
spe+=3;

}

}



atk=scale(atk);
def=scale(def);
spe=scale(spe);



let className;


if(atk>=def && atk>=spe)
className="Kinetic";


else if(def>=atk && def>=spe)
className="Barrier";


else
className="Mystic";





const baseTotal=atk+def+spe;
const uniqueSigns=new Set(combo).size;
const repetitionPenalty=(combo.length-uniqueSigns)*4;
const diversityBonus=uniqueSigns*2;
const complexityBonus=Math.max(0,combo.length-2)*3;
const power=Math.max(1,baseTotal + diversityBonus + complexityBonus - repetitionPenalty);
const cost=Math.ceil(power*0.38 + combo.length*3);
const risk=Math.max(1,Math.floor((atk*0.24 + spe*0.18) - (def*0.12) + repetitionPenalty));

return {

atk,
def,
spe,

class:className,
power,
cost,
risk,
modifiers:{
diversityBonus,
complexityBonus,
repetitionPenalty
},

types:[...new Set(types)]

};

}





function rank(spell){

let total=spell.power ?? (
spell.atk+
spell.def+
spell.spe
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
if(finisher.spe) boosted.spe+=finisher.spe;

boosted.finisher=finisher.name;
boosted.power=boosted.atk+boosted.def+boosted.spe + (boosted.modifiers?.diversityBonus ?? 0) + (boosted.modifiers?.complexityBonus ?? 0) - (boosted.modifiers?.repetitionPenalty ?? 0);
boosted.cost=Math.ceil(boosted.power*0.38);
boosted.risk=Math.max(1,Math.floor((boosted.atk*0.24 + boosted.spe*0.18) - (boosted.def*0.12) + (boosted.modifiers?.repetitionPenalty ?? 0)));

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
return 8;

return -8;

}



function scoreDuelist(spell,opponent,seed=0){

const deterministicPressure=(seed-0.5)*6;
return spell.atk*1.15 + spell.def + spell.spe*0.9 + forceAdvantage(spell,opponent) - spell.cost*0.08 - spell.risk*0.12 + deterministicPressure;

}



function describeTechnique(spell){

const prefix=spell.spe>=spell.atk && spell.spe>=spell.def ? "Celestial" : spell.def>=spell.atk ? "Heavenly" : "Iron";
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
name:describeTechnique(parsed.spell)
};

}



async function simulateBattle(player,opponent,requestedMatchId){

const canonical=[player.decoded,opponent.decoded,requestedMatchId ?? ""].join("|");
const matchHash=await sha256Hex(canonical);
const matchId=requestedMatchId || `MATCH-${matchHash.slice(0,10).toUpperCase()}`;
const seed=await sha256Hex(`${player.decoded}|${opponent.decoded}|${matchId}`);

const playerScore=scoreDuelist(player.spell,opponent.spell,seedNumber(seed,0));
const opponentScore=scoreDuelist(opponent.spell,player.spell,seedNumber(seed,1));
const playerDamage=Math.max(0,Math.round(playerScore - opponent.spell.def*0.35 + seedNumber(seed,2)*5));
const opponentDamage=Math.max(0,Math.round(opponentScore - player.spell.def*0.35 + seedNumber(seed,3)*5));

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
`Player 1 cost ${player.spell.cost} with risk ${player.spell.risk}`,
`Player 2 cost ${opponent.spell.cost} with risk ${opponent.spell.risk}`
],
rounds:[
{attacker:"Player 1",damage:playerDamage,score:Number(playerScore.toFixed(2))},
{attacker:"Player 2",damage:opponentDamage,score:Number(opponentScore.toFixed(2))}
],
winner
};

}



function parseTechnique(input){

if(!input)
return {error:"Missing combo",status:400};

const decoded=decodeURIComponent(input);

if(!decoded.endsWith(FINISHER))
return {error:"Every technique must end with 🙏🏻",status:400};

const core=decoded.slice(0,decoded.length-FINISHER.length);

const combo=parseEmojis(core);

if(!combo)
return {error:"Unknown gesture detected",status:400};

if(combo.length<1)
return {error:"Choose at least one hand sign before 🙏🏻",status:400};

if(combo.length>5)
return {error:"Training rules allow 1-5 hand signs before 🙏🏻",status:400};

const spell=applyFinisher(buildSpell(combo),combo[combo.length-1]);

return {decoded,combo,spell};

}



function analyze(combo){


return combo.map(e=>{

let g=GESTURES[e];


return `${e} ${g.name}: +${g.atk} ATK +${g.def} DEF +${g.spe} SPE`;

});

}





function json(data,status=200){

return new Response(

JSON.stringify(data,null,2),

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


async fetch(request){


const url=new URL(request.url);


const path=url.pathname;



if(path==="/help")
return json(CODEX.help);



if(path==="/rules")
return json(CODEX.rules);



if(path==="/train")
return json(CODEX.train);



if(path==="/gestures")

return json({

count:Object.keys(GESTURES).length,

gestures:GESTURES

});





if(
path!=="/lookup" &&
path!=="/analyze" &&
path!=="/duel" &&
path!=="/simulate" &&
path!=="/replay"
)

return json({
error:"Unknown command"
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

return json({
status:"success",
...replay,
combo:{id,name,technique:decoded,class:spell.class,rank:rank(spell),stats:spell},
opponent:{id:decoratedOpponent.id,name:decoratedOpponent.name,technique:decoratedOpponent.decoded,class:decoratedOpponent.spell.class,rank:rank(decoratedOpponent.spell),stats:decoratedOpponent.spell},
forceRule:"Kinetic > Mystic > Barrier > Kinetic"
});

}





if(path==="/analyze")

return json({

id,

name,

technique:decoded,

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

spell:

`${spell.class} Technique`,

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
