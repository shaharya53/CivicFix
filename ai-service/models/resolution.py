import random
from typing import Dict, Any
from models.base import BaseResolutionVerifier

class CivicResolutionVerifier(BaseResolutionVerifier):
    def __init__(self):
        self.model_name = "civic-resolution-verifier-prototype"
        self.model_version = "v0.1.0"

    def verify_resolution(self, before_image_bytes: bytes, after_image_bytes: bytes) -> Dict[str, Any]:
        # Generate deterministic mock verification status using image lengths
        seed_val = len(before_image_bytes) + len(after_image_bytes)
        rng = random.Random(seed_val)
        
        verified = rng.choice([True, True, True, False]) # 75% chance of being verified
        confidence = round(rng.uniform(0.70, 0.96), 2)
        
        observations = (
            "The repair work appears to be completed successfully. Evidence of issue is cleared."
            if verified else
            "Incomplete resolution detected. The scene still matches patterns of the reported issue."
        )
        
        return {
            "verified": verified,
            "confidence": confidence,
            "observations": observations,
            "model_name": self.model_name,
            "model_version": self.model_version
        }
