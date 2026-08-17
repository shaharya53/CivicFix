import random
from typing import Dict, Any
from models.base import BaseVisionModel

class CivicVisionModel(BaseVisionModel):
    def __init__(self):
        self.model_name = "civic-vision-prototype"
        self.model_version = "v0.1.0"
        self.categories = [
            "Pothole",
            "Garbage/waste",
            "Broken streetlight",
            "Water leakage",
            "Road damage",
            "Drainage problem",
            "Fallen tree",
            "Traffic-signal damage",
            "Public-property damage",
            "Other"
        ]
        
    def predict_category(self, image_bytes: bytes) -> Dict[str, Any]:
        # Generate deterministic mock predictions using the length of the image bytes as a seed
        seed_val = len(image_bytes)
        rng = random.Random(seed_val)
        
        predicted_idx = rng.randint(0, len(self.categories) - 1)
        category = self.categories[predicted_idx]
        confidence = round(rng.uniform(0.75, 0.99), 2)
        
        return {
            "category": category,
            "confidence": confidence,
            "model_name": self.model_name,
            "model_version": self.model_version
        }
