"""Pydantic schemas for RAG module.

Following python-patterns skill: Pydantic for validation, type safety, and serialization.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field


class InterviewMode(str, Enum):
    """Interview mode selection."""
    LEARNING = "learning"  # Real-time coaching enabled
    STRICT = "strict"      # No intervention, real interview simulation


class DocumentType(str, Enum):
    """Types of documents that can be uploaded."""
    QUESTION_BANK = "question_bank"
    REFERENCE = "reference"
    RUBRIC = "rubric"
    RESUME = "resume"
    JOB_DESCRIPTION = "job_description"


class DocumentMetadata(BaseModel):
    """Metadata for an uploaded document."""
    id: str = Field(..., description="Unique document identifier")
    name: str = Field(..., description="Original filename")
    doc_type: DocumentType = Field(..., description="Type of document")
    template_id: str | None = Field(None, description="Associated template ID")
    uploaded_by: str = Field(..., description="User ID who uploaded")
    uploaded_at: datetime = Field(default_factory=datetime.now)
    chunk_count: int = Field(0, description="Number of chunks created")
    file_size: int = Field(0, description="File size in bytes")


class ProcessedDocument(BaseModel):
    """Result of document processing."""
    metadata: DocumentMetadata
    chunks: list[DocumentChunk] = Field(default_factory=list)
    status: Literal["success", "failed", "processing"] = "processing"
    error: str | None = None


class DocumentChunk(BaseModel):
    """A chunk of processed document text."""
    id: str
    content: str
    metadata: dict = Field(default_factory=dict)
    embedding: list[float] | None = None


class TemplateContext(BaseModel):
    """Context retrieved from vector store for an interview template."""
    template_id: str
    mode: InterviewMode = InterviewMode.STRICT
    questions: list[str] = Field(default_factory=list)
    reference_content: str = ""
    rubric: str | None = None


class InterviewState(BaseModel):
    """State for LangGraph interview workflow."""
    messages: list[dict] = Field(default_factory=list)
    current_question_idx: int = 0
    template_context: TemplateContext | None = None
    candidate_profile: str = ""
    mode: InterviewMode = InterviewMode.STRICT
    scores: list[float] = Field(default_factory=list)


class DocumentUploadRequest(BaseModel):
    """Request schema for document upload API."""
    doc_type: DocumentType
    template_id: str | None = None


class DocumentUploadResponse(BaseModel):
    """Response schema for document upload API."""
    id: str
    name: str
    status: str
    chunk_count: int
    message: str


# Forward reference resolution
ProcessedDocument.model_rebuild()
