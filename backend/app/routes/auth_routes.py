"""
Authentication Routes
=====================
Handles user registration, login (email/password, Google OAuth, magic links).

TEACHING NOTE:
    Three auth strategies are supported:
    1. Email/Password - traditional registration + login
    2. Google OAuth - "Sign in with Google" flow
    3. Magic Links - passwordless login via email

    All three ultimately produce a JWT token that the client stores
    and sends with subsequent requests.
"""

import random
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt import (
    create_access_token,
    create_magic_link_token,
    verify_magic_link_token,
)
from app.auth.password import hash_password, verify_password
from app.database import get_db
from app.models.user import PlayerStatus, User, UserRole
from app.schemas.user import (
    MagicLinkRequest,
    TokenResponse,
    UserLogin,
    UserRegister,
    UserResponse,
)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

_LEGACY_AVATAR_IDS = [
    "jordan", "magic", "bird", "isiah", "drexler", "wilkins", "ewing",
    "barkley", "malone", "stockton", "hakeem", "robinson", "pippen",
    "shaq", "iverson", "kobe", "duncan", "kg", "penny", "payton",
    "kidd", "carter", "tmac", "nash", "dirk", "reggie", "ray",
    "pierce", "yao", "benwallace", "lebron", "wade", "cp3", "melo",
    "dwight", "pau", "tony", "manu", "rondo", "billups", "westbrook",
    "durant", "drose", "bosh", "davis", "frazier", "ljohnson", "bensimmons", "bennett",
    "sambowie", "washburn", "olowokandi", "kwame", "darko", "morrison", "thabeet",
    "fultz", "laruemartin",
    # Additional NBA
    "rodman", "bogues", "abdulrauf", "eaton", "olivermiller", "camby",
    "cassell", "artest", "kirilenko", "prince", "kawhi",
    # WNBA
    "taurasi", "suebird", "lisaleslie", "swoopes", "candaceparker",
    "mayamoore", "catchings", "cynthiacooper", "laurenjackson",
    "tinathompson", "stewie", "ajawilson",
    "caitlinclark", "griner", "angelreese",
]


# =============================================================================
# Email/Password Authentication
# =============================================================================

@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(data: UserRegister, db: AsyncSession = Depends(get_db)):
    """Register a new user account. Requires a valid invite code.

    The invite code ties registration to a specific Run. New users
    start with player_status=PENDING and must be approved by an admin.
    """
    from app.models.invite_code import InviteCode
    from app.models.run import RunMembership, RunPlayerStats

    # Require invite code for registration
    if not data.invite_code:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Registration is by invite only. Please use an invite link.",
        )

    # Validate invite code
    invite_result = await db.execute(
        select(InviteCode).where(InviteCode.code == data.invite_code.upper().strip())
    )
    invite = invite_result.scalar_one_or_none()

    if not invite or not invite.is_active:
        raise HTTPException(status_code=400, detail="Invalid or deactivated invite code")

    if invite.expires_at and invite.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="This invite code has expired")

    if invite.max_uses and invite.use_count >= invite.max_uses:
        raise HTTPException(status_code=400, detail="This invite code has reached its usage limit")

    # Check for existing email or username
    existing = await db.execute(
        select(User).where((User.email == data.email) | (User.username == data.username))
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email or username already registered",
        )

    # Create user
    user = User(
        email=data.email,
        username=data.username,
        hashed_password=hash_password(data.password),
        full_name=data.full_name,
        phone=data.phone,
        avatar_url=data.avatar_url or random.choice(_LEGACY_AVATAR_IDS),
        player_status=PlayerStatus.PENDING,
        role=UserRole.PLAYER,
    )
    db.add(user)
    await db.flush()

    # Auto-join the run referenced by the invite code (as PENDING)
    membership = RunMembership(
        run_id=invite.run_id,
        user_id=user.id,
        player_status=PlayerStatus.PENDING,
    )
    db.add(membership)

    stats = RunPlayerStats(
        run_id=invite.run_id,
        user_id=user.id,
    )
    db.add(stats)

    # Increment invite code usage
    invite.use_count += 1

    await db.flush()

    # Notify run admins about the new pending registration
    from app.models.run import RunAdmin
    from app.models.notification import NotificationType
    from app.services.notification_service import send_bulk_notification

    admin_result = await db.execute(
        select(RunAdmin).where(RunAdmin.run_id == invite.run_id)
    )
    admin_ids = [ra.user_id for ra in admin_result.scalars().all()]
    # Also notify super admins
    super_result = await db.execute(
        select(User).where(User.role == UserRole.SUPER_ADMIN)
    )
    for sa in super_result.scalars().all():
        if sa.id not in admin_ids:
            admin_ids.append(sa.id)

    if admin_ids:
        admins_result = await db.execute(select(User).where(User.id.in_(admin_ids)))
        admin_users = list(admins_result.scalars().all())
        await send_bulk_notification(
            db,
            admin_users,
            NotificationType.REGISTRATION_APPROVED,  # reuse closest type
            f"New Registration: {user.full_name}",
            f"{user.full_name} ({user.email}) has registered and is awaiting approval.",
            action_url="/admin",
        )

    token = create_access_token(user.id)
    return TokenResponse(
        access_token=token,
        user=UserResponse.model_validate(user),
    )


@router.post("/login", response_model=TokenResponse)
async def login(data: UserLogin, db: AsyncSession = Depends(get_db)):
    """Log in with email and password."""
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()

    if not user or not user.hashed_password:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is deactivated")

    token = create_access_token(user.id)
    return TokenResponse(
        access_token=token,
        user=UserResponse.model_validate(user),
    )


# =============================================================================
# Magic Link Authentication
# =============================================================================

@router.post("/magic-link", status_code=status.HTTP_200_OK)
async def request_magic_link(data: MagicLinkRequest, db: AsyncSession = Depends(get_db)):
    """Send a magic link login email.

    TEACHING NOTE:
        We always return 200 even if the email doesn't exist.
        This prevents email enumeration attacks (attackers can't use
        this endpoint to discover which emails are registered).
    """
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()

    if user:
        token = create_magic_link_token(user.email)
        # TODO: Send email with link containing the token
        # In development, we log the token for testing
        print(f"[DEV] Magic link for {user.email}: {token}")

    return {"message": "If an account exists with that email, a magic link has been sent."}


@router.get("/magic-link/verify", response_model=TokenResponse)
async def verify_magic_link(token: str, db: AsyncSession = Depends(get_db)):
    """Verify a magic link token and return a JWT.

    TEACHING NOTE:
        The user clicks a link like: /auth/magic-link/verify?token=xxx
        We verify the token, find the user, and return a regular JWT.
    """
    email = verify_magic_link_token(token)
    if not email:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired magic link")

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    access_token = create_access_token(user.id)
    return TokenResponse(
        access_token=access_token,
        user=UserResponse.model_validate(user),
    )


# =============================================================================
# Google OAuth
# =============================================================================

@router.post("/google", response_model=TokenResponse)
async def google_auth(google_token: dict, db: AsyncSession = Depends(get_db)):
    """Authenticate with a Google OAuth token.

    TEACHING NOTE:
        The frontend handles the Google sign-in popup and sends us the
        ID token. We verify it with Google's API, extract the user info,
        and either find or create the user in our database.

        Flow:
        1. Frontend shows Google sign-in button
        2. User authorizes, frontend gets an ID token
        3. Frontend POSTs the token here
        4. We verify with Google and return our JWT
    """
    import httpx

    # Verify the Google token
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"https://oauth2.googleapis.com/tokeninfo?id_token={google_token.get('credential', '')}"
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Google token")

    google_data = resp.json()
    google_id = google_data.get("sub")
    email = google_data.get("email")
    name = google_data.get("name", email)

    # Find existing user by Google ID or email
    result = await db.execute(
        select(User).where((User.google_id == google_id) | (User.email == email))
    )
    user = result.scalar_one_or_none()

    if user:
        # Link Google ID if not already linked
        if not user.google_id:
            user.google_id = google_id
    else:
        # Create new user from Google profile
        user = User(
            email=email,
            username=email.split("@")[0],  # Default username from email
            full_name=name,
            google_id=google_id,
            avatar_url=google_data.get("picture"),
            player_status=PlayerStatus.PENDING,
            role=UserRole.PLAYER,
        )
        db.add(user)
        await db.flush()

    access_token = create_access_token(user.id)
    return TokenResponse(
        access_token=access_token,
        user=UserResponse.model_validate(user),
    )
