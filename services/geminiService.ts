
import { GoogleGenAI, Type } from "@google/genai";
import { RevisionResult, RevisionTime, FileData, StudentProfile } from "../types";

const aiInstance = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateRevision = async (
  content: string, 
  time: RevisionTime, 
  profile: StudentProfile,
  file?: FileData
): Promise<RevisionResult> => {
  const ai = aiInstance();
  const model = "gemini-3-flash-preview";

  const promptText = `
    You are an AI Exam Revision Assistant called "LastMinute".
    Convert the following study content into concise, exam-oriented revision material.

    Student Context:
    - Learning Style: ${profile.learningStyle} (Tailor formatting and explanation style to this)
    - Academic Strengths: ${profile.academicStrengths} (Focus more on areas that might complement these strengths)
    
    Study Content:
    ${content || "Content provided via uploaded file."}

    Revision Time Limit: ${time}

    Rules:
    - If revision time is 5 minutes, keep everything extremely short and to the point.
    - If revision time is 10 minutes, give slightly more detailed explanations but stay concise.
    - One-Page Revision Notes: Summarize clearly and briefly, highlight important concepts. Use Markdown.
    - Important Definitions: Bullet points with short, clear definitions.
    - Formula List: Extract all formulas. If none, return ["No formulas applicable"].
    - Exam Tips: Provide exactly 3 actionable tips for students.
    - Practice Arena (MCQs): Generate 5-7 high-impact Multiple Choice Questions. 
    - CRITICAL: For each MCQ explanation, provide a DETAILED breakdown. Explain why the correct answer is right AND briefly explain why the other options are common misconceptions or incorrect in this context.
    - VISUAL CONCEPT MAP: Generate a valid Mermaid.js flowchart string (starting with 'graph TD' or 'graph LR') that visualizes the logical structure and connections between the main topics in the notes. Keep it simple and focused on the core hierarchy.
    - PERSONALIZATION: Since the student is a ${profile.learningStyle} learner, ensure the ${profile.learningStyle === 'Visual' ? 'flowchart and visual descriptions are top-tier' : profile.learningStyle === 'Auditory' ? 'explanations are conversational and rhythmic' : profile.learningStyle === 'Reading/Writing' ? 'notes are structured with clear headings and lists' : 'examples involve practical or physical scenarios'}.

    The response must be in valid JSON format according to the provided schema.
  `;

  const parts: any[] = [{ text: promptText }];

  if (file) {
    parts.push({
      inlineData: {
        data: file.base64,
        mimeType: file.mimeType
      }
    });
  }

  const response = await ai.models.generateContent({
    model,
    contents: { parts },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          revisionNotes: {
            type: Type.STRING,
            description: "Concise summary of the content in Markdown format."
          },
          definitions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                term: { type: Type.STRING },
                definition: { type: Type.STRING }
              },
              required: ["term", "definition"]
            }
          },
          formulas: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          },
          examTips: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          },
          mcqs: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                question: { type: Type.STRING },
                options: { 
                  type: Type.ARRAY, 
                  items: { type: Type.STRING }
                },
                correctAnswerIndex: { type: Type.INTEGER },
                explanation: { 
                  type: Type.STRING,
                  description: "A detailed breakdown explaining the correct answer and why the distractors are wrong."
                }
              },
              required: ["question", "options", "correctAnswerIndex", "explanation"]
            }
          },
          flowchart: {
            type: Type.STRING,
            description: "A valid Mermaid.js flowchart string visualization."
          }
        },
        required: ["revisionNotes", "definitions", "formulas", "examTips", "mcqs", "flowchart"]
      }
    }
  });

  if (!response.text) {
    throw new Error("No response generated from AI.");
  }

  return JSON.parse(response.text.trim());
};

export const askTutor = async (
  question: string,
  contextContent: string,
  revisionResult: RevisionResult | null,
  chatHistory: { role: 'user' | 'model', text: string }[]
): Promise<string> => {
  const ai = aiInstance();
  const model = "gemini-3-pro-preview";
  
  const systemInstruction = `
    You are the "LastMinute Pro Assistant". 
    Your GOAL is to provide CLARITY, not volume. Students are stressed and need quick, sharp answers.

    CRITICAL CONSTRAINTS:
    1. BE BRIEF: Keep responses under 100 words unless absolutely necessary.
    2. LAYERED INFO: Use a "Summary first, Details second" approach.
    3. NO JARGON: Explain complex terms simply.
    4. FORMATTING: Use **Bold** for key terms and bullet points for lists. 
    5. THE 1-2-3 RULE: 
       - 1 simple opening sentence.
       - Max 3 bullet points for explanation.
       - 1 follow-up question to ensure they understand.

    ${contextContent ? `CONTEXT (Original Material): ${contextContent.slice(0, 1000)}` : ''}
    ${revisionResult ? `CONTEXT (Generated Notes): ${revisionResult.revisionNotes.slice(0, 500)}` : ''}
  `;

  const chat = ai.chats.create({
    model,
    config: {
      systemInstruction,
    },
    history: chatHistory.map(m => ({
      role: m.role,
      parts: [{ text: m.text }]
    }))
  });

  const result = await chat.sendMessage({ message: question });
  return result.text || "I'm sorry, I couldn't process that. Can you rephrase?";
};
