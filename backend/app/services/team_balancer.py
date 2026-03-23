"""
Team Balancing Algorithm
========================
Creates two fair teams from a pool of accepted players.

TEACHING NOTE:
    This is the heart of the application. The algorithm must balance teams
    across multiple dimensions: skill ratings, physical attributes,
    historical win rates, and any custom metrics defined by admins.

    1. SCORING: Each player gets a composite score based on weighted factors
    2. SORTING: Players are sorted by composite score (best to worst)
    3. SNAKE DRAFT: Teams alternate picks in a serpentine pattern
       (A, B, B, A, A, B, B, A, ...) to distribute talent evenly
    4. OPTIMIZATION: After the draft, we do swap-based refinement to
       minimize the score difference between teams

    Default Weight Configuration:
    - Overall rating (peer-rated):  35% - highest weight as requested
    - Jordan Factor (win history):  20% - rewards consistent winners
    - Offense rating:               15%
    - Defense rating:               15%
    - Height (normalized):           5%
    - Age (normalized, inverse):     5% - younger slightly favored
    - Mobility:                      5%

    Admins can override these weights and add custom metrics via the UI.
    Weights are loaded from the database at runtime. If no database config
    exists, the defaults above are used. Weights are automatically
    normalized so they don't need to sum to 1.0 — admins can think in
    relative terms ("offense should matter twice as much as height").

    The algorithm is deterministic given the same inputs, which makes
    it testable and debuggable.
"""

from dataclasses import dataclass

from app.models.user import User


# =============================================================================
# Default Weight Configuration (used when no DB config exists)
# =============================================================================

DEFAULT_WEIGHTS = {
    "overall": 0.35,         # Peer-rated overall skill (highest weight)
    "jordan_factor": 0.20,   # Historical win percentage (the Jordan Factor)
    "offense": 0.15,         # Peer-rated offensive skill
    "defense": 0.15,         # Peer-rated defensive skill
    "height": 0.05,          # Physical height (normalized)
    "age": 0.05,             # Age factor (younger = slightly higher)
    "mobility": 0.05,        # Admin-rated mobility
}


@dataclass
class CustomMetricDef:
    """Definition of a custom metric for scoring purposes.

    TEACHING NOTE:
        Passed into the scoring function so it knows the scale
        (min/max) for normalization and the default value for
        players who haven't been rated on this metric.
    """
    name: str
    min_value: float
    max_value: float
    default_value: float


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
        - Custom metrics: admin-defined ranges

        By normalizing everything to 0-1, the weights work as intended.
    """
    if max_val == min_val:
        return 0.5
    return (value - min_val) / (max_val - min_val)


def compute_player_score(
    player: User,
    weights: dict[str, float],
    custom_metrics: list[CustomMetricDef] | None = None,
    player_custom_values: dict[str, float] | None = None,
) -> PlayerScore:
    """Calculate a player's composite score from all their attributes.

    TEACHING NOTE:
        This function now accepts dynamic weights and custom metrics.
        The weights dict is normalized so they sum to 1.0, meaning
        admins don't need to worry about exact math — they just need
        to set relative importance.

    Args:
        player: The User object with built-in attributes.
        weights: Dict of metric_name -> weight (from DB or defaults).
        custom_metrics: Definitions of custom metrics (name, scale, default).
        player_custom_values: This player's values for custom metrics
                              (metric_name -> value).
    """
    custom_metrics = custom_metrics or []
    player_custom_values = player_custom_values or {}

    # Normalize weights so they sum to 1.0
    total_weight = sum(weights.values())
    if total_weight == 0:
        total_weight = 1.0
    normalized_weights = {k: v / total_weight for k, v in weights.items()}

    # Calculate built-in factors (normalized to 0.0-1.0)
    factors = {
        "overall": normalize(player.avg_overall or 3.0, 1.0, 5.0),
        "jordan_factor": player.jordan_factor if player.jordan_factor is not None else 0.5,
        "offense": normalize(player.avg_offense or 3.0, 1.0, 5.0),
        "defense": normalize(player.avg_defense or 3.0, 1.0, 5.0),
        "height": normalize(player.height_inches or 70, 60, 84),
        "age": 1.0 - normalize(player.age or 30, 18, 65),  # Inverse: younger = higher
        "mobility": normalize(player.mobility or 3.0, 1.0, 5.0),
    }

    # Add custom metric factors
    for cm in custom_metrics:
        value = player_custom_values.get(cm.name, cm.default_value)
        factors[cm.name] = normalize(value, cm.min_value, cm.max_value)

    # Weighted sum (only include factors that have a weight)
    composite = sum(
        normalized_weights.get(k, 0.0) * factors[k]
        for k in factors
        if k in normalized_weights
    )

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


def create_balanced_teams(
    players: list[User],
    weights: dict[str, float] | None = None,
    custom_metrics: list[CustomMetricDef] | None = None,
    player_custom_values: dict[int, dict[str, float]] | None = None,
) -> tuple[list[User], list[User]]:
    """Main entry point: create two balanced teams from a player pool.

    TEACHING NOTE:
        The full pipeline:
        1. Score each player (multi-factor composite with dynamic weights)
        2. Sort by score (best first)
        3. Snake draft for initial distribution
        4. Optimize via player swaps
        5. Sort each team: starters first (top 5), then subs

    Args:
        players: List of User objects (accepted RSVPs).
        weights: Optional dict of metric_name -> weight. Falls back to
                 DEFAULT_WEIGHTS if None (for backward compatibility).
        custom_metrics: Optional list of custom metric definitions.
        player_custom_values: Optional dict of user_id -> {metric_name: value}
                              for custom metric values per player.

    Returns:
        Tuple of (team_a_players, team_b_players) as User objects.
    """
    if len(players) < 2:
        # Edge case: not enough players
        return players, []

    active_weights = weights or DEFAULT_WEIGHTS
    custom_metrics = custom_metrics or []
    player_custom_values = player_custom_values or {}

    # Step 1 & 2: Score and sort
    scored = [
        compute_player_score(
            p,
            active_weights,
            custom_metrics,
            player_custom_values.get(p.id, {}),
        )
        for p in players
    ]
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
