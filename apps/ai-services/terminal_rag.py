"""Terminal RAG Test — Document-Augmented Interview Coach

Test the RAG pipeline locally without requiring external Qdrant.
Uses in-memory Qdrant, local embeddings (all-MiniLM-L6-v2), and
the existing STT/LLM/TTS pipeline from terminal_chat.py.

Usage:
    # Text-only mode (no microphone needed)
    python terminal_rag.py --doc path/to/document.pdf

    # Voice mode (full voice pipeline + RAG)
    python terminal_rag.py --doc path/to/document.pdf --voice

    # With Guide Mode analysis
    python terminal_rag.py --doc path/to/document.pdf --voice --guide
"""

import asyncio
import sys
import os
import io
import re
import wave
import argparse
from pathlib import Path

import numpy as np
from dotenv import load_dotenv

from agent.settings import settings

settings.use_local_ai = True
load_dotenv()


def parse_args():
    parser = argparse.ArgumentParser(description="Terminal RAG Test")
    parser.add_argument("--doc", type=str, required=True, help="Path to document (PDF, TXT, DOCX)")
    parser.add_argument("--voice", action="store_true", help="Enable voice mode (mic + TTS)")
    parser.add_argument("--guide", action="store_true", help="Enable Guide Mode (speech analysis)")
    parser.add_argument("--chunks", type=int, default=5, help="Number of RAG chunks to retrieve (default: 5)")
    parser.add_argument("--qdrant", action="store_true", help="Use real Qdrant vector store (instead of in-memory)")
    return parser.parse_args()


async def load_document(filepath: str) -> list[dict]:
    """Load and chunk a document using the existing DocumentProcessor."""
    from agent.rag.document_processor import DocumentProcessor
    from agent.rag.schemas import DocumentType

    processor = DocumentProcessor(chunk_size=800, chunk_overlap=150)
    path = Path(filepath)

    if not path.exists():
        print(f"❌ File not found: {filepath}")
        sys.exit(1)

    # Determine doc type
    ext = path.suffix.lower()
    if ext == ".pdf":
        doc_type = DocumentType.REFERENCE
    elif ext in (".txt", ".md"):
        doc_type = DocumentType.REFERENCE
    elif ext == ".docx":
        doc_type = DocumentType.REFERENCE
    else:
        doc_type = DocumentType.REFERENCE

    print(f"📄 Loading: {path.name} ({ext})")

    with open(path, "rb") as f:
        result = await processor.process_file(
            file=f,
            filename=path.name,
            doc_type=doc_type,
            template_id="terminal_test",
            uploaded_by="terminal_user",
        )

    if result.status != "success":
        print(f"❌ Document processing failed: {result.error}")
        sys.exit(1)

    print(f"✅ Processed: {len(result.chunks)} chunks")
    return result.chunks


def build_vector_store(chunks):
    """Build an in-memory vector store from document chunks."""
    from sentence_transformers import SentenceTransformer
    
    print("🧠 Generating embeddings...")
    embedder = SentenceTransformer("all-MiniLM-L6-v2")
    
    texts = [c.content for c in chunks]
    embeddings = embedder.encode(texts, show_progress_bar=True)
    
    # Store as simple list for in-memory retrieval
    store = []
    for chunk, embedding in zip(chunks, embeddings):
        store.append({
            "content": chunk.content,
            "embedding": embedding,
            "metadata": chunk.metadata,
        })
    
    print(f"✅ Vector store ready: {len(store)} vectors")
    return store, embedder


def retrieve_context(query: str, store: list, embedder, k: int = 5, use_qdrant: bool = False) -> list[str]:
    """Retrieve top-k relevant chunks for a query."""
    if use_qdrant:
        from agent.rag.vector_store import get_vector_store
        v_store = get_vector_store()
        # Note: We use 'terminal_test' as the template_id (hardcoded in load_document)
        return asyncio.run(v_store.query_for_interview("terminal_test", query, k=k))

    query_embedding = embedder.encode([query])[0]
    
    # Cosine similarity
    scores = []
    for item in store:
        vec = item["embedding"]
        similarity = np.dot(query_embedding, vec) / (
            np.linalg.norm(query_embedding) * np.linalg.norm(vec) + 1e-8
        )
        scores.append((similarity, item["content"]))
    
    # Sort by similarity descending
    scores.sort(key=lambda x: x[0], reverse=True)
    
    results = []
    for score, content in scores[:k]:
        results.append(content)
        
    return results


async def run_text_mode(store, embedder, args):
    """Text-only RAG Q&A loop."""
    from agent.voice_agent import create_model_components
    from livekit.agents.llm import ChatContext

    _, llm, _ = create_model_components(settings)
    chat_ctx = ChatContext()
    chat_ctx.add_message(role="system", content=(
        "You are a knowledgeable assistant. Answer questions based on the provided document context. "
        "If the context doesn't contain the answer, say so. Keep answers concise and cite relevant parts."
    ))

    print("\n" + "=" * 55)
    print("📝 RAG Text Mode — Type questions about your document")
    print("    Type 'quit' to exit")
    print("=" * 55)

    while True:
        try:
            user_input = input("\n👤 You: ").strip()
        except (KeyboardInterrupt, EOFError):
            break

        if not user_input or user_input.lower() in ("quit", "exit", "q"):
            break

        # Retrieve relevant context
        context_chunks = retrieve_context(user_input, store, embedder, k=args.chunks, use_qdrant=args.qdrant)
        
        if context_chunks:
            context_str = "\n---\n".join(context_chunks)
            augmented_prompt = (
                f"[DOCUMENT CONTEXT]\n{context_str}\n[END CONTEXT]\n\n"
                f"Question: {user_input}"
            )
            print(f"  📎 Retrieved {len(context_chunks)} relevant chunks")
        else:
            augmented_prompt = user_input
            print("  ⚠️  No relevant context found")

        # LLM response
        chat_ctx.add_message(role="user", content=augmented_prompt)
        
        print("🤖 Agent: ", end="", flush=True)
        full_response = ""

        try:
            stream = llm.chat(chat_ctx=chat_ctx)
            if asyncio.iscoroutine(stream) or hasattr(stream, '__await__'):
                stream = await stream

            async for chunk in stream:
                content = ""
                if hasattr(chunk, 'choices') and chunk.choices:
                    delta = chunk.choices[0].delta
                    content = getattr(delta, 'content', getattr(delta, 'text', ""))
                elif hasattr(chunk, 'text'):
                    content = chunk.text
                elif hasattr(chunk, 'delta') and hasattr(chunk.delta, 'content'):
                    content = chunk.delta.content

                if content:
                    print(content, end="", flush=True)
                    full_response += content

            chat_ctx.add_message(role="assistant", content=full_response)
            print()  # Newline after response

        except Exception as e:
            print(f"\n❌ LLM Error: {e}")

    print("\n[System] RAG session ended.")


async def run_voice_mode(store, embedder, args):
    """Full voice pipeline with RAG augmentation."""
    import sounddevice as sd
    import requests
    from agent.voice_agent import create_model_components
    from agent.analysis.turn_analyzer import TurnAnalyzer
    from livekit.agents.llm import ChatContext
    from livekit.rtc import AudioFrame

    stt, llm, _ = create_model_components(settings)
    chat_ctx = ChatContext()

    system_prompt = (
        "You are a knowledgeable interview coach. Answer questions based on the provided document context. "
        "Keep your responses concise and natural for voice conversation. No emojis or formatting."
    )
    if args.guide:
        system_prompt += (
            "\nYou are in GUIDE MODE. Adapt your responses based on the candidate's emotional state."
        )
    chat_ctx.add_message(role="system", content=system_prompt)

    turn_analyzer = TurnAnalyzer() if args.guide else None

    # VAD setup
    from livekit.plugins import silero
    from livekit.plugins.silero import onnx_model
    vad_plugin = silero.VAD.load()
    model = onnx_model.OnnxModel(onnx_session=vad_plugin._onnx_session, sample_rate=16000)

    # Playback queue
    playback_queue = asyncio.Queue()
    current_playback_task = None
    playing = False

    async def playback_worker():
        nonlocal playing, current_playback_task
        while True:
            try:
                item = await playback_queue.get()
                if not item:
                    playback_queue.task_done()
                    continue
                audio_array, sample_rate = item

                async def _play():
                    nonlocal playing
                    playing = True
                    sd.play(audio_array, sample_rate)
                    duration = len(audio_array) / sample_rate
                    await asyncio.sleep(duration)
                    playing = False

                current_playback_task = asyncio.create_task(_play())
                try:
                    await current_playback_task
                except asyncio.CancelledError:
                    sd.stop()
                    playing = False
                finally:
                    current_playback_task = None
                    playback_queue.task_done()
            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"❌ Playback Error: {e}")
                playing = False

    worker_task = asyncio.create_task(playback_worker())

    async def synthesize_and_enqueue(text):
        if not text.strip():
            return
        clean_text = re.sub(r'[^\x00-\x7F]+', '', text)
        clean_text = clean_text.replace("*", "").replace("#", "").strip()
        if not clean_text:
            return
        url = f"{settings.kokoro_base_url}/audio/speech"
        payload = {"model": "kokoro", "input": clean_text, "voice": "af_sky", "response_format": "wav"}
        try:
            res = requests.post(url, json=payload, timeout=12)
            if res.status_code == 200:
                with io.BytesIO(res.content) as wav_io:
                    with wave.open(wav_io, 'rb') as wav_file:
                        sr = wav_file.getframerate()
                        audio_bytes = wav_file.readframes(wav_file.getnframes())
                        arr = np.frombuffer(audio_bytes, dtype=np.int16)
                        await playback_queue.put((arr, sr))
        except Exception as e:
            print(f"❌ TTS Failed: {e}")

    # VAD state
    is_speaking = False
    speech_frames = []
    silence_counter = 0
    interrupt_counter = 0
    SILENCE_THRESHOLD = 20
    inference_f32 = np.empty(512, dtype=np.float32)

    def audio_callback(indata, frames, time, status):
        nonlocal is_speaking, speech_frames, silence_counter, playing, interrupt_counter, current_playback_task
        if status:
            pass
        chunk = indata.copy()
        try:
            np.divide(chunk.flatten(), 32768.0, out=inference_f32, dtype=np.float32)
            prob = model(inference_f32)

            if prob > 0.4:
                if playing or not playback_queue.empty():
                    interrupt_counter += 1
                    if interrupt_counter > 2:
                        if current_playback_task:
                            current_playback_task.cancel()
                        sd.stop()
                        while not playback_queue.empty():
                            try:
                                playback_queue.get_nowait()
                            except:
                                break
                        playing = False
                        interrupt_counter = 0

                if not is_speaking:
                    is_speaking = True
                    print("\n[System] Listening...")
                speech_frames.append(chunk)
                silence_counter = 0
            else:
                interrupt_counter = 0
                if is_speaking:
                    speech_frames.append(chunk)
                    silence_counter += 1
        except Exception:
            pass

    print("\n" + "=" * 55)
    print("🎙️  RAG Voice Mode — Speak questions about your document")
    print("    Press Ctrl+C for session summary")
    print("=" * 55)

    with sd.InputStream(samplerate=16000, channels=1, dtype=np.int16,
                        blocksize=512, callback=audio_callback):
        try:
            while True:
                if is_speaking and silence_counter > SILENCE_THRESHOLD:
                    is_speaking = False
                    recorded_audio = np.concatenate(speech_frames)
                    speech_frames = []
                    silence_counter = 0

                    print("[System] Processing...")

                    int_data = recorded_audio.astype(np.int16)
                    frame = AudioFrame(
                        data=int_data.tobytes(),
                        sample_rate=16000,
                        num_channels=1,
                        samples_per_channel=len(int_data),
                    )

                    try:
                        stt_res = await stt.recognize(buffer=frame)
                        user_text = stt_res.alternatives[0].text if stt_res.alternatives else ""
                        if not user_text.strip():
                            continue
                    except Exception as e:
                        print(f"❌ STT Error: {e}")
                        continue

                    print(f"\n👤 You: {user_text}", flush=True)

                    # Speech analysis (if guide mode)
                    if turn_analyzer:
                        metrics = turn_analyzer.analyze_turn(recorded_audio, user_text, 16000)
                        display = turn_analyzer.format_terminal_display(metrics)
                        print(f"📊 {display}", flush=True)

                    # RAG retrieval
                    context_chunks = retrieve_context(user_text, store, embedder, k=args.chunks, use_qdrant=args.qdrant)
                    if context_chunks:
                        context_str = "\n---\n".join(context_chunks)
                        augmented_prompt = (
                            f"[DOCUMENT CONTEXT]\n{context_str}\n[END CONTEXT]\n\n"
                            f"Question: {user_text}"
                        )
                        print(f"  📎 {len(context_chunks)} chunks retrieved", flush=True)
                    else:
                        augmented_prompt = user_text

                    # LLM
                    chat_ctx.add_message(role="user", content=augmented_prompt)

                    if args.guide and turn_analyzer:
                        guide_prompt = turn_analyzer.get_guide_prompt(metrics)
                        chat_ctx.add_message(role="system", content=guide_prompt)

                    print("🤖 Agent: ", end="", flush=True)
                    full_response = ""
                    sentence_buffer = ""

                    try:
                        stream = llm.chat(chat_ctx=chat_ctx)
                        if asyncio.iscoroutine(stream) or hasattr(stream, '__await__'):
                            stream = await stream

                        async for chunk in stream:
                            content = ""
                            if hasattr(chunk, 'choices') and chunk.choices:
                                delta = chunk.choices[0].delta
                                content = getattr(delta, 'content', getattr(delta, 'text', ""))
                            elif hasattr(chunk, 'text'):
                                content = chunk.text
                            elif hasattr(chunk, 'delta') and hasattr(chunk.delta, 'content'):
                                content = chunk.delta.content

                            if content:
                                print(content, end="", flush=True)
                                full_response += content
                                sentence_buffer += content

                                if any(p in sentence_buffer for p in ".!?\n"):
                                    parts = re.split(r'([.!?\n])', sentence_buffer)
                                    if len(parts) > 2:
                                        to_speak = "".join(parts[:2])
                                        sentence_buffer = "".join(parts[2:])
                                        asyncio.create_task(synthesize_and_enqueue(to_speak))

                        if sentence_buffer.strip():
                            asyncio.create_task(synthesize_and_enqueue(sentence_buffer))

                        chat_ctx.add_message(role="assistant", content=full_response)
                    except Exception as e:
                        print(f"\n❌ Turn Error: {e}")

                    print("\n[System] Ready...")

                await asyncio.sleep(0.01)
        except KeyboardInterrupt:
            if turn_analyzer:
                summary = turn_analyzer.get_session_summary()
                print(turn_analyzer.format_session_display(summary))
            worker_task.cancel()
            print("\n[System] RAG voice session ended.")


async def main():
    args = parse_args()

    print("=" * 55)
    print("📚 TERMINAL RAG TEST — Document-Augmented AI Coach")
    print("=" * 55)

    # 1. Load document
    chunks = await load_document(args.doc)

    # 2. Build vector store
    if args.qdrant:
        from agent.rag.vector_store import get_vector_store
        v_store = get_vector_store()
        print("🗄️ Persisting to Qdrant...")
        await v_store.add_template_documents("terminal_test", chunks)
        store, embedder = [], None
    else:
        store, embedder = build_vector_store(chunks)

    # 3. Run appropriate mode
    if args.voice:
        await run_voice_mode(store, embedder, args)
    else:
        await run_text_mode(store, embedder, args)


if __name__ == "__main__":
    asyncio.run(main())
