# API Verification Audit

Date: 2026-06-25
Base URL: `https://alchemical.lockloke50.workers.dev`

## Live verification status

The production audit attempted to fetch `GET /help` with:

```sh
curl -sS --retry 3 --retry-delay 2 https://alchemical.lockloke50.workers.dev/help
```

The local environment could not reach the deployed Worker because the configured outbound CONNECT proxy returned `403` before the request reached Cloudflare:

```text
curl: (56) CONNECT tunnel failed, response 403
```

Because the request did not reach the Worker, no production response schema can be honestly recorded from this environment. The endpoint contract below is derived from the repository's `/help` command registry and route handlers, and should be rerun from an unrestricted network.

## Endpoint report

| Endpoint | Expected behavior | Actual behavior in this audit environment | Pass/fail | Response schema |
|---|---|---|---|---|
| `GET /lookup?combo=👊🖖🙏` | Return generated technique name, rank, stats, outcome, battle style. | Network blocked before Worker. Local code path returns JSON for valid combos. | Fail: environment blocked live verification | `{status,id,name,technique,outcome,spell,element,type,damage,effect,chakraCost,rank,stats,battleStyle,curl,help,isSystemCommand}` |
| `GET /analyze?combo=👊🖖🙏` | Return hand-sign breakdown and stat construction. | Network blocked before Worker. Local tests cover named outcome matrix. | Fail: environment blocked live verification | `{id,name,technique,outcome,outcomeName,outcomeMatrix,breakdown,class,rank,stats,curl,help,isSystemCommand}` |
| `GET /duel?combo=👊🖖🙏&opponent=✋🤟🙏` | Return deterministic duel result. | Network blocked before Worker. Local code path validates both combos and simulates battle. | Fail: environment blocked live verification | `{status,match,analysis,rounds,winner,combo,opponent,forceRule,ranked,curl,help,isSystemCommand}` |
| `GET /simulate?combo=👊🖖🙏&opponent=✋👐🙏` | Return replayable deterministic duel. | Network blocked before Worker. | Fail: environment blocked live verification | Same as `/duel` without duel rate-limit branch. |
| `GET /replay?combo=👊🖖🙏&opponent=✋👐🙏&matchId=MATCH-123` | Recompute deterministic match with supplied match id. | Network blocked before Worker. | Fail: environment blocked live verification | Same as `/simulate`; `match.id` equals supplied `matchId`. |
| `POST /queue` | Queue technique, optionally include AI Butler, resolve compatible battles. | Network blocked before Worker. | Fail: environment blocked live verification | `{status,entry,resolved,queueDepth,latestBattle,curl,help,isSystemCommand}` or validation error. |
| `GET /arena` | Return queue, history, leaderboard, and AI Butler state. | Network blocked before Worker. | Fail: environment blocked live verification | `{persistence,queue,activeBattles,history,leaderboard,legacyLeaderboard,aiButler,curl,help,isSystemCommand}` |
| `GET /leaderboard` | Return ranked arena leaders. | Network blocked before Worker. | Fail: environment blocked live verification | `{persistence,leaderboard,legacyLeaderboard,ranks,count,curl,help,isSystemCommand}` |
| `GET /battle/:id` | Return matching completed arena battle or 404. | Network blocked before Worker. | Fail: environment blocked live verification | Battle object or `{error:"Battle not found",curl,help,isSystemCommand}`. |
| `GET /butler` | Return AI Butler state and next combo. | Network blocked before Worker. | Fail: environment blocked live verification | `{id,name,history,winRate,preferredStyle,adaptationLevel,nextCombo,behavior,curl,help,isSystemCommand}` |

