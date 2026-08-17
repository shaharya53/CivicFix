from fastapi import FastAPI, UploadFile, File, Form, HTTPException, status
from pydantic import BaseModel
from typing import List

from models.vision import CivicVisionModel
from models.severity import CivicSeverityModel
from models.embeddings import CivicEmbeddingModel
from models.resolution import CivicResolutionVerifier

app = FastAPI(title="CivicFix AI Service Interface", version="1.0.0")

# Instantiate models via abstractions
vision_model = CivicVisionModel()
severity_model = CivicSeverityModel()
embedding_model = CivicEmbeddingModel()
resolution_verifier = CivicResolutionVerifier()

class EmbedRequest(BaseModel):
    text: str

class EmbedResponse(BaseModel):
    embedding: List[float]

@app.get("/health")
def health():
    return {"status": "healthy"}

@app.post("/classify")
async def classify(image: UploadFile = File(...)):
    try:
        content = await image.read()
        return vision_model.predict_category(content)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Classification failed: {str(e)}"
        )

@app.post("/severity")
async def severity(
    image: UploadFile = File(...),
    category: str = Form(...),
    description: str = Form(...)
):
    try:
        content = await image.read()
        return severity_model.predict_severity(content, category, description)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Severity prediction failed: {str(e)}"
        )

@app.post("/embed", response_model=EmbedResponse)
def embed(request: EmbedRequest):
    try:
        vec = embedding_model.get_embedding(request.text)
        return {"embedding": vec}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Embedding generation failed: {str(e)}"
        )

@app.post("/verify-resolution")
async def verify_resolution(
    before_image: UploadFile = File(...),
    after_image: UploadFile = File(...)
):
    try:
        before_content = await before_image.read()
        after_content = await after_image.read()
        return resolution_verifier.verify_resolution(before_content, after_content)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Resolution verification failed: {str(e)}"
        )
