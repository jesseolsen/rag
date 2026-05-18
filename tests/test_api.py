import pytest
from io import BytesIO


def test_health_endpoint(client):
    """Test health check endpoint."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_root_endpoint(client):
    """Test root endpoint."""
    response = client.get("/")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_api_routes_defined(app=None):
    """Test that API routes are properly defined."""
    from app.main import app

    # Get all registered routes
    routes = [route.path for route in app.routes]

    # Check that API endpoints are registered
    assert any("/api/v1/resume" in r for r in routes), "Resume endpoints not registered"
    assert any("/api/v1/generate" in r for r in routes), "Generation endpoints not registered"
    assert any("/api/v1/search" in r for r in routes), "Search endpoints not registered"
