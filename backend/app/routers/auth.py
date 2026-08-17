from fastapi import APIRouter, Depends, HTTPException, Response, Request, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User
from app import schemas, auth

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/register", response_model=schemas.UserOut, status_code=status.HTTP_201_CREATED)
def register(user_in: schemas.UserCreate, db: Session = Depends(get_db)):
    # Check if user already exists
    existing_user = db.query(User).filter(User.email == user_in.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    hashed_pwd = auth.hash_password(user_in.password)
    # Ensure roles are clean strings
    db_user = User(
        email=user_in.email,
        password_hash=hashed_pwd,
        role=user_in.role.upper()
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

@router.post("/login", response_model=schemas.UserOut)
def login(response: Response, login_in: schemas.UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == login_in.email).first()
    if not user or not auth.verify_password(login_in.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
    
    access_token = auth.create_access_token(data={"sub": str(user.id), "role": user.role})
    refresh_token = auth.create_refresh_token(data={"sub": str(user.id)})
    
    # Set access token and refresh token in HttpOnly cookies
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        max_age=15 * 60, # 15 minutes
        expires=15 * 60,
        samesite="lax",
        secure=False, # Set to True in production (requires HTTPS)
        path="/"
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        max_age=7 * 24 * 60 * 60, # 7 days
        expires=7 * 24 * 60 * 60,
        samesite="lax",
        secure=False, # Set to True in production (requires HTTPS)
        path="/"
    )
    return user

@router.post("/refresh", response_model=schemas.MessageResponse)
def refresh(request: Request, response: Response, db: Session = Depends(get_db)):
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token missing"
        )
    
    payload = auth.verify_token(refresh_token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token"
        )
    
    user_id = payload.get("sub")
    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )
    
    access_token = auth.create_access_token(data={"sub": str(user.id), "role": user.role})
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        max_age=15 * 60,
        expires=15 * 60,
        samesite="lax",
        secure=False,
        path="/"
    )
    return {"detail": "Token refreshed successfully"}

@router.post("/logout", response_model=schemas.MessageResponse)
def logout(response: Response):
    response.delete_cookie(key="access_token", path="/")
    response.delete_cookie(key="refresh_token", path="/")
    return {"detail": "Logged out successfully"}

@router.get("/me", response_model=schemas.UserOut)
def get_me(current_user: User = Depends(auth.get_current_user)):
    return current_user
