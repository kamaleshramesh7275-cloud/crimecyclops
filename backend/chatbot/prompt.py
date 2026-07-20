from chatbot.config import SYSTEM_PROMPT

def build_prompt(query: str, context: str, history: list = None) -> str:
    """Combine system prompt, past conversation history, context, and query."""
    prompt_parts = [SYSTEM_PROMPT, "\n=== CONTEXT FROM KRISHNA / KARNATAKA CRIME DATASET ==="]
    
    if context:
        prompt_parts.append(context)
    else:
        prompt_parts.append("No specific context found.")
        
    prompt_parts.append("==========================================================")
    
    if history:
        prompt_parts.append("\n=== RECENT CONVERSATION HISTORY ===")
        for msg in history[-4:]:
            role = "User" if msg["sender"] == "user" else "Assistant"
            prompt_parts.append(f"{role}: {msg['text']}")
        prompt_parts.append("===================================")
        
    prompt_parts.append(f"\nUser Query: {query}")
    prompt_parts.append("Assistant Answer (grounded ONLY in context):")
    
    return "\n".join(prompt_parts)
