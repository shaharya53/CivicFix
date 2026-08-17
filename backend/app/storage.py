import os
import shutil
from abc import ABC, abstractmethod
from fastapi import UploadFile

from app.config import settings

class BaseStorageService(ABC):
    @abstractmethod
    def save_file(self, file: UploadFile, subfolder: str) -> str:
        """
        Saves an uploaded file to a subfolder and returns its storage reference/URI.
        """
        pass
        
    @abstractmethod
    def delete_file(self, file_path: str) -> bool:
        """
        Deletes a file by its reference/URI.
        """
        pass

class LocalStorageService(BaseStorageService):
    def __init__(self, base_dir: str = settings.UPLOAD_DIR):
        self.base_dir = base_dir
        os.makedirs(self.base_dir, exist_ok=True)
        
    def save_file(self, file: UploadFile, subfolder: str) -> str:
        folder = os.path.join(self.base_dir, subfolder)
        os.makedirs(folder, exist_ok=True)
        
        # Generate target path
        filename = file.filename
        full_path = os.path.join(folder, filename)
        
        with open(full_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # Return path relative to base directory
        return f"/uploads/{subfolder}/{filename}"
        
    def delete_file(self, file_path: str) -> bool:
        if file_path.startswith("/uploads/"):
            rel_path = file_path.replace("/uploads/", "")
            full_path = os.path.join(self.base_dir, rel_path)
            if os.path.exists(full_path):
                os.remove(full_path)
                return True
        return False

# Export instance for use in router files
storage_service = LocalStorageService()
