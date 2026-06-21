const GESTURES = {
  '💪🏻':['Flex',6,2,2],'👏🏻':['Clap',3,4,3],'👍🏻':['Up',4,4,2],'👎🏻':['Down',4,3,3],
  '🫶🏻':['Heart',2,5,6],'🙌🏻':['Raise',4,4,5],'👐🏻':['Open',3,6,1],'🤲🏻':['Cup',1,6,3],
  '🤜🏻':['RHook',9,1,0],'🤛🏻':['LHook',9,1,0],'✊🏻':['Fist',8,2,0],'👊🏻':['Strike',8,2,0],
  '🫳🏻':['PDown',2,7,1],'🫴🏻':['PUp',2,7,1],'🫱🏻':['HRight',3,5,2],'🫲🏻':['HLeft',3,5,2],
  '🫸🏻':['ThrustR',7,3,0],'🫷🏻':['ThrustL',7,3,0],'👋🏻':['Wave',3,5,2],'🤚🏻':['Raise',1,8,1],
  '🖐🏻':['Palm',2,8,0],'✋🏻':['Stop',1,9,0],'🖖🏻':['Vulcan',3,3,9],'🤟🏻':['Love',2,4,8],
  '🤘🏻':['Horns',5,1,4],'✌🏻':['Peace',3,4,7],'🤞🏻':['Cross',4,3,7],'🫰🏻':['Snap',5,2,7],
  '🤙🏻':['Shaka',3,4,6],'🤌🏻':['Kiss',4,4,6],'🤏🏻':['Pinch',3,5,2],'👌🏻':['OK',4,3,5],
  '🫵🏻':['You',5,2,5],'👉🏻':['PRight',5,2,3],'👈🏻':['PLeft',5,2,3],'☝🏻':['OneUp',4,3,3],
  '👆🏻':['PUp2',4,3,3],'👇🏻':['PDown2',4,3,3],'🖕🏻':['Defiance',6,0,4],'✍🏻':['Write',3,3,6],
  '🤳🏻':['Selfie',2,2,7]
};

const FINISHER = '🙏🏻';

function getOutcome(atk, defn, spe) {
  if (atk >= 20 && spe >= 15) return '🔥💥⚡🌪️🤜🏻';
  if (atk >= 20)              return '💥🤜🏻🤛🏻✊🏻👊🏻';
  if (defn >= 20 && spe >= 15) return '🛡️🌀🔮✨🤲🏻';
  if (defn >= 20)              return '🛡️🤚🏻✋🏻🖐🏻👐🏻';
  if (spe >= 25)               return '🌀🔮⭐🌙✨🎇🤟🏻';
  if (spe >= 20)               return '✨🔮🌀🖖🏻🤌🏻';
  if (atk >= 15 && defn >= 15) return '⚖️🤜🏻✋🏻💫🛡️';
  if (atk >= 15)               return '⚡🤜🏻👊🏻🔥';
  if (defn >= 15)              return '🛡️✋🏻🤲🏻💠';
  if (spe >= 15)               return '🌀✨🤞🏻🌙';
  return '👋🏻💨🌫️';
}

function parseEmojis(input) {
  const parsed = [];
  let remaining = input;
  while (remaining.length > 0) {
    let matched = false;
    for (const gesture of Object.keys(GESTURES)) {
      if (remaining.startsWith(gesture)) {
        parsed.push(gesture);
        remaining = remaining.slice(gesture.length);
        matched = true;
        break;
      }
    }
    if (!matched) {
      // skip one character (handles multi-byte safely)
      remaining = [...remaining].slice(1).join('');
    }
  }
  return parsed;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Content-Type': 'application/json',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (url.pathname !== '/lookup') {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404, headers: corsHeaders
      });
    }

    const combo = url.searchParams.get('combo');
    if (!combo) {
      return new Response(JSON.stringify({ error: 'Missing combo parameter' }), {
        status: 400, headers: corsHeaders
      });
    }

    const decoded = decodeURIComponent(combo).trim();

    if (!decoded.endsWith(FINISHER)) {
      return new Response(JSON.stringify({ error: 'Sequence must end with the 🙏🏻 finisher.' }), {
        status: 400, headers: corsHeaders
      });
    }

    const core = decoded.slice(0, decoded.length - FINISHER.length);
    const comboList = parseEmojis(core);

    if (comboList.length === 0) {
      return new Response(JSON.stringify({ error: 'No valid gestures found in sequence.' }), {
        status: 400, headers: corsHeaders
      });
    }

    const stats = comboList.map(e => GESTURES[e]);
    const rawAtk  = stats.reduce((s, x) => s + x[1], 0);
    const rawDefn = stats.reduce((s, x) => s + x[2], 0);
    const rawSpe  = stats.reduce((s, x) => s + x[3], 0);

    const atk  = (rawAtk  >= rawDefn && rawAtk  >= rawSpe)  ? Math.floor(rawAtk  * 1.5) : rawAtk;
    const defn = (rawDefn >  rawAtk  && rawDefn >= rawSpe)  ? Math.floor(rawDefn * 1.5) : rawDefn;
    const spe  = (rawSpe  >  rawAtk  && rawSpe  >  rawDefn) ? Math.floor(rawSpe  * 1.5) : rawSpe;

    return new Response(JSON.stringify({
      status: 'success',
      data: { combo: decoded, atk, def: defn, spe, outcome: getOutcome(atk, defn, spe) }
    }), { headers: corsHeaders });
  }
};
