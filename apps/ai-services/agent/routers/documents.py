"""Document upload API router.

Provides endpoints for uploading and managing interview template documents.
Following api-patterns skill: consistent response format, validation, error handling.
"""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status

from ..rag.document_processor import DocumentProcessor
from ..rag.vector_store import get_vector_store
from ..rag.schemas import (
    DocumentType,
    DocumentUploadRequest,
    DocumentUploadResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/documents", tags=["documents"])


@router.post(
    "/upload/{template_id}",
    response_model=DocumentUploadResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_template_document(
    template_id: str,
    file: Annotated[UploadFile, File(description="Document file (PDF, TXT, DOCX)")],
    doc_type: Annotated[DocumentType, Form(description="Type of document")],
    uploaded_by: Annotated[str, Form(description="User ID")] = "admin",
) -> DocumentUploadResponse:
    """Upload a document for an interview template.
    
    Used by admins to add question banks, reference materials, or rubrics
    to a template. Documents are processed, chunked, and stored in the
    vector database for RAG retrieval during interviews.
    
    Args:
        template_id: Template ID to associate document with
        file: Uploaded file
        doc_type: Type of document
        uploaded_by: User ID who uploaded
        
    Returns:
        DocumentUploadResponse with processing status
    """
    # Validate file
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must have a filename",
        )
    
    # Check file extension
    allowed_extensions = {".pdf", ".txt", ".md", ".docx"}
    ext = "." + file.filename.split(".")[-1].lower() if "." in file.filename else ""
    if ext not in allowed_extensions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type not supported. Allowed: {allowed_extensions}",
        )

    try:
        # Process document
        processor = DocumentProcessor()
        result = await processor.process_file(
            file=file.file,
            filename=file.filename,
            doc_type=doc_type,
            template_id=template_id,
            uploaded_by=uploaded_by,
        )
        
        if result.status == "failed":
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Document processing failed: {result.error}",
            )
        
        # Store in vector database
        vector_store = get_vector_store()
        await vector_store.add_template_documents(template_id, result.chunks)
        
        logger.info(
            f"Uploaded document {file.filename} for template {template_id}: "
            f"{result.metadata.chunk_count} chunks"
        )
        
        return DocumentUploadResponse(
            id=result.metadata.id,
            name=result.metadata.name,
            status="success",
            chunk_count=result.metadata.chunk_count,
            message=f"Document processed and {result.metadata.chunk_count} chunks indexed",
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error uploading document: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error processing document: {str(e)}",
        )


@router.post(
    "/user-upload/{session_id}",
    response_model=DocumentUploadResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_user_document(
    session_id: str,
    file: Annotated[UploadFile, File(description="Resume or Job Description")],
    doc_type: Annotated[DocumentType, Form()] = DocumentType.RESUME,
    user_id: Annotated[str, Form()] = "user",
) -> DocumentUploadResponse:
    """Upload a user document for a personalized interview.
    
    Users can upload their resume or job description to get
    personalized interview questions.
    
    Args:
        session_id: Current interview session ID
        file: Uploaded file
        doc_type: Type of document (resume or job_description)
        user_id: User ID
        
    Returns:
        DocumentUploadResponse with processing status
    """
    # Validate doc_type for user uploads
    allowed_types = {DocumentType.RESUME, DocumentType.JOB_DESCRIPTION}
    if doc_type not in allowed_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"User uploads must be: {[t.value for t in allowed_types]}",
        )
    
    # Process similar to template upload but with session_id as context
    processor = DocumentProcessor()
    result = await processor.process_file(
        file=file.file,
        filename=file.filename or "document",
        doc_type=doc_type,
        template_id=None,  # User docs not tied to templates
        uploaded_by=user_id,
    )
    
    if result.status == "failed":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Document processing failed: {result.error}",
        )
    
    # Store with session_id as template_id for filtering
    vector_store = get_vector_store()
    await vector_store.add_template_documents(f"session_{session_id}", result.chunks)
    
    return DocumentUploadResponse(
        id=result.metadata.id,
        name=result.metadata.name,
        status="success",
        chunk_count=result.metadata.chunk_count,
        message=f"Document uploaded for personalized questions",
    )


@router.delete("/{template_id}")
async def delete_template_documents(template_id: str) -> dict:
    """Delete all documents for a template.
    
    Args:
        template_id: Template ID
        
    Returns:
        Confirmation message
    """
    vector_store = get_vector_store()
    await vector_store.delete_template_documents(template_id)
    
    return {"message": f"Documents deleted for template {template_id}"}
