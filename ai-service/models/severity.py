import random
from typing import Dict, Any
from models.base import BaseSeverityModel

class CivicSeverityModel(BaseSeverityModel):
    def __init__(self):
        self.model_name = "civic-severity-prototype"
        self.model_version = "v0.1.0"
        self.severities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]

    def predict_severity(self, image_bytes: bytes, category: str, description: str) -> Dict[str, Any]:
        # Generate deterministic mock severity using length of inputs
        seed_val = len(image_bytes) + len(category) + len(description)
        rng = random.Random(seed_val)
        
        # Heuristics based on text keywords
        desc_lower = description.lower()
        if any(w in desc_lower for w in ["danger", "accident", "injured", "risk", "critical", "urgent"]):
            severity = "CRITICAL"
        elif any(w in desc_lower for w in ["severe", "huge", "broken", "leak", "high"]):
            severity = "HIGH"
        else:
            severity = rng.choice(self.severities)
            
        confidence = round(rng.uniform(0.65, 0.95), 2)
        
        return {
            "severity": severity,
            "confidence": confidence,
            "model_name": self.model_name,
            "model_version": self.model_version
        }
