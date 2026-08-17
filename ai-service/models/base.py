from abc import ABC, abstractmethod
from typing import Dict, List, Any

class BaseVisionModel(ABC):
    @abstractmethod
    def predict_category(self, image_bytes: bytes) -> Dict[str, Any]:
        """
        Takes image bytes and returns a dictionary with:
        - category: str (e.g. 'pothole', 'garbage', etc.)
        - confidence: float (0.0 to 1.0)
        - model_name: str
        - model_version: str
        """
        pass

class BaseSeverityModel(ABC):
    @abstractmethod
    def predict_severity(self, image_bytes: bytes, category: str, description: str) -> Dict[str, Any]:
        """
        Takes image bytes, category prediction and text description, and returns:
        - severity: str (LOW, MEDIUM, HIGH, CRITICAL)
        - confidence: float (0.0 to 1.0)
        - model_name: str
        - model_version: str
        """
        pass

class BaseEmbeddingModel(ABC):
    @abstractmethod
    def get_embedding(self, text: str) -> List[float]:
        """
        Takes a string and returns its dense vector embedding.
        """
        pass

class BaseResolutionVerifier(ABC):
    @abstractmethod
    def verify_resolution(self, before_image_bytes: bytes, after_image_bytes: bytes) -> Dict[str, Any]:
        """
        Takes before and after image bytes, comparing them to verify repair completion.
        Returns:
        - verified: bool
        - confidence: float
        - observations: str
        - model_name: str
        - model_version: str
        """
        pass
