import random
from typing import List
from models.base import BaseEmbeddingModel

class CivicEmbeddingModel(BaseEmbeddingModel):
    def __init__(self):
        self.model_name = "sentence-transformers/all-MiniLM-L6-v2"
        self.vector_dim = 384
        try:
            from sentence_transformers import SentenceTransformer
            self.model = SentenceTransformer(self.model_name)
            self.is_mock = False
        except Exception as e:
            print(f"Failed to load sentence-transformers, using fallback mock embedder. Error: {str(e)}")
            self.model = None
            self.is_mock = True

    def get_embedding(self, text: str) -> List[float]:
        if not self.is_mock and self.model:
            try:
                embeddings = self.model.encode(text)
                return embeddings.tolist()
            except Exception as e:
                print(f"Embedding execution failed, using fallback mock. Error: {str(e)}")
        
        # Fallback deterministic vector based on text content
        seed_val = hash(text) & 0xffffffff
        rng = random.Random(seed_val)
        return [rng.uniform(-1.0, 1.0) for _ in range(self.vector_dim)]
