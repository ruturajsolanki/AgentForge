"""AI Clarification Engine — multi-turn conversational clarification that
gathers missing details from the client before full planning runs."""

from __future__ import annotations

import asyncio
from typing import Optional

from app.config import settings
from app.llm import get_provider, model_router
from app.planner._jsonutil import extract_json

CLARIFICATION_PROMPT = """\
You are a senior delivery architect at a technology company. A client has just
submitted a demand. Your job is to identify **gaps** in the requirement and
generate 3-5 targeted clarifying questions that will help the planning team
produce a more accurate estimate and better technical architecture.

Rules:
- Each question must address a SPECIFIC gap (e.g. missing user-role info,
  unclear integration points, no performance requirements, missing compliance
  needs, vague scope boundaries).
- Do NOT ask generic questions. Every question must be grounded in something
  the demand text says or fails to say.
- For each question provide a "why" — a short sentence explaining why this
  matters for planning.
- For each question provide exactly 3 suggested answer "options" that are
  realistic and relevant to the demand. These help the client pick quickly.
  Make options specific to their domain/project, not generic.
- If the demand is already extremely detailed and complete, return fewer
  questions (minimum 1).

Respond with a SINGLE JSON object. No prose, no markdown.

Schema:
{{
  "questions": [
    {{
      "id": "q1",
      "question": "the question text",
      "why": "why this matters for planning",
      "category": one of ["scope", "users", "integration", "performance",
                          "compliance", "timeline", "budget", "technical",
                          "data", "ux"],
      "options": ["option 1", "option 2", "option 3"]
    }}
  ],
  "completeness_score": float between 0 and 1 indicating how complete the
                        original demand already is
}}

Demand text:
\"\"\"{demand_text}\"\"\"
"""

CONVERSATION_PROMPT = """\
You are a senior delivery architect having a conversation with a client to
gather requirements for their software project. You are friendly, concise,
and professional.

Below is the client's original demand, followed by the conversation so far.

Your job:
1. Acknowledge what the client just told you (1 short sentence).
2. Evaluate whether you have enough information to produce a solid plan.
3. If there are still important gaps, ask 1-2 follow-up questions (be specific,
   reference what they said). For each question provide exactly 3 suggested
   answer options that are realistic and specific to their project.
4. If the demand is now detailed enough, say so and encourage them to proceed.

Respond with a SINGLE JSON object:
{{
  "message": "Your conversational response to the client (2-4 sentences max)",
  "follow_up_questions": [
    {{
      "id": "fq1",
      "question": "a follow-up question",
      "why": "why this matters",
      "category": "scope|users|integration|performance|compliance|timeline|budget|technical|data|ux",
      "options": ["option 1", "option 2", "option 3"]
    }}
  ],
  "ready_for_plan": true or false (true if the demand is detailed enough),
  "completeness_score": float 0-1
}}

Original demand:
\"\"\"{demand_text}\"\"\"

Conversation so far:
{conversation_history}

Client's latest message:
\"\"\"{latest_message}\"\"\"
"""


class ClarificationEngine:
    """Generates targeted follow-up questions and handles multi-turn
    clarification conversations."""

    async def generate_questions(self, demand_text: str) -> dict:
        if settings.demo_mode:
            return self._heuristic(demand_text)
        try:
            return await self._llm_clarify(demand_text)
        except Exception:
            return self._heuristic(demand_text)

    async def converse(
        self,
        demand_text: str,
        history: list[dict],
        latest_message: str,
    ) -> dict:
        """Continue a multi-turn clarification conversation."""
        if settings.demo_mode:
            return self._heuristic_converse(demand_text, history, latest_message)
        try:
            return await self._llm_converse(demand_text, history, latest_message)
        except Exception:
            return self._heuristic_converse(demand_text, history, latest_message)

    async def _llm_converse(
        self,
        demand_text: str,
        history: list[dict],
        latest_message: str,
    ) -> dict:
        history_text = ""
        for turn in history:
            role_label = "AI" if turn.get("role") == "assistant" else "Client"
            history_text += f"{role_label}: {turn.get('content', '')}\n"
        if not history_text:
            history_text = "(No prior conversation)"

        routed = model_router.resolve("planner")
        provider = get_provider(routed.provider)
        text = await asyncio.wait_for(
            provider.chat(
                [
                    {"role": "system", "content": "Return ONLY a valid JSON object."},
                    {
                        "role": "user",
                        "content": CONVERSATION_PROMPT.format(
                            demand_text=demand_text,
                            conversation_history=history_text,
                            latest_message=latest_message,
                        ),
                    },
                ],
                model=routed.model,
                temperature=0.3,
                max_tokens=1200,
            ),
            timeout=15,
        )
        data = extract_json(text)
        if not data or "message" not in data:
            return self._heuristic_converse(demand_text, history, latest_message)
        data.setdefault("follow_up_questions", [])
        data.setdefault("ready_for_plan", False)
        data.setdefault("completeness_score", 0.5)
        for i, q in enumerate(data["follow_up_questions"]):
            q.setdefault("id", f"fq{i + 1}")
            q.setdefault("why", "Helps refine the plan.")
            q.setdefault("category", "scope")
            q.setdefault("options", [])
        return data

    def _heuristic_converse(
        self,
        demand_text: str,
        history: list[dict],
        latest_message: str,
    ) -> dict:
        """Deterministic multi-turn fallback."""
        total_words = len(demand_text.split()) + sum(
            len(t.get("content", "").split())
            for t in history
            if t.get("role") == "user"
        ) + len(latest_message.split())

        combined = (demand_text + " " + latest_message).lower()
        combined += " ".join(
            t.get("content", "") for t in history if t.get("role") == "user"
        ).lower()

        gaps: list[dict] = []

        if not any(w in combined for w in ["user", "role", "admin", "customer", "employee", "persona"]):
            gaps.append({
                "id": "fq1",
                "question": "Thanks for that detail. Could you tell me who the main users of this system will be and what roles they'll have?",
                "why": "User roles shape access control and the number of distinct views.",
                "category": "users",
                "options": ["Admin + End Users (2 roles)", "Admin + Manager + End User (3 roles)", "Complex hierarchy with 4+ roles"],
            })
        if not any(w in combined for w in ["integrat", "api", "connect", "third-party", "existing", "legacy"]):
            gaps.append({
                "id": "fq2",
                "question": "Got it. Does this need to connect to any existing systems or third-party APIs?",
                "why": "Integrations significantly affect architecture and timeline.",
                "category": "integration",
                "options": ["No integrations needed — standalone system", "Yes, 1-2 APIs (e.g. payment, email)", "Yes, multiple systems (ERP, CRM, legacy DB)"],
            })
        if not any(w in combined for w in ["scale", "concurrent", "performance", "traffic", "volume", "load"]):
            gaps.append({
                "id": "fq3",
                "question": "Understood. What kind of user volume are you expecting?",
                "why": "This determines infrastructure sizing.",
                "category": "performance",
                "options": ["Small (under 100 users)", "Medium (100-1,000 concurrent users)", "Large (1,000+ concurrent users)"],
            })
        if not any(w in combined for w in ["complian", "gdpr", "hipaa", "pci", "security", "encrypt"]):
            gaps.append({
                "id": "fq4",
                "question": "Are there compliance or security standards we need to follow?",
                "why": "Compliance adds architectural constraints.",
                "category": "compliance",
                "options": ["No specific compliance needed", "Standard security (SSL, auth, encryption)", "Industry-regulated (GDPR, HIPAA, PCI-DSS, SOC2)"],
            })
        if not any(w in combined for w in ["mobile", "responsive", "ios", "android", "app"]):
            gaps.append({
                "id": "fq5",
                "question": "Should this work on mobile devices?",
                "why": "Affects tech stack choice.",
                "category": "ux",
                "options": ["Desktop only — web browser", "Responsive web (works on mobile browsers)", "Native mobile app (iOS/Android)"],
            })

        completeness = min(0.95, max(0.3, total_words / 150))
        ready = completeness >= 0.75 or len(gaps) == 0

        if ready:
            message = (
                f"Thanks for the additional details! I now have a good understanding of your "
                f"requirements. Your demand looks detailed enough to generate a solid plan. "
                f"Click 'Generate Plan' whenever you're ready."
            )
            return {
                "message": message,
                "follow_up_questions": [],
                "ready_for_plan": True,
                "completeness_score": round(completeness, 2),
            }

        picked = gaps[:2]
        message = (
            f"Thanks for sharing that. I've noted your response. "
            f"I have {'a couple more' if len(picked) > 1 else 'one more'} "
            f"question{'s' if len(picked) > 1 else ''} to help me build a better plan for you."
        )
        return {
            "message": message,
            "follow_up_questions": picked,
            "ready_for_plan": False,
            "completeness_score": round(completeness, 2),
        }

    async def _llm_clarify(self, demand_text: str) -> dict:
        routed = model_router.resolve("planner")
        provider = get_provider(routed.provider)
        text = await asyncio.wait_for(
            provider.chat(
                [
                    {"role": "system", "content": "Return ONLY a valid JSON object."},
                    {
                        "role": "user",
                        "content": CLARIFICATION_PROMPT.format(
                            demand_text=demand_text
                        ),
                    },
                ],
                model=routed.model,
                temperature=0.3,
                max_tokens=1200,
            ),
            timeout=15,
        )
        data = extract_json(text)
        if not data or "questions" not in data:
            return self._heuristic(demand_text)
        for i, q in enumerate(data["questions"]):
            q.setdefault("id", f"q{i + 1}")
            q.setdefault("why", "Helps refine the planning estimate.")
            q.setdefault("category", "scope")
            q.setdefault("options", [])
        data.setdefault("completeness_score", 0.5)
        return data

    def _heuristic(self, demand_text: str) -> dict:
        """Deterministic fallback — inspect the text for common gaps."""
        text = demand_text.lower()
        questions: list[dict] = []

        if not any(w in text for w in ["user", "role", "admin", "manager", "customer", "employee"]):
            questions.append({
                "id": "q1",
                "question": "Who are the primary users of this system? What distinct user roles do you envision?",
                "why": "User roles drive the access control model and number of UI views we need to build.",
                "category": "users",
                "options": ["Admin + End Users (2 roles)", "Admin + Manager + End User (3 roles)", "Complex hierarchy with 4+ roles"],
            })
        if not any(w in text for w in ["integrat", "api", "connect", "third-party", "existing system", "legacy"]):
            questions.append({
                "id": "q2",
                "question": "Does this need to integrate with any existing systems, APIs, or third-party services?",
                "why": "Integration points significantly impact architecture complexity and timeline.",
                "category": "integration",
                "options": ["No — standalone system", "Yes, 1-2 APIs (e.g. payment, email, auth)", "Yes, multiple systems (ERP, CRM, legacy DB)"],
            })
        if not any(w in text for w in ["concurrent", "users at", "scale", "performance", "load", "traffic", "volume"]):
            questions.append({
                "id": "q3",
                "question": "What is the expected user volume? How many concurrent users should the system support?",
                "why": "Performance requirements determine infrastructure sizing and architecture patterns.",
                "category": "performance",
                "options": ["Small (under 100 users)", "Medium (100-1,000 concurrent users)", "Large-scale (1,000+ concurrent users)"],
            })
        if not any(w in text for w in ["complian", "gdpr", "hipaa", "pci", "security", "encrypt", "audit"]):
            questions.append({
                "id": "q4",
                "question": "Are there specific compliance or security requirements?",
                "why": "Compliance requirements add mandatory architectural constraints and testing overhead.",
                "category": "compliance",
                "options": ["No specific compliance needed", "Standard security (SSL, encryption, auth)", "Industry-regulated (GDPR, HIPAA, PCI-DSS)"],
            })
        if not any(w in text for w in ["mobile", "responsive", "ios", "android", "tablet", "device"]):
            questions.append({
                "id": "q5",
                "question": "Should this application support mobile devices?",
                "why": "Mobile support affects technology choice and testing scope.",
                "category": "ux",
                "options": ["Desktop web only", "Responsive web (works on mobile browsers)", "Native mobile app (iOS / Android)"],
            })
        if not any(w in text for w in ["data", "migrat", "import", "existing data", "historical", "records"]):
            questions.append({
                "id": "q6",
                "question": "Is there existing data that needs to be migrated into the new system?",
                "why": "Data migration adds a workstream and may require ETL tooling.",
                "category": "data",
                "options": ["No — starting fresh", "Yes, from spreadsheets/CSV files", "Yes, from an existing database or system"],
            })
        if not any(w in text for w in ["notif", "email", "sms", "alert", "push"]):
            questions.append({
                "id": "q7",
                "question": "What notification channels are needed?",
                "why": "Notification requirements drive third-party service selection and async processing design.",
                "category": "technical",
                "options": ["Email only", "Email + in-app notifications", "Email + SMS + push notifications"],
            })

        picked = questions[:5] if len(questions) > 5 else questions
        if not picked:
            picked = [{
                "id": "q1",
                "question": "Is there anything else you'd like to add or any specific constraints the team should know about?",
                "why": "Open-ended follow-up to catch any unstated requirements.",
                "category": "scope",
                "options": ["No, this covers everything", "Yes, there are deadline constraints", "Yes, there are budget constraints"],
            }]

        word_count = len(demand_text.split())
        completeness = min(0.9, max(0.2, word_count / 200))
        return {"questions": picked, "completeness_score": round(completeness, 2)}
