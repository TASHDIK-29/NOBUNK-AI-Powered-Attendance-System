from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import get_settings
from app.core.database import engine, Base
from app.core.middleware import CSRFMiddleware, SecurityHeadersMiddleware

settings = get_settings()

CORS_ORIGINS = [origin.strip() for origin in settings.CORS_ORIGINS.split(",") if origin.strip()]

def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.PROJECT_NAME,
        version=settings.VERSION,
        openapi_url=f"{settings.API_V1_STR}/openapi.json"
    )

    # Middleware runs in reverse order of registration for the request path, so
    # the last one added is the outermost. Security headers wrap everything;
    # CSRF is checked before requests reach the routes; CORS is outermost so
    # even rejected requests get the right CORS headers.
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(CSRFMiddleware)

    # Cookies are cross-origin (SPA on :3000 → API on :8000), so credentials
    # must be allowed and the origin must be explicit (never "*" with creds).
    app.add_middleware(
        CORSMiddleware,
        allow_origins=CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["Content-Disposition"],
    )

    from app.api.v1.api import api_router
    app.include_router(api_router, prefix=settings.API_V1_STR)

    @app.get("/health")
    def health_check():
        return {"status": "healthy", "version": settings.VERSION}

    return app

app = create_app()
