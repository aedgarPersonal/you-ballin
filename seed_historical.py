"""
Generate < 20 historical game sessions matching exact win-loss records.

Each session has unequal teams (e.g. 6v5, 7v6) with subs.
Score is like 3-2. Players on winning team get W wins and L losses;
players on losing team get L wins and W losses.
"""
import random
import json

random.seed(42)

# Target: {user_id: (name, target_wins, target_losses)}
targets = {
    22: ('Bryan',    26, 14),
    23: ('Julien',   23, 12),
    24: ('Denis',    23, 17),
    25: ('Imran',    22, 15),
    26: ('Gary',     21, 19),
    27: ('Carey',    20, 18),
    28: ('Ren',      20, 20),
    29: ('Didier',   19, 21),
    30: ('Chris',    18, 22),
    31: ('Seb',      18, 22),
    32: ('Mike',     17, 23),
    33: ('Shamir',   16, 18),
    1:  ('Alic',     15, 21),
    34: ('Bobby',    14, 16),
    35: ('Dan',      14,  9),
    36: ('Dion',     13,  8),
    37: ('Hendrick', 11, 11),
    38: ('Sean',     11, 14),
    39: ('Ryan',      9,  7),
    40: ('Jeff',      3,  7),
}

SCORES = [(3,2), (3,1), (3,0), (2,1), (4,1), (2,0), (1,0)]

def try_generate(seed):
    random.seed(seed)
    rw = {uid: t[1] for uid, t in targets.items()}
    rl = {uid: t[2] for uid, t in targets.items()}
    result_games = []

    for _ in range(100):
        available = [u for u in targets if rw[u] > 0 or rl[u] > 0]
        if not available:
            break
        if len(available) < 4:
            break

        # Roster: 10-14 players, unequal teams
        roster_size = min(len(available), random.choice([10, 11, 12, 13, 14]))
        if roster_size < 4:
            break

        available.sort(key=lambda u: rw[u] + rl[u], reverse=True)
        roster = available[:roster_size]

        best_score = None
        best_teams = None
        best_cost = float('inf')

        for w_score, l_score in SCORES:
            for _ in range(80):
                random.shuffle(roster)
                # Unequal split: winning team can be larger or smaller
                split_options = []
                half = len(roster) // 2
                for s in range(max(3, half - 2), min(len(roster) - 2, half + 3)):
                    split_options.append(s)

                split = random.choice(split_options)
                t1 = roster[:split]
                t2 = roster[split:]

                # Try t1 wins
                ok = True
                cost = 0
                for u in t1:
                    if rw[u] < w_score or rl[u] < l_score:
                        ok = False
                        break
                    cost += (rw[u] - w_score) + (rl[u] - l_score)
                if ok:
                    for u in t2:
                        if rw[u] < l_score or rl[u] < w_score:
                            ok = False
                            break
                        cost += (rw[u] - l_score) + (rl[u] - w_score)

                if ok and cost < best_cost:
                    best_cost = cost
                    best_score = (w_score, l_score)
                    best_teams = (list(t1), list(t2))

                # Try t2 wins
                ok = True
                cost = 0
                for u in t2:
                    if rw[u] < w_score or rl[u] < l_score:
                        ok = False
                        break
                    cost += (rw[u] - w_score) + (rl[u] - l_score)
                if ok:
                    for u in t1:
                        if rw[u] < l_score or rl[u] < w_score:
                            ok = False
                            break
                        cost += (rw[u] - l_score) + (rl[u] - w_score)

                if ok and cost < best_cost:
                    best_cost = cost
                    best_score = (w_score, l_score)
                    best_teams = (list(t2), list(t1))

        if best_score is None:
            continue

        winners, losers = best_teams
        w_score, l_score = best_score

        for u in winners:
            rw[u] -= w_score
            rl[u] -= l_score
        for u in losers:
            rw[u] -= l_score
            rl[u] -= w_score

        result_games.append({
            'winners': winners,
            'losers': losers,
            'winner_score': w_score,
            'loser_score': l_score,
        })

    total_remaining = sum(rw[u] + rl[u] for u in targets)
    return result_games, rw, rl, total_remaining


best = None
for seed in range(500):
    games, rw, rl, rem = try_generate(seed)
    if len(games) <= 19 and (best is None or rem < best[3]):
        best = (games, rw, rl, rem, seed)
        if rem == 0:
            break

games, rw, rl, rem, seed = best
print(f"Best seed: {seed}, Games: {len(games)}, Remaining: {rem}")

if rem > 0:
    print(f"\nPlayers with remaining rounds:")
    for uid, (name, tw, tl) in targets.items():
        if rw[uid] != 0 or rl[uid] != 0:
            print(f"  {name}: {rw[uid]}W/{rl[uid]}L remaining")
else:
    print("All player records match exactly!")

print(f"\n=== Verification ===")
for uid, (name, tw, tl) in sorted(targets.items(), key=lambda x: x[1][0]):
    aw = tw - rw[uid]
    al = tl - rl[uid]
    status = "OK" if aw == tw and al == tl else f"OFF {rw[uid]}W/{rl[uid]}L"
    print(f"  {name:10s}: {tw:2d}W/{tl:2d}L -> {aw:2d}W/{al:2d}L  {status}")

print(f"\n=== Games ({len(games)}) ===")
for i, g in enumerate(games):
    wn = [targets[u][0] for u in g['winners']]
    ln = [targets[u][0] for u in g['losers']]
    print(f"  {i+1:2d}. {g['winner_score']}-{g['loser_score']}  "
          f"({len(wn)}v{len(ln)})  W={wn}  L={ln}")

with open('historical_games.json', 'w') as f:
    json.dump(games, f, indent=2)
print(f"\nWrote to historical_games.json")
