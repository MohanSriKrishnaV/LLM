import { HfInference } from "@huggingface/inference";
import { chatService } from "./chatService.js";

const hf = new HfInference(process.env.HF_API_KEY);

const DEFAULT_SYSTEM_PROMPT = `
You are an order assistant.
Respond helpfully and politely to the user's queries.
`;

export const hfService = {
  generateResponse: async (
    message,
    conversationHistory = [],
    systemPrompt = DEFAULT_SYSTEM_PROMPT,
    options = {}
  ) => {
    try {
      // Save user message
      if (chatService) await chatService.saveMessage("user", message);

      // Build prompt: system + conversation + user
      const prompt = [
        systemPrompt,
        ...conversationHistory.map(m => `${m.role}: ${m.content}`),
        `User: ${message}`,
        "Assistant:"
      ].join("\n");

      // Call Hugging Face text generation
      const response = await hf.textGeneration({
        model: options.model || "gpt2",
        inputs: prompt,
        parameters: {
          max_new_tokens: options.maxTokens || 200,
          temperature: options.temperature || 0.7,
          top_p: options.topP || 0.9,
        },
      });

      // Get the generated text
      const outputText = response?.[0]?.generated_text || "No response generated.";

      // Save assistant response
      if (chatService) await chatService.saveMessage("assistant", outputText);

      return { type: "text", message: outputText };
    } catch (err) {
      console.error("HF API error:", err);
      return { type: "text", message: "Failed to generate a response." };
    }
  },
};