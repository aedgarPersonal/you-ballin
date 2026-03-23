"""
Team Balancing Algorithm
========================
Creates two fair teams from a pool of accepted players.

TEACHING NOTE:
    This is the heart of the application. The algorithm must balance teams
    across multiple dimensions: skill ratings, physical attributes, and
    historical win rates. Here's how it works:

    1. SCORING: Each player gets a composite score based on weighted factors
    2. SORTING: Players are sorted by composite score (best to worst)
    3. SNAKE DRAFT: Teams alternate picks in a serpentine pattern
       (A, B, B, A, A, B, B, A, ...) to distribute talent evenly
    4. OPTIMIZATION: After the draft, we do swap-based refinement to
       minimize the score difference between teams

    Weight Configuration:
    - Overall rating (peer-rated):  35% - highest weight as requested
    - Winner rating (win history):  20% - rewards consistent winners
    - Offense rating:               15%
    - Defense rating:               15%
    - Height (normalized):           5%
    - Age (normalized, inverse):     5% - younger slightly favored
    - Mobility:                      5%

    The algorithm is deterministic given the same inputs, which makes
    it testable and debuggable.
"""

import itertools
from dataclasses import dataclass

from app.models.user import User


# =============================================================================
# Weight Configuration
# =============================================================================

WEIGHTS = {
    "overall": 0.35,     # Peer-rated overall skill (highest weight)
    "winner": 0.20,      # Historical win rate
    "offense": 0.15,     # Peer-rated offensive skill
    "defense": 0.15,     # Peer-rated defensive skill
    "height": 0.05,      # Physical height (normalized)
    "age": 0.05,         # Age factor (younger = slightly higher)
    "mobility": 0.05,    # Admin-rated mobility
}


@dataclass
class PlayerScore:
    """A player with their computed composite score.

    TEACHING NOTE:
        We separate scoring from the User model so the algorithm
        is pure and testable without database dependencies.
    """
    user: User
    composite: float
    breakdown: dict[str, float]


# =============================================================================
# Scoring Functions
# =============================================================================

def normalize(value: float, min_val: float, max_val: float) -> float:
    """Normalize a value to 0.0-1.0 range.

    TEACHING NOTE:
        Normalization is essential because our inputs are on different scales:
        - Ratings: 1-5
        - Height: 60-84 inches
        - Age: 18-65 years
        - Mobility: 1-5

        By normalizing everything to 0-1, the weights work as intended.
    """
    if max_val == min_val:
        return 0.5
    return (value - min_val) / (max_val - min_val)


def compute_player_score(player: User) -> PlayerScore:
    """Calculate a player's composite score from all their attributes.

    TEACHING NOTE:
        Default values are used for missing data (e.g., a new player
        with no ratings gets the middle score of 3.0). This prevents
        new players from being unfairly penalized or advantaged.
    """
    # Normalize each factor to 0.0-1.0 range
    factors = {
        "overall": normalize(player.avg_overall or 3.0, 1.0, 5.0),
        "winner": player.winner_rating or 0.5,  # Already 0-1
        "offense": normalize(player.avg_offense or 3.0, 1.0, 5.0),
        "defense": normalize(player.avg_defense or 3.0, 1.0, 5.0),
        "height": normalize(player.height_inches or 70, 60, 84),
        "age": 1.0 - normalize(player.age or 30, 18, 65),  # Inverse: younger = higher
        "mobility": normalize(player.mobility or 3.0, 1.0, 5.0),
    }

    # Weighted sum
    composite = sum(WEIGHTS[k] * factors[k] for k in WEIGHTS)

    return PlayerScore(user=player, composite=composite, breakdown=factors)


# =============================================================================
# Team Creation Algorithm
# =============================================================================

def snake_draft(scored_players: list[PlayerScore]) -> tuple[list[PlayerScore], list[PlayerScore]]:
    """Distribute players using a serpentine (snake) draft.

    TEACHING NOTE:
        A snake draft alternates direction each round:
        Round 1: Team A picks 1st, Team B picks 2nd
        Round 2: Team B picks 3rd, Team A picks 4th
        Round 3: Team A picks 5th, Team B picks 6th
        ...and so on.

        This is fairer than a straight draft because the team that picks
        first in one round picks last in the next, preventing one team
        from always getting the better player in each pair.

        Players are sorted best-to-worst, so the snake draft naturally
        distributes talent:
        - Team A gets: 1st, 4th, 5th, 8th, 9th...
        - Team B gets: 2nd, 3rd, 6th, 7th, 10th...
    """
    team_a: list[PlayerScore] = []
    team_b: list[PlayerScore] = []

    for i, player in enumerate(scored_players):
        # Determine which "round" we're in
        round_num = i // 2
        pick_in_round = i % 2

        if round_num % 2 == 0:
            # Even rounds: A picks first
            if pick_in_round == 0:
                team_a.append(player)
            else:
                team_b.append(player)
        else:
            # Odd rounds: B picks first (snake back)
            if pick_in_round == 0:
                team_b.append(player)
            else:
                team_a.append(player)

    return team_a, team_b


def team_total(team: list[PlayerScore]) -> float:
    """Sum of composite scores for a team."""
    return sum(p.composite for p in team)


def optimize_teams(
    team_a: list[PlayerScore],
    team_b: list[PlayerScore],
    max_iterations: int = 100,
) -> tuple[list[PlayerScore], list[PlayerScore]]:
    """Refine teams by swapping players to minimize score difference.

    TEACHING NOTE:
        After the snake draft, we do greedy optimization:
        1. For every pair of players (one from each team), consider swapping
        2. If a swap reduces the score difference, make it
        3. Repeat until no improving swaps exist or we hit max iterations

        This is a local search / hill climbing approach. It's not guaranteed
        to find the global optimum, but it's fast and produces good results
        in practice.
    """
    best_diff = abs(team_total(team_a) - team_total(team_b))

    for _ in range(max_iterations):
        improved = False

        for i in range(len(team_a)):
            for j in range(len(team_b)):
                # Try swapping player i from A with player j from B
                team_a[i], team_b[j] = team_b[j], team_a[i]
                new_diff = abs(team_total(team_a) - team_total(team_b))

                if new_diff < best_diff:
                    # Swap improved balance - keep it
                    best_diff = new_diff
                    improved = True
                else:
                    # Swap made things worse - undo it
                    team_a[i], team_b[j] = team_b[j], team_a[i]

        if not improved:
            break  # No more improving swaps possible

    return team_a, team_b


def create_balanced_teams(players: list[User]) -> tuple[list[User], list[User]]:
    """Main entry point: create two balanced teams from a player pool.

    TEACHING NOTE:
        The full pipeline:
        1. Score each player (multi-factor composite)
        2. Sort by score (best first)
        3. Snake draft for initial distribution
        4. Optimize via player swaps
        5. Sort each team: starters first (top 5), then subs

    Args:
        players: List of User objects (accepted RSVPs).

    Returns:
        Tuple of (team_a_players, team_b_players) as User objects.
    """
    if len(players) < 2:
        # Edge case: not enough players
        return players, []

    # Step 1 & 2: Score and sort
    scored = [compute_player_score(p) for p in players]
    scored.sort(key=lambda s: s.composite, reverse=True)

    # Step 3: Snake draft
    team_a, team_b = snake_draft(scored)

    # Step 4: Optimize
    team_a, team_b = optimize_teams(team_a, team_b)

    # Step 5: Sort within teams (highest rated = starters)
    team_a.sort(key=lambda s: s.composite, reverse=True)
    team_b.sort(key=lambda s: s.composite, reverse=True)

    # Return User objects only
    return (
        [ps.user for ps in team_a],
        [ps.user for ps in team_b],
    )
