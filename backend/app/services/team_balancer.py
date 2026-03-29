"""
Team Balancing Algorithm
========================
Creates N fair teams from a pool of accepted players.

TEACHING NOTE:
    This is the heart of the application. The algorithm must balance teams
    across multiple dimensions: skill ratings, physical attributes,
    historical win rates, and any custom metrics defined by admins.

    1. SCORING: Each player gets a composite score based on weighted factors
    2. SORTING: Players are sorted by composite score (best to worst)
    3. SNAKE DRAFT: Teams alternate picks in a serpentine pattern
       to distribute talent evenly across N teams
    4. OPTIMIZATION: After the draft, we do swap-based refinement to
       minimize the score variance between teams

    Universal Weight Configuration (defaults when no custom metrics exist):
    - Win Rate (win history):       20% - rewards consistent winners
    - Height (normalized):           5%
    - Age (normalized, inverse):     5% - younger slightly favored

    Custom metrics (offense, defense, athleticism, etc.) are defined per-run
    via the CustomMetric system. Admins can adjust weights and add/remove
    metrics via the UI.
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
    "win_rate": 0.20,        # Historical win percentage
    "height": 0.05,          # Physical height (normalized)
    "age": 0.05,             # Age factor (younger = slightly higher)
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

    # Calculate universal factors (normalized to 0.0-1.0)
    factors = {
        "win_rate": player.win_rate if player.win_rate is not None else 0.5,
        "height": normalize(player.height_inches or 70, 60, 84),
        "age": 1.0 - normalize(player.age or 30, 18, 65),  # Inverse: younger = higher
    }

    # Add custom metric factors (these are the primary source for all skill metrics)
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


def compute_player_rating(player: User) -> int:
    """Calculate a 1-100 player rating from universal factors only.

    Uses DEFAULT_WEIGHTS (win_rate, height, age) since custom metrics are
    dynamic per-run and not available on the User model alone.
    The raw composite (0.0-1.0) is scaled to 40-99 range to feel like
    a realistic basketball rating (no one gets 100, no one gets below 40).
    """
    score = compute_player_score(player, DEFAULT_WEIGHTS)
    # Scale 0.0-1.0 composite to 40-99 range
    rating = int(40 + score.composite * 59)
    return max(40, min(99, rating))


def compute_player_rating_with_metrics(
    player: User,
    weights: dict[str, float],
    custom_metrics: list[CustomMetricDef],
    player_custom_values: dict[str, float],
) -> int:
    """Calculate a 1-100 player rating using full run-scoped metrics.

    Unlike compute_player_rating(), this uses the run's custom metrics
    and weights for a true composite rating.
    """
    score = compute_player_score(player, weights, custom_metrics, player_custom_values)
    rating = int(40 + score.composite * 59)
    return max(40, min(99, rating))


# =============================================================================
# Team Creation Algorithm
# =============================================================================

def snake_draft(scored_players: list[PlayerScore], num_teams: int) -> list[list[PlayerScore]]:
    """Distribute players using a serpentine (snake) draft across N teams.

    TEACHING NOTE:
        A snake draft alternates direction each round:
        Round 1 (forward):  Team 1, Team 2, Team 3, ... Team N
        Round 2 (reverse):  Team N, ... Team 3, Team 2, Team 1
        Round 3 (forward):  Team 1, Team 2, Team 3, ... Team N
        ...and so on.

        This distributes talent evenly across any number of teams.
        With 3 teams and players ranked 1-9:
        - Team 1 gets: 1st, 6th, 7th
        - Team 2 gets: 2nd, 5th, 8th
        - Team 3 gets: 3rd, 4th, 9th
    """
    teams: list[list[PlayerScore]] = [[] for _ in range(num_teams)]

    for i, player in enumerate(scored_players):
        round_num = i // num_teams
        pick_in_round = i % num_teams

        if round_num % 2 == 0:
            # Forward round
            teams[pick_in_round].append(player)
        else:
            # Reverse round (snake back)
            teams[num_teams - 1 - pick_in_round].append(player)

    return teams


def team_total(team: list[PlayerScore]) -> float:
    """Sum of composite scores for a team."""
    return sum(p.composite for p in team)


def _avg_attr(team: list[PlayerScore], attr: str, default: float) -> float:
    """Average of a player attribute for a team."""
    vals = [getattr(p.user, attr, None) or default for p in team]
    return sum(vals) / len(vals) if vals else default


def _variance(values: list[float]) -> float:
    """Variance of a list of values."""
    if not values:
        return 0
    mean = sum(values) / len(values)
    return sum((v - mean) ** 2 for v in values) / len(values)


def team_balance_cost(teams: list[list[PlayerScore]]) -> float:
    """Combined cost function: composite score variance + height/age variance.

    Balances three dimensions:
    - Composite score (skill) — primary (weight 1.0)
    - Average height per team — secondary (weight 0.3)
    - Average age per team — secondary (weight 0.2)
    """
    # Composite score variance (normalized per-player)
    totals = [team_total(t) / max(len(t), 1) for t in teams]
    score_var = _variance(totals)

    # Height variance (in inches, normalize to 0-1 range by dividing by 84)
    height_avgs = [_avg_attr(t, "height_inches", 70) / 84.0 for t in teams]
    height_var = _variance(height_avgs)

    # Age variance (normalize by dividing by 50)
    age_avgs = [_avg_attr(t, "age", 30) / 50.0 for t in teams]
    age_var = _variance(age_avgs)

    return score_var + height_var * 0.3 + age_var * 0.2


def optimize_teams(
    teams: list[list[PlayerScore]],
    max_iterations: int = 100,
) -> list[list[PlayerScore]]:
    """Refine teams by swapping players to minimize a combined balance cost.

    Balances composite skill score, average height, and average age
    across teams via greedy swap optimization.
    """
    best_cost = team_balance_cost(teams)
    num_teams = len(teams)

    for _ in range(max_iterations):
        improved = False

        for a in range(num_teams):
            for b in range(a + 1, num_teams):
                for i in range(len(teams[a])):
                    for j in range(len(teams[b])):
                        teams[a][i], teams[b][j] = teams[b][j], teams[a][i]
                        new_cost = team_balance_cost(teams)

                        if new_cost < best_cost:
                            best_cost = new_cost
                            improved = True
                        else:
                            teams[a][i], teams[b][j] = teams[b][j], teams[a][i]

        if not improved:
            break

    return teams


def create_balanced_teams(
    players: list[User],
    num_teams: int = 2,
    weights: dict[str, float] | None = None,
    custom_metrics: list[CustomMetricDef] | None = None,
    player_custom_values: dict[int, dict[str, float]] | None = None,
) -> list[list[User]]:
    """Main entry point: create N balanced teams from a player pool.

    TEACHING NOTE:
        The full pipeline:
        1. Score each player (multi-factor composite with dynamic weights)
        2. Sort by score (best first)
        3. Snake draft for initial distribution across N teams
        4. Optimize via player swaps to minimize variance
        5. Sort each team by score (highest rated first)

    Args:
        players: List of User objects (accepted RSVPs).
        num_teams: Number of teams to create (default 2).
        weights: Optional dict of metric_name -> weight. Falls back to
                 DEFAULT_WEIGHTS if None (for backward compatibility).
        custom_metrics: Optional list of custom metric definitions.
        player_custom_values: Optional dict of user_id -> {metric_name: value}
                              for custom metric values per player.

    Returns:
        List of lists — each inner list contains User objects for one team.
    """
    if len(players) < num_teams:
        # Not enough players for the requested number of teams
        return [players] + [[] for _ in range(num_teams - 1)]

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

    # Step 3: Snake draft across N teams
    teams = snake_draft(scored, num_teams)

    # Step 4: Optimize
    teams = optimize_teams(teams)

    # Step 5: Sort within each team (highest rated first)
    for team in teams:
        team.sort(key=lambda s: s.composite, reverse=True)

    # Return User objects only
    return [[ps.user for ps in team] for team in teams]
