import openAI from "openai"

export const openai = new openAI({
    apiKey: process.env.OPEN_AI_KEY
})