from anthropic import AsyncAnthropic
from app.config import settings


class GenerationError(Exception):
    pass


COVER_LETTER_SYSTEM_PROMPT = """You are an expert cover letter writer. Write compelling, personalized cover letters that highlight relevant experience and demonstrate genuine interest in the role.

Guidelines:
- Match the tone and requirements of the job description
- Highlight specific relevant skills and experiences
- Keep it concise (3-4 paragraphs)
- Use professional but personable language
- Include a clear call to action
- Customize for the specific company and role"""


RESPONSE_SYSTEM_PROMPT = """You are an expert at writing professional responses to job application questions. Your responses should be:
- Specific and evidence-based
- Tailored to the job and company
- Authentic and honest
- Concise but complete
- Professional in tone"""


async def generate_cover_letter(
    job_title: str,
    company: str,
    job_description: str,
    resume_context: str,
    specific_requirements: list[str] = None
) -> str:
    """Generate a tailored cover letter using resume context."""
    try:
        client = AsyncAnthropic(api_key=settings.anthropic_api_key)

        requirements_text = ""
        if specific_requirements:
            requirements_text = f"Key requirements: {', '.join(specific_requirements)}"

        user_prompt = f"""Based on the resume below, write a personalized cover letter for this job:

Company: {company}
Position: {job_title}
{requirements_text}

Job Description:
{job_description}

Resume Context:
{resume_context}"""

        response = await client.messages.create(
            model=settings.generation_model,
            max_tokens=settings.max_generation_tokens,
            system=COVER_LETTER_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}]
        )

        return response.content[0].text

    except Exception as e:
        raise GenerationError(f"Failed to generate cover letter: {str(e)}")


async def generate_response(
    prompt: str,
    resume_context: str,
    job_context: str = "",
    tone: str = "professional"
) -> str:
    """Generate a response to a job application question."""
    try:
        client = AsyncAnthropic(api_key=settings.anthropic_api_key)

        context_text = ""
        if job_context:
            context_text = f"Job Context: {job_context}\n"

        user_prompt = f"""{context_text}Question: {prompt}

Resume Context:
{resume_context}

Write a professional response to the above question, using relevant details from the resume context."""

        response = await client.messages.create(
            model=settings.generation_model,
            max_tokens=settings.max_generation_tokens,
            system=RESPONSE_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}]
        )

        return response.content[0].text

    except Exception as e:
        raise GenerationError(f"Failed to generate response: {str(e)}")
