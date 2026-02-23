"""Qdrant vector store for RAG pipeline.

Manages template-specific document embeddings and retrieval.
Following backend-specialist agent: Qdrant for vector search.
"""

from __future__ import annotations

import logging
from typing import Any

from langchain.schema import Document
from langchain_qdrant import QdrantVectorStore
from qdrant_client import QdrantClient
from qdrant_client.http import models as qdrant_models
from sentence_transformers import SentenceTransformer

from ..settings import settings
from .schemas import DocumentChunk, TemplateContext, InterviewMode

logger = logging.getLogger(__name__)


class TemplateVectorStore:
    """Qdrant-based vector store for interview templates.
    
    Features:
    - Template-specific document storage
    - Semantic search for relevant context
    - Embedding generation via sentence-transformers
    """

    COLLECTION_NAME = "interview_templates"
    EMBEDDING_MODEL = "all-MiniLM-L6-v2"
    EMBEDDING_DIMENSION = 384  # MiniLM dimension

    def __init__(self, url: str | None = None):
        self.url = url or settings.qdrant_url
        self.client = QdrantClient(url=self.url)
        self._embedder: SentenceTransformer | None = None
        self._ensure_collection()

    @property
    def embedder(self) -> SentenceTransformer:
        """Lazy load embedder."""
        if self._embedder is None:
            self._embedder = SentenceTransformer(self.EMBEDDING_MODEL)
        return self._embedder

    def _ensure_collection(self) -> None:
        """Create collection if it doesn't exist."""
        try:
            collections = self.client.get_collections()
            exists = any(c.name == self.COLLECTION_NAME for c in collections.collections)
            
            if not exists:
                self.client.create_collection(
                    collection_name=self.COLLECTION_NAME,
                    vectors_config=qdrant_models.VectorParams(
                        size=self.EMBEDDING_DIMENSION,
                        distance=qdrant_models.Distance.COSINE,
                    ),
                )
                logger.info(f"Created Qdrant collection: {self.COLLECTION_NAME}")
        except Exception as e:
            logger.warning(f"Could not ensure Qdrant collection: {e}")

    async def add_template_documents(
        self,
        template_id: str,
        chunks: list[DocumentChunk],
    ) -> int:
        """Add document chunks for a template.
        
        Args:
            template_id: Template ID to associate chunks with
            chunks: List of document chunks
            
        Returns:
            Number of chunks added
        """
        if not chunks:
            return 0

        # Generate embeddings
        texts = [chunk.content for chunk in chunks]
        embeddings = self.embedder.encode(texts, show_progress_bar=False)

        # Prepare points for Qdrant
        points = []
        for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
            points.append(
                qdrant_models.PointStruct(
                    id=hash(chunk.id) & 0xFFFFFFFFFFFFFFFF,  # Positive int64
                    vector=embedding.tolist(),
                    payload={
                        "chunk_id": chunk.id,
                        "template_id": template_id,
                        "content": chunk.content,
                        **chunk.metadata,
                    },
                )
            )

        # Upsert to Qdrant
        self.client.upsert(
            collection_name=self.COLLECTION_NAME,
            points=points,
        )
        
        logger.info(f"Added {len(points)} chunks for template {template_id}")
        return len(points)

    async def query_for_interview(
        self,
        template_id: str,
        query: str,
        k: int = 5,
    ) -> list[str]:
        """Retrieve relevant context for an interview question.
        
        Args:
            template_id: Template to search within
            query: Search query (e.g., interview topic)
            k: Number of results to return
            
        Returns:
            List of relevant content strings
        """
        # Generate query embedding
        query_embedding = self.embedder.encode([query], show_progress_bar=False)[0]

        # Search with template filter
        results = self.client.search(
            collection_name=self.COLLECTION_NAME,
            query_vector=query_embedding.tolist(),
            query_filter=qdrant_models.Filter(
                must=[
                    qdrant_models.FieldCondition(
                        key="template_id",
                        match=qdrant_models.MatchValue(value=template_id),
                    )
                ]
            ),
            limit=k,
        )

        return [hit.payload.get("content", "") for hit in results]

    async def get_template_context(
        self,
        template_id: str,
        mode: InterviewMode = InterviewMode.STRICT,
    ) -> TemplateContext:
        """Get full context for a template interview.
        
        Args:
            template_id: Template ID
            mode: Interview mode
            
        Returns:
            TemplateContext with all relevant information
        """
        # Query for questions
        questions = await self.query_for_interview(
            template_id, "interview questions", k=10
        )
        
        # Query for reference content
        references = await self.query_for_interview(
            template_id, "reference material concepts", k=5
        )
        
        # Query for rubric
        rubric_results = await self.query_for_interview(
            template_id, "evaluation rubric scoring", k=2
        )

        return TemplateContext(
            template_id=template_id,
            mode=mode,
            questions=questions,
            reference_content="\n\n".join(references),
            rubric="\n".join(rubric_results) if rubric_results else None,
        )

    async def delete_template_documents(self, template_id: str) -> int:
        """Delete all documents for a template.
        
        Args:
            template_id: Template ID
            
        Returns:
            Number of documents deleted
        """
        result = self.client.delete(
            collection_name=self.COLLECTION_NAME,
            points_selector=qdrant_models.FilterSelector(
                filter=qdrant_models.Filter(
                    must=[
                        qdrant_models.FieldCondition(
                            key="template_id",
                            match=qdrant_models.MatchValue(value=template_id),
                        )
                    ]
                )
            ),
        )
        logger.info(f"Deleted documents for template {template_id}")
        return 1  # Qdrant doesn't return count


# Singleton instance
_vector_store: TemplateVectorStore | None = None


def get_vector_store() -> TemplateVectorStore:
    """Get or create vector store singleton."""
    global _vector_store
    if _vector_store is None:
        _vector_store = TemplateVectorStore()
    return _vector_store
