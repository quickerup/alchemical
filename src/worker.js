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





const total=atk+def+spe;

return {

atk,
def,
spe,

class:className,
power:total,

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
boosted.power=boosted.atk+boosted.def+boosted.spe;

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



function scoreDuelist(spell,opponent){

return spell.atk*1.15 + spell.def + spell.spe*0.9 + forceAdvantage(spell,opponent);

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
path!=="/duel"
)

return json({
error:"Unknown command"
},404);





let input=url.searchParams.get("combo");


let parsed=parseTechnique(input);

if(parsed.error)
return json({error:parsed.error},parsed.status);

let {decoded,combo,spell}=parsed;


if(path==="/duel"){

const opponentInput=url.searchParams.get("opponent");
const opponent=parseTechnique(opponentInput);

if(opponent.error)
return json({error:`Opponent: ${opponent.error}`},opponent.status);

const playerScore=scoreDuelist(spell,opponent.spell);
const opponentScore=scoreDuelist(opponent.spell,spell);

let outcome="draw";

if(playerScore>opponentScore) outcome="win";
if(opponentScore>playerScore) outcome="loss";

return json({
status:"success",
outcome,
combo:{technique:decoded,class:spell.class,rank:rank(spell),score:Number(playerScore.toFixed(2)),stats:spell},
opponent:{technique:opponent.decoded,class:opponent.spell.class,rank:rank(opponent.spell),score:Number(opponentScore.toFixed(2)),stats:opponent.spell},
forceRule:"Kinetic > Mystic > Barrier > Kinetic"
});

}





if(path==="/analyze")

return json({

technique:decoded,

breakdown:analyze(combo),

class:spell.class,

rank:rank(spell),

stats:spell

});






return json({

status:"success",

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
