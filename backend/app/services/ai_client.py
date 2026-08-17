import httpx
import logging
from app.config import settings

logger = logging.getLogger(__name__)

# Category to department mapping (configurable, handles lowercase keys)
DEPARTMENT_MAPPING = {
    "pothole": "road_maintenance",
    "garbage": "sanitation",
    "garbage/waste": "sanitation",
    "broken streetlight": "electrical",
    "streetlight": "electrical",
    "water leakage": "water_department",
    "water_leakage": "water_department",
    "drainage": "drainage",
    "drainage problem": "drainage",
    "road damage": "road_maintenance",
    "fallen tree": "sanitation",
    "traffic-signal damage": "electrical",
    "public-property damage": "road_maintenance"
}

class AIServiceUnavailableError(Exception):
    """Exception raised when the remote AI Service cannot be reached or returns an error."""
    pass

def get_recommended_department(category: str) -> str:
    """Deterministically maps a prediction category to its responsible department."""
    key = category.lower().strip()
    return DEPARTMENT_MAPPING.get(key, "general_maintenance")

def analyze_image(image_bytes: bytes, filename: str) -> dict:
    """
    Orchestrates predictions by uploading the report evidence image to the internal AI Service.
    Queries /classify and /severity, and maps the category to a department recommendation.
    """
    ai_service_url = settings.AI_SERVICE_URL.rstrip("/")
    
    files = {"image": (filename, image_bytes, "image/jpeg")}
    
    try:
        # 1. Query visual issue classification
        logger.info(f"Connecting to AI Service at {ai_service_url}/classify")
        with httpx.Client(timeout=5.0) as client:
            classify_resp = client.post(f"{ai_service_url}/classify", files=files)
            
        if classify_resp.status_code != 200:
            raise AIServiceUnavailableError(f"AI Service classification error: status {classify_resp.status_code}")
            
        classify_data = classify_resp.json()
        category = classify_data.get("category", "other")
        category_confidence = classify_data.get("confidence", 0.0)
        vision_model_version = classify_data.get("model_version", "civic-vision-v1")
        
    except httpx.RequestError as e:
        logger.error(f"Failed to connect to classification service: {str(e)}")
        raise AIServiceUnavailableError("AI Service is currently unavailable for classification")
        
    try:
        # 2. Query severity prediction
        # The severity endpoint needs Form data for category and description
        severity_form = {
            "category": category,
            "description": "Image analysis request"
        }
        
        # Reset file reading context for the next request
        files_severity = {"image": (filename, image_bytes, "image/jpeg")}
        
        with httpx.Client(timeout=5.0) as client:
            severity_resp = client.post(
                f"{ai_service_url}/severity",
                files=files_severity,
                data=severity_form
            )
            
        if severity_resp.status_code != 200:
            raise AIServiceUnavailableError(f"AI Service severity error: status {severity_resp.status_code}")
            
        severity_data = severity_resp.json()
        severity_pred = severity_data.get("severity", "medium")
        severity_confidence = severity_data.get("confidence", 0.0)
        severity_model_version = severity_data.get("model_version", "civic-severity-v1")
        
    except httpx.RequestError as e:
        logger.error(f"Failed to connect to severity prediction service: {str(e)}")
        raise AIServiceUnavailableError("AI Service is currently unavailable for severity checking")

    # 3. Resolve recommended department
    recommended_dept = get_recommended_department(category)

    # 4. Formulate unified AI Analysis payload
    return {
        "category": category,
        "category_confidence": category_confidence,
        "severity": severity_pred.lower(),
        "severity_confidence": severity_confidence,
        "recommended_department": recommended_dept,
        "model_versions": {
            "vision": vision_model_version,
            "severity": severity_model_version
        }
    }
