import os
import uuid
from fastapi import UploadFile, HTTPException, status
from werkzeug.utils import secure_filename

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "uploads")
MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024  # 5MB
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp", "image/jpg"}

def validate_image_file(file: UploadFile):
    """
    Validates the uploaded file size and MIME type.
    """
    # 1. Validate MIME type
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type. Allowed types are: {', '.join(ALLOWED_MIME_TYPES)}"
        )

    # 2. Validate file size
    file.file.seek(0, os.SEEK_END)
    file_size = file.file.tell()
    file.file.seek(0)  # Reset pointer to start

    if file_size > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File size exceeds the 5MB limit"
        )

def save_uploaded_file(file: UploadFile) -> str:
    """
    Validates and saves an uploaded report evidence image file to the local uploads directory.
    Returns the web-accessible static file path (e.g., "/uploads/filename.jpg").
    """
    # Run common validation checks
    validate_image_file(file)

    # Create uploads directory if it doesn't exist
    if not os.path.exists(UPLOAD_DIR):
        os.makedirs(UPLOAD_DIR)

    # Generate a safe, unique filename to prevent overwrites, path traversal, and exploits
    original_filename = secure_filename(file.filename or "upload.jpg")
    name, ext = os.path.splitext(original_filename)
    if not ext:
        ext = ".jpg"
        
    # Prevent arbitrary execution extensions
    if ext.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file extension"
        )

    unique_filename = f"{uuid.uuid4().hex}_{secure_filename(name)}{ext}"
    
    # Save file to disk
    file_path = os.path.join(UPLOAD_DIR, unique_filename)
    
    # Verify that the path is inside UPLOAD_DIR (prevent path traversal)
    if not os.path.abspath(file_path).startswith(os.path.abspath(UPLOAD_DIR)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file path"
        )

    with open(file_path, "wb") as buffer:
        buffer.write(file.file.read())

    # Return web-accessible path
    return f"/uploads/{unique_filename}"
